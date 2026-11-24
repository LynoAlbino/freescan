import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(`${path}/${e.name}`) : `${path}/${e.name}`,
      ),
    )
  ).flat();
}
const files = (await walk("dist"))
  .filter(
    (p) =>
      !p.endsWith("sw.js") && !p.includes("/tessdata/") && !p.endsWith(".map"),
  )
  .map((p) => p.slice(5));
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(`dist/${file}`));
const version = hash.digest("hex").slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const CACHE='freescan-app-${version}',LANG='freescan-languages-v1',FILES=${JSON.stringify(files)};
const url=p=>new URL(p,self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const path of FILES)await cache.add(new Request(url(path),{cache:'reload'}));const languages=await caches.open(LANG);if(!await languages.match(url('tessdata/eng.traineddata.gz')))await languages.add(url('tessdata/eng.traineddata.gz'));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('freescan-app-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const req=event.request,u=new URL(req.url);if(req.method!=='GET'||u.origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(u.pathname.includes('/tessdata/')?LANG:CACHE);const hit=await cache.match(req);if(hit)return hit;try{const response=await fetch(req);if(response.ok&&u.pathname.includes('/tessdata/'))await cache.put(req,response.clone());return response;}catch(error){if(req.mode==='navigate'){const index=await(await caches.open(CACHE)).match(url('index.html'));if(index)return index;}throw error;}})());});`,
);
console.log(`Offline cache ${version}: ${files.length} assets + English OCR.`);
