/* =====================================================================
 * app.js — app shell: screens, header, tabs, live subscriptions, boot
 * ===================================================================== */

import { APP_CONFIG, DEFAULT_MEMBERS, CARS } from './config.js';
import { Store } from './store.js';
import { Data } from './data.js';
import { Utils, avatarHtml, icon, renderIcons, Actions, Toast, Modal, friendlyError } from './ui.js';
import { WIDGETS, CarsWidget, setRerender } from './widgets.js';
import { PWA, Notify } from './pwa.js';

/* ---------------------------------------------------------------------
 * Live subscriptions — started/stopped automatically based on state
 * --------------------------------------------------------------------- */
const subs = {};
function ensureSub(key, wanted, start) {
  if (wanted && !subs[key]) subs[key] = start();
  if (!wanted && subs[key]) { subs[key](); delete subs[key]; }
}

let accessRequestedFor = null;

function syncSubscriptions() {
  const s = Store.state;
  const uid = s.authUser?.uid;
  ensureSub('owner', !!uid, () => Data.watchOwner((owner) => Store.set({ owner, ownerLoaded: true })));
  ensureSub('link', !!uid, () => Data.watchLink(uid, (link) => Store.set({ link, linkLoaded: true })));
  const linked = !!uid && !!s.link;
  ensureSub('members', linked || (!!uid && Store.isOwner()), () =>
    Data.watchMembers((members) => Store.set({ members, membersLoaded: true })));
  ensureSub('reservations', linked, () => Data.watchReservations(onReservations));
  ensureSub('shopping', linked, () => Data.watchShopping((shopping) => Store.set({ shopping })));
  ensureSub('parking', linked, () => Data.watchParking((parking) => Store.set({ parking })));
  const admin = linked && s.membersLoaded && Store.isAdmin();
  ensureSub('pending', admin, () => Data.watchPending((pending) => Store.set({ pending })));
  ensureSub('links', admin, () => Data.watchLinks((links) => Store.set({ links })));

  // Someone new signed in: ask the admins for access (once)
  if (Store.phase() === 'pending' && accessRequestedFor !== uid) {
    accessRequestedFor = uid;
    Data.requestAccess(s.authUser).catch((err) => console.error('requestAccess', err));
  }
}

/* ---------------------------------------------------------------------
 * New-booking alerts: when someone else books a car, everyone gets a
 * pop-up (in-app toast if the app is open, system notification otherwise).
 * --------------------------------------------------------------------- */
let knownReservations = null; // ids already seen; null until the first load

function onReservations(reservations) {
  const myUid = Store.state.authUser?.uid;
  if (knownReservations) {
    reservations
      .filter((r) => !knownReservations.has(r.id) && r.uid !== myUid && Date.now() - (r.createdAt || 0) < 10 * 60 * 1000)
      .forEach((r) => Store.memberById(r.memberId) ? announceBooking(r) : setTimeout(() => announceBooking(r), 1500));
  }
  knownReservations = new Set(reservations.map((r) => r.id));
  Store.set({ reservations });
}

function announceBooking(r) {
  const who = Store.memberById(r.memberId)?.name || 'מישהו';
  const car = CARS.find((c) => c.id === r.carId)?.short || 'רכב';
  const body = `${who} שריין/ה את ${car} · ${Utils.dayLabel(r.start)} ${Utils.fmtTime(r.start)}–${Utils.fmtTime(r.end)}${r.note ? ` · ${r.note}` : ''}`;
  if (document.visibilityState === 'visible') Toast.show(`🚗 ${body}`, 'info');
  else Notify.show('שריון רכב חדש 🚗', body, `res-${r.id}`);
}

/* ---------------------------------------------------------------------
 * Screens
 * --------------------------------------------------------------------- */
