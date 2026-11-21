/* =====================================================================
 * config.js — everything you'd normally want to customize
 * ===================================================================== */

/** Firebase web config (Firebase console → Project settings → Your apps). Safe to be public. */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAdv0kauFoBi2HgsaaOZBsy1Xv7GhtOT0A',
  authDomain: 'family-hub-54a7c.firebaseapp.com',
  projectId: 'family-hub-54a7c',
  storageBucket: 'family-hub-54a7c.firebasestorage.app',
  messagingSenderId: '39844605787',
  appId: '1:39844605787:web:f5bd2f00658e3b216b747e',
};

export const APP_CONFIG = {
  appName: 'הבית שלנו',
  liveRefreshMs: 30 * 1000,   // how often "free / busy" statuses re-check the clock
  reservationsLookbackDays: 2, // finished bookings older than this are not loaded
};

/**
 * Starting family members — used ONLY on first setup to seed the database.
 * After that, members live in the database and admins edit them in "ניהול משפחה".
 *  - isAdmin:  approves new accounts, edits members, cancels any booking
 *  - canScore: may change dishwashing points (can only be changed in the Firebase console)
 *  - avatar:   an emoji, or '' to show the first letter of the name
 *  - inDishes: false = not shown in the dishwashing table (default: shown)
 */
export const DEFAULT_MEMBERS = [
  { id: 'dad',   name: 'אבא',  avatar: '👨', color: '#6366F1', canScore: true, inDishes: false },
  { id: 'mom',   name: 'אמא',  avatar: '👩', color: '#EC4899', inDishes: false },
  { id: 'gilad', name: 'גלעד', avatar: '',   color: '#0EA5E9', isAdmin: true },
  { id: 'ori',   name: 'אורי', avatar: '',   color: '#10B981' },
  { id: 'roni',  name: 'רוני', avatar: '',   color: '#F59E0B' },
  { id: 'noam',  name: 'נועם', avatar: '',   color: '#8B5CF6' },
  { id: 'yael',  name: 'יעל',  avatar: '',   color: '#EF4444' },
];

/** Cars. If you add a car, also add its id to the list in firestore.rules. `icon` = Lucide icon name. */
export const CARS = [
  { id: 'car1', name: 'רכב 1 - סיטרואן',  short: 'סיסי',  description: '', icon: 'car',       color: '#6366F1' },
  { id: 'car2', name: 'רכב 2 - יונדאי', short: 'קוני', description: '',     icon: 'car-front', color: '#14B8A6' },
];

/** Quick-pick notes under the booking form. */
export const NOTE_PRESETS = ['דייט' ,'אימון', 'סידורים', 'עבודה', 'קניות', 'חוג', 'בילוי'];

/** Colors offered when adding a family member. */
export const MEMBER_COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#8B5CF6', '#EF4444', '#14B8A6'];
