/* Shuffle Stakes – patch.js v6
   Fixes: outright picks not showing in My Bets
*/
(function () {
  const POLL = 400;

  /* ── helpers ── */
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

  /* ── Firebase ref helper ── */
  function fbRef(path) {
    return firebase.database().ref(path);
  }

  /* ── Load outright config (questions list) ── */
  let OR_CFG = {};
  fbRef('shufflecup2026_betting/outright_cfg').once('value', snap => {
    OR_CFG = snap.val() || {};
  });

  /* ── Inject outright picks into My Bets tab ── */
  function injectOrBets() {
    if (!window.S || !S.user) return;
    const picks = S.myOrPicks || {};
    if (!Object.keys(picks).length) return;

    // Find the bets list container
    const container = document.querySelector('.bets-list') || document.querySelector('[class*="bets"]');
    if (!container) return;

    // Remove previously injected outright rows
    document.querySelectorAll('.or-injected-row').forEach(el => el.remove());

    // Also update pending count badge
    let pendingCount = parseInt((document.querySelector('.tab-pending') || {}).textContent) || 0;

    Object.entries(picks).forEach(([qid, pick]) => {
      if (!pick || pick.settled) return;

      const label = (OR_CFG[qid] && OR_CFG[qid].label) || qid;
      const pot = Math.round(pick.amount * pick.odds);

      const row = document.createElement('div');
      row.className = 'bet-row or-injected-row';
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

    // Update pending badge
    const badge = document.querySelector('.tab-btn[data-tab="pending"] .count, [class*="pending"] [class*="count"]');
    if (badge) {
      const existing = parseInt(badge.textContent) || 0;
      const orPending = Object.values(picks).filter(p => p && !p.settled).length;
      // badge.textContent = existing + orPending; // only if needed
    }
  }

  /* ── Watch My Bets tab for render, then inject ── */
  function _watchMyBets() {
    // MutationObserver on bets area
    const target = document.querySelector('main') || document.body;
    let injectQueued = false;

    const obs = new MutationObserver(() => {
      if (injectQueued) return;
      injectQueued = true;
      setTimeout(() => { injectOrBets(); injectQueued = false; }, 120);
    });
    obs.observe(target, { childList: true, subtree: true });

    // Also poll as fallback
    setInterval(injectOrBets, POLL);
  }

  /* ── Setup Firebase listener for S.myOrPicks ── */
  function _setupOrPicksListener() {
    const key = sk(S.user);
    if (!key) return;
    fbRef('shufflecup2026_betting/outright_picks/' + key)
      .on('value', snap => {
        S.myOrPicks = snap.val() || {};
        injectOrBets();
      });
  }

  /* ── Patch orPlaceBet to update local state immediately ── */
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

  /* ── Boot: wait for S.user, then activate ── */
  waitFor(() => window.S && S.user, () => {
    if (!S.myOrPicks) S.myOrPicks = {};
    _setupOrPicksListener();
    _watchMyBets();
  }, 500, 20000);

  console.log('[patch v6] loaded');
})();
