/* =====================================================================
 * sw.js — service worker: makes the app installable on Android,
 * keeps the app files fresh after every update (and usable offline),
 * and opens the app when a notification is tapped.
 * ===================================================================== */

const CACHE = 'family-hub-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// App files: network first (always the newest version), cached copy when offline.
// Other origins (Firebase, CDNs, fonts) are left alone.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      return (await caches.match(req)) || (await caches.match('./')) || Response.error();
    }
  })());
});

// Tapping a notification focuses the open app, or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((c) => c.url.startsWith(self.registration.scope));
    return win ? win.focus() : self.clients.openWindow(self.registration.scope);
  })());
});
