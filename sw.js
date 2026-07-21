/* =========================================================
   Trade Journal — Service Worker (PWA offline support)
   กลยุทธ์:
   - Navigation (HTML)        -> Network-first, fallback เป็น shell ที่ cache ไว้ (ใช้งาน offline ได้)
   - CDN ภายนอก (cdnjs)       -> Cache-first (ไลบรารี versioned/immutable)
   - ไฟล์ static เดียวกัน (origin) -> Stale-While-Revalidate
   เปลี่ยน CACHE_VERSION เมื่ออัปเดตไฟล์ เพื่อล้าง cache เก่าอัตโนมัติ
   ========================================================= */

const CACHE_VERSION = "v8";
const CACHE_NAME = `trade-journal-${CACHE_VERSION}`;

// ไฟล์หลักที่ต้อง cache ไว้ให้เปิด offline ได้ตั้งแต่ครั้งแรก
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./app.js",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js"
];

// ---------- Install: precache app shell ----------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache:"reload" บังคับดึงของสดจาก network (เลี่ยง HTTP cache ของเบราว์เซอร์)
    await Promise.allSettled(
      PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })))
    );
    await self.skipWaiting(); // เปิดใช้เวอร์ชันใหม่ทันที
  })());
});

// ---------- Activate: ลบ cache เวอร์ชันเก่า ----------
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ---------- Fetch: routing ตามกลยุทธ์ ----------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // ข้าม POST/PUT ฯลฯ

  const url = new URL(req.url);

  // 1) การนำทางหน้าเว็บ -> Network-first, fallback เป็น shell
  if (req.mode === "navigate") {
    event.respondWith(networkFirstShell(req));
    return;
  }

  // 2) CDN ภายนอก -> Cache-first
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 3) static ภายใน origin -> Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(req));
});

// อนุญาตให้หน้าเว็บสั่ง SW ให้ข้ามการรอ (สำหรับปุ่ม "อัปเดตแอป" ในอนาคต)
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ---------- Strategy helpers ----------
async function networkFirstShell(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    cache.put("./index.html", fresh.clone());
    return fresh;
  } catch (e) {
    return (
      (await cache.match(req)) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./")) ||
      Response.error()
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    networkPromise; // อัปเดต cache เบื้องหลัง
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  // offline ครั้งแรก + ไฟล์มี query (?v=xx) -> fallback ไปไฟล์ base ที่ precache ไว้
  return (await cache.match(req, { ignoreSearch: true })) || Response.error();
}
