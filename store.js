/* =====================================================================
 * store.js — in-memory app state, fed live by Firestore subscriptions.
 * Call Store.set(patch) to change state; listeners re-render the UI.
 * ===================================================================== */

const savedTab = (() => { try { return localStorage.getItem('familyHub.activeTab'); } catch { return null; } })();

export const Store = {
  state: {
    authReady: false,
    authUser: null,       // Firebase user (Google account)
    owner: null, ownerLoaded: false,
    link: null,  linkLoaded: false,   // { memberId } for the signed-in account
    members: [], membersLoaded: false,
    reservations: [],
    shopping: [],         // shared shopping list items
    pending: [],          // admin only
    links: [],            // admin only
    activeTab: savedTab || 'overview',
    busy: false,          // a setup action is running
  },
  listeners: [],

  set(patch) {
    Object.assign(this.state, patch);
    if ('activeTab' in patch) { try { localStorage.setItem('familyHub.activeTab', patch.activeTab); } catch {} }
    this.listeners.forEach((fn) => fn(this.state));
  },
  subscribe(fn) { this.listeners.push(fn); },

  // ---- selectors ----
  me() { return this.memberById(this.state.link?.memberId); },
  memberById(id) { return this.state.members.find((m) => m.id === id) || null; },
  isOwner() { const s = this.state; return !!(s.owner && s.authUser && s.owner.uid === s.authUser.uid); },
  isAdmin() { return this.isOwner() || !!this.me()?.isAdmin; },
  canScore() { return !!this.me()?.canScore; },   // may change dishwashing points

  /** Which screen to show. */
  phase() {
    const s = this.state;
    if (!s.authReady) return 'loading';
    if (!s.authUser) return 'signedOut';
    if (!s.ownerLoaded || !s.linkLoaded) return 'loading';
    if (s.link) return s.membersLoaded ? (this.me() ? 'ready' : 'orphan') : 'loading';
    if (!s.owner || this.isOwner()) return 'setup';
    return 'pending';
  },
};
