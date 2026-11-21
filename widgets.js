/* =====================================================================
 * widgets.js — dashboard widgets
 * ---------------------------------------------------------------------
 * HOW TO ADD A NEW WIDGET:
 *   const MyWidget = {
 *     id: 'my-widget',          // unique; also the tab id
 *     title: 'כותרת', subtitle: 'תיאור קצר',
 *     icon: 'star',             // Lucide icon name
 *     accent: '#8B5CF6',
 *     span: 'lg:col-span-1',    // width in the 3-column overview grid
 *     visible(ctx) { return true; },   // optional (e.g. admins only)
 *     headerExtra(ctx) { ... },        // optional HTML at the header's left
 *     render(ctx) { return '...'; },   // ctx = { state, me, isAdmin }
 *     actions: { 'my:action'(el, event) { ... } },
 *   };
 *   ...then add it to WIDGETS at the bottom. Shared data goes in Firestore
 *   (data.js + firestore.rules) and is exposed through Store.state.
 * ===================================================================== */

import { CARS, NOTE_PRESETS, MEMBER_COLORS } from './config.js';
import { Store } from './store.js';
import { Data } from './data.js';
import { Utils, avatarHtml, icon, renderIcons, Toast, Modal } from './ui.js';

// Re-render hook, injected by app.js
let rerender = () => {};
export const setRerender = (fn) => { rerender = fn; };

/* ---------------------------------------------------------------------
 * 1. Dishwashing leaderboard
 * --------------------------------------------------------------------- */

const MEDALS = [
  { icon: 'trophy', bg: '#FEF3C7', fg: '#D97706', ring: '#FCD34D', label: 'מקום ראשון' },
  { icon: 'medal',  bg: '#F1F5F9', fg: '#64748B', ring: '#CBD5E1', label: 'מקום שני' },
  { icon: 'award',  bg: '#FFEDD5', fg: '#C2410C', ring: '#FDBA74', label: 'מקום שלישי' },
];

