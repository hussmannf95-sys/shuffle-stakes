/* Shuffle Stakes – patch.js v11 */
(function () {

  // FIX: gleiche Key-Logik wie die App (kein lowercase, ß bleibt)
  function userKey(name) {
    return name ? name.trim().replace(/\s+/g, '_') : null;
  }

  function fbRef(path) { return firebase.database().ref(path); }

  let OR_CFG = {};
  fbRef('shufflecup2026_betting/outright_cfg').once('value', snap => {
    OR_CFG = snap.val() || {};
  });

  function getOrContainer() {
    let el = document.getElementById('or-bets-panel');
    if (el) return el;
    const list = document.getElementById('myBetsList');
    if (!list) return null;
    el = document.createElement('div');
    el.id = 'or-bets-panel';
    list.parentNode.insertBefore(el, list);
    return el;
  }

  function injectOrBets() {
    if (!window.S || !S.user) return;
    const picks = S.myOrPicks || {};
    const pending = Object.entries(picks).filter(([, p]) => p && !p.settled);
    console.log('[patch v11] injectOrBets — pending:', pending.length);
    if (!pending.length) return;
    const panel = getOrContainer();
    if (!panel) return;
    panel.innerHTML = '';
    pending.forEach(([qid, pick]) => {
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
      panel.appendChild(row);
    });
    console.log('[patch v11] injected', pending.length, 'OR row(s)');
  }
  window._patchInject = injectOrBets;

  function _tryWrapRenderMyBets() {
    if (typeof window.renderMyBets === 'function' && !window.renderMyBets._patched) {
      const _orig = window.renderMyBets;
      window.renderMyBets = function () {
        const r = _orig.apply(this, arguments);
        setTimeout(injectOrBets, 0);
        return r;
      };
      window.renderMyBets._patched = true;
      console.log('[patch v11] renderMyBets wrapped');
    }
  }

  let _listenerActive = false;
  function _setupOrPicksListener() {
    if (_listenerActive) return;
    const key = userKey(S.user); // FIX: userKey statt sk
    if (!key) return;
    _listenerActive = true;
    fbRef('shufflecup2026_betting/outright_picks/' + key)
      .on('value', snap => {
        S.myOrPicks = snap.val() || {};
        console.log('[patch v11] picks loaded:', JSON.stringify(S.myOrPicks));
        injectOrBets();
      });
    console.log('[patch v11] listener for key:', key);
  }

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

  setInterval(() => {
    _tryWrapRenderMyBets();
    _tryWrapOrPlaceBet();
    if (!window.S || !S.user) return;
    if (!_listenerActive) _setupOrPicksListener();
    const picks = S.myOrPicks || {};
    const pending = Object.values(picks).filter(p => p && !p.settled);
    const panel = document.getElementById('or-bets-panel');
    if (pending.length > 0 && (!panel || panel.children.length === 0)) {
      injectOrBets();
    }
  }, 500);

  console.log('[patch v11] loaded');
})();
