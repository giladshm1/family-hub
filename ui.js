/* =====================================================================
 * ui.js — utilities, icons, avatars, event delegation, toasts, modals
 * ===================================================================== */

export const pad = (n) => String(n).padStart(2, '0');

export const Utils = {
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),

  esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /** Hex color -> rgba string with alpha. */
  alpha(hex, a) {
    const n = parseInt(String(hex || '#94A3B8').replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  },

  toDateInput: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  toTimeInput: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  fmtTime: (ms) => Utils.toTimeInput(new Date(ms)),

  /** 'YYYY-MM-DD' + 'HH:MM' -> local timestamp (ms). */
  parseLocal(dateStr, timeStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const [h, mi] = String(timeStr).split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  },

  startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); },

  /** "היום" / "מחר" / "יום שלישי, 24.11" */
  dayLabel(ms) {
    const diff = Math.round((Utils.startOfDay(ms) - Utils.startOfDay(Date.now())) / 864e5);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff === -1) return 'אתמול';
    const d = new Date(ms);
    return `${d.toLocaleDateString('he-IL', { weekday: 'long' })}, ${d.getDate()}.${d.getMonth() + 1}`;
  },

  fullDate: (ms = Date.now()) =>
    new Date(ms).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }),

  greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 21) return 'ערב טוב';
    return 'לילה טוב';
  },

  /** "עוד 45 דק׳" / "עוד 2 ש׳ 10 דק׳" */
  remaining(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `עוד ${mins} דק׳`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `עוד ${h} ש׳ ${m} דק׳` : `עוד ${h} ש׳`;
  },
};

/** Colorful avatar bubble for a family member. size: xs | sm | md | lg */
export function avatarHtml(member, size = 'md') {
  if (!member) return '';
  const sizes = { xs: 'w-6 h-6 text-xs', sm: 'w-9 h-9 text-lg', md: 'w-11 h-11 text-xl', lg: 'w-20 h-20 text-4xl' };
  const c = member.color || '#94A3B8';
  const style = member.avatar
    ? `background: linear-gradient(135deg, ${Utils.alpha(c, 0.22)}, ${Utils.alpha(c, 0.08)}); box-shadow: inset 0 0 0 2px ${Utils.alpha(c, 0.35)};`
    : `background: linear-gradient(135deg, ${c}, ${Utils.alpha(c, 0.7)}); color: #fff; box-shadow: 0 6px 16px -6px ${Utils.alpha(c, 0.7)};`;
  return `<span class="avatar ${sizes[size]}" style="${style}" title="${Utils.esc(member.name)}">${Utils.esc(member.avatar || (member.name || '?').charAt(0))}</span>`;
}

/** Turn every <i data-lucide="..."> into an SVG icon. Call after rendering HTML. */
export function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
  }
}

export const icon = (name, cls = 'w-5 h-5') => `<i data-lucide="${name}" class="${cls}"></i>`;

/* ---------------------------------------------------------------------
 * Actions — event delegation.
 * data-action="name" (click), data-input="name" (input/change),
 * data-submit="name" (form submit). Register: Actions.register(name, fn)
 * --------------------------------------------------------------------- */
export const Actions = {
  handlers: {},
  register(name, fn) { this.handlers[name] = fn; },
  async run(name, el, event) {
    const fn = this.handlers[name];
    if (!fn) return console.warn('No handler for action:', name);
    try { await fn(el, event); }
    catch (err) { console.error(err); Toast.show(friendlyError(err), 'error'); }
  },
};

