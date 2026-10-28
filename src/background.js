// Right Blocker : service worker.
// Tient la liste, la file de blocage et le rythme. Les blocages eux-mêmes
// sont exécutés par le driver du réseau (src/content/x.js) dans un onglet
// où l'utilisateur est déjà connecté.

const PACE = { minMs: 4000, maxMs: 9000 }; // pause entre deux blocages
const PAGE_TIMEOUT_MS = 25000;             // attente max du chargement d'un profil
const BLOCK_TIMEOUT_MS = 20000;            // attente max du driver
const REFRESH_ALARM = 'refresh-list';
const WATCHDOG_ALARM = 'watchdog';

// Réseaux pris en charge : un driver par réseau dans src/content/.
const NETWORKS = {
  x: { home: 'https://x.com/home', profile: (h) => `https://x.com/${h}` },
  instagram: { home: 'https://www.instagram.com/', profile: (h) => `https://www.instagram.com/${h}/` },
};
const key = (p) => `${p.network}:${p.handle}`;

const DEFAULTS = {
  source: { kind: 'none', url: '' },  // kind: 'none' | 'url' | 'file'
  list: { version: 0, updated: null, profiles: [] },
  done: {},                           // "réseau:handle" -> { status, at }
  running: false,
  stopReason: null,                   // null | 'user' | 'cap' | 'done' | 'logged-out'
  current: null,                      // profil en cours { network, handle, name, category }
  lastResult: null,                   // { key, status, at } du dernier profil traité
  lastActivity: 0,
  workerTabs: {},                     // réseau -> id d'onglet
  log: [],                            // dernières lignes, les plus récentes en tête
  total: 0,                           // blocages réussis depuis ce navigateur
  daily: { date: '', count: 0 },      // blocages du jour
  settings: { dailyCap: 12 },         // plafond quotidien, à rythme humain
  loading: false,                     // liste en cours de chargement
};

const todayKey = () => new Date().toISOString().slice(0, 10);
function dailyOf(state) {
  return state.daily.date === todayKey() ? state.daily : { date: todayKey(), count: 0 };
}

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
      name: String(p.name || p.handle || '').trim(),
      category: String(p.category || '').trim(),
      followers: p.followers == null ? null : Number(p.followers),
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
  await setState({ loading: true });
  try {
    const res = await fetch(source.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await loadFromText(await res.text(), source);
  } finally {
    await setState({ loading: false });
  }
}

// ---------- file de blocage ----------

function isPending(state, p) {
  return NETWORKS[p.network] && !state.done[key(p)];
}
function nextPending(state) {
  return state.list.profiles.find((p) => isPending(state, p)) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pace() {
  return PACE.minMs + Math.random() * (PACE.maxMs - PACE.minMs);
}

async function workerTab(network) {
  const state = await getState();
  const id = state.workerTabs[network];
  if (id != null) {
    try {
      const tab = await chrome.tabs.get(id);
      if (tab) return tab;
    } catch (_) { /* onglet fermé */ }
  }
  const tab = await chrome.tabs.create({ url: NETWORKS[network].home, active: false });
  await setState({ workerTabs: { ...state.workerTabs, [network]: tab.id } });
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

async function askDriver(tabId, network, handle) {
  // Le script de contenu peut ne pas être prêt juste après le chargement :
  // on réessaie quelques fois.
  const deadline = Date.now() + BLOCK_TIMEOUT_MS;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'block', network, handle });
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
      const daily = dailyOf(state);
      if (daily.count >= state.settings.dailyCap) {
        await setState({ running: false, current: null, stopReason: 'cap', daily });
        await log(`Plafond du jour atteint (${state.settings.dailyCap}) : on reprend demain.`);
        break;
      }
      const next = nextPending(state);
      if (!next) {
        await setState({ running: false, current: null, stopReason: 'done' });
        await log('File terminée : plus rien à bloquer.');
        break;
      }
      await setState({ current: next, lastActivity: Date.now() });
      const label = `${next.network} @${next.handle}`;
      let status = 'error';
      try {
        const tab = await workerTab(next.network);
        await chrome.tabs.update(tab.id, { url: NETWORKS[next.network].profile(next.handle) });
        await waitForLoad(tab.id, PAGE_TIMEOUT_MS);
        await sleep(1200 + Math.random() * 800);
        const res = await askDriver(tab.id, next.network, next.handle);
        status = res.status;
        await log(`${label} : ${status}${res.detail ? ' (' + res.detail + ')' : ''}`);
      } catch (e) {
        status = 'error';
        await log(`${label} : erreur, ${e.message}`);
      }
      const s = await getState();
      const d = dailyOf(s);
      const blocked = status === 'blocked';
      await setState({
        done: { ...s.done, [key(next)]: { status, at: Date.now() } },
        lastResult: { key: key(next), status, at: Date.now() },
        total: s.total + (blocked ? 1 : 0),
        daily: { date: d.date, count: d.count + (blocked ? 1 : 0) },
        current: null,
        lastActivity: Date.now(),
      });
      if (status === 'logged-out') {
        await setState({ running: false, stopReason: 'logged-out' });
        await log(`Pas connecté à ${next.network} dans cet onglet : file mise en pause.`);
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
        const pending = s.list.profiles.filter((p) => isPending(s, p)).length;
        const unsupported = s.list.profiles.filter((p) => !NETWORKS[p.network]).length;
        const upNext = s.list.profiles.filter((p) => isPending(s, p) && !(s.current && key(p) === key(s.current))).slice(0, 2);
        return { ...s, daily: dailyOf(s), pending, unsupported, upNext, networks: Object.keys(NETWORKS) };
      }
      case 'set-url': {
        await setState({ source: { kind: 'url', url: msg.url } });
        await refreshFromUrl();
        await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 360 });
        return { ok: true };
      }
      case 'refresh':
        await refreshFromUrl();
        return { ok: true };
      case 'load-text':
        await loadFromText(msg.text, { kind: 'file', url: '' });
        return { ok: true };
      case 'set-settings': {
        const s = await getState();
        await setState({ settings: { ...s.settings, ...msg.settings } });
        return { ok: true };
      }
      case 'open-network':
        await chrome.tabs.create({ url: NETWORKS[msg.network].home });
        return { ok: true };
      case 'start':
        await setState({ running: true, stopReason: null });
        await log('File démarrée.');
        runLoop();
        return { ok: true };
      case 'pause':
        await setState({ running: false, stopReason: 'user' });
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
