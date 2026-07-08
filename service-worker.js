const CACHE='financeapp-pro-v1';
const ASSETS=['./','index.html','style.css','script.js','manifest.json','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
