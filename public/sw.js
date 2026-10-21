// Retire the offline demo service worker; never cache authenticated content.
self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.registration.unregister(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('servimatch-shell-')).map(k=>caches.delete(k))))])));
