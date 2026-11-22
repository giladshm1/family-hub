/* =====================================================================
 * pwa.js — "install as an app" (Android) + notifications on this device
 * ===================================================================== */

const NOTIFY_KEY = 'familyHub.notify'; // 'on' | 'off' — per-device mute switch
let deferredPrompt = null;             // Chrome's saved install prompt
let onChange = () => {};

const getPref = () => { try { return localStorage.getItem(NOTIFY_KEY); } catch { return null; } };
const setPref = (v) => { try { localStorage.setItem(NOTIFY_KEY, v); } catch {} };

export const PWA = {
  /** Register the service worker and listen for install availability. */
  init(changed) {
    if (changed) onChange = changed;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
    }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; onChange(); });
    window.addEventListener('appinstalled', () => { deferredPrompt = null; onChange(); });
  },

  canInstall: () => !!deferredPrompt,
  isInstalled: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,

  /** Show Chrome's install dialog. Returns true if the user accepted. */
  async install() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    onChange();
    return outcome === 'accepted';
  },
};

export const Notify = {
  supported: () => 'Notification' in window && 'serviceWorker' in navigator,

  /** 'on' | 'off' | 'blocked' | 'unsupported' */
  status() {
    if (!this.supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted' && getPref() !== 'off') return 'on';
    return 'off';
  },

  /** Ask for permission (must be called from a click). */
  async enable() {
    if (!this.supported()) return 'unsupported';
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') setPref('on');
    onChange();
    return this.status();
  },

  disable() { setPref('off'); onChange(); },

  /** Show a system notification (works on Android through the service worker). */
  async show(title, body, tag) {
    if (this.status() !== 'on') return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'he' });
      return true;
    } catch (err) {
      console.warn('Notification failed', err);
      return false;
    }
  },
};