export function friendlyError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'אין לך הרשאה לפעולה הזו';
  if (code.includes('unavailable') || code.includes('network')) return 'אין חיבור לאינטרנט — נסו שוב';
  if (code.includes('unauthorized-domain')) return 'הדומיין לא מאושר ב-Firebase (Authorized domains)';
  return 'משהו השתבש — נסו שוב';
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) Actions.run(el.dataset.action, el, e);
});
['input', 'change'].forEach((type) =>
  document.addEventListener(type, (e) => {
    const el = e.target.closest('[data-input]');
    if (el) Actions.run(el.dataset.input, el, e);
  })
);
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (form) { e.preventDefault(); Actions.run(form.dataset.submit, form, e); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

/* ---------------------------------------------------------------------
 * Toast
 * --------------------------------------------------------------------- */
export const Toast = {
  show(message, type = 'success') {
    const root = document.getElementById('toast-root');
    const styles = {
      success: { icon: 'check', cls: 'bg-emerald-500' },
      error:   { icon: 'triangle-alert', cls: 'bg-rose-500' },
      info:    { icon: 'info', cls: 'bg-indigo-500' },
    }[type] || {};
    while (root.children.length >= 3) root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900/95 text-white pl-5 pr-2 py-2 shadow-lift backdrop-blur max-w-md';
    el.innerHTML = `
      <span class="w-8 h-8 rounded-xl ${styles.cls} flex items-center justify-center shrink-0">${icon(styles.icon, 'w-4 h-4')}</span>
      <span class="text-sm font-medium">${Utils.esc(message)}</span>`;
    root.appendChild(el);
    renderIcons();
    setTimeout(() => { el.classList.add('toast-leave'); setTimeout(() => el.remove(), 300); }, 2600);
  },
};

/* ---------------------------------------------------------------------
 * Modal. onConfirm(panelEl) may be async; return false to keep it open.
 * --------------------------------------------------------------------- */
export const Modal = {
  _onConfirm: null,
  tones: {
    indigo: { badge: 'bg-indigo-100 text-indigo-600', btn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30' },
    rose:   { badge: 'bg-rose-100 text-rose-600', btn: 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30' },
    amber:  { badge: 'bg-amber-100 text-amber-600', btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30' },
  },

  open({ title, body = '', iconName = 'info', tone = 'indigo', confirmText = 'אישור', cancelText = null, onConfirm = null }) {
    const t = this.tones[tone] || this.tones.indigo;
    this._onConfirm = onConfirm;
    document.getElementById('modal-root').innerHTML = `
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
        <div class="modal-backdrop absolute inset-0 bg-slate-900/40 backdrop-blur-sm" data-action="modal:close"></div>
        <div class="modal-panel relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl" id="modal-panel">
          <div class="flex items-start gap-4">
            <span class="w-12 h-12 rounded-2xl ${t.badge} flex items-center justify-center shrink-0">${icon(iconName, 'w-6 h-6')}</span>
            <div class="flex-1 min-w-0 pt-1">
              <h3 class="text-lg font-bold text-slate-900">${Utils.esc(title)}</h3>
              <div class="mt-2 text-sm text-slate-600 leading-relaxed">${body}</div>
            </div>
          </div>
          <div class="mt-6 flex gap-3">
            <button data-action="modal:confirm" class="flex-1 rounded-2xl ${t.btn} px-4 py-3 font-bold text-white shadow-lg transition active:scale-[0.98]">${Utils.esc(confirmText)}</button>
            ${cancelText ? `<button data-action="modal:close" class="flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-600 transition hover:bg-slate-200">${Utils.esc(cancelText)}</button>` : ''}
          </div>
        </div>
      </div>`;
    renderIcons();
    const firstInput = document.querySelector('#modal-panel input');
    (firstInput || document.querySelector('[data-action="modal:confirm"]'))?.focus();
  },

  isOpen: () => !!document.getElementById('modal-root').children.length,

  close() {
    this._onConfirm = null;
    document.getElementById('modal-root').innerHTML = '';
  },
};

Actions.register('modal:close', () => Modal.close());
Actions.register('modal:confirm', async (btn) => {
  const fn = Modal._onConfirm;
  if (!fn) return Modal.close();
  btn.disabled = true;
  try {
    const result = await fn(document.getElementById('modal-panel'));
    if (result !== false) Modal.close();
  } finally {
    btn.disabled = false;
  }
});