const logo = (size = 'w-16 h-16', iconSize = 'w-8 h-8') =>
  `<div class="inline-flex ${size} rounded-[22px] bg-gradient-to-br from-indigo-500 to-violet-500 text-white items-center justify-center shadow-xl shadow-indigo-500/30">${icon('house', iconSize)}</div>`;

const centered = (inner) => `
  <main class="min-h-screen flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-xl text-center">${inner}</div>
  </main>`;

function renderLoading() {
  return centered(`
    <div class="anim-fade-up">${logo()}</div>
    <div class="mt-6 flex justify-center"><span class="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></span></div>`);
}

function googleButton(label = 'התחברות עם Google') {
  return `
    <button data-action="auth:signin" class="inline-flex items-center justify-center gap-3 rounded-2xl bg-white border border-slate-200 px-6 py-3.5 font-bold text-slate-700 shadow-soft transition hover:shadow-lift hover:-translate-y-0.5 active:scale-[0.98]">
      <svg class="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      ${label}
    </button>`;
}

function renderSignedOut() {
  return centered(`
    <div class="anim-fade-up">${logo()}</div>
    <h1 class="anim-fade-up mt-5 text-3xl sm:text-4xl font-extrabold text-slate-900" style="animation-delay:60ms">ברוכים הבאים ל${Utils.esc(APP_CONFIG.appName)}</h1>
    <p class="anim-fade-up mt-3 text-slate-500 text-lg" style="animation-delay:120ms">טבלת הכלים, שריון הרכבים וכל מה שהמשפחה צריכה — מסונכרן לכולם.</p>
    <div class="anim-fade-up mt-9" style="animation-delay:180ms">${googleButton()}</div>
    <div class="anim-fade-up mt-10 grid grid-cols-3 gap-3 text-sm text-slate-500" style="animation-delay:240ms">
      ${[['utensils', 'ניקוד שטיפת כלים'], ['car', 'שריון רכבים'], ['refresh-cw', 'סנכרון חי']].map(([i, t]) =>
        `<div class="rounded-2xl bg-white/80 border border-white shadow-soft p-4">${icon(i, 'w-5 h-5 mx-auto text-indigo-500')}<div class="mt-2 font-semibold">${t}</div></div>`).join('')}
    </div>`);
}

function renderSetup() {
  const s = Store.state;
  const list = s.members.length ? s.members : DEFAULT_MEMBERS;
  const cards = list.map((m, i) => `
    <button data-action="setup:pick" data-member="${m.id}" ${s.busy ? 'disabled' : ''} style="--c:${Utils.alpha(m.color, 0.55)}; animation-delay:${i * 60}ms"
      class="login-card anim-fade-up group w-[calc(50%-0.5rem)] sm:w-36 flex flex-col items-center rounded-3xl border-2 border-white bg-white/90 p-5 shadow-soft outline-none transition duration-300 hover:-translate-y-1 disabled:opacity-50">
      <div class="transition duration-300 group-hover:scale-105">${avatarHtml(m, 'lg')}</div>
      <div class="mt-3 text-lg font-bold text-slate-800">${Utils.esc(m.name)}</div>
    </button>`).join('');
  return `
    <main class="min-h-screen flex items-center justify-center px-4 py-12">
      <div class="w-full max-w-4xl text-center">
        <div class="anim-fade-up">${logo()}</div>
        <h1 class="anim-fade-up mt-5 text-3xl font-extrabold text-slate-900">הגדרה ראשונה 🎉</h1>
        <p class="anim-fade-up mt-2 text-slate-500 text-lg max-w-xl mx-auto">את/ה הראשון/ה כאן, ולכן תהיה/י מנהל/ת המשפחה. מי את/ה?</p>
        <div class="mt-10 flex flex-wrap justify-center gap-4">${cards}</div>
        <p class="mt-8 text-sm text-slate-400">אפשר לשנות שמות, אימוג׳י והרשאות אחר כך במסך ״ניהול משפחה״.</p>
        <button class="mt-4 text-sm font-semibold text-slate-400 hover:text-slate-600" data-action="auth:signout">התחברות עם חשבון אחר</button>
      </div>
    </main>`;
}

