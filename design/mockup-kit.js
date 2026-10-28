/* mockup-kit.js: toolbar, frame themes, motion player, alignment audit and a self-check. Load it
   at the end of <body> with <script src="mockup-kit.js"></script>. The page writes no JavaScript
   of its own unless a scene needs a behavior the kit lacks.

   Page API (all optional):
   - <div data-kit-toolbar data-states="progress,empty,done" data-selects='{"Surface":["Reels","Stories"]}'></div>
     builds the toolbar (theme, text, state, stress, motion, grid). An extra select sets
     data-<name lowercased> on <html>, so CSS can switch copy: [data-surface="Stories"] .x { … }.
   - <div class="frame-wrap" data-themes="light dark black" data-cap="Mark + sheet">phone…</div>
     is written once and cloned per theme: the first keeps the global theme, the others are forced
     (.theme-dark, .theme-black) and captioned "Mark + sheet · dark". No id inside a cloned frame.
   - A frame-wrap holding a .scene gets a Replay button; a .storyboard stays on the first copy only.
   - window.mockupReport() returns, per section, frames, themes and scenes, and lists the options
     missing a dark frame or a motion frame; window.mockupAudit() returns the near-miss edges.
     Both are meant for the browser tool: measure with them instead of taking screenshots. */
(() => {
  const root = document.documentElement;
  const STRESS = {
    word: "Ok", para: "Explain how an LWW-Element-Set CRDT works, why convergence holds without coordination, what it costs in metadata as the number of replicas grows, and when a CRDT is a bad choice compared with an operation log plus consensus, answering as you would to a backend developer who knows distributed databases but has never used a CRDT in production, with one concrete example and the traps to avoid.",
    url: "https://developer.android.com/reference/android/webkit/WebView#evaluateJavascript(java.lang.String,%20android.webkit.ValueCallback%3Cjava.lang.String%3E)",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXhhbmRyZSIsImlhdCI6MTUxNjIzOTAyMn0SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c",
    code: "val x = list.map { it * 2 }.filter { it > 2 } // [4, 6]", emoji: "🔥🏋️‍♀️🥗✨🎯", arabic: "اشرح لي كيف يعمل هذا التطبيق باختصار", french: "Séance d'étirement : l'épaule, le cou et les hanches, à faire après l'effort (20 % longer than English)"
  };
  const THEME_LABEL = { light: 'light', dark: 'dark', black: 'black (AMOLED)' };

  // 1. Toolbar, built from the placeholder so pages never carry its markup.
  const bar = document.querySelector('[data-kit-toolbar]');
  if (bar) {
    const opt = (v, l) => `<option value="${v}">${l ?? v}</option>`;
    const states = (bar.dataset.states || '').split(',').map(s => s.trim()).filter(Boolean);
    const extra = JSON.parse(bar.dataset.selects || '{}');
    bar.className = 'toolbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Mockup settings');
    bar.innerHTML =
      `<label>Theme <select data-theme-select>${opt('', 'light')}${opt('dark')}${opt('black', 'black (AMOLED)')}</select></label>` +
      `<label>Text <select data-scale>${opt(1, '100 %')}${opt(1.3, '130 %')}${opt(2, '200 %')}</select></label>` +
      (states.length ? `<label>State <select data-state>${states.map(s => opt(s)).join('')}</select></label>` : '') +
      Object.entries(extra).map(([k, vs]) => `<label>${k} <select data-extra="${k.toLowerCase()}">${vs.map(v => opt(v)).join('')}</select></label>`).join('') +
      `<label>Content <button data-toggle="stress" aria-pressed="false">stress</button></label>` +
      `<label>Motion <button data-replay-all>Replay all</button> <button data-toggle="slow" aria-pressed="false">Slow 4×</button></label>` +
      `<label>Layout <button data-toggle="grid" aria-pressed="false">Grid</button> <button data-toggle="squint" aria-pressed="false">Squint</button> <span class="muted" data-audit></span></label>`;
    Object.keys(extra).forEach(k => { root.dataset[k.toLowerCase()] = extra[k][0]; });
  }

  // 2. Frames written once, cloned per theme.
  document.querySelectorAll('.frame-wrap[data-themes]').forEach(wrap => {
    const themes = wrap.dataset.themes.split(/\s+/).filter(Boolean);
    const cap = wrap.dataset.cap;
    const label = t => (cap ? cap + ' · ' : '') + THEME_LABEL[t] + (t === themes[0] ? '' : ' (forced)');
    const setCap = (el, t) => { let c = el.querySelector(':scope > .cap'); if (!c) { c = document.createElement('div'); c.className = 'cap'; el.querySelector('.phone').after(c); } c.textContent = label(t); };
    if (themes[0] !== 'light') wrap.classList.add('theme-' + themes[0]);
    setCap(wrap, themes[0]);
    let prev = wrap;
    themes.slice(1).forEach(t => {
      const c = wrap.cloneNode(true);
      c.removeAttribute('data-themes'); c.classList.add('theme-' + t);
      c.querySelectorAll('.storyboard').forEach(s => s.remove());
      setCap(c, t); prev.after(c); prev = c;
    });
  });
  document.querySelectorAll('.frame-wrap[data-cap]:not([data-themes])').forEach(w => {
    if (!w.querySelector(':scope > .cap')) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = w.dataset.cap; w.querySelector('.phone').after(c); }
  });

  // 2b. Android status bar in every empty .status (or one still holding the ▮ placeholder).
  const SYS = '<span class="sys">' +
    '<svg viewBox="0 0 24 24"><path d="M12 21 1.6 8.6A16 16 0 0 1 12 5a16 16 0 0 1 10.4 3.6Z"/></svg>' +
    '<svg viewBox="0 0 24 24"><path d="M2 22h20V2Z"/></svg>' +
    '<svg viewBox="0 0 24 24"><path d="M16 4h-2V2h-4v2H8a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z"/></svg></span>';
  document.querySelectorAll('.status').forEach(s => {
    if (!s.textContent.trim() || s.textContent.includes('▮')) s.innerHTML = '<span>10:00</span>' + SYS;
  });

  // 2c. Frames and the showcase start their CSS animations once they are on screen.
  const show = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); show.unobserve(e.target); } }), { threshold: .35 });
  document.querySelectorAll('.frame-wrap, .showcase').forEach(el => show.observe(el));
  // Fallback: if nothing reported visible after 2.5 s (hidden tab, thumbnail, print), play all, so
  // no content stays hidden behind an entrance that never ran.
  setTimeout(() => { if (!document.querySelector('.in-view')) document.querySelectorAll('.frame-wrap, .showcase').forEach(el => el.classList.add('in-view')); }, 2500);

  // 3. Toolbar behavior: every setting applies to every phone; forced frames keep their theme.
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  const toggle = e => { const v = e.target.getAttribute('aria-pressed') !== 'true'; e.target.setAttribute('aria-pressed', v); return v; };
  on('[data-theme-select]', 'change', e => { root.dataset.theme = e.target.value; });
  on('[data-scale]', 'change', e => root.style.setProperty('--scale', e.target.value));
  on('[data-state]', 'change', e => document.querySelectorAll('.screen[data-state]').forEach(s => s.dataset.state = e.target.value));
  document.querySelectorAll('[data-extra]').forEach(s => s.addEventListener('change', e => { root.dataset[e.target.dataset.extra] = e.target.value; }));
  on('[data-toggle="stress"]', 'click', e => {
    const v = toggle(e); document.body.classList.toggle('stress', v);
    // Elements marked data-stress="para|url|token|word|code|emoji|arabic|french" swap their text.
    document.querySelectorAll('[data-stress]').forEach(el => { if (v) { el.dataset.orig = el.dataset.orig ?? el.textContent; el.textContent = STRESS[el.dataset.stress] ?? el.textContent; } else if (el.dataset.orig !== undefined) el.textContent = el.dataset.orig; });
    if (document.body.classList.contains('grid')) audit();
  });

  // 4. Motion player: a .scene walks its data-steps ("name ms, name ms, …"), scaled by --motion.
  const motion = () => parseFloat(getComputedStyle(root).getPropertyValue('--motion')) || 1;
  const wait = ms => new Promise(r => setTimeout(r, ms * motion()));
  const firstStep = s => s.dataset.steps.split(',')[0].trim().split(/\s+/)[0];
  async function play(scene) {
    if (scene.dataset.playing) return; scene.dataset.playing = '1';
    const steps = scene.dataset.steps.split(',').map(s => s.trim().split(/\s+/));
    // Reset without animating, so a replay starts from the first frame instead of rewinding.
    scene.style.setProperty('--motion', 0.001); scene.dataset.step = steps[0][0]; scene.offsetHeight; scene.style.removeProperty('--motion');
    for (const [name, ms] of steps) { scene.dataset.step = name; scene.querySelectorAll('.rise').forEach(el => { el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; }); await wait(+ms || 0); }
    delete scene.dataset.playing;
  }
  const scenes = document.querySelectorAll('.scene');
  const seen = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { seen.unobserve(e.target); play(e.target); } }), { threshold: .35 });
  scenes.forEach(s => { s.dataset.step = firstStep(s); seen.observe(s); });
  document.querySelectorAll('.frame-wrap').forEach(w => {
    const s = w.querySelector('.scene'); if (!s) return;
    let b = w.querySelector('.replay');
    if (!b) { b = document.createElement('button'); b.className = 'replay'; b.textContent = 'Replay'; w.querySelector('.cap')?.after(b) ?? w.append(b); }
    b.addEventListener('click', () => play(s));
  });
  on('[data-replay-all]', 'click', () => scenes.forEach(play));
  on('[data-toggle="slow"]', 'click', e => root.style.setProperty('--motion', toggle(e) ? 4 : 1));

  // 5. Alignment audit: inside each screen, an element whose left (or right) edge sits 1–3 px from
  // another's is a near miss (two keylines that should be one). Heuristic: it flags, the eye decides.
  function audit() {
    const misses = [];
    document.querySelectorAll('.misaligned, .misaligned-v, .collides').forEach(el => el.classList.remove('misaligned', 'misaligned-v', 'collides'));
    document.querySelectorAll('.screen').forEach(screen => {
      const box = screen.getBoundingClientRect();
      const els = [...screen.querySelectorAll('h1,h2,h3,h4,p,.card,.pill,.cta,.section-title,button,svg,img,[data-align]')]
        .filter(el => el.getClientRects().length && !el.closest('.navbar,.status'));
      // Left edges and right edges are checked separately: a trailing icon and a "See all" link
      // must share the right keyline as surely as titles share the left one.
      for (const [side, edge] of [['left', r => r.left - box.left], ['right', r => box.right - r.right]]) {
        const xs = els.map(el => [el, Math.round(edge(el.getBoundingClientRect()))]);
        xs.forEach(([el, x]) => {
          const o = xs.find(([p, y]) => p !== el && Math.abs(x - y) >= 1 && Math.abs(x - y) <= 3);
          if (o) { el.classList.add('misaligned'); misses.push({ section: el.closest('section')?.id || '', side, x, near: o[1], text: (el.textContent || el.tagName).trim().slice(0, 40) }); }
        });
      }
      // Vertical: an icon, a badge or a dot sitting on a line of text must share its center with
      // the text's first line (the "lotus trop bas", "cadenas trop bas", "le 1 trop bas" defect).
      const glyphs = [...screen.querySelectorAll('svg, img, .badge, .dot, [data-icon]')]
        .filter(g => g.getClientRects().length && !g.closest('.status,.navbar') && !g.closest('svg:not(:scope)') && !g.hasAttribute('data-deco'));
      glyphs.forEach(g => {
        const gr = g.getBoundingClientRect(); if (gr.height < 6 || gr.height > 64) return;
        const row = g.parentElement; if (!row) return;
        for (const sib of row.childNodes) {
          if (sib === g || (sib.nodeType === 1 && sib.contains(g))) continue;
          const tn = sib.nodeType === 3 ? sib : (sib.nodeType === 1 && !sib.querySelector('svg,img') ? [...sib.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()) : null);
          if (!tn || !tn.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(tn);
          const line = range.getClientRects()[0]; if (!line) continue;
          if (line.bottom < gr.top || line.top > gr.bottom) continue; // not on the same line
          const d = Math.round(((gr.top + gr.bottom) - (line.top + line.bottom)) / 2 * 2) / 2;
          if (Math.abs(d) >= 1.5) { g.classList.add('misaligned-v'); misses.push({ section: g.closest('section')?.id || '', side: 'vertical', offset: d, text: tn.textContent.trim().slice(0, 40) }); }
          break;
        }
      });
      // Collisions: a decoration (data-deco: waves, halos, watermarks) keeps 8 px from any text.
      const texts = [...screen.querySelectorAll('h1,h2,h3,h4,p,span,b,strong,button,.cta,.pill')].filter(t => t.getClientRects().length && t.textContent.trim() && !t.closest('.status'));
      screen.querySelectorAll('[data-deco]').forEach(dk => {
        const r = dk.getBoundingClientRect();
        const hit = texts.find(t => { if (dk.contains(t) || t.contains(dk)) return false; const q = t.getBoundingClientRect(); return q.left < r.right + 8 && q.right > r.left - 8 && q.top < r.bottom + 8 && q.bottom > r.top - 8; });
        if (hit) { dk.classList.add('collides'); misses.push({ section: dk.closest('section')?.id || '', side: 'collision', text: hit.textContent.trim().slice(0, 40) }); }
      });
    });
    const out = document.querySelector('[data-audit]');
    if (out) out.textContent = misses.length ? misses.length + ' near-miss edges' : 'edges aligned';
    return misses;
  }
  on('[data-toggle="grid"]', 'click', e => {
    const v = toggle(e); document.body.classList.toggle('grid', v);
    if (v) audit(); else { const out = document.querySelector('[data-audit]'); if (out) out.textContent = ''; }
  });

  on('[data-toggle="squint"]', 'click', e => document.body.classList.toggle('squint', toggle(e)));

  // 6. Self-check for the browser tool: completeness of every option, without a screenshot.
  window.mockupAudit = audit;
  window.mockupReport = () => {
    const sections = [...document.querySelectorAll('section.option[id^="option-"]')].map(s => ({
      id: s.id,
      frames: s.querySelectorAll('.frame-wrap').length,
      dark: s.querySelectorAll('.frame-wrap.theme-dark, .frame-wrap.theme-black').length,
      scenes: s.querySelectorAll('.scene').length,
      storyboards: s.querySelectorAll('.storyboard').length,
      overflow: Math.round(s.scrollWidth - s.clientWidth),
    }));
    return {
      showcase: !!document.querySelector('.showcase'),
      // Blocks with nothing visible inside: a card or a [data-block] with no text and no image.
      emptyBlocks: [...document.querySelectorAll('.screen .card, .screen [data-block]')].filter(b => b.getClientRects().length && !b.textContent.trim() && !b.querySelector('img, svg, canvas')).map(b => (b.closest('section')?.id || '') + ':' + (b.previousElementSibling?.textContent || '').trim().slice(0, 30)),
      sections,
      missing: sections.filter(s => !s.dark || !s.scenes || !s.storyboards).map(s => s.id + ':' + [!s.dark && 'dark', !s.scenes && 'motion', !s.storyboards && 'storyboard'].filter(Boolean).join('+')),
      ...(() => { const m = audit(); return { nearMisses: m.filter(x => x.side === 'left' || x.side === 'right').length, verticalMisses: m.filter(x => x.side === 'vertical').length, collisions: m.filter(x => x.side === 'collision').length }; })(),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  };
})();
