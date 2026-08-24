/* PhysioCore service worker — cache-first, fully offline after first load.
   Registered with scope '/physiocore_' so it never collides with the Drop-root sw.js
   (DropTheme & friends register scope '/'). Cross-origin requests made by pages this
   SW controls (Google Fonts) are runtime-cached; everything the app needs to boot —
   HTML, Three.js vendor modules, Draco decoder, GLB anatomy (~17MB) — is precached. */
const VERSION = "physiocore-v2.1.0";
const PRECACHE = [
  "/physiocore_v2.html",
  "/physiocore_manifest.json",
  "/physiocore_icon_192.png",
  "/physiocore_icon_512.png",
  "/physiocore_icon_maskable_512.png",
  "/physiocore_assets/lower-limb.glb",
  "/physiocore_assets/upper-limb.glb",
  "/physiocore_assets/overview-skeleton.glb",
  "/physiocore_assets/vendor/three.module.js",
  "/physiocore_assets/vendor/addons/controls/OrbitControls.js",
  "/physiocore_assets/vendor/addons/loaders/GLTFLoader.js",
  "/physiocore_assets/vendor/addons/loaders/DRACOLoader.js",
  "/physiocore_assets/vendor/addons/utils/BufferGeometryUtils.js",
  "/physiocore_assets/draco/draco_wasm_wrapper.js",
  "/physiocore_assets/draco/draco_decoder.wasm",
  "/physiocore_assets/draco/draco_decoder.js"
];
/* Google Fonts CSS is imported from the page; its woff2 URLs vary, so the CSS is
   precached (no-cors — CSS may be consumed opaque) and fonts are runtime-cached. */
const PRECACHE_OPAQUE = [
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&family=Space+Grotesk:wght@500;700;800&family=Heebo:wght@400;600;700;800;900&display=swap"
];
const RUNTIME_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "www.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(PRECACHE);
    await Promise.all(PRECACHE_OPAQUE.map(async (u) => {
      try { await cache.put(u, await fetch(u, { mode: "no-cors" })); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("physiocore-") && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const inScope = sameOrigin && (url.pathname.startsWith("/physiocore_") || url.pathname === "/physiocore_v2.html");
  const runtimeHost = RUNTIME_HOSTS.includes(url.hostname);
  if (!inScope && !runtimeHost) return; /* let everything else hit the network untouched */

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    } catch (err) {
      /* offline navigation → serve the app shell */
      if (req.mode === "navigate") {
        const shell = await cache.match("/physiocore_v2.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