function renderPending(orphan = false) {
  const u = Store.state.authUser;
  return centered(`
    <div class="card anim-fade-up !p-8">
      <span class="inline-flex w-16 h-16 rounded-[22px] bg-violet-100 text-violet-600 items-center justify-center">${icon('hourglass', 'w-8 h-8')}</span>
      <h1 class="mt-5 text-2xl font-extrabold text-slate-900">${orphan ? 'החשבון לא משויך לבן משפחה' : 'כמעט שם!'}</h1>
      <p class="mt-3 text-slate-600 leading-relaxed">${orphan ? 'בן המשפחה שהחשבון היה משויך אליו כבר לא קיים.' : 'שלחנו בקשה למנהלי המשפחה.'} ברגע שיאשרו את החשבון שלך, האפליקציה תיפתח כאן אוטומטית.</p>
      <div class="mt-6 inline-flex items-center gap-3 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-2.5">
        ${u.photoURL ? `<img src="${Utils.esc(u.photoURL)}" alt="" referrerpolicy="no-referrer" class="w-8 h-8 rounded-full" />` : ''}
        <span class="text-sm font-semibold text-slate-700" dir="ltr">${Utils.esc(u.email || '')}</span>
      </div>
      <div class="mt-6"><button class="btn-ghost" data-action="auth:signout">${icon('log-out', 'w-4 h-4')} התחברות עם חשבון אחר</button></div>
    </div>`);
}

function renderHeader(me, isAdmin) {
  return `
    <header class="sticky top-0 z-30 border-b border-white/70 bg-white/70 backdrop-blur-xl">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">${icon('house', 'w-5 h-5')}</span>
          <span class="font-extrabold text-lg text-slate-900 truncate">${Utils.esc(APP_CONFIG.appName)}</span>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-2.5 rounded-full bg-white border border-slate-100 shadow-soft py-1 pr-1 pl-3 sm:pl-4">
            ${avatarHtml(me, 'sm')}
            <div class="leading-tight">
              <div class="hidden sm:block text-[11px] text-slate-400">מחובר/ת כעת</div>
              <div class="flex items-center gap-1 font-bold text-sm text-slate-800">${Utils.esc(me.name)}
                ${isAdmin ? `<span class="text-amber-500" title="מורשה">${icon('shield-check', 'w-4 h-4')}</span>` : ''}
              </div>
            </div>
          </div>
          ${headerButtons()}
          <button class="btn-ghost" data-action="auth:signout" title="החלפת משתמש / התנתקות">${icon('repeat', 'w-4 h-4')}<span class="hidden sm:inline">החלפת משתמש</span></button>
        </div>
      </div>
    </header>`;
}

/** Install-app and notification buttons in the header. */
function headerButtons() {
  const ns = Notify.status();
  const bellTitle = { on: 'התראות פעילות — לחיצה להשתקה', off: 'הפעלת התראות על שריון רכב', blocked: 'ההתראות חסומות בהגדרות הדפדפן' }[ns];
  const bell = ns === 'unsupported' ? ''
    : `<button class="btn-ghost !px-2.5 ${ns === 'on' ? '!text-indigo-600 !border-indigo-200' : ''}" data-action="notify:toggle" title="${bellTitle}" aria-label="${bellTitle}">${icon(ns === 'on' ? 'bell-ring' : 'bell-off', 'w-4 h-4')}</button>`;
  const install = PWA.canInstall()
    ? `<button class="btn-ghost !px-2.5 sm:!px-3.5" data-action="pwa:install" title="התקנה כאפליקציה">${icon('download', 'w-4 h-4')}<span class="hidden sm:inline">התקנה</span></button>`
    : '';
  return install + bell;
}

