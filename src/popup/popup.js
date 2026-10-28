// On bloque. : popup. Trois vues (principale, liste, réglages), un état lu dans le
// service worker, un squelette tant qu'il n'est pas là, un tampon quand un compte
// vient d'être bloqué.

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const NET_LABEL = { x: 'X', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook' };
const STATUS_LABEL = {
  blocked: ['Bloqué', 'ok'], already: ['Déjà bloqué', 'ok'], missing: ['Introuvable', ''],
  self: ['Ton compte', ''], mismatch: ['Erreur', 'err'], 'logged-out': ['Déconnecté', 'err'], error: ['Erreur', 'err'],
};
const STAMP_MS = 2500; // le tampon reste le temps d'être vu, puis la fiche passe au suivant
const DAY_MS = 86400000;

let state = null;
let filter = { q: '', net: 'all', cat: 'all' };
let lastTotal = null;

const key = (p) => `${p.network}:${p.handle}`;
const netLabel = (n) => NET_LABEL[n] || n;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (p) => (p.name || p.handle).split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `il y a ${s} s` : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`; };
const profileOf = (k) => state.list.profiles.find((p) => key(p) === k) || null;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const pendingList = () => state.list.profiles.filter((p) => !state.done[key(p)] && state.networks.includes(p.network));
const statusOf = (p) => (state.done[key(p)] || {}).status || null;

// ---------- vue principale ----------

function renderNum(total) {
  const txt = fmt(total);
  const el = $('num');
  el.innerHTML = [...txt].map((c) => (/\d/.test(c) ? `<span class="d">${c}</span>` : `<span class="sep"></span>`)).join('');
  if (lastTotal != null && total !== lastTotal) {
    const ds = el.querySelectorAll('.d');
    ds[ds.length - 1].classList.add('tick');
  }
  lastTotal = total;
}

function renderLive() {
  const cap = state.settings.dailyCap;
  const n = state.daily.count;
  renderNum(state.total);
  $('delta').textContent = `+${n} aujourd'hui`;
  $('today-txt').textContent = `Aujourd'hui : ${n} / ${cap}`;
  $('today-bar').style.width = `${Math.min(100, (n / cap) * 100)}%`;
  const dot = $('live-dot');
  const tag = $('live-tag');
  if (state.running) { dot.className = 'dot'; tag.textContent = 'EN DIRECT'; }
  else if (state.stopReason === 'cap' || state.stopReason === 'done') { dot.className = 'dot ok'; tag.textContent = 'TERMINÉ'; }
  else { dot.className = 'dot still'; tag.textContent = 'EN PAUSE'; }
}

