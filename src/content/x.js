// Right Blocker : driver X.
// Tourne dans la page du profil et pilote l'interface comme un humain :
// menu « ... », Bloquer, confirmer. Répond au service worker par un statut.
//
// Statuts : blocked, already, missing (compte inexistant ou suspendu),
//           self, mismatch (mauvaise page), logged-out, error.

(() => {
  if (window.__rightBlockerLoaded) return;
  window.__rightBlockerLoaded = true;

  const SEL = {
    actions: '[data-testid="userActions"]',
    blockItem: '[data-testid="block"]',
    confirm: '[data-testid="confirmationSheetConfirm"]',
    unblock: '[data-testid$="-unblock"]',
    editProfile: '[data-testid="editProfileButton"]',
    empty: '[data-testid="emptyState"]',
    loginLink: 'a[href="/login"]',
    primaryColumn: '[data-testid="primaryColumn"]',
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (min, max) => sleep(min + Math.random() * (max - min));

  function waitFor(selectors, timeoutMs) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        for (const sel of list) {
          const el = document.querySelector(sel);
          if (el) return resolve({ sel, el });
        }
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  function currentHandle() {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    return seg.toLowerCase();
  }

  function click(el) {
    el.scrollIntoView({ block: 'center' });
    el.click();
  }

  async function blockProfile(handle) {
    if (currentHandle() !== handle.toLowerCase()) {
      return { status: 'mismatch', detail: `page ${location.pathname}` };
    }
    const first = await waitFor(
      [SEL.actions, SEL.unblock, SEL.editProfile, SEL.empty, SEL.loginLink],
      12000,
    );
    if (!first) return { status: 'error', detail: 'profil non chargé' };
    if (first.sel === SEL.loginLink && !document.querySelector(SEL.primaryColumn)) {
      return { status: 'logged-out' };
    }
    if (document.querySelector(SEL.unblock)) return { status: 'already' };
    if (document.querySelector(SEL.editProfile)) return { status: 'self' };
    if (document.querySelector(SEL.empty) && !document.querySelector(SEL.actions)) {
      return { status: 'missing' };
    }
    const actions = document.querySelector(SEL.actions);
    if (!actions) return { status: 'error', detail: 'bouton « ... » introuvable' };

    await jitter(400, 900);
    click(actions);
    const item = await waitFor(SEL.blockItem, 4000);
    if (!item) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { status: 'error', detail: 'entrée Bloquer absente du menu' };
    }
    await jitter(300, 700);
    click(item.el);
    const confirm = await waitFor(SEL.confirm, 4000);
    if (!confirm) return { status: 'error', detail: 'dialogue de confirmation absent' };
    await jitter(300, 700);
    click(confirm.el);
    const ok = await waitFor(SEL.unblock, 6000);
    return ok ? { status: 'blocked' } : { status: 'error', detail: 'blocage non confirmé par la page' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'block' || msg.network !== 'x') return false;
    blockProfile(msg.handle)
      .then(sendResponse)
      .catch((e) => sendResponse({ status: 'error', detail: e.message }));
    return true;
  });
})();