/** One-time invitation to turn on booking notifications on this device. */
function notifyBanner() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('familyHub.notifyAsked') === '1'; } catch {}
  if (Notify.status() !== 'off' || dismissed) return '';
  return `
    <div class="anim-fade-up mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-3xl bg-indigo-50 border border-indigo-100 p-4">
      <span class="w-11 h-11 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">${icon('bell-ring', 'w-5 h-5')}</span>
      <div class="flex-1 text-sm">
        <div class="font-bold text-slate-800">לקבל התראה כשמישהו משריין רכב?</div>
        <div class="text-slate-500">ההתראה תקפוץ במכשיר הזה.</div>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary !py-2.5" data-action="notify:toggle">הפעלה</button>
        <button class="btn-ghost" data-action="notify:dismiss">לא עכשיו</button>
      </div>
    </div>`;
}

let lastView = null; // animate only when the view/tab changes

function renderDashboard() {
  const state = Store.state;
  const me = Store.me();
  const isAdmin = Store.isAdmin();
  const ctx = { state, me, isAdmin };
  const widgets = WIDGETS.filter((w) => !w.visible || w.visible(ctx));
  const tabs = [{ id: 'overview', title: 'סקירה', icon: 'layout-dashboard' }, ...widgets.map((w) => ({ id: w.id, title: w.title, icon: w.icon }))];
  const activeTab = tabs.some((t) => t.id === state.activeTab) ? state.activeTab : 'overview';
  const view = `${me.id}:${activeTab}`;
  const animate = view !== lastView;
  lastView = view;

  const frame = (w, full, delay = 0, overview = false) => `
    <section class="card ${full ? '' : w.span} ${animate ? 'anim-fade-up' : ''}" style="animation-delay:${delay}ms" id="widget-${w.id}">
      <header class="mb-5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:${Utils.alpha(w.accent, 0.13)}; color:${w.accent}">${icon(w.icon, 'w-5 h-5')}</span>
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-slate-900">${Utils.esc(w.title)}</h2>
            <p class="text-sm text-slate-500 truncate">${Utils.esc(w.subtitle || '')}</p>
          </div>
        </div>
        ${w.headerExtra ? w.headerExtra(ctx) : ''}
      </header>
      ${overview && w.renderOverview ? w.renderOverview(ctx) : w.render(ctx)}
    </section>`;

  const content = activeTab === 'overview'
    ? `<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">${widgets.filter((w) => w.inOverview !== false).map((w, i) => frame(w, false, i * 80, true)).join('')}</div>`
    : `<div class="max-w-5xl mx-auto">${frame(widgets.find((w) => w.id === activeTab), true)}</div>`;

  const tabsHtml = `
    <nav class="no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <div class="inline-flex gap-1 rounded-2xl bg-white/80 border border-white p-1.5 shadow-soft">
        ${tabs.map((t) => `
          <button class="tab-btn ${t.id === activeTab ? 'tab-active' : ''}" data-action="nav:tab" data-tab="${t.id}">
            ${icon(t.icon, 'w-4 h-4')} ${Utils.esc(t.title)}
            ${t.id === 'family' && state.pending.length ? `<span class="w-2 h-2 rounded-full bg-violet-500"></span>` : ''}
          </button>`).join('')}
      </div>
    </nav>`;

  return `
    ${renderHeader(me, isAdmin)}
    <main class="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <div class="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div class="${animate ? 'anim-fade-up' : ''}">
          <p class="text-sm font-medium text-slate-500">${Utils.esc(Utils.fullDate())}</p>
          <h1 class="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900">${Utils.greeting()}, ${Utils.esc(me.name)} 👋</h1>
        </div>
        ${tabsHtml}
      </div>
      ${notifyBanner()}
      ${content}
      <footer class="mt-10 flex items-center justify-center gap-1.5 text-xs text-slate-400">${icon('cloud', 'w-3.5 h-3.5')} מסונכרן בזמן אמת לכל המשפחה</footer>
    </main>`;
}

