/* Shuffle Stakes – patch.js v8 */
(function () {
  const POLL = 1000;

  function sk(name) {
    return name ? name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : null;
  }

  function waitFor(check, cb, interval, maxMs) {
    interval = interval || 300; maxMs = maxMs || 15000;
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += interval;
      if (check()) { clearInterval(t); cb(); }
      else if (elapsed >= maxMs) clearInterval(t);
    }, interval);
  }

  function fbRef(path) { return firebase.database().ref(path); }

  let OR_CFG = {};
  fbRef('shufflecup2026_betting/outright_cfg').once('value', snap => {
    OR_CFG = snap.val() || {};
  });

  function injectOrBets() {
    if (!window.S || !S.user) return;
    const picks = S.myOrPicks || {};
    if (!Object.keys(picks).length) return;
    const container = document.getElementById('myBetsList');
    if (!container) return;
    container.querySelectorAll('.or-injected-row').forEach(el => el.remove());
    Object.entries(picks).forEach(([qid, pick]) => {
      if (!pick || pick.settled) return;
      const label = (OR_CFG[qid] && OR_CFG[qid].label) || qid;
      const pot = Math.round(pick.amount * pick.odds);
      const row = document.createElement('div');
      row.className = 'bet-item pending or-injected-row';
      row.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;';
      row.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="color:#f5c842;">🎯</span>
            <span style="font-weight:600;">${pick.pick}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span style="font-size:11px;background:#1a3a5c;color:#4a9eff;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.5px;">PENDING</span>
          <span style="font-size:12px;color:#aaa;">${pick.amount}🪙 · ${pick.odds}x → pot. ${pot}🪙</span>
        </div>
      `;
      container.prepend(row);
    });
    console.log('[patch v8] injected', Object.keys(picks).length, 'OR row(s)');
  }

  /* ── Container-Observer: direkt auf #myBetsList ─────────────────── */
  let _cObs = null;

  function _attachContainerObs() {
    const container = document.getElementById('myBetsList');
    if (!container) return;
    if (_cObs) _cObs.disconnect();

    _cObs = new MutationObserver(() => {
      // Nur reagieren wenn UNSERE Rows verschwunden sind
      if (container.querySelectorAll('.or-injected-row').length === 0) {
        _cObs.disconnect();          // Feedback-Loop verhindern
        injectOrBets();
        setTimeout(() => {           // Nach dem Inject wieder beobachten
          if (_cObs) _cObs.observe(container, { childList: true });
        }, 0);
      }
    });

    _cObs.observe(container, { childList: true });
    injectOrBets(); // Sofort beim Attach injizieren
  }

  function _watchMyBets() {
    // Body-Observer: falls #myBetsList beim Tab-Wechsel komplett neu gebaut wird
    const bodyObs = new MutationObserver(() => {
      const container = document.getElementById('myBetsList');
      if (container && container.querySelectorAll('.or-injected-row').length === 0) {
        _attachContainerObs();
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: false }); // subtree:false = schneller

    _attachContainerObs(); // Initial

    // Fallback-Poll (Sicherheitsnetz)
    setInterval(() => {
      const c = document.getElementById('myBetsList');
      if (c && c.querySelectorAll('.or-injected-row').length === 0 &&
          Object.keys(S.myOrPicks || {}).length > 0) {
        console.log('[patch v8] poll-fallback: re-injecting');
        _attachContainerObs();
      }
    }, POLL);
  }

  /* ── renderMyBets wrappen falls auf window verfügbar ────────────── */
  waitFor(() => typeof window.renderMyBets === 'function', () => {
    const _orig = window.renderMyBets;
    window.renderMyBets = function () {
      const r = _orig.apply(this, arguments);
      setTimeout(injectOrBets, 0); // Nach dem Original-Render sofort nachinjizieren
      return r;
    };
    console.log('[patch v8] renderMyBets wrapped');
  }, 300, 8000);

  /* ── orPlaceBet wrappen ──────────────────────────────────────────── */
  waitFor(() => typeof window.orPlaceBet === 'function', () => {
    const _orig = window.orPlaceBet;
    window.orPlaceBet = async function (qid, pick, amount, odds) {
      const result = await _orig.apply(this, arguments);
      if (!S.myOrPicks) S.myOrPicks = {};
      S.myOrPicks[qid] = { pick, amount, odds, placedAt: Date.now(), settled: false, won: false };
      injectOrBets();
      return result;
    };
  }, 300, 10000);

  /* ── Init ────────────────────────────────────────────────────────── */
  waitFor(() => window.S && S.user, () => {
    if (!S.myOrPicks) S.myOrPicks = {};
    fbRef('shufflecup2026_betting/outright_picks/' + sk(S.user))
      .on('value', snap => { S.myOrPicks = snap.val() || {}; injectOrBets(); });
    _watchMyBets();
  }, 500, 20000);

  console.log('[patch v8] loaded');
})();
