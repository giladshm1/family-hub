/* =====================================================================
 * events.js — family events board: upcoming events, calendar, RSVP
 * Data: events/{id} { title, date 'YYYY-MM-DD', time, location, notes,
 *                     createdBy, uid, createdAt, rsvp: { [memberId]: 'yes'|'no' } }
 * ===================================================================== */

import { Store } from './store.js';
import { Data } from './data.js';
import { Utils, avatarHtml, icon, Toast, Modal } from './ui.js';

let rerender = () => {};
export const setRerender = (fn) => { rerender = fn; };

const todayKey = () => Utils.toDateInput(new Date());
const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const sortEvents = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');

/** Shared form fields (new event + edit modal). */
function eventFields(e, prefix, withInputHooks) {
  const hook = withInputHooks ? 'data-input="ev:field"' : '';
  return `
    <input id="${prefix}-title" name="title" class="field" maxlength="60" placeholder="מה האירוע? (למשל: יום הולדת לסבתא)" value="${Utils.esc(e.title || '')}" ${hook} />
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label" for="${prefix}-date">תאריך</label>
        <input id="${prefix}-date" name="date" type="date" dir="ltr" class="field" value="${e.date || ''}" ${hook} /></div>
      <div><label class="label" for="${prefix}-time">שעה <span class="font-normal text-slate-400">(לא חובה)</span></label>
        <input id="${prefix}-time" name="time" type="time" dir="ltr" class="field text-center" value="${e.time || ''}" ${hook} /></div>
    </div>
    <input id="${prefix}-location" name="location" class="field" maxlength="60" placeholder="איפה? (לא חובה)" value="${Utils.esc(e.location || '')}" ${hook} />
    <textarea id="${prefix}-notes" name="notes" class="field" rows="2" maxlength="300" placeholder="פרטים נוספים (לא חובה)" ${hook}>${Utils.esc(e.notes || '')}</textarea>`;
}

function readFields(root, prefix) {
  const v = (n) => root.querySelector(`#${prefix}-${n}`).value.trim();
  const e = { title: v('title'), date: v('date'), time: v('time'), location: v('location'), notes: v('notes') };
  if (!e.title) { Toast.show('נא לכתוב מה האירוע', 'error'); return null; }
  if (!e.date) { Toast.show('נא לבחור תאריך', 'error'); return null; }
  return e;
}

