// Faux chrome.* pour ouvrir le popup dans un navigateur normal (vérification visuelle).
(() => {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('s') || 'running';
  const profiles = [
    { network: 'x', handle: 'mlp_officiel', name: 'Marine Le Pen', category: 'Politiques', followers: 3048949 },
    { network: 'x', handle: 'j_bardella', name: 'Jordan Bardella', category: 'Politiques', followers: 1800000 },
    { network: 'x', handle: 'cnews', name: 'CNews', category: 'Médias' },
    { network: 'x', handle: 'zemmoureric', name: 'Éric Zemmour', category: 'Politiques' },
    { network: 'instagram', handle: 'bfmtv', name: 'BFMTV', category: 'Médias' },
    { network: 'x', handle: 'rnational_off', name: 'Rassemblement National', category: 'Partis' },
    { network: 'tiktok', handle: 'gilbertcollard', name: 'Gilbert Collard', category: 'Politiques' },
  ];
  const base = { source: { kind: 'url', url: 'https://onbloquelextremedroite.fun/liste.json' }, list: { version: 2, updated: '28/10/2026', profiles },
    done: { 'x:cnews': { status: 'already', at: Date.now() - 60000 }, 'x:zemmoureric': { status: 'error', at: Date.now() - 30000 }, 'tiktok:gilbertcollard': { status: 'blocked', at: Date.now() - 900000 } },
    running: false, stopReason: null, current: null, lastResult: null, total: 1034, daily: { date: '', count: 3, byNetwork: { x: 2, tiktok: 1 } }, settings: { dailyCap: 20 },
    loading: false, log: ['11:20:08  x @cnews : already', '11:19:50  File démarrée.'], networks: ['x', 'instagram'] };
  const S = {
    loading: { ...base, loading: true },
    idle: { ...base },
    empty: { ...base, list: { version: 0, updated: null, profiles: [] } },
    running: { ...base, running: true, current: profiles[0] },
    blocked: { ...base, running: true, lastResult: { key: 'x:mlp_officiel', status: 'blocked', at: Date.now() + 1500 }, total: 1035, daily: { date: '', count: 4, byNetwork: { x: 3, tiktok: 1 } } },
    cap: { ...base, stopReason: 'cap', daily: { date: '', count: 4, byNetwork: { x: 3, tiktok: 1, instagram: 0 } }, settings: { dailyCap: 3 } },
    loggedout: { ...base, stopReason: 'logged-out', lastResult: { key: 'instagram:bfmtv', status: 'logged-out', at: Date.now() - 9000 } },
  }[scenario];
  const pendingOf = (s) => s.list.profiles.filter((p) => !s.done[`${p.network}:${p.handle}`]);
  window.chrome = {
    runtime: { sendMessage: async (m) => { if (m.type === 'get-state') { const pend = pendingOf(S); return { ...S, pending: pend.length, upNext: pend.filter((p) => !(S.current && p.handle === S.current.handle)).slice(0, 2) }; } return { ok: true }; } },
    storage: { onChanged: { addListener() {} } },
  };
})();