const LeaderboardWidget = {
  id: 'dishes',
  title: 'אלופי הכלים',
  subtitle: 'טבלת שטיפת הכלים המשפחתית',
  icon: 'utensils',
  accent: '#F59E0B',
  span: 'lg:col-span-1',
  _bump: null,

  headerExtra() {
    return Store.canScore()
      ? `<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2.5 py-1 text-xs font-bold">${icon('shield-check', 'w-3.5 h-3.5')} עריכה</span>`
      : `<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 px-2.5 py-1 text-xs font-bold">${icon('lock', 'w-3.5 h-3.5')} צפייה</span>`;
  },

  render({ state }) {
    const canEdit = Store.canScore();
    const scoreOf = (m) => Math.max(0, m.score || 0);
    const members = state.members.filter((m) => m.inDishes !== false)   // only members in the dishes table
      .sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name, 'he'));
    const max = Math.max(1, ...members.map(scoreOf));
    const total = members.reduce((s, m) => s + scoreOf(m), 0);
    const rankOf = (m) => 1 + members.filter((o) => scoreOf(o) > scoreOf(m)).length;
    const leader = members[0];
    const tie = members[1] && scoreOf(members[1]) === scoreOf(leader);

    const banner = total > 0
      ? `<div class="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-l from-amber-50 to-orange-50 border border-amber-100 p-3.5">
           <span class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-amber-500 shadow-sm">${icon('crown')}</span>
           <div class="flex-1 text-sm">
             <div class="font-bold text-slate-800">${tie ? 'תיקו על המקום הראשון!' : `${Utils.esc(leader.name)} בראש הטבלה`}</div>
             <div class="text-slate-500">סה״כ ${total} סבבי כלים במשפחה</div>
           </div>
         </div>`
      : `<div class="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-3.5 text-sm text-slate-500">
           ${icon('sparkles', 'w-5 h-5 text-amber-400')} עוד אין נקודות — מי יפתח את העונה?
         </div>`;

    const rows = members.map((m) => {
      const score = scoreOf(m);
      const rank = rankOf(m);
      const pct = Math.round((score / max) * 100);
      const medal = rank <= 3 && score > 0 ? MEDALS[rank - 1] : null;
      const bump = this._bump === m.id;
      const rankBadge = medal
        ? `<span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${medal.bg}; color:${medal.fg}; box-shadow: inset 0 0 0 1.5px ${medal.ring}" title="${medal.label}">${icon(medal.icon, 'w-[18px] h-[18px]')}</span>`
        : `<span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-50 text-slate-400 text-sm font-bold">${rank}</span>`;
      const controls = canEdit
        ? `<div class="flex items-center gap-1.5 shrink-0">
             <button class="score-btn bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600" data-action="score:change" data-member="${m.id}" data-delta="-1" ${score <= 0 ? 'disabled' : ''} aria-label="הורד נקודה ל${Utils.esc(m.name)}">${icon('minus', 'w-4 h-4')}</button>
             <button class="score-btn bg-emerald-500 text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-600" data-action="score:change" data-member="${m.id}" data-delta="1" aria-label="הוסף נקודה ל${Utils.esc(m.name)}">${icon('plus', 'w-4 h-4')}</button>
           </div>`
        : '';
      return `
        <li class="flex items-center gap-3 rounded-2xl p-2.5 transition ${rank === 1 && score > 0 ? 'bg-amber-50/60' : 'hover:bg-slate-50'}">
          ${rankBadge}
          ${avatarHtml(m, 'sm')}
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-semibold text-slate-800 truncate">${Utils.esc(m.name)}</span>
              <span class="text-lg font-extrabold tabular-nums text-slate-900 ${bump ? 'anim-pop' : ''}" style="display:inline-block">${score}</span>
            </div>
            <div class="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div class="bar-fill h-full rounded-full" style="width:${pct}%; background: linear-gradient(270deg, ${m.color}, ${Utils.alpha(m.color, 0.55)})"></div>
            </div>
          </div>
          ${controls}
        </li>`;
    }).join('');

    const keepers = state.members.filter((m) => m.canScore).map((m) => m.name).join(', ') || 'מנהל';
    const footer = canEdit
      ? `<p class="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">${icon('shield-check', 'w-4 h-4 shrink-0')} מצב עריכה פעיל — אפשר להוסיף או להוריד נקודות.</p>`
      : `<p class="mt-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">${icon('lock', 'w-4 h-4 shrink-0')} רק ${Utils.esc(keepers)} יכול לעדכן את הניקוד.</p>`;

    return `${banner}<ul class="space-y-1.5">${rows}</ul>${footer}`;
  },

  actions: {
    async 'score:change'(el) {
      if (!Store.canScore()) return Toast.show('אין לך הרשאה לעדכן את הניקוד', 'error');
      const m = Store.memberById(el.dataset.member);
      const delta = Number(el.dataset.delta);
      if (!m || (m.score || 0) + delta < 0) return;
      LeaderboardWidget._bump = m.id;
      setTimeout(() => { LeaderboardWidget._bump = null; }, 600);
      await Data.changeScore(m.id, delta);
      Toast.show(delta > 0 ? `נקודה ל${m.name}! 🎉` : `ירדה נקודה ל${m.name}`, delta > 0 ? 'success' : 'info');
    },
  },
};

/* ---------------------------------------------------------------------
 * 2. Car reservations
 * --------------------------------------------------------------------- */

