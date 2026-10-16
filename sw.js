/* Offline: vlastní soubory síť napřed, při výpadku z mezipaměti. Firebase si spojení řeší samo. */
const C='sk-v4',OWN=['./','index.html','app.js','app.css','manifest.json','favicon.ico','favicon-32x32.png','apple-touch-icon.png','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(OWN)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('sk-')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  const cacheable=u.origin===location.origin||/gstatic\.com\/firebasejs|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.href);if(!cacheable)return;
  /* vlastní soubory vždy ověřit na serveru (obejde 10min mezipaměť GitHub Pages), ať je nová verze vidět hned */
  e.respondWith((u.origin===location.origin?fetch(e.request.url,{cache:'no-cache'}):fetch(e.request)).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:u.origin===location.origin})))});