function netCounts() {
  const counts = {};
  for (const p of state.list.profiles) counts[p.network] = (counts[p.network] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function renderNets(container, selected, onPick) {
  container.innerHTML = netCounts().map(([n, c]) =>
    `<button class="pill${selected === n ? ' on' : ''}" data-net="${esc(n)}">${esc(netLabel(n))} <b>${fmt(c)}</b></button>`).join('');
  container.querySelectorAll('button').forEach((b) => { b.onclick = () => onPick(b.dataset.net); });
}

function accountCard(p, inner) {
  const note = p.followers ? `<div class="note">≈ ${fmt(p.followers)} abonnés</div>` : '';
  return `<div class="eyebrow">${esc(p.category)}</div>
    <div class="who"><div class="portrait">${esc(initials(p))}</div><div><h2>${esc(p.name || '@' + p.handle)}</h2><div class="handle">@${esc(p.handle)} · ${esc(netLabel(p.network))}</div></div></div>
    ${note}${inner}<div class="stamp">BLOQUÉ</div>`;
}

function renderMain() {
  renderLive();
  const card = $('cur-card');
  const title = $('cur-title');
  const cta = $('cta');
  const fresh = state.lastResult && Date.now() - state.lastResult.at < STAMP_MS ? state.lastResult : null;
  const freshP = fresh ? profileOf(fresh.key) : null;
  const pending = pendingList();
  const upNext = pending.filter((p) => !(state.current && key(p) === key(state.current)));
  const remaining = Math.max(0, state.settings.dailyCap - state.daily.count);
  let selectedNet = null;
  document.body.dataset.step = fresh && fresh.status === 'blocked' ? 'blocked' : 'ready';
  card.className = 'acc';
  cta.hidden = false;

  if (!state.list.profiles.length) {
    title.textContent = 'Pour commencer';
    card.innerHTML = `<div class="who"><div class="portrait">↓</div><div><h2>Aucune liste chargée</h2><div class="handle">Une adresse ou un fichier JSON, dans les réglages.</div></div></div>`;
    cta.textContent = 'Choisir une liste'; cta.className = 'cta'; cta.disabled = false; cta.onclick = () => view('settings');
  } else if (freshP) {
    const [label, tone] = STATUS_LABEL[fresh.status] || ['Erreur', 'err'];
    title.textContent = fresh.status === 'blocked' ? 'Bloqué' : 'Dernier';
    selectedNet = freshP.network;
    card.innerHTML = accountCard(freshP, `<div class="state ${tone}">${tone === 'ok' ? '✓ ' : ''}${esc(label)} ${esc(ago(fresh.at))}</div>`);
    cta.textContent = state.running ? 'Pause' : 'Reprendre'; cta.className = state.running ? 'cta quiet' : 'cta'; cta.disabled = false;
    cta.onclick = () => send({ type: state.running ? 'pause' : 'start' }).then(refresh);
  } else if (state.running && state.current) {
    title.textContent = 'En cours';
    selectedNet = state.current.network;
    card.innerHTML = accountCard(state.current, `<div class="state"><span class="spin"></span>Blocage en cours…</div>`);
    cta.textContent = 'Pause'; cta.className = 'cta quiet'; cta.disabled = false; cta.onclick = () => send({ type: 'pause' }).then(refresh);
  } else if (state.running) {
    title.textContent = 'En cours';
    const p = upNext[0];
    card.innerHTML = p ? accountCard(p, `<div class="state"><span class="spin"></span>Ouverture du profil…</div>`) : `<div class="state"><span class="spin"></span>Un instant…</div>`;
    cta.textContent = 'Pause'; cta.className = 'cta quiet'; cta.disabled = false; cta.onclick = () => send({ type: 'pause' }).then(refresh);
  } else if (state.stopReason === 'cap') {
    title.textContent = "Bravo, c'est fait pour aujourd'hui";
    card.innerHTML = `<div class="who"><div class="portrait ok">✓</div><div><h2>${fmt(state.daily.count)} compte${state.daily.count > 1 ? 's' : ''} bloqué${state.daily.count > 1 ? 's' : ''}</h2><div class="handle">On reprend demain, à ton rythme.</div></div></div>`;
    cta.hidden = true;
  } else if (state.stopReason === 'done' || pending.length === 0) {
    title.textContent = 'Liste terminée';
    card.innerHTML = `<div class="who"><div class="portrait ok">✓</div><div><h2>Tout est bloqué</h2><div class="handle">La liste se met à jour toute seule, reviens plus tard.</div></div></div>`;
    cta.hidden = true;
  } else if (state.stopReason === 'logged-out') {
    const p = state.lastResult ? profileOf(state.lastResult.key) : upNext[0];
    const n = p ? p.network : 'x';
    title.textContent = netLabel(n);
    card.className = 'acc warn';
    card.innerHTML = `<div class="who"><div class="portrait warn">!</div><div><h2>Pas connecté à ${esc(netLabel(n))}</h2><div class="handle">Connecte-toi dans l'onglet, puis reprends.</div></div></div>
      <button class="cta small ghost" style="margin-top:12px" id="open-net">Ouvrir ${esc(n === 'x' ? 'x.com' : n + '.com')} ↗</button>`;
    card.querySelector('#open-net').onclick = () => send({ type: 'open-network', network: n });
    cta.textContent = 'Reprendre'; cta.className = 'cta'; cta.disabled = false; cta.onclick = () => send({ type: 'retry-errors' }).then(() => send({ type: 'start' })).then(refresh);
  } else {
    title.textContent = 'À suivre';
    const p = upNext[0];
    selectedNet = p ? p.network : null;
    card.innerHTML = p ? accountCard(p, `<div class="state muted">${fmt(pending.length)} compte${pending.length > 1 ? 's' : ''} dans la liste, ${remaining} encore aujourd'hui</div>`) : '';
    const started = Object.keys(state.done).length > 0;
    cta.textContent = started ? 'Reprendre' : 'Démarrer'; cta.className = 'cta'; cta.disabled = false; cta.onclick = () => send({ type: 'start' }).then(refresh);
  }

  // À bloquer aujourd'hui : ce qui reste dans le plafond du jour, sans le compte affiché.
  const shown = freshP || state.current || (state.running ? upNext[0] : (!state.stopReason || state.stopReason === 'user' ? upNext[0] : null));
  const todo = upNext.filter((p) => !shown || key(p) !== key(shown)).slice(0, Math.max(0, remaining - (shown && !freshP ? 1 : 0)));
  $('todo-title').textContent = `À bloquer aujourd'hui · ${todo.length + (shown && !freshP ? 1 : 0)}`;
  $('todo-title').hidden = !state.list.profiles.length;
  $('todo').innerHTML = todo.length
    ? todo.map((p) => `<div><span class="portrait">${esc(initials(p))}</span><b>${esc(p.name || '@' + p.handle)}</b><span class="h">@${esc(p.handle)} · ${esc(netLabel(p.network))}</span></div>`).join('')
    : `<div class="empty">${remaining === 0 ? 'Plafond du jour atteint, on reprend demain.' : pending.length ? 'Rien d’autre aujourd’hui.' : 'Rien à bloquer.'}</div>`;

  // Fait aujourd'hui : les comptes traités depuis minuit, les plus récents en tête.
  const since = startOfToday();
  const doneToday = Object.entries(state.done).filter(([, v]) => v.at >= since).sort((a, b) => b[1].at - a[1].at)
    .map(([k, v]) => ({ p: profileOf(k) || { network: k.split(':')[0], handle: k.split(':')[1], name: '' }, v }));
  $('done-title').textContent = `Fait aujourd'hui · ${doneToday.length}`;
  $('done-title').hidden = !state.list.profiles.length;
  $('done-today').innerHTML = doneToday.length
    ? doneToday.map(({ p, v }) => { const [label, tone] = STATUS_LABEL[v.status] || ['Erreur', 'err']; return `<div><span class="portrait">${esc(initials(p))}</span><b>${esc(p.name || '@' + p.handle)}</b><span class="h">@${esc(p.handle)} · ${esc(netLabel(p.network))}</span><span class="chip ${tone}">${esc(label)}</span></div>`; }).join('')
    : `<div class="empty">Rien encore aujourd'hui.</div>`;
  renderNets($('nets'), selectedNet, (n) => { filter.net = n; view('list'); });
}

// ---------- vue liste ----------

function renderList() {
  const all = state.list.profiles;
  $('list-count').textContent = `${fmt(all.length)} compte${all.length > 1 ? 's' : ''}`;
  $('list-date').textContent = state.list.updated || '';
  renderNets($('list-nets'), filter.net === 'all' ? null : filter.net, (n) => { filter.net = filter.net === n ? 'all' : n; renderList(); });
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  $('cats').innerHTML = cats.length ? ['Tous', ...cats].map((c) => `<button class="${(c === 'Tous' ? 'all' : c) === filter.cat ? 'on' : ''}" data-cat="${esc(c === 'Tous' ? 'all' : c)}">${esc(c)}</button>`).join('') : '';
  $('cats').querySelectorAll('button').forEach((b) => { b.onclick = () => { filter.cat = b.dataset.cat; renderList(); }; });
  const q = filter.q.trim().toLowerCase().replace(/^@/, '');
  const rows = all.filter((p) =>
    (filter.net === 'all' || p.network === filter.net) &&
    (filter.cat === 'all' || p.category === filter.cat) &&
    (!q || p.handle.includes(q) || (p.name || '').toLowerCase().includes(q)));
  $('rows').innerHTML = rows.length ? rows.map((p) => {
    const st = statusOf(p);
    const [label, tone] = st ? (STATUS_LABEL[st] || ['Erreur', 'err']) : ['À faire', ''];
    return `<div><span class="portrait">${esc(initials(p))}</span><div><b>${esc(p.name || '@' + p.handle)}</b><small>@${esc(p.handle)} · ${esc(netLabel(p.network))}</small></div><span class="chip ${tone}">${esc(label)}</span></div>`;
  }).join('') : `<span class="empty">${all.length ? 'Aucun compte ne correspond.' : 'Aucune liste chargée.'}</span>`;
  const src = state.source.kind === 'url' ? state.source.url.replace(/^https?:\/\//, '') : state.source.kind === 'file' ? 'fichier local' : 'aucune';
  $('src-txt').textContent = `Source : ${src}`;
  $('src-date').textContent = state.list.updated ? `Mise à jour : ${state.list.updated}` : '';
  $('refresh').style.display = state.source.kind === 'url' ? '' : 'none';
}

// ---------- vue réglages ----------

function renderSettings() {
  if (document.activeElement !== $('url')) $('url').value = state.source.kind === 'url' ? state.source.url : $('url').value;
  if (document.activeElement !== $('cap')) $('cap').value = state.settings.dailyCap;
  $('source').textContent =
    state.source.kind === 'url' ? `Liste chargée depuis l'adresse, rafraîchie toutes les six heures.` :
    state.source.kind === 'file' ? `Liste chargée depuis un fichier local (version ${state.list.version}).` : 'Aucune liste chargée.';
  $('log').textContent = state.log.join('\n');
}

// ---------- orchestration ----------

function view(name) {
  document.body.dataset.view = name;
  render();
  if (name === 'list') $('q').focus();
}

function render() {
  if (!state) return;
  document.body.dataset.step = state.loading ? 'loading' : document.body.dataset.step;
  $('n-list').textContent = fmt(state.list.profiles.length);
  const v = document.body.dataset.view;
  if (v === 'main') renderMain();
  else if (v === 'list') renderList();
  else renderSettings();
  if (state.loading) document.body.dataset.step = 'loading';
}

async function refresh() {
  const s = await send({ type: 'get-state' });
  if (!s || s.error) return;
  const firstPaint = !state;
  state = s;
  render();
  if (firstPaint && !state.loading) document.body.dataset.step = document.body.dataset.step === 'loading' ? 'ready' : document.body.dataset.step;
}

$('go-main').onclick = () => view('main');
$('go-list').onclick = () => view('list');
$('go-settings').onclick = () => view('settings');
$('back-list').onclick = () => view('main');
$('back-settings').onclick = () => view('main');
$('q').oninput = (e) => { filter.q = e.target.value; renderList(); };
$('refresh').onclick = async () => { await send({ type: 'refresh' }); refresh(); };

$('load-url').onclick = async () => {
  const url = $('url').value.trim();
  if (!url) return;
  const r = await send({ type: 'set-url', url });
  if (r && r.error) alert(`Chargement raté : ${r.error}`);
  refresh();
};
$('file').onchange = async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const r = await send({ type: 'load-text', text: await f.text() });
  if (r && r.error) alert(`Fichier invalide : ${r.error}`);
  ev.target.value = '';
  refresh();
};
$('cap').onchange = (e) => {
  const v = Math.max(1, Math.min(200, Number(e.target.value) || 12));
  e.target.value = v;
  send({ type: 'set-settings', settings: { dailyCap: v } }).then(refresh);
};
document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => send({ type: 'open-network', network: b.dataset.open }); });
$('retry').onclick = () => send({ type: 'retry-errors' }).then(refresh);
$('reset').onclick = () => { if (confirm("Oublier tout l'historique et retenter chaque compte ?")) send({ type: 'reset-done' }).then(refresh); };

chrome.storage.onChanged.addListener(() => refresh());
setInterval(() => { if (state && (state.running || (state.lastResult && Date.now() - state.lastResult.at < STAMP_MS + 500))) render(); }, 500);
refresh();