const CarsWidget = {
  id: 'cars',
  title: 'שריון רכבים',
  subtitle: 'מי לוקח את הרכב ומתי',
  icon: 'car',
  accent: '#6366F1',
  span: 'lg:col-span-2',

  draft: null,     // booking form values (kept across re-renders)
  filter: 'all',   // list filter: 'all' | car id

  car: (id) => CARS.find((c) => c.id === id),

  defaultDraft() {
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0); // next half hour
    const date = Utils.toDateInput(start);
    const endD = new Date(start.getTime() + 60 * 60000);
    const end = Utils.toDateInput(endD) === date ? Utils.toTimeInput(endD) : '23:59';
    return { carId: CARS[0].id, date, start: Utils.toTimeInput(start), end, note: '' };
  },

  sortedFor(carId) {
    return Store.state.reservations.filter((r) => r.carId === carId).sort((a, b) => a.start - b.start);
  },

  status(carId, now = Date.now()) {
    const list = this.sortedFor(carId);
    return {
      current: list.find((r) => r.start <= now && now < r.end) || null,
      next: list.find((r) => r.start > now) || null,
    };
  },

  /** Overlap: [start, end) intersects an existing booking of the same car. */
  findConflicts(carId, start, end) {
    return this.sortedFor(carId).filter((r) => start < r.end && r.start < end);
  },

  validate() {
    const d = this.draft;
    if (!d.carId || !d.date || !d.start || !d.end) return { error: 'נא לבחור רכב, תאריך ושעות', conflicts: [] };
    const start = Utils.parseLocal(d.date, d.start);
    const end = Utils.parseLocal(d.date, d.end);
    if (Number.isNaN(start) || Number.isNaN(end)) return { error: 'התאריך או השעה אינם תקינים', conflicts: [] };
    if (end <= start) return { error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה', start, end, conflicts: [] };
    if (end <= Date.now()) return { error: 'הזמן שנבחר כבר עבר — בחרו זמן עתידי', start, end, conflicts: [] };
    return { error: null, start, end, conflicts: this.findConflicts(d.carId, start, end) };
  },

  canCancel(r) {
    const me = Store.me();
    return !!me && (r.memberId === me.id || Store.isAdmin());
  },

  headerExtra() {
    return `<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-bold tabular-nums">${icon('clock', 'w-3.5 h-3.5')} <span data-live-clock>${Utils.fmtTime(Date.now())}</span></span>`;
  },

  render(ctx) {
    if (!this.draft) this.draft = this.defaultDraft();
    return `
      <div id="car-status" class="grid sm:grid-cols-2 gap-4">${this.renderStatus()}</div>
      <div class="mt-6 grid md:grid-cols-2 gap-5">
        ${this.renderForm()}
        ${this.renderList(ctx)}
      </div>`;
  },

  renderStatus() {
    const now = Date.now();
    return CARS.map((car) => {
      const { current, next } = this.status(car.id, now);
      const who = current && Store.memberById(current.memberId);
      const badge = current
        ? `<div class="inline-flex items-center gap-2.5 rounded-2xl bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-4 py-2.5 font-bold">
             <span class="relative flex h-2.5 w-2.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70"></span><span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span></span>
             <span>תפוס ע״י ${Utils.esc(who ? who.name : 'לא ידוע')} עד שעה ${Utils.fmtTime(current.end)}</span>
           </div>
           <div class="mt-2 text-xs font-semibold text-rose-500">${Utils.remaining(current.end - now)}${current.note ? ` · ${Utils.esc(current.note)}` : ''}</div>`
        : `<div class="inline-flex items-center gap-2.5 rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-4 py-2.5 font-bold">
             <span class="relative flex h-2.5 w-2.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"></span><span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span></span>
             <span>פנוי כרגע</span>
           </div>`;
      const nextWho = next && Store.memberById(next.memberId);
      const nextLine = next
        ? `הבא בתור: ${Utils.dayLabel(next.start)} ב-${Utils.fmtTime(next.start)} · ${Utils.esc(nextWho ? nextWho.name : '')}`
        : 'אין הזמנות קרובות';
      return `
        <div class="relative overflow-hidden rounded-3xl border p-5" style="background: linear-gradient(135deg, ${Utils.alpha(car.color, 0.10)}, rgba(255,255,255,0.9) 70%); border-color: ${Utils.alpha(car.color, 0.18)}">
          <div class="absolute -left-6 -top-6 w-28 h-28 rounded-full" style="background:${Utils.alpha(car.color, 0.08)}"></div>
          <div class="relative flex items-center gap-3">
            <span class="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style="background: linear-gradient(135deg, ${car.color}, ${Utils.alpha(car.color, 0.75)}); box-shadow: 0 10px 20px -8px ${Utils.alpha(car.color, 0.7)}">${icon(car.icon, 'w-6 h-6')}</span>
            <div class="min-w-0">
              <div class="font-bold text-slate-800">${Utils.esc(car.name)}</div>
              <div class="text-xs text-slate-500">${Utils.esc(car.description)}</div>
            </div>
          </div>
          <div class="relative mt-4">${badge}</div>
          <div class="relative mt-3 flex items-center gap-1.5 text-xs text-slate-500">${icon('calendar-clock', 'w-4 h-4 shrink-0')} ${nextLine}</div>
        </div>`;
    }).join('');
  },

  renderForm() {
    const d = this.draft;
    const carButtons = CARS.map((car) => {
      const active = car.id === d.carId;
      const style = active ? `border-color:${car.color}; background:${Utils.alpha(car.color, 0.08)}; box-shadow: 0 0 0 3px ${Utils.alpha(car.color, 0.15)}` : '';
      return `
        <button type="button" data-action="booking:car" data-car="${car.id}" aria-pressed="${active}"
          class="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 text-right transition hover:border-slate-300" style="${style}">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${Utils.alpha(car.color, 0.14)}; color:${car.color}">${icon(car.icon, 'w-5 h-5')}</span>
          <span class="min-w-0">
            <span class="block text-sm font-bold text-slate-800 truncate">${Utils.esc(car.short)}</span>
            <span class="block text-[11px] text-slate-400">${active ? 'נבחר' : 'בחירה'}</span>
          </span>
        </button>`;
    }).join('');
    const presets = NOTE_PRESETS.map((n) =>
      `<button type="button" class="chip ${d.note === n ? 'chip-active' : ''}" data-action="booking:preset" data-note="${Utils.esc(n)}">${Utils.esc(n)}</button>`).join('');

    return `
      <form data-submit="booking:submit" novalidate class="rounded-3xl bg-slate-50/80 border border-slate-100 p-5 space-y-4">
        <h3 class="flex items-center gap-2 font-bold text-slate-800">${icon('calendar-plus', 'w-5 h-5 text-indigo-500')} הזמנה חדשה</h3>
        <div>
          <span class="label">בחירת רכב</span>
          <div class="grid grid-cols-2 gap-2">${carButtons}</div>
        </div>
        <div>
          <label class="label" for="bk-date">תאריך</label>
          <input id="bk-date" class="field" type="date" name="date" dir="ltr" min="${Utils.toDateInput(new Date())}" value="${d.date}" data-input="booking:field" required />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="bk-start">משעה</label>
            <input id="bk-start" class="field text-center" type="time" name="start" dir="ltr" step="300" value="${d.start}" data-input="booking:field" required />
          </div>
          <div>
            <label class="label" for="bk-end">עד שעה</label>
            <input id="bk-end" class="field text-center" type="time" name="end" dir="ltr" step="300" value="${d.end}" data-input="booking:field" required />
          </div>
        </div>
        <div>
          <label class="label" for="bk-note">הערה <span class="font-normal text-slate-400">(לא חובה)</span></label>
          <input id="bk-note" class="field" type="text" name="note" maxlength="40" placeholder="לדוגמה: אימון, סידורים…" value="${Utils.esc(d.note)}" data-input="booking:field" />
          <div class="mt-2 flex flex-wrap gap-1.5">${presets}</div>
        </div>
        <div id="booking-check">${this.renderCheck()}</div>
        <button type="submit" class="btn-primary w-full">${icon('key-round', 'w-5 h-5')} שריון הרכב</button>
      </form>`;
  },

  renderCheck() {
    const d = this.draft;
    const car = this.car(d.carId);
    const v = this.validate();
    let msg;
    if (v.error) {
      msg = `<div class="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-700 px-3 py-2 text-sm">${icon('info', 'w-4 h-4 mt-0.5 shrink-0')} ${Utils.esc(v.error)}</div>`;
    } else if (v.conflicts.length) {
      const c = v.conflicts[0];
      const who = Store.memberById(c.memberId);
      msg = `<div class="flex items-start gap-2 rounded-xl bg-rose-50 text-rose-700 px-3 py-2 text-sm font-medium">${icon('triangle-alert', 'w-4 h-4 mt-0.5 shrink-0')}
               <span>מתנגש עם הזמנה של ${Utils.esc(who ? who.name : '')} (<span dir="ltr">${Utils.fmtTime(c.start)}–${Utils.fmtTime(c.end)}</span>)${v.conflicts.length > 1 ? ` ועוד ${v.conflicts.length - 1}` : ''}</span></div>`;
    } else {
      msg = `<div class="flex items-center gap-2 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-medium">${icon('circle-check', 'w-4 h-4 shrink-0')} ${Utils.esc(car.short)} פנוי בזמן שבחרתם</div>`;
    }
    let schedule = '';
    if (d.date) {
      const dayStart = Utils.parseLocal(d.date, '00:00');
      const dayEnd = dayStart + 864e5;
      const dayList = this.sortedFor(d.carId).filter((r) => r.start < dayEnd && r.end > dayStart);
      const items = dayList.length
        ? dayList.map((r) => `<span class="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 pl-2.5 pr-1 py-0.5 text-xs text-slate-600">${avatarHtml(Store.memberById(r.memberId), 'xs')}<span dir="ltr" class="tabular-nums">${Utils.fmtTime(r.start)}–${Utils.fmtTime(r.end)}</span></span>`).join('')
        : `<span class="text-xs text-slate-400">אין הזמנות ביום הזה</span>`;
      schedule = `
        <div class="mt-3">
          <div class="text-xs font-semibold text-slate-500 mb-1.5">${Utils.esc(car.name)} · ${Utils.esc(Utils.dayLabel(dayStart))}:</div>
          <div class="flex flex-wrap gap-1.5">${items}</div>
        </div>`;
    }
    return msg + schedule;
  },

  renderList({ state }) {
    const now = Date.now();
    const upcoming = state.reservations
      .filter((r) => r.end > now && (this.filter === 'all' || r.carId === this.filter))
      .sort((a, b) => a.start - b.start);
    const filters = [{ id: 'all', label: 'הכל' }, ...CARS.map((c) => ({ id: c.id, label: c.short }))]
      .map((f) => `<button class="chip ${this.filter === f.id ? 'chip-active' : ''}" data-action="booking:filter" data-filter="${f.id}">${Utils.esc(f.label)}</button>`).join('');
    const groups = [];
    upcoming.forEach((r) => {
      const key = Utils.startOfDay(r.start);
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, items: [] }));
      g.items.push(r);
    });
    const body = groups.length
      ? groups.map((g) => `
          <div>
            <div class="mb-2 text-xs font-bold text-slate-400">${Utils.esc(Utils.dayLabel(g.key))}</div>
            <div class="space-y-2">${g.items.map((r) => this.renderItem(r, now)).join('')}</div>
          </div>`).join('')
      : `<div class="flex flex-col items-center justify-center text-center py-10 text-slate-400">
           <span class="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">${icon('calendar-check', 'w-7 h-7')}</span>
           <div class="font-semibold text-slate-500">אין הזמנות קרובות</div>
           <div class="text-sm">הרכבים מחכים לכם 🚗</div>
         </div>`;
    return `
      <div class="rounded-3xl border border-slate-100 bg-white p-5">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h3 class="flex items-center gap-2 font-bold text-slate-800">${icon('list-ordered', 'w-5 h-5 text-indigo-500')} הזמנות קרובות
            <span class="rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-0.5">${upcoming.length}</span>
          </h3>
          <div class="flex gap-1.5">${filters}</div>
        </div>
        <div class="thin-scroll mt-4 space-y-5 max-h-[470px] overflow-y-auto pl-1">${body}</div>
      </div>`;
  },

  renderItem(r, now) {
    const car = this.car(r.carId) || { short: '?', color: '#94A3B8', icon: 'car' };
    const m = Store.memberById(r.memberId);
    const active = r.start <= now && now < r.end;
    return `
      <div class="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition hover:shadow-soft ${active ? 'ring-2 ring-rose-100' : ''}">
        <span class="w-1.5 self-stretch rounded-full" style="background:${car.color}"></span>
        <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${Utils.alpha(car.color, 0.12)}; color:${car.color}">${icon(car.icon, 'w-5 h-5')}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-800">${Utils.esc(car.short)}</span>
            <span dir="ltr" class="text-sm font-semibold text-slate-600 tabular-nums">${Utils.fmtTime(r.start)}–${Utils.fmtTime(r.end)}</span>
            ${active ? '<span class="rounded-full bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5">עכשיו</span>' : ''}
          </div>
          <div class="mt-1 flex items-center gap-2 text-sm text-slate-500 min-w-0">
            ${avatarHtml(m, 'xs')}<span class="truncate">${Utils.esc(m ? m.name : 'לא ידוע')}</span>
            ${r.note ? `<span class="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">${Utils.esc(r.note)}</span>` : ''}
          </div>
        </div>
        ${this.canCancel(r)
          ? `<button data-action="booking:cancel" data-id="${r.id}" class="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="ביטול הזמנה" aria-label="ביטול הזמנה">${icon('trash-2', 'w-[18px] h-[18px]')}</button>`
          : ''}
      </div>`;
  },

  /** Lightweight refresh (timer) — doesn't touch the form inputs. */
  refreshLive() {
    const status = document.getElementById('car-status');
    if (status) status.innerHTML = this.renderStatus();
    this.refreshCheck();
    document.querySelectorAll('[data-live-clock]').forEach((el) => { el.textContent = Utils.fmtTime(Date.now()); });
    renderIcons();
  },

  refreshCheck() {
    const el = document.getElementById('booking-check');
    if (el) { el.innerHTML = this.renderCheck(); renderIcons(); }
  },

  actions: {
    'booking:car'(el) { CarsWidget.draft.carId = el.dataset.car; rerender(); },
    'booking:preset'(el) {
      const d = CarsWidget.draft;
      d.note = d.note === el.dataset.note ? '' : el.dataset.note;
      rerender();
    },
    'booking:field'(el) { CarsWidget.draft[el.name] = el.value; CarsWidget.refreshCheck(); },
    'booking:filter'(el) { CarsWidget.filter = el.dataset.filter; rerender(); },

    async 'booking:submit'(form) {
      const self = CarsWidget;
      const fd = new FormData(form);
      ['date', 'start', 'end', 'note'].forEach((k) => { self.draft[k] = String(fd.get(k) || '').trim(); });
      const v = self.validate();
      if (v.error) { Toast.show(v.error, 'error'); self.refreshCheck(); return; }
      const car = self.car(self.draft.carId);
      if (v.conflicts.length) {
        const list = v.conflicts.map((c) => {
          const u = Store.memberById(c.memberId);
          return `<li class="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2">${avatarHtml(u, 'xs')} <b>${Utils.esc(u ? u.name : '')}</b> <span dir="ltr" class="tabular-nums">${Utils.fmtTime(c.start)}–${Utils.fmtTime(c.end)}</span>${c.note ? ` · ${Utils.esc(c.note)}` : ''}</li>`;
        }).join('');
        Modal.open({
          title: `${car.name} כבר תפוס בזמן הזה`,
          body: `<p>ההזמנה לא נשמרה. הזמנות קיימות שחופפות לזמן שבחרתם:</p><ul class="mt-3 space-y-2">${list}</ul><p class="mt-3">נסו שעה אחרת או את הרכב השני.</p>`,
          iconName: 'triangle-alert', tone: 'rose', confirmText: 'הבנתי',
        });
        return;
      }
      const me = Store.me();
      const btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        await Data.addReservation({
          carId: self.draft.carId, memberId: me.id, uid: Store.state.authUser.uid,
          start: v.start, end: v.end, note: self.draft.note, createdAt: Date.now(),
        });
      } finally { if (btn) btn.disabled = false; }
      Toast.show(`${car.short} שוריין ל${Utils.dayLabel(v.start)} ${Utils.fmtTime(v.start)}–${Utils.fmtTime(v.end)}`);
      self.draft.note = '';
      rerender();
    },

    'booking:cancel'(el) {
      const r = Store.state.reservations.find((x) => x.id === el.dataset.id);
      if (!r) return;
      if (!CarsWidget.canCancel(r)) return Toast.show('רק מי שיצר את ההזמנה או מנהל יכולים לבטל אותה', 'error');
      const car = CarsWidget.car(r.carId);
      const owner = Store.memberById(r.memberId);
      const mine = owner && owner.id === Store.me()?.id;
      Modal.open({
        title: 'לבטל את ההזמנה?',
        body: `${Utils.esc(car.name)} · ${Utils.esc(Utils.dayLabel(r.start))} <span dir="ltr" class="tabular-nums">${Utils.fmtTime(r.start)}–${Utils.fmtTime(r.end)}</span>${owner && !mine ? `<br>ההזמנה שייכת ל${Utils.esc(owner.name)}.` : ''}`,
        iconName: 'trash-2', tone: 'rose', confirmText: 'כן, לבטל', cancelText: 'השאר',
        onConfirm: async () => {
          await Data.cancelReservation(r.id);
          Toast.show('ההזמנה בוטלה', 'info');
        },
      });
    },
  },
};

/* ---------------------------------------------------------------------
 * 3. Family management (admins only)
 * --------------------------------------------------------------------- */

function memberFormHtml(m = {}) {
  const color = m.color || MEMBER_COLORS[0];
  return `
    <div class="space-y-3 text-right">
      <div><label class="label" for="mf-name">שם</label><input id="mf-name" class="field" maxlength="20" value="${Utils.esc(m.name || '')}" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label" for="mf-avatar">אימוג׳י</label><input id="mf-avatar" class="field text-center text-xl" maxlength="4" value="${Utils.esc(m.avatar || '')}" placeholder="🙂" /></div>
        <div><label class="label" for="mf-color">צבע</label><input id="mf-color" type="color" class="field h-12 p-1.5 cursor-pointer" value="${color}" /></div>
      </div>
    </div>`;
}

function readMemberForm(panel) {
  const name = panel.querySelector('#mf-name').value.trim();
  if (!name) { Toast.show('נא להזין שם', 'error'); return null; }
  return { name, avatar: panel.querySelector('#mf-avatar').value.trim(), color: panel.querySelector('#mf-color').value };
}

const FamilyWidget = {
  id: 'family',
  title: 'ניהול משפחה',
  subtitle: 'חשבונות, הרשאות ובני משפחה',
  icon: 'users',
  accent: '#8B5CF6',
  span: 'lg:col-span-3',
  visible: ({ isAdmin }) => isAdmin,

  headerExtra({ state }) {
    return state.pending.length
      ? `<span class="inline-flex items-center gap-1.5 rounded-full bg-violet-600 text-white px-3 py-1 text-xs font-bold">${icon('bell-ring', 'w-3.5 h-3.5')} ${state.pending.length} ממתינים</span>`
      : '';
  },

  render({ state, me }) {
    const options = state.members.map((m) => `<option value="${m.id}">${Utils.esc(m.name)}</option>`).join('');
    const pending = state.pending.length
      ? `<div class="mb-6 rounded-3xl bg-violet-50 border border-violet-100 p-4">
           <h3 class="flex items-center gap-2 font-bold text-violet-800 mb-3">${icon('user-plus', 'w-5 h-5')} מחכים לאישור</h3>
           <div class="space-y-2">
             ${state.pending.map((p) => `
               <div class="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3">
                 ${p.photoURL ? `<img src="${Utils.esc(p.photoURL)}" alt="" referrerpolicy="no-referrer" class="w-10 h-10 rounded-full object-cover" />` : `<span class="avatar w-10 h-10 bg-slate-100 text-slate-500">${icon('user', 'w-5 h-5')}</span>`}
                 <div class="flex-1 min-w-[10rem]">
                   <div class="font-semibold text-slate-800">${Utils.esc(p.name || 'ללא שם')}</div>
                   <div class="text-xs text-slate-500" dir="ltr" style="text-align:right">${Utils.esc(p.email)}</div>
                 </div>
                 <select class="field !w-auto !py-2" id="assign-${p.id}" aria-label="שיוך לבן משפחה">${options}</select>
                 <button class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2 text-sm transition" data-action="family:approve" data-uid="${p.id}">אישור</button>
                 <button class="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-2 text-sm transition" data-action="family:reject" data-uid="${p.id}">דחייה</button>
               </div>`).join('')}
           </div>
         </div>`
      : '';

    const rows = state.members.map((m) => {
      const accounts = state.links.filter((l) => l.memberId === m.id);
      const self = me && me.id === m.id;
      return `
        <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
          ${avatarHtml(m, 'md')}
          <div class="flex-1 min-w-[9rem]">
            <div class="flex items-center gap-1.5 font-bold text-slate-800">${Utils.esc(m.name)} ${self ? '<span class="text-xs font-semibold text-slate-400">(את/ה)</span>' : ''}${m.canScore ? '<span class="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-bold">מעדכן ניקוד</span>' : ''}</div>
            <div class="mt-1 flex flex-wrap gap-1.5">
              ${accounts.length ? accounts.map((l) => `
                <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 pl-1 pr-2.5 py-0.5 text-xs text-slate-600" dir="ltr">
                  ${Utils.esc(l.email || l.name || 'חשבון')}
                  ${l.id === state.authUser.uid ? '' : `<button class="w-5 h-5 rounded-full flex items-center justify-center hover:bg-rose-100 hover:text-rose-600" data-action="family:unlink" data-uid="${l.id}" title="ניתוק החשבון">${icon('x', 'w-3 h-3')}</button>`}
                </span>`).join('') : '<span class="text-xs text-slate-400">עוד לא חובר חשבון</span>'}
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" class="peer sr-only" data-input="family:dishes" data-member="${m.id}" ${m.inDishes !== false ? 'checked' : ''} />
            <span class="relative w-10 h-6 rounded-full bg-slate-200 transition peer-checked:bg-emerald-400 after:absolute after:top-1 after:right-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:-translate-x-4"></span>
            בטבלת הכלים
          </label>
          <label class="flex items-center gap-2 text-sm font-semibold text-slate-600 ${self ? 'opacity-50' : 'cursor-pointer'}" title="${self ? 'אי אפשר להסיר הרשאה מעצמך' : ''}">
            <input type="checkbox" class="peer sr-only" data-input="family:admin" data-member="${m.id}" ${m.isAdmin ? 'checked' : ''} ${self ? 'disabled' : ''} />
            <span class="relative w-10 h-6 rounded-full bg-slate-200 transition peer-checked:bg-amber-400 after:absolute after:top-1 after:right-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:-translate-x-4"></span>
            מורשה
          </label>
          <button class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition" data-action="family:edit" data-member="${m.id}" title="עריכה">${icon('pencil', 'w-4 h-4')}</button>
        </div>`;
    }).join('');

    return `
      ${pending}
      <div class="grid md:grid-cols-2 gap-3">${rows}</div>
      <div class="mt-5 flex flex-col sm:flex-row gap-3">
        <button class="btn-ghost !rounded-2xl" data-action="family:add">${icon('user-plus', 'w-4 h-4')} הוספת בן/בת משפחה</button>
        <div class="flex-1 flex items-center gap-2 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-2.5 text-sm text-slate-600">
          ${icon('share-2', 'w-4 h-4 text-slate-400 shrink-0')}
          <span class="flex-1">שלחו לבני המשפחה את הקישור. אחרי שיתחברו עם Google, הם יופיעו כאן לאישור.</span>
          <button class="chip" data-action="family:copy">${icon('copy', 'w-3.5 h-3.5')} העתקת קישור</button>
        </div>
      </div>`;
  },

  actions: {
    async 'family:approve'(el) {
      const uid = el.dataset.uid;
      const p = Store.state.pending.find((x) => x.id === uid);
      const memberId = document.getElementById(`assign-${uid}`)?.value;
      if (!p || !memberId) return;
      el.disabled = true;
      await Data.approve(uid, memberId, p);
      Toast.show(`${p.name || p.email} חובר/ה כ${Store.memberById(memberId)?.name || ''}`);
    },
    async 'family:reject'(el) {
      await Data.reject(el.dataset.uid);
      Toast.show('הבקשה נדחתה', 'info');
    },
    'family:unlink'(el) {
      const l = Store.state.links.find((x) => x.id === el.dataset.uid);
      Modal.open({
        title: 'לנתק את החשבון?', tone: 'rose', iconName: 'unlink',
        body: `<span dir="ltr">${Utils.esc(l?.email || '')}</span> לא יוכל/תוכל להיכנס עד שתאשרו שוב.`,
        confirmText: 'ניתוק', cancelText: 'ביטול',
        onConfirm: async () => { await Data.unlink(el.dataset.uid); Toast.show('החשבון נותק', 'info'); },
      });
    },
    async 'family:admin'(el) {
      const m = Store.memberById(el.dataset.member);
      if (!m) return;
      try {
        await Data.updateMember(m.id, { isAdmin: el.checked });
        Toast.show(el.checked ? `${m.name} עכשיו מורשה` : `${m.name} כבר לא מורשה`, 'info');
      } catch (err) { el.checked = !el.checked; throw err; }
    },
    async 'family:dishes'(el) {
      const m = Store.memberById(el.dataset.member);
      if (!m) return;
      try {
        await Data.updateMember(m.id, { inDishes: el.checked });
        Toast.show(el.checked ? `${m.name} נוסף/ה לטבלת הכלים` : `${m.name} הוסר/ה מטבלת הכלים`, 'info');
      } catch (err) { el.checked = !el.checked; throw err; }
    },
    'family:edit'(el) {
      const m = Store.memberById(el.dataset.member);
      if (!m) return;
      Modal.open({
        title: `עריכת ${m.name}`, iconName: 'pencil', body: memberFormHtml(m),
        confirmText: 'שמירה', cancelText: 'ביטול',
        onConfirm: async (panel) => {
          const data = readMemberForm(panel);
          if (!data) return false;
          await Data.updateMember(m.id, data);
          Toast.show('נשמר');
        },
      });
    },
    'family:add'() {
      const color = MEMBER_COLORS[Store.state.members.length % MEMBER_COLORS.length];
      Modal.open({
        title: 'בן/בת משפחה חדש/ה', iconName: 'user-plus', body: memberFormHtml({ color }),
        confirmText: 'הוספה', cancelText: 'ביטול',
        onConfirm: async (panel) => {
          const data = readMemberForm(panel);
          if (!data) return false;
          const order = Math.max(-1, ...Store.state.members.map((m) => m.order ?? 0)) + 1;
          await Data.addMember(Utils.uid(), { ...data, isAdmin: false, score: 0, order });
          Toast.show(`${data.name} נוסף/ה למשפחה`);
        },
      });
    },
    async 'family:copy'() {
      const url = location.origin + location.pathname;
      try { await navigator.clipboard.writeText(url); Toast.show('הקישור הועתק'); }
      catch { Toast.show(url, 'info'); }
    },
  },
};

/* ---------------------------------------------------------------------
 * Registry — order = order in the overview & tabs
 * --------------------------------------------------------------------- */
export const WIDGETS = [LeaderboardWidget, CarsWidget, FamilyWidget];
export { CarsWidget };
