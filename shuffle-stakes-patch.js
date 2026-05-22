/* Shuffle Stakes – patch.js v16 */
(function () {

  /* ── PIN Gate ────────────────────────────────────────────────────── */
  const CORRECT_PIN = 'oslo';

  function _showPinGate() {
    const overlay = document.createElement('div');
    overlay.id = 'pin-gate-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,15,30,0.97);z-index:999999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:36px 32px;width:320px;display:flex;flex-direction:column;gap:16px;text-align:center;">
        <div style="font-size:28px;">🏆</div>
        <div style="color:#f5c842;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Shuffle Stakes</div>
        <div style="color:#aaa;font-size:13px;">Enter the event password to continue</div>
        <input id="pin-input" type="password" placeholder="Password..."
          style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:12px 16px;color:white;font-size:16px;outline:none;width:100%;box-sizing:border-box;text-align:center;letter-spacing:2px;" />
        <div id="pin-error" style="color:#ff6b6b;font-size:12px;min-height:16px;"></div>
        <button id="pin-ok"
          style="background:#f5c842;color:#1a1a2e;border:none;border-radius:8px;padding:12px;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;width:100%;">
          Enter
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    const input   = overlay.querySelector('#pin-input');
    const okBtn   = overlay.querySelector('#pin-ok');
    const errMsg  = overlay.querySelector('#pin-error');

    input.focus();

    const attempt = () => {
      if (input.value.trim().toLowerCase() === CORRECT_PIN) {
        sessionStorage.setItem('ss_auth', '1');
        overlay.remove();
        console.log('[patch v16] PIN accepted');
      } else {
        errMsg.textContent = 'Wrong password — try again.';
        input.value = '';
        input.focus();
      }
    };

    okBtn.addEventListener('click', attempt);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  }

  function _initPinGate() {
    if (sessionStorage.getItem('ss_auth') === '1') {
      console.log('[patch v16] PIN already verified this session');
      return;
    }
    // Wait for body, then show gate
    if (document.body) {
      _showPinGate();
    } else {
      document.addEventListener('DOMContentLoaded', _showPinGate);
    }
  }

  _initPinGate();

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function userKey(name) {
    return name ? name.trim().replace(/\s+/g, '_') : null;
  }
  function fbRef(path) { return firebase.database().ref(path); }

  let OR_CFG = {};
  fbRef('shufflecup2026_betting/outright_cfg').once('value', snap => {
    OR_CFG = snap.val() || {};
  });

  /* ── Manueller Login: Button abfangen ───────────────────────────── */
  function _patchManualLoginButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.toLowerCase().includes('enter name manually'));
    if (!btn || btn._patched) return;
    btn._patched = true;
    btn.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:32px;width:320px;display:flex;flex-direction:column;gap:16px;">
          <div style="color:#f5c842;font-size:12px;letter-spacing:2px;text-transform:uppercase;">✏️ Enter Name Manually</div>
          <input id="patch-name-input" type="text" placeholder="Your name..."
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:12px 16px;color:white;font-size:16px;outline:none;width:100%;box-sizing:border-box;" />
          <button id="patch-name-ok"
            style="background:#f5c842;color:#1a1a2e;border:none;border-radius:8px;padding:12px;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;width:100%;">
            Confirm
          </button>
          <button id="patch-name-cancel"
            style="background:transparent;color:#aaa;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;font-size:13px;cursor:pointer;width:100%;">
            Cancel
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
      const input   = overlay.querySelector('#patch-name-input');
      const okBtn   = overlay.querySelector('#patch-name-ok');
      const cancelBtn = overlay.querySelector('#patch-name-cancel');
      input.focus();
      const confirm = () => {
        const val = input.value.trim();
        document.body.removeChild(overlay);
        if (val && typeof login === 'function') login(val);
      };
      const cancel = () => document.body.removeChild(overlay);
      okBtn.addEventListener('click', confirm);
      cancelBtn.addEventListener('click', cancel);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') cancel();
      });
    }, true);
    console.log('[patch v16] manual login button patched');
  }

  /* ── OR Bets Panel ───────────────────────────────────────────────── */
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
    if (typeof S === 'undefined' || !S.user) return;
    const picks = S.myOrPicks || {};
    const pending = Object.entries(picks).filter(([, p]) => p && !p.settled);
    console.log('[patch v16] injectOrBets — pending:', pending.length);
    if (!pending.length) return;
    const panel = getOrContainer();
    if (!panel) return;
    panel.innerHTML = '';
    const emptyEl = document.querySelector('#myBetsList .empty p, #myBetsList p');
    if (emptyEl && emptyEl.textContent.includes("haven't placed")) {
      emptyEl.textContent = "No match bets yet — your outright bets are shown above.";
    }
    pending.forEach(([qid, pick]) => {
      const LABELS = { q1_overall: 'Overall Winner 🏆' };
      const label = (OR_CFG[qid] && OR_CFG[qid].label) || LABELS[qid] || qid;
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
    console.log('[patch v16] injected', pending.length, 'OR row(s)');
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
      console.log('[patch v16] renderMyBets wrapped');
    }
  }

  let _listenerActive = false;
  function _setupOrPicksListener() {
    if (_listenerActive) return;
    const key = userKey(S.user);
    if (!key) return;
    _listenerActive = true;
    fbRef('shufflecup2026_betting/outright_picks/' + key)
      .on('value', snap => {
        S.myOrPicks = snap.val() || {};
        injectOrBets();
      });
    console.log('[patch v16] listener for key:', key);
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
    _patchManualLoginButton();
    if (typeof S === 'undefined' || !S.user) return;
    if (!_listenerActive) _setupOrPicksListener();
    const picks = S.myOrPicks || {};
    const pending = Object.values(picks).filter(p => p && !p.settled);
    const panel = document.getElementById('or-bets-panel');
    if (pending.length > 0 && (!panel || panel.children.length === 0)) {
      injectOrBets();
    }
  }, 500);

  console.log('[patch v16] loaded');
})();