/* ---------------------------------------------------------------------
 * Render (batched per animation frame; keeps focus in inputs)
 * --------------------------------------------------------------------- */
let frameRequested = false;
function renderApp() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => { frameRequested = false; renderNow(); });
}

function renderNow() {
  const phase = Store.phase();
  if (phase !== 'ready') lastView = null;
  const active = document.activeElement;
  const focusId = active && active.id && document.getElementById('app').contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  const screens = {
    loading: renderLoading, signedOut: renderSignedOut, setup: renderSetup,
    pending: () => renderPending(false), orphan: () => renderPending(true), ready: renderDashboard,
  };
  document.getElementById('app').innerHTML = (screens[phase] || renderLoading)();
  renderIcons();

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch {} }
  }
}

setRerender(renderApp);

// Register every widget's action handlers
WIDGETS.forEach((w) => Object.entries(w.actions || {}).forEach(([name, fn]) => Actions.register(name, fn)));

/* ---------------------------------------------------------------------
 * Shell actions
 * --------------------------------------------------------------------- */
Actions.register('auth:signin', async (el) => {
  el.disabled = true;
  try { await Data.signIn(); } finally { el.disabled = false; }
});

Actions.register('auth:signout', async () => {
  Modal.close();
  await Data.signOut();
});

Actions.register('setup:pick', async (el) => {
  const s = Store.state;
  if (s.busy) return;
  Store.set({ busy: true });
  try {
    await Data.claimOwnership(s.authUser, el.dataset.member, Store.isOwner());
    Toast.show('המשפחה מוכנה! 🎉');
  } catch (err) {
    console.error(err);
    Toast.show(err?.code?.includes('permission-denied') ? 'מישהו אחר כבר הגדיר את המשפחה — נשלחה בקשת הצטרפות' : friendlyError(err), 'error');
  } finally {
    Store.set({ busy: false });
  }
});

Actions.register('pwa:install', async () => {
  if (await PWA.install()) Toast.show('האפליקציה הותקנה! 🎉');
});

Actions.register('notify:toggle', async () => {
  const s = Notify.status();
  if (s === 'on') { Notify.disable(); Toast.show('ההתראות הושתקו במכשיר הזה', 'info'); return; }
  if (s === 'blocked') { Toast.show('ההתראות חסומות — אפשר לאשר אותן בהגדרות האתר בדפדפן', 'error'); return; }
  const r = await Notify.enable();
  Toast.show(r === 'on' ? 'מעולה! תקבלו התראה על כל שריון רכב' : 'ההתראות לא אושרו', r === 'on' ? 'success' : 'info');
});

Actions.register('notify:dismiss', () => {
  try { localStorage.setItem('familyHub.notifyAsked', '1'); } catch {}
  renderApp();
});

Actions.register('nav:tab', (el) => {
  Store.set({ activeTab: el.dataset.tab });
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------------------------------------------------------------------
 * Boot
 * --------------------------------------------------------------------- */
Store.subscribe(() => { syncSubscriptions(); renderApp(); });

Data.onAuth((user) => {
  Object.keys(subs).forEach((k) => { subs[k](); delete subs[k]; }); // drop the previous account's listeners
  knownReservations = null;
  Store.set({
    authReady: true, authUser: user,
    owner: null, ownerLoaded: false, link: null, linkLoaded: false,
    members: [], membersLoaded: false, reservations: [], shopping: [], parking: {}, pending: [], links: [],
  });
});

PWA.init(renderApp);
renderApp();

// Keep "free / busy" statuses fresh; avoid a full re-render while typing.
setInterval(() => {
  if (Store.phase() !== 'ready') return;
  const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
  if (typing || Modal.isOpen()) CarsWidget.refreshLive();
  else renderApp();
}, APP_CONFIG.liveRefreshMs);
