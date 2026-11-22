/* =====================================================================
 * data.js — Firebase layer (auth + Firestore). The rest of the app never
 * imports Firebase directly, so swapping backends only touches this file.
 *
 * Firestore layout:
 *   meta/owner          { uid, email, at }           first person to set up = owner (always admin)
 *   members/{id}        { name, avatar, color, isAdmin, canScore, score, order }
 *   links/{uid}         { memberId, email, name }    Google account -> family member
 *   pending/{uid}       { email, name, photoURL, at } sign-ins waiting for an admin
 *   reservations/{id}   { carId, memberId, uid, start, end, note, createdAt }
 *   shopping/{id}       { text, qty, addedBy, uid, done, doneBy, doneAt, createdAt }
 *   parking/{carId}     { text, lat?, lng?, by, uid, at }   where each car is parked
 *   events/{id}         { title, date, time, location, notes, createdBy, uid, createdAt, rsvp: { [memberId]: 'yes'|'no' } }
 * Permissions are enforced server-side in firestore.rules.
 * ===================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, increment,
  query, where, getDocs, deleteField,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { FIREBASE_CONFIG, APP_CONFIG, DEFAULT_MEMBERS } from './config.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
let db;
try {
  // Offline cache: the app opens instantly and works briefly without signal.
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (err) {
  console.warn('Offline cache unavailable, using memory cache', err);
  db = getFirestore(app);
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const onErr = (label) => (err) => console.error(`[${label}]`, err);

export const Data = {
  // ---------- Auth ----------
  onAuth: (cb) => onAuthStateChanged(auth, cb),

  async signIn() {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        throw err;
      }
    }
  },

  signOut: () => signOut(auth),

  // ---------- Live subscriptions (each returns an unsubscribe fn) ----------
  watchOwner: (cb) => onSnapshot(doc(db, 'meta', 'owner'), (s) => cb(s.exists() ? s.data() : null), onErr('owner')),
  watchLink: (uid, cb) => onSnapshot(doc(db, 'links', uid), (s) => cb(s.exists() ? s.data() : null), onErr('link')),
  watchMembers: (cb) => onSnapshot(collection(db, 'members'), (s) =>
    cb(docsOf(s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), onErr('members')),
  watchReservations: (cb) => {
    const since = Date.now() - APP_CONFIG.reservationsLookbackDays * 864e5;
    return onSnapshot(query(collection(db, 'reservations'), where('end', '>', since)), (s) => cb(docsOf(s)), onErr('reservations'));
  },
  watchPending: (cb) => onSnapshot(collection(db, 'pending'), (s) => cb(docsOf(s)), onErr('pending')),
  watchLinks: (cb) => onSnapshot(collection(db, 'links'), (s) => cb(docsOf(s)), onErr('links')),

  // ---------- First-time setup ----------
  /** Make `user` the owner, seed the members if empty, and link the user to `memberId`. */
  async claimOwnership(user, memberId, ownerAlreadyMine) {
    if (!ownerAlreadyMine) {
      await setDoc(doc(db, 'meta', 'owner'), { uid: user.uid, email: user.email || '', at: Date.now() });
    }
    const existing = await getDocs(collection(db, 'members'));
    if (existing.empty) {
      const batch = writeBatch(db);
      DEFAULT_MEMBERS.forEach((m, i) => {
        const { id, ...rest } = m;
        batch.set(doc(db, 'members', id), { ...rest, isAdmin: !!m.isAdmin || id === memberId, canScore: !!m.canScore, score: 0, order: i });
      });
      await batch.commit();
    }
    await setDoc(doc(db, 'links', user.uid), { memberId, email: user.email || '', name: user.displayName || '' });
  },

  requestAccess: (user) => setDoc(doc(db, 'pending', user.uid), {
    email: user.email || '', name: user.displayName || '', photoURL: user.photoURL || '', at: Date.now(),
  }),

  // ---------- Admin: accounts ----------
  async approve(uid, memberId, info) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'links', uid), { memberId, email: info.email || '', name: info.name || '' });
    batch.delete(doc(db, 'pending', uid));
    await batch.commit();
  },
  reject: (uid) => deleteDoc(doc(db, 'pending', uid)),
  unlink: (uid) => deleteDoc(doc(db, 'links', uid)),

  // ---------- Admin: members & scores ----------
  changeScore: (memberId, delta) => updateDoc(doc(db, 'members', memberId), { score: increment(delta) }),
  updateMember: (id, patch) => updateDoc(doc(db, 'members', id), patch),
  addMember: (id, data) => setDoc(doc(db, 'members', id), data),

  // ---------- Reservations ----------
  addReservation: (r) => addDoc(collection(db, 'reservations'), r),
  cancelReservation: (id) => deleteDoc(doc(db, 'reservations', id)),

  // ---------- Family events ----------
  watchEvents: (cb) => onSnapshot(collection(db, 'events'), (s) => cb(docsOf(s)), onErr('events')),
  addEvent: (e) => addDoc(collection(db, 'events'), e),
  updateEvent: (id, patch) => updateDoc(doc(db, 'events', id), patch),
  deleteEvent: (id) => deleteDoc(doc(db, 'events', id)),
  /** answer: 'yes' | 'no' | null (clear) — only touches the member's own answer. */
  setRsvp: (id, memberId, answer) => updateDoc(doc(db, 'events', id), { [`rsvp.${memberId}`]: answer || deleteField() }),

  // ---------- Parking ----------
  watchParking: (cb) => onSnapshot(collection(db, 'parking'), (s) =>
    cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), onErr('parking')),
  setParking: (carId, data) => setDoc(doc(db, 'parking', carId), data),

  // ---------- Shopping list ----------
  watchShopping: (cb) => onSnapshot(collection(db, 'shopping'), (s) => cb(docsOf(s)), onErr('shopping')),
  addShoppingItem: (item) => addDoc(collection(db, 'shopping'), item),
  setShoppingDone: (id, done, memberId) => updateDoc(doc(db, 'shopping', id),
    { done, doneBy: done ? memberId : null, doneAt: done ? Date.now() : null }),
  deleteShoppingItem: (id) => deleteDoc(doc(db, 'shopping', id)),
  async clearShopping(ids) {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, 'shopping', id)));
    await batch.commit();
  },
};
