const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

async function refresh() {
  const s = await send({ type: 'get-state' });
  if (!s || s.error) return;
  const done = Object.values(s.done);
  $('n-total').textContent = s.list.profiles.length;
  $('n-pending').textContent = s.pending;
  $('n-blocked').textContent = done.filter((d) => d.status === 'blocked' || d.status === 'already').length;
  $('n-error').textContent = done.filter((d) => d.status === 'error' || d.status === 'logged-out').length;
  $('source').textContent =
    s.source.kind === 'url' ? `Source : ${s.source.url}` :
    s.source.kind === 'file' ? 'Source : fichier local' : 'Aucune liste chargée.';
  if (s.source.kind === 'url' && !$('url').value) $('url').value = s.source.url;
  $('current').textContent = s.running
    ? (s.current ? `En cours : ${s.current.network} @${s.current.handle}` : 'En cours…')
    : (s.unsupported ? `À l’arrêt. ${s.unsupported} profil(s) sur un réseau non géré (gérés : ${s.networks.join(', ')}).` : 'À l’arrêt.');
  $('start').disabled = s.running || s.pending === 0;
  $('pause').disabled = !s.running;
  $('log').textContent = s.log.join('\n');
}

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
  refresh();
};

$('start').onclick = () => send({ type: 'start' }).then(refresh);
$('pause').onclick = () => send({ type: 'pause' }).then(refresh);
$('retry').onclick = () => send({ type: 'retry-errors' }).then(refresh);
$('reset').onclick = () => {
  if (confirm('Oublier tout l’historique et retenter chaque profil ?')) send({ type: 'reset-done' }).then(refresh);
};

chrome.storage.onChanged.addListener(refresh);
refresh();
