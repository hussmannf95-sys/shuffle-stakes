/* Shuffle Stakes – patch.js v9 */
(function () {

  function sk(name) {
    return name ? name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : null;
  }

  function fbRef(path) { return firebase.database().ref(path); }

  let OR_CFG = {};
  fbRef('shufflecup2026_betting/outright_cfg').once('value', snap => {
    OR_CFG = snap.val() || {};
  });

  /* ── Inject ──────────────────────────────────────────────────────── */
  function injectOrBets() {
    if (!window.S || !S.user) return;
    const picks = S.myOrPicks || {};
    if (!Object.keys(picks).length) return;
    const container = document.getElementById('myBetsList');
    if (!container) return;

    // Empty-State entfernen falls vorhanden
    container.querySelectorAll('.empty').forEach(el => el.remove());
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
    console.log('[patch v9] injected', Object.keys(picks).filter(k => !picks[k].settled).length, 'OR row(s)');
  }
  window._patchInject = injectOrBets; // Debug-Zugang

  /* ── renderMyBets wrappen ───────────────────────────────────────── */
  function _tryWrapRenderMyBets() {
    if (typeof window.renderMyBets === 'function' && !window.renderMyBets._patched) {
      const _orig = window.renderMyBets;
      window.renderMyBets = function () {
        const r = _orig.apply(this, arguments);
        setTimeout(injectOrBets, 0);
        return r;
      };
      window.renderMyBets._patched = true;
      console.log('[patch v9] renderMyBets wrapped');
    }
  }

  /* ── Firebase-Listener für OR-Picks ────────────────────────────── */
  let _listenerActive = false;
  function _setupOrPicksListener() {
    if (_listenerActive) return;
    const key = sk(S.user);
    if (!key) return;
    _listenerActive = true;
    fbRef('shufflecup2026_betting/outright_picks/' + key)
      .on('value', snap => {
        S.myOrPicks = snap.val() || {};
        injectOrBets();
      });
    console.log('[patch v9] OR listener set up for', key);
  }

  /* ── orPlaceBet wrappen ─────────────────────────────────────────── */
  function _tryWrapOrPlaceBet() {
    if (typeof window.orPlaceBet === 'function' && !window.orPlaceBet._patched) {
      const _orig = window.orPlaceBet;
      window.orPlaceBet = async function (qid, pick, amount, odds) {
        const result = await _orig.apply(this, arguments);
        if (!S.myOrPicks) S.myOrPicks = {};
        S.myOrPicks[qid] = { pick, amount, odds, placedAt: Date.now(), settled: false, won: false };
        injectOrBets();
        return result;
      };
      window.orPlaceBet._patched = true;
    }
  }

  /* ── MutationObserver auf #myBetsList ──────────────────────────── */
  let _cObs = null;
  function _attachContainerObs() {
    const container = document.getElementById('myBetsList');
    if (!container) return;
    if (_cObs) { _cObs.disconnect(); _cObs = null; }
    _cObs = new MutationObserver(() => {
      if (container.querySelectorAll('.or-injected-row').length === 0) {
        _cObs.disconnect();
        injectOrBets();
        setTimeout(() => { if (_cObs) _cObs.observe(container, { childList: true }); }, 0);
      }
    });
    _cObs.observe(container, { childList: true });
  }

  /* ── Haupt-Poll: läuft UNBEGRENZT alle 500ms ────────────────────── */
  // Kein Timeout – deckt späten Login (manuell) sicher ab
  setInterval(() => {
    _tryWrapRenderMyBets();
    _tryWrapOrPlaceBet();

    if (!window.S || !S.user) return;

    // Firebase-Listener beim ersten User-Fund starten
    if (!_listenerActive) _setupOrPicksListener();

    // Container-Observer ggf. (neu) anhängen
    const container = document.getElementById('myBetsList');
    if (container) {
      if (!_cObs) _attachContainerObs();
      // Wenn OR-Picks da aber keine injected Rows → inject
      const picks = S.myOrPicks || {};
      const pending = Object.values(picks).filter(p => p && !p.settled);
      if (pending.length > 0 && container.querySelectorAll('.or-injected-row').length === 0) {
        injectOrBets();
      }
    }
  }, 500);

  console.log('[patch v9] loaded');
})();
