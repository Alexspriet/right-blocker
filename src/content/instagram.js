// Right Blocker : driver Instagram.
// Instagram n'a pas de data-testid stables : le driver se repère aux libellés
// (anglais et français) et aux aria-label des icônes. Chemin : bouton Options
// du profil, Bloquer dans la feuille, Bloquer dans la confirmation, fermer.
// Vérifié dans Chrome connecté (interface anglaise) le 28/10/2026 : le bouton
// Options est un div role=button dont le svg porte aria-label « Options »,
// la feuille liste Block, Restrict, Report, Share to..., About this account.
//
// Statuts : blocked, already, missing, self, mismatch, logged-out, error.

(() => {
  if (window.__rightBlockerLoaded) return;
  window.__rightBlockerLoaded = true;

  // Libellés à reconnaître, en minuscules. Ajouter une langue ici.
  const WORDS = {
    options: ['options', "plus d'options", 'more options'],
    block: ['block', 'bloquer'],
    unblock: ['unblock', 'débloquer'],
    edit: ['edit profile', 'modifier le profil'],
    dismiss: ['dismiss', 'ok', 'fermer', 'ignorer', 'close'],
    missing: ["sorry, this page isn't available", "cette page n'est pas disponible"],
    home: ['home', 'accueil'],
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (min, max) => sleep(min + Math.random() * (max - min));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => !!(el && el.getClientRects().length);

  // Bouton dont le texte ou l'aria-label est exactement l'un des mots.
  function findButton(words, root = document) {
    const candidates = root.querySelectorAll('button, [role="button"], [role="menuitem"], a[role="link"]');
    for (const el of candidates) {
      if (!visible(el)) continue;
      const own = norm(el.getAttribute('aria-label'));
      const text = norm(el.textContent);
      const svg = el.querySelector('svg[aria-label]');
      const icon = norm(svg && svg.getAttribute('aria-label'));
      if (words.includes(own) || words.includes(text) || words.includes(icon)) return el;
    }
    return null;
  }

  function hasText(words, root = document) {
    const body = norm(root.body ? root.body.innerText : root.innerText);
    return words.some((w) => body.includes(w));
  }

  // Instagram laisse parfois un dialogue fermé dans le DOM le temps d'une
  // transition : on ne regarde que les dialogues visibles.
  function lastDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    return dialogs.length ? dialogs[dialogs.length - 1] : null;
  }

  function waitFor(probe, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const r = probe();
        if (r) return resolve(r);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  function currentHandle() {
    return (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  }

  function click(el) {
    el.scrollIntoView({ block: 'center' });
    el.click();
  }

  function loggedIn() {
    return !!(
      document.querySelector('a[href="/direct/inbox/"]') ||
      findButton(WORDS.home) ||
      document.querySelector('svg[aria-label="Home"], svg[aria-label="Accueil"]')
    );
  }

  async function blockProfile(handle) {
    if (currentHandle() !== handle.toLowerCase()) {
      return { status: 'mismatch', detail: `page ${location.pathname}` };
    }
    const state = await waitFor(() => {
      // Déconnecté, un profil public s'affiche quand même, avec un lien
      // « Se connecter » dans l'en-tête et sans boîte de réception.
      if (document.querySelector('input[name="username"]')) return 'logged-out';
      if (document.querySelector('a[href*="/accounts/login"]') && !loggedIn()) return 'logged-out';
      if (findButton(WORDS.unblock)) return 'already';
      if (findButton(WORDS.edit)) return 'self';
      if (hasText(WORDS.missing)) return 'missing';
      if (findButton(WORDS.options)) return 'ready';
      return null;
    }, 12000);
    if (!state) return { status: loggedIn() ? 'error' : 'logged-out', detail: 'profil non chargé' };
    if (state !== 'ready') return { status: state };

    await jitter(400, 900);
    click(findButton(WORDS.options));
    const sheet = await waitFor(() => {
      const d = lastDialog();
      return d && findButton(WORDS.block, d) ? d : null;
    }, 4000);
    if (!sheet) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { status: 'error', detail: 'entrée Bloquer absente de la feuille Options' };
    }
    await jitter(300, 700);
    click(findButton(WORDS.block, sheet));

    // La confirmation est un nouveau dialogue qui remplace la feuille
    // (observé le 28/10/2026 : « Block <nom>? », boutons Block et Cancel).
    const confirm = await waitFor(() => {
      const d = lastDialog();
      if (!d || d === sheet) return null;
      return findButton(WORDS.block, d) || null;
    }, 4000);
    if (!confirm) return { status: 'error', detail: 'dialogue de confirmation absent' };
    await jitter(300, 700);
    click(confirm);

    // Instagram affiche ensuite « Bloqué » avec un bouton pour fermer.
    const closer = await waitFor(() => {
      const d = lastDialog();
      return d ? findButton(WORDS.dismiss, d) : null;
    }, 5000);
    if (closer) { await jitter(300, 600); click(closer); }

    const ok = await waitFor(() => findButton(WORDS.unblock), 6000);
    return ok ? { status: 'blocked' } : { status: 'error', detail: 'blocage non confirmé par la page' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'block' || msg.network !== 'instagram') return false;
    blockProfile(msg.handle)
      .then(sendResponse)
      .catch((e) => sendResponse({ status: 'error', detail: e.message }));
    return true;
  });
})();
