/**
 * =====================================================
 *  SHUFFLE STAKES — SECURITY PATCH v1.0
 * =====================================================
 *  Behebt:
 *  [1] Kein User-Schutz → 4-stellige PIN pro Spieler
 *  [2] Klartext-Passwort im Source → entfernt
 *  [3] Admin-PIN-Brute-Force → Rate-Limiting + Lockout
 *
 *  Einbindung: <script src="shuffle-stakes-security.js"></script>
 *  NACH dem Laden der App, BEVOR der User interagiert.
 * =====================================================
 */

const ShuffleAuth = (() => {
  /* ─── Konfiguration ─────────────────────────────── */
  const CFG = {
    PIN_LENGTH:        4,
    SESSION_TIMEOUT:   8 * 60 * 60 * 1000, // 8 Stunden in ms
    ADMIN_MAX_TRIES:   5,                   // Versuche bis Lockout
    ADMIN_LOCKOUT_MS:  10 * 60 * 1000,      // 10 Minuten Sperre
    STORAGE_KEY_PINS:  'ss_pins_v1',
    STORAGE_KEY_SESS:  'ss_session_v1',
    STORAGE_KEY_ADMIN: 'ss_admin_lock_v1',
  };

  /* ─── Hilfsfunktionen ────────────────────────────── */

  /** SHA-256 via Web Crypto API – gibt Hex-String zurück */
  async function sha256(text) {
    const buf  = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Liest JSON sicher aus localStorage */
  function lsGet(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  /** Schreibt JSON in localStorage */
  function lsSet(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  /* ─── PIN-Speicher ───────────────────────────────── */

  const Pins = {
    getAll() { return lsGet(CFG.STORAGE_KEY_PINS, {}); },

    exists(name) { return !!this.getAll()[name]; },

    async set(name, pin) {
      const hash = await sha256(`${name}:${pin}`);
      const all  = this.getAll();
      all[name]  = hash;
      lsSet(CFG.STORAGE_KEY_PINS, all);
    },

    async verify(name, pin) {
      const hash = await sha256(`${name}:${pin}`);
      return this.getAll()[name] === hash;
    },
  };

  /* ─── Session-Verwaltung ─────────────────────────── */

  const Session = {
    get() { return lsGet(CFG.STORAGE_KEY_SESS, null); },

    set(name) {
      lsSet(CFG.STORAGE_KEY_SESS, { name, ts: Date.now() });
    },

    clear() { localStorage.removeItem(CFG.STORAGE_KEY_SESS); },

    currentUser() {
      const s = this.get();
      if (!s) return null;
      if (Date.now() - s.ts > CFG.SESSION_TIMEOUT) { this.clear(); return null; }
      return s.name;
    },

    refresh() {
      const s = this.get();
      if (s) this.set(s.name);
    },
  };

  /* ─── Admin-Lockout ──────────────────────────────── */

  const AdminLock = {
    get() { return lsGet(CFG.STORAGE_KEY_ADMIN, { tries: 0, lockedUntil: 0 }); },
    set(val) { lsSet(CFG.STORAGE_KEY_ADMIN, val); },

    isLocked() {
      const s = this.get();
      return Date.now() < s.lockedUntil;
    },

    remainingMs() {
      return Math.max(0, this.get().lockedUntil - Date.now());
    },

    recordFail() {
      const s    = this.get();
      s.tries   += 1;
      if (s.tries >= CFG.ADMIN_MAX_TRIES) {
        s.lockedUntil = Date.now() + CFG.ADMIN_LOCKOUT_MS;
        s.tries = 0;
      }
      this.set(s);
    },

    reset() {
      this.set({ tries: 0, lockedUntil: 0 });
    },
  };

  /* ─── PIN-Dialog (UI) ────────────────────────────── */

  function buildDialog() {
    if (document.getElementById('ss-auth-overlay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #ss-auth-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        font-family: inherit;
      }
      #ss-auth-box {
        background: #1a1a2e; color: #eee;
        border-radius: 1.2rem; padding: 2rem 1.5rem;
        width: min(340px, 92vw); text-align: center;
        box-shadow: 0 8px 40px rgba(0,0,0,.6);
        border: 1px solid rgba(255,255,255,.08);
      }
      #ss-auth-title  { font-size: 1.15rem; font-weight: 700; margin-bottom: .3rem; }
      #ss-auth-sub    { font-size: .82rem; color: #aaa; margin-bottom: 1.4rem; }
      #ss-auth-dots   {
        display: flex; justify-content: center; gap: .6rem;
        margin-bottom: 1.2rem;
      }
      .ss-dot {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid #555; transition: background .15s;
      }
      .ss-dot.filled { background: #f0a500; border-color: #f0a500; }
      #ss-auth-pad    {
        display: grid; grid-template-columns: repeat(3, 1fr);
        gap: .5rem; margin-bottom: 1rem;
      }
      .ss-key {
        background: rgba(255,255,255,.06); border: none;
        color: #eee; font-size: 1.3rem; font-weight: 600;
        padding: .7rem 0; border-radius: .6rem; cursor: pointer;
        transition: background .1s;
        touch-action: manipulation;
      }
      .ss-key:active, .ss-key:hover { background: rgba(255,255,255,.15); }
      .ss-key.wide { grid-column: span 1; }
      #ss-auth-err {
        color: #e74c3c; font-size: .8rem; min-height: 1.1em;
        margin-bottom: .5rem;
      }
      #ss-auth-cancel {
        background: none; border: none; color: #777;
        cursor: pointer; font-size: .8rem; text-decoration: underline;
        padding: .3rem;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id    = 'ss-auth-overlay';
    overlay.innerHTML = `
      <div id="ss-auth-box">
        <div id="ss-auth-title"></div>
        <div id="ss-auth-sub"></div>
        <div id="ss-auth-dots">
          ${Array(CFG.PIN_LENGTH).fill('<div class="ss-dot"></div>').join('')}
        </div>
        <div id="ss-auth-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n =>
            `<button class="ss-key" data-n="${n}">${n}</button>`
          ).join('')}
          <button class="ss-key" data-n="del">⌫</button>
          <button class="ss-key" data-n="0">0</button>
          <button class="ss-key" data-n="ok">OK</button>
        </div>
        <div id="ss-auth-err"></div>
        <button id="ss-auth-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.style.display = 'none';
  }

  /**
   * Zeigt den PIN-Dialog.
   * @param {Object} opts
   * @param {string}   opts.title
   * @param {string}   opts.sub
   * @param {Function} opts.onSubmit  async (pin: string) => boolean  — true = OK
   * @param {Function} [opts.onCancel]
   */
  function showPinDialog({ title, sub, onSubmit, onCancel }) {
    buildDialog();
    const overlay = document.getElementById('ss-auth-overlay');
    const dots    = overlay.querySelectorAll('.ss-dot');
    const err     = document.getElementById('ss-auth-err');
    let   entered = '';

    document.getElementById('ss-auth-title').textContent = title;
    document.getElementById('ss-auth-sub').textContent   = sub;
    err.textContent = '';
    overlay.style.display = 'flex';

    function updateDots() {
      dots.forEach((d, i) => d.classList.toggle('filled', i < entered.length));
    }

    async function trySubmit() {
      if (entered.length < CFG.PIN_LENGTH) return;
      const ok = await onSubmit(entered);
      if (!ok) {
        err.textContent = '❌ Wrong PIN – please try again.';
        entered = '';
        updateDots();
      } else {
        overlay.style.display = 'none';
      }
    }

    // Pad-Clicks
    overlay.querySelector('#ss-auth-pad').onclick = async e => {
      const key = e.target.closest('[data-n]')?.dataset.n;
      if (!key) return;
      if (key === 'del') {
        entered = entered.slice(0, -1);
        err.textContent = '';
      } else if (key === 'ok') {
        await trySubmit();
        return;
      } else if (entered.length < CFG.PIN_LENGTH) {
        entered += key;
        if (entered.length === CFG.PIN_LENGTH) await trySubmit();
      }
      updateDots();
    };

    // Tastatur-Support
    const kbHandler = async e => {
      if (e.key >= '0' && e.key <= '9' && entered.length < CFG.PIN_LENGTH) {
        entered += e.key;
        updateDots();
        if (entered.length === CFG.PIN_LENGTH) await trySubmit();
      } else if (e.key === 'Backspace') {
        entered = entered.slice(0, -1);
        err.textContent = '';
        updateDots();
      } else if (e.key === 'Enter') {
        await trySubmit();
      } else if (e.key === 'Escape') {
        closeAndCancel();
      }
    };
    document.addEventListener('keydown', kbHandler);

    function closeAndCancel() {
      overlay.style.display = 'none';
      document.removeEventListener('keydown', kbHandler);
      onCancel?.();
    }

    document.getElementById('ss-auth-cancel').onclick = closeAndCancel;
    updateDots();
  }

  /* ─── Öffentliche API ────────────────────────────── */

  /**
   * Muss aufgerufen werden, wenn ein User auf seinen Namen klickt.
   * Gibt Promise<boolean> zurück – true wenn Login erfolgreich.
   */
  async function loginAs(name) {
    // Schon eingeloggt als dieser User?
    if (Session.currentUser() === name) return true;

    return new Promise(resolve => {
      if (!Pins.exists(name)) {
        /* Erster Login → PIN setzen */
        let firstPin = '';

        showPinDialog({
          title: `👋 Hallo ${name}`,
          sub:   'The app now requires a personal PIN. Create yours below — your existing bets and coins are safe.',
          onSubmit: async pin => {
            firstPin = pin;
            // Zweite Abfrage: Bestätigung
            return new Promise(r2 => {
              showPinDialog({
                title: '🔁 Confirm PIN',
                sub:   'Enter your PIN again to confirm.',
                onSubmit: async pinConfirm => {
                  if (pinConfirm !== firstPin) {
                    return false; // PINs don't match
                  }
                  await Pins.set(name, pinConfirm);
                  Session.set(name);
                  r2(true);
                  resolve(true);
                  return true;
                },
                onCancel: () => { r2(false); resolve(false); },
              });
              return true; // Schließe 1. Dialog
            });
          },
          onCancel: () => resolve(false),
        });

      } else {
        /* Bekannter User → PIN prüfen */
        showPinDialog({
          title: `🔐 ${name}`,
          sub:   'Enter your PIN to sign in.',
          onSubmit: async pin => {
            const ok = await Pins.verify(name, pin);
            if (ok) { Session.set(name); resolve(true); }
            return ok;
          },
          onCancel: () => resolve(false),
        });
      }
    });
  }

  /** Gibt den aktuell angemeldeten User zurück (oder null). */
  function currentUser() {
    return Session.currentUser();
  }

  /** Loggt den aktuellen User aus. */
  function logout() {
    Session.clear();
  }

  /**
   * Ersatz für die Admin-PIN-Prüfung der App.
   * @param {string} pin  Die eingegebene PIN
   * @param {string} correctHashedPin  SHA-256-Hash der richtigen Admin-PIN
   *                                   (vorher mit sha256('admin:DEINE_PIN') erzeugen)
   */
  async function verifyAdminPin(pin, correctHashedPin) {
    if (AdminLock.isLocked()) {
      const mins = Math.ceil(AdminLock.remainingMs() / 60000);
      throw new Error(`Admin gesperrt – noch ${mins} Minute(n). Zu viele Fehlversuche.`);
    }

    const hash = await sha256(`admin:${pin}`);
    if (hash === correctHashedPin) {
      AdminLock.reset();
      return true;
    }

    AdminLock.recordFail();
    const s = AdminLock.get();
    if (s.lockedUntil > Date.now()) {
      throw new Error(`Admin gesperrt für ${CFG.ADMIN_LOCKOUT_MS / 60000} Minuten!`);
    }
    const remaining = CFG.ADMIN_MAX_TRIES - s.tries;
    throw new Error(`Falsche PIN – noch ${remaining} Versuch(e).`);
  }

  /** Hilfsfunktion: SHA-256-Hash einer Admin-PIN erzeugen (Einmalig beim Setup) */
  async function generateAdminPinHash(pin) {
    return sha256(`admin:${pin}`);
  }

  return {
    loginAs, currentUser, logout, verifyAdminPin, generateAdminPinHash,
    // Admin-Lockout-Helfer (für das bestehende PIN-System in index.html)
    adminFailed()         { AdminLock.recordFail(); },
    adminSucceeded()      { AdminLock.reset(); },
    adminIsLocked()       { return AdminLock.isLocked(); },
    adminLockRemainingMs(){ return AdminLock.remainingMs(); },
  };
})();

/* ══════════════════════════════════════════════════════════
   INTEGRATION: Wie du die App anpasst
   ══════════════════════════════════════════════════════════

1. DIESES FILE einbinden (vor app.js oder am Ende von <body>):

     <script src="shuffle-stakes-security.js"></script>

2. NAME-KLICK abfangen — suche in deiner app.js die Stelle,
   wo du nach Namensklick den User setzt, z.B.:

     // VORHER:
     player.onclick = () => { currentPlayer = name; showBettingView(); };

     // NACHHER:
     player.onclick = async () => {
       const ok = await ShuffleAuth.loginAs(name);
       if (ok) { currentPlayer = name; showBettingView(); }
     };

3. MANUAL-NAME-ENTRY auch absichern:
     // nach Eingabe des manuellen Namens:
     const ok = await ShuffleAuth.loginAs(enteredName);
     if (ok) { ... }

4. ADMIN-LOGIN ersetzen — suche deine Admin-PIN-Prüfung und ersetze:

     // VORHER (unsicher – Klartext-Vergleich):
     if (pin === '20190507') { enterAdminMode(); }

     // NACHHER (sicher – Hash-Vergleich + Lockout):
     // Schritt A: Einmalig deinen neuen Admin-PIN-Hash erzeugen:
     //   console.log(await ShuffleAuth.generateAdminPinHash('DEINE_NEUE_PIN'));
     //   → in Konsole copy/pasten und unten eintragen.
     const ADMIN_HASH = 'HIER_DEN_GENERIERTEN_HASH_EINTRAGEN';
     try {
       await ShuffleAuth.verifyAdminPin(pin, ADMIN_HASH);
       enterAdminMode();
     } catch (e) {
       alert(e.message);
     }

5. OSLO-PASSWORT (App-Zugangspasswort):
   Das sollte NICHT mehr im Source-Code stehen.
   Optionen:
   a) Komplett entfernen (wenn der Turnier-Link ohnehin nur geteilt wird).
   b) Durch einen serverseitigen Lookup ersetzen (braucht Backend).
   c) Als ENV-Variable beim Build einfügen (GitHub Actions Secret).

6. AKTUELLEN USER prüfen (optional, für Validierung):
     // Bevor ein Tipp abgegeben wird, prüfen ob der richtige User eingeloggt ist:
     if (ShuffleAuth.currentUser() !== betPlayerName) {
       alert('Bitte zuerst als ' + betPlayerName + ' einloggen.');
       return;
     }

══════════════════════════════════════════════════════════ */
