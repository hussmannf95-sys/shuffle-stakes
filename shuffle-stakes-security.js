'use strict';
const ShuffleAuth = (() => {

  /* ── Config ── */
  const DB        = 'https://shufflecup2026-default-rtdb.europe-west1.firebasedatabase.app';
  const USERS_PATH = 'shufflecup2026_betting/users';
  const SESSION   = 'ss_session_v1';
  const LOCK      = 'ss_admin_lock_v1';
  const SESSION_H = 8;
  const MAX_FAIL  = 5;
  const LOCK_MS   = 10 * 60 * 1000;

  /* ── Crypto ── */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ── Firebase REST ── */
  function fbKey(name) {
    return encodeURIComponent(name.replace(/\s+/g, '_'));
  }

  async function fbRead(path) {
    const r = await fetch(`${DB}/${path}.json`);
    if (!r.ok) throw new Error('Firebase read ' + r.status);
    return r.json(); // null wenn nicht vorhanden
  }

  async function fbWrite(path, value) {
    const r = await fetch(`${DB}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if (!r.ok) throw new Error('Firebase write ' + r.status);
  }

  async function fbDelete(path) {
    const r = await fetch(`${DB}/${path}.json`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Firebase delete ' + r.status);
  }

  /* ── Session (bleibt lokal – nur "wer ist auf diesem Gerät eingeloggt") ── */
  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION));
      if (!s || Date.now() > s.exp) { localStorage.removeItem(SESSION); return null; }
      return s;
    } catch { return null; }
  }

  function saveSession(name) {
    localStorage.setItem(SESSION, JSON.stringify({
      name, exp: Date.now() + SESSION_H * 3_600_000
    }));
  }

  /* ── Dialog ── */
  function pinDialog({ title, body, confirmLabel, withRepeat }) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99999;display:flex;align-items:center;justify-content:center';
      ov.innerHTML = `
        <div style="background:#12192b;border:1px solid #f5a623;border-radius:12px;padding:1.8rem 2rem;min-width:300px;max-width:88vw;color:#e8e8e8;font-family:inherit;box-shadow:0 8px 32px #000b">
          <div style="font-size:1.15rem;font-weight:700;color:#f5a623;margin-bottom:.5rem">${title}</div>
          <div style="font-size:.88rem;color:#bbb;margin-bottom:1rem;white-space:pre-line;line-height:1.5">${body}</div>
          <input id=_p1 type=password maxlength=20 placeholder="PIN"
            style="width:100%;padding:.55rem .8rem;margin:.3rem 0 .8rem;border-radius:6px;border:1px solid #f5a623;background:#0a1020;color:#fff;font-size:1rem;box-sizing:border-box"
            autocomplete=new-password>
          ${withRepeat ? `<input id=_p2 type=password maxlength=20 placeholder="PIN wiederholen / Repeat PIN"
            style="width:100%;padding:.55rem .8rem;margin:.3rem 0 .8rem;border-radius:6px;border:1px solid #f5a623;background:#0a1020;color:#fff;font-size:1rem;box-sizing:border-box"
            autocomplete=new-password>` : ''}
          <div id=_err style="color:#ff5555;font-size:.82rem;min-height:1.1em;margin-bottom:.6rem"></div>
          <div style="display:flex;gap:.6rem;justify-content:flex-end">
            <button id=_cancel style="padding:.5rem 1.2rem;border-radius:6px;border:1px solid #555;background:transparent;color:#aaa;cursor:pointer">Abbrechen / Cancel</button>
            <button id=_ok style="padding:.5rem 1.2rem;border-radius:6px;border:none;background:#f5a623;color:#000;font-weight:700;cursor:pointer">${confirmLabel}</button>
          </div>
        </div>`;

      document.body.appendChild(ov);
      const p1  = ov.querySelector('#_p1');
      const p2  = ov.querySelector('#_p2');
      const err = ov.querySelector('#_err');
      const close = v => { document.body.removeChild(ov); resolve(v); };

      ov.querySelector('#_cancel').onclick = () => close(null);
      ov.querySelector('#_ok').onclick = () => {
        const v = p1.value.trim();
        if (v.length < 3) { err.textContent = 'Mindestens 3 Zeichen / Min. 3 characters'; return; }
        if (withRepeat && p2 && p2.value.trim() !== v) {
          err.textContent = 'PINs stimmen nicht überein / PINs do not match';
          p2.value = ''; return;
        }
        close(v);
      };
      p1.addEventListener('keydown', e => {
        if (e.key === 'Enter') withRepeat && p2 ? p2.focus() : ov.querySelector('#_ok').click();
      });
      p2?.addEventListener('keydown', e => { if (e.key === 'Enter') ov.querySelector('#_ok').click(); });
      setTimeout(() => p1.focus(), 80);
    });
  }

  /* ── loginAs – Kernlogik ── */
  async function loginAs(name) {
    // Bereits auf diesem Gerät eingeloggt?
    const s = getSession();
    if (s && s.name === name) return true;

    const hashPath = `${USERS_PATH}/${fbKey(name)}/pinHash`;
    let storedHash = null;

    try {
      storedHash = await fbRead(hashPath);
    } catch {
      _toast('Verbindungsfehler / Connection error', 'error');
      return false;
    }

    if (storedHash) {
      // ── PIN bereits gesetzt → abfragen ──
      const pin = await pinDialog({
        title       : '🔒 Anmelden / Sign in',
        body        : `Hallo ${name}!\nBitte deinen PIN eingeben.\n\nHi ${name}!\nPlease enter your PIN.`,
        confirmLabel: 'Anmelden / Sign in'
      });
      if (!pin) return false;

      const hash = await sha256(`${name}:${pin}`);
      if (hash !== storedHash) {
        _toast('Falscher PIN / Wrong PIN', 'error');
        return false;
      }
    } else {
      // ── Noch kein PIN → neu setzen ──
      const pin = await pinDialog({
        title       : '🔑 PIN festlegen / Set PIN',
        body        : `Hallo ${name}!\nSetze einen PIN für deinen Account.\nDu brauchst ihn bei jedem Login.\n\nHi ${name}!\nSet a PIN for your account.\nYou will need it on every login.`,
        confirmLabel: 'PIN setzen / Set PIN',
        withRepeat  : true
      });
      if (!pin) return false;

      const hash = await sha256(`${name}:${pin}`);
      try {
        await fbWrite(hashPath, hash);
      } catch {
        _toast('PIN konnte nicht gespeichert werden / Could not save PIN', 'error');
        return false;
      }
    }

    saveSession(name);
    return true;
  }

  /* ── Admin: PIN eines Users zurücksetzen ── */
  async function adminResetPin(name) {
    await fbDelete(`${USERS_PATH}/${fbKey(name)}/pinHash`);
  }

  /* ── currentUser / logout ── */
  function currentUser() { return getSession()?.name ?? null; }
  function logout()      { localStorage.removeItem(SESSION); }

  /* ── Admin-Lockout ── */
  function _getLock() { try { return JSON.parse(localStorage.getItem(LOCK)); } catch { return null; } }
  function adminIsLocked() {
    const l = _getLock();
    if (!l) return false;
    if (Date.now() > l.until) { localStorage.removeItem(LOCK); return false; }
    return true;
  }
  function adminLockRemainingMs() { return Math.max(0, (_getLock()?.until ?? 0) - Date.now()); }
  function adminFailed() {
    const l = _getLock() ?? { fails: 0, until: 0 };
    l.fails++;
    if (l.fails >= MAX_FAIL) l.until = Date.now() + LOCK_MS;
    localStorage.setItem(LOCK, JSON.stringify(l));
  }
  function adminSucceeded() { localStorage.removeItem(LOCK); }

  /* ── Admin-PIN Crypto ── */
  async function verifyAdminPin(pin, hash) {
    if (await sha256(pin) !== hash) throw new Error('Wrong PIN');
  }
  async function generateAdminPinHash(pin) { return sha256(pin); }

  /* ── Interner Toast-Fallback ── */
  function _toast(msg, type) {
    typeof toast === 'function' ? toast(msg, type) : alert(msg);
  }

  return {
    loginAs, currentUser, logout,
    adminResetPin,
    adminFailed, adminSucceeded, adminIsLocked, adminLockRemainingMs,
    verifyAdminPin, generateAdminPinHash
  };
})();