export const EventsWidget = {
  id: 'events',
  title: 'אירועים משפחתיים',
  subtitle: 'מה קורה בקרוב ומי מגיע',
  icon: 'party-popper',
  accent: '#EC4899',
  span: 'lg:col-span-3',

  draft: { title: '', date: '', time: '', location: '', notes: '' },
  calMonth: null,     // first day of shown month (ms)
  calSelected: null,  // 'YYYY-MM-DD'

  upcoming: (state) => state.events.filter((e) => e.date >= todayKey()).sort(sortEvents),
  on: (state, key) => state.events.filter((e) => e.date === key).sort(sortEvents),

  headerExtra({ state }) {
    const n = this.upcoming(state).length;
    return `<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-50 text-pink-700 ring-1 ring-pink-200 px-3 py-1 text-xs font-bold">${icon('calendar-heart', 'w-3.5 h-3.5')} ${n} בקרוב</span>`;
  },

  /** One event card with RSVP buttons. */
  renderEvent(e) {
    const me = Store.me();
    const mine = me && e.rsvp ? e.rsvp[me.id] : null;
    const members = Store.state.members;
    const yes = members.filter((m) => e.rsvp?.[m.id] === 'yes');
    const no = members.filter((m) => e.rsvp?.[m.id] === 'no');
    const waiting = members.length - yes.length - no.length;
    const d = dateOf(e.date);
    const canEdit = me && (e.createdBy === me.id || Store.isAdmin());
    const by = Store.memberById(e.createdBy);
    const rsvpBtn = (answer, label, iconName, on) => `
      <button class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold transition active:scale-95 ${mine === answer ? on : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}"
        data-action="ev:rsvp" data-id="${e.id}" data-answer="${answer}">${icon(iconName, 'w-4 h-4')} ${label}</button>`;
    return `
      <div class="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
        <div class="w-14 shrink-0 self-start rounded-2xl bg-pink-50 text-pink-600 flex flex-col items-center py-2">
          <span class="text-[11px] font-bold">${d.toLocaleDateString('he-IL', { weekday: 'short' })}</span>
          <span class="text-2xl font-extrabold leading-tight">${d.getDate()}</span>
          <span class="text-[11px] font-semibold">${d.toLocaleDateString('he-IL', { month: 'short' })}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 break-words">${Utils.esc(e.title)}</div>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>${Utils.esc(Utils.dayLabel(d.getTime()))}</span>
                ${e.time ? `<span class="inline-flex items-center gap-1">${icon('clock', 'w-3.5 h-3.5')} <span dir="ltr">${Utils.esc(e.time)}</span></span>` : ''}
                ${e.location ? `<span class="inline-flex items-center gap-1">${icon('map-pin', 'w-3.5 h-3.5')} ${Utils.esc(e.location)}</span>` : ''}
              </div>
            </div>
            ${canEdit ? `<div class="flex shrink-0">
              <button class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-indigo-600" data-action="ev:edit" data-id="${e.id}" title="עריכה" aria-label="עריכה">${icon('pencil', 'w-4 h-4')}</button>
              <button class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600" data-action="ev:delete" data-id="${e.id}" title="מחיקה" aria-label="מחיקה">${icon('trash-2', 'w-4 h-4')}</button>
            </div>` : ''}
          </div>
          ${e.notes ? `<p class="mt-2 text-sm text-slate-600 whitespace-pre-line break-words">${Utils.esc(e.notes)}</p>` : ''}
          <div class="mt-3 flex flex-wrap items-center gap-2">
            ${rsvpBtn('yes', 'מגיע/ה', 'check', 'bg-emerald-500 text-white border-emerald-500')}
            ${rsvpBtn('no', 'לא מגיע/ה', 'x', 'bg-rose-500 text-white border-rose-500')}
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1.5"><span class="font-bold text-emerald-600">${yes.length} מגיעים</span>${yes.map((m) => avatarHtml(m, 'xs')).join('')}</span>
            ${no.length ? `<span class="inline-flex items-center gap-1.5"><span class="font-bold text-rose-500">${no.length} לא</span>${no.map((m) => avatarHtml(m, 'xs')).join('')}</span>` : ''}
            ${waiting ? `<span>${waiting} עוד לא ענו</span>` : ''}
            ${by ? `<span class="text-slate-400">נוסף ע״י ${Utils.esc(by.name)}</span>` : ''}
          </div>
        </div>
      </div>`;
  },

  /** Overview: the next 3 events, with RSVP. */
  renderOverview({ state }) {
    const list = this.upcoming(state).slice(0, 3);
    return `
      ${list.length ? `<div class="grid lg:grid-cols-3 gap-3">${list.map((e) => this.renderEvent(e)).join('')}</div>`
        : '<p class="text-sm text-slate-400">אין אירועים קרובים.</p>'}
      <button class="btn-ghost !rounded-2xl mt-4" data-action="nav:tab" data-tab="events">${icon('calendar-heart', 'w-4 h-4')} לכל האירועים וללוח השנה</button>`;
  },

  renderCalendar(state) {
    const now = new Date();
    const today = todayKey();
    if (!this.calMonth) this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (!this.calSelected) this.calSelected = today;
    const month = new Date(this.calMonth);
    const y = month.getFullYear(), mo = month.getMonth();
    const offset = new Date(y, mo, 1).getDay();
    const count = Math.ceil((offset + new Date(y, mo + 1, 0).getDate()) / 7) * 7;
    const cells = Array.from({ length: count }, (_, i) => {
      const d = new Date(y, mo, 1 - offset + i);
      const key = Utils.toDateInput(d);
      const list = this.on(state, key);
      const isToday = key === today;
      const selected = key === this.calSelected;
      return `
        <button type="button" data-action="ev:day" data-date="${key}"
          class="min-h-[3.25rem] sm:min-h-[5.75rem] min-w-0 rounded-xl sm:rounded-2xl border p-1 sm:p-1.5 flex flex-col items-stretch gap-1 text-right transition
                 ${selected ? 'border-pink-400 ring-2 ring-pink-100 bg-pink-50/50' : 'border-slate-100 bg-white hover:border-slate-300'} ${d.getMonth() === mo ? '' : 'opacity-40'}">
          <span class="self-start text-xs sm:text-sm font-bold ${isToday ? 'w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center' : key < today ? 'text-slate-400' : 'text-slate-700'}">${d.getDate()}</span>
          <span class="hidden sm:flex flex-col gap-0.5 min-w-0">${list.slice(0, 2).map((e) => `<span class="truncate rounded-md bg-pink-500 px-1 py-0.5 text-[10px] font-semibold text-white">${e.time ? `${Utils.esc(e.time)} ` : ''}${Utils.esc(e.title)}</span>`).join('')}${list.length > 2 ? `<span class="text-[10px] font-semibold text-slate-400">+${list.length - 2} נוספים</span>` : ''}</span>
          <span class="flex sm:hidden flex-wrap gap-0.5">${list.slice(0, 4).map(() => '<span class="w-1.5 h-1.5 rounded-full bg-pink-500"></span>').join('')}</span>
        </button>`;
    }).join('');
    const weekdays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((w) => `<div class="text-center text-xs font-bold text-slate-400 py-1">${w}</div>`).join('');
    const sel = this.on(state, this.calSelected);
    const selDate = dateOf(this.calSelected);
    return `
      <div class="mt-6 rounded-3xl border border-slate-100 bg-white p-4 sm:p-5">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h3 class="flex items-center gap-2 font-bold text-slate-800">${icon('calendar-days', 'w-5 h-5 text-pink-500')} לוח אירועים</h3>
          <div class="flex items-center gap-1.5">
            <button class="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600" data-action="ev:prev" aria-label="החודש הקודם">${icon('chevron-right', 'w-5 h-5')}</button>
            <span class="min-w-[8.5rem] text-center font-bold text-slate-800">${Utils.esc(month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }))}</span>
            <button class="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600" data-action="ev:next" aria-label="החודש הבא">${icon('chevron-left', 'w-5 h-5')}</button>
            <button class="chip" data-action="ev:today">היום</button>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1 sm:gap-1.5">${weekdays}${cells}</div>
        <div class="mt-5 border-t border-slate-100 pt-4">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h4 class="font-bold text-slate-800">${Utils.esc(selDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>
            ${this.calSelected >= todayKey() ? `<button class="chip" data-action="ev:addOnDay">${icon('plus', 'w-3.5 h-3.5')} אירוע ביום הזה</button>` : ''}
          </div>
          ${sel.length ? `<div class="space-y-2">${sel.map((e) => this.renderEvent(e)).join('')}</div>` : '<p class="text-sm text-slate-400">אין אירועים ביום הזה.</p>'}
        </div>
      </div>`;
  },

  render({ state }) {
    if (!this.draft.date) this.draft.date = todayKey();
    const upcoming = this.upcoming(state);
    return `
      <div class="grid md:grid-cols-5 gap-5">
        <form data-submit="ev:add" novalidate class="md:col-span-2 self-start rounded-3xl bg-slate-50/80 border border-slate-100 p-5 space-y-3">
          <h3 class="flex items-center gap-2 font-bold text-slate-800">${icon('calendar-plus', 'w-5 h-5 text-pink-500')} אירוע חדש</h3>
          ${eventFields(this.draft, 'ev', true)}
          <button type="submit" class="btn-primary w-full">${icon('plus', 'w-5 h-5')} הוספת אירוע</button>
        </form>
        <div class="md:col-span-3">
          <h3 class="mb-3 flex items-center gap-2 font-bold text-slate-800">${icon('list-ordered', 'w-5 h-5 text-pink-500')} אירועים קרובים
            <span class="rounded-full bg-pink-50 text-pink-700 text-xs font-bold px-2 py-0.5">${upcoming.length}</span></h3>
          ${upcoming.length ? `<div class="space-y-3">${upcoming.map((e) => this.renderEvent(e)).join('')}</div>`
            : `<div class="rounded-2xl bg-slate-50 py-10 text-center text-slate-400">${icon('party-popper', 'w-7 h-7 mx-auto mb-2')}<div class="font-semibold">אין אירועים קרובים</div><div class="text-sm">הוסיפו את האירוע הבא של המשפחה</div></div>`}
        </div>
      </div>
      ${this.renderCalendar(state)}`;
  },

  actions: {
    'ev:field'(el) { EventsWidget.draft[el.name] = el.value; },

    async 'ev:add'(form) {
      const e = readFields(form, 'ev');
      if (!e) return;
      if (e.date < todayKey()) return Toast.show('התאריך כבר עבר', 'error');
      const me = Store.me();
      await Data.addEvent({ ...e, createdBy: me.id, uid: Store.state.authUser.uid, createdAt: Date.now(), rsvp: { [me.id]: 'yes' } });
      EventsWidget.draft = { title: '', date: e.date, time: '', location: '', notes: '' };
      Toast.show(`האירוע "${e.title}" נוסף`);
      rerender();
    },

    async 'ev:rsvp'(el) {
      const me = Store.me();
      const ev = Store.state.events.find((x) => x.id === el.dataset.id);
      if (!me || !ev) return;
      const answer = ev.rsvp?.[me.id] === el.dataset.answer ? null : el.dataset.answer; // tap again to clear
      await Data.setRsvp(ev.id, me.id, answer);
    },

    'ev:edit'(el) {
      const ev = Store.state.events.find((x) => x.id === el.dataset.id);
      if (!ev) return;
      Modal.open({
        title: 'עריכת אירוע', iconName: 'pencil', confirmText: 'שמירה', cancelText: 'ביטול',
        body: `<div class="space-y-3 text-right">${eventFields(ev, 'eve', false)}</div>`,
        onConfirm: async (panel) => {
          const e = readFields(panel, 'eve');
          if (!e) return false;
          await Data.updateEvent(ev.id, e);
          Toast.show('האירוע עודכן');
        },
      });
    },

    'ev:delete'(el) {
      const ev = Store.state.events.find((x) => x.id === el.dataset.id);
      if (!ev) return;
      Modal.open({
        title: 'למחוק את האירוע?', iconName: 'trash-2', tone: 'rose', confirmText: 'מחיקה', cancelText: 'ביטול',
        body: `"${Utils.esc(ev.title)}" יימחק לכל המשפחה.`,
        onConfirm: async () => { await Data.deleteEvent(ev.id); Toast.show('האירוע נמחק', 'info'); },
      });
    },

    // ---- calendar ----
    'ev:prev'() { const m = new Date(EventsWidget.calMonth); EventsWidget.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime(); rerender(); },
    'ev:next'() { const m = new Date(EventsWidget.calMonth); EventsWidget.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime(); rerender(); },
    'ev:today'() { EventsWidget.calMonth = null; EventsWidget.calSelected = null; rerender(); },
    'ev:day'(el) {
      const key = el.dataset.date;
      const d = dateOf(key);
      EventsWidget.calSelected = key;
      EventsWidget.calMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      rerender();
    },
    'ev:addOnDay'() {
      EventsWidget.draft.date = EventsWidget.calSelected;
      rerender();
      setTimeout(() => { const t = document.getElementById('ev-title'); t?.scrollIntoView({ behavior: 'smooth', block: 'center' }); t?.focus(); }, 60);
    },
  },
};
