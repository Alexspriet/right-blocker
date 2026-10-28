// Right Blocker : service worker.
// Tient la liste, la file de blocage et le rythme. Les blocages eux-mêmes
// sont exécutés par le driver du réseau (src/content/x.js) dans un onglet
// où l'utilisateur est déjà connecté.

const PACE = { minMs: 4000, maxMs: 9000 }; // pause entre deux blocages
const PAGE_TIMEOUT_MS = 25000;             // attente max du chargement d'un profil
const BLOCK_TIMEOUT_MS = 20000;            // attente max du driver
const REFRESH_ALARM = 'refresh-list';
const WATCHDOG_ALARM = 'watchdog';

const DEFAULTS = {
  source: { kind: 'none', url: '' },  // kind: 'none' | 'url' | 'file'
  list: { version: 0, updated: null, profiles: [] },
  done: {},                           // handle -> { status, at }
  running: false,
  current: null,                      // handle en cours
  lastActivity: 0,
  workerTabId: null,
  log: [],                            // dernières lignes, les plus récentes en tête
};

async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

async function log(line) {
  const { log } = await getState();
  const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
  await setState({ log: [stamped, ...log].slice(0, 50) });
}

// ---------- liste ----------

function parseList(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.profiles)) throw new Error('JSON sans tableau "profiles"');
  const profiles = data.profiles
    .map((p) => ({
      network: String(p.network || 'x').toLowerCase(),
      handle: String(p.handle || '').replace(/^@/, '').trim().toLowerCase(),
    }))
    .filter((p) => p.handle);
  return { version: Number(data.version || 0), updated: data.updated || null, profiles };
}

async function loadFromText(text, source) {
  const list = parseList(text);
  await setState({ list, source });
  await log(`Liste chargée : ${list.profiles.length} profils (version ${list.version})`);
  return list;
}

async function refreshFromUrl() {
  const { source } = await getState();
  if (source.kind !== 'url' || !source.url) return null;
  const res = await fetch(source.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return loadFromText(await res.text(), source);
}

// ---------- file de blocage ----------

function nextPending(state) {
  return state.list.profiles.find((p) => p.network === 'x' && !state.done[p.handle]) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pace() {
  return PACE.minMs + Math.random() * (PACE.maxMs - PACE.minMs);
}

async function workerTab() {
  const state = await getState();
  if (state.workerTabId != null) {
    try {
      const tab = await chrome.tabs.get(state.workerTabId);
      if (tab) return tab;
    } catch (_) { /* onglet fermé */ }
  }
  const tab = await chrome.tabs.create({ url: 'https://x.com/home', active: false });
  await setState({ workerTabId: tab.id });
  return tab;
}

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('chargement trop long'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function askDriver(tabId, handle) {
  // Le script de contenu peut ne pas être prêt juste après le chargement :
  // on réessaie quelques fois.
  const deadline = Date.now() + BLOCK_TIMEOUT_MS;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'x:block', handle });
      if (res && res.status) return res;
      lastErr = new Error('réponse vide du driver');
    } catch (e) {
      lastErr = e;
      await sleep(700);
    }
  }
  throw lastErr || new Error('driver muet');
}

let loopActive = false;

async function runLoop() {
  if (loopActive) return;
  loopActive = true;
  try {
    while (true) {
      const state = await getState();
      if (!state.running) break;
      const next = nextPending(state);
      if (!next) {
        await setState({ running: false, current: null });
        await log('File terminée : plus rien à bloquer.');
        break;
      }
      await setState({ current: next.handle, lastActivity: Date.now() });
      let status = 'error';
      try {
        const tab = await workerTab();
        await chrome.tabs.update(tab.id, { url: `https://x.com/${next.handle}` });
        await waitForLoad(tab.id, PAGE_TIMEOUT_MS);
        await sleep(1200 + Math.random() * 800);
        const res = await askDriver(tab.id, next.handle);
        status = res.status;
        await log(`@${next.handle} : ${status}${res.detail ? ' (' + res.detail + ')' : ''}`);
      } catch (e) {
        status = 'error';
        await log(`@${next.handle} : erreur, ${e.message}`);
      }
      const s = await getState();
      await setState({
        done: { ...s.done, [next.handle]: { status, at: Date.now() } },
        current: null,
        lastActivity: Date.now(),
      });
      if (status === 'logged-out') {
        await setState({ running: false });
        await log('Pas connecté à X dans cet onglet : file mise en pause.');
        break;
      }
      await sleep(pace());
    }
  } finally {
    loopActive = false;
  }
}

// ---------- messages du popup ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'get-state': {
        const s = await getState();
        const pending = s.list.profiles.filter((p) => p.network === 'x' && !s.done[p.handle]).length;
        return { ...s, pending };
      }
      case 'set-url': {
        await setState({ source: { kind: 'url', url: msg.url } });
        await refreshFromUrl();
        await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 360 });
        return { ok: true };
      }
      case 'load-text':
        await loadFromText(msg.text, { kind: 'file', url: '' });
        return { ok: true };
      case 'start':
        await setState({ running: true });
        await log('File démarrée.');
        runLoop();
        return { ok: true };
      case 'pause':
        await setState({ running: false });
        await log('File mise en pause.');
        return { ok: true };
      case 'reset-done':
        await setState({ done: {} });
        await log('Historique effacé : tout sera retenté.');
        return { ok: true };
      case 'retry-errors': {
        const s = await getState();
        const done = Object.fromEntries(
          Object.entries(s.done).filter(([, v]) => v.status !== 'error' && v.status !== 'logged-out'),
        );
        await setState({ done });
        await log('Les erreurs seront retentées.');
        return { ok: true };
      }
      default:
        return { error: `message inconnu : ${msg.type}` };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

// ---------- reprise et alarmes ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    try { await refreshFromUrl(); } catch (e) { await log(`Rafraîchissement raté : ${e.message}`); }
  }
  if (alarm.name === WATCHDOG_ALARM) {
    const s = await getState();
    if (s.running && !loopActive) runLoop();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
});
