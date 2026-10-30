// Service worker của bản cài về máy: lưu trang và tài nguyên đã tải để mở nhanh và chơi khách khi mất mạng.
// Chỉ phục vụ trang chính và thư mục assets; mothe.html (370 MB) và Supabase đi thẳng ra mạng.
const CACHE = 'fco-v1';
const scope = new URL(self.registration.scope);
const bundlePattern = /[^"'\s]*\/assets\/main-[^/"]+\.(?:js|css)/g;

const bundlesIn = html => html.match(bundlePattern) ?? [];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(scope.href, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.clone().text();
    await cache.put(scope.href, response);
    await cache.addAll(bundlesIn(html));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

// Luôn ưu tiên bản mới nhất của trang; bản build cũ được dọn ngay khi trang đổi để khỏi đầy dần sau mỗi lần cập nhật.
async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put(scope.href, response.clone());
      const current = new Set(bundlesIn(html));
      for (const key of await cache.keys()) {
        const { pathname } = new URL(key.url);
        if (bundlesIn(pathname).length && !current.has(pathname)) await cache.delete(key);
      }
    }
    return response;
  } catch {
    return (await cache.match(scope.href, { ignoreVary: true })) ?? Response.error();
  }
}

async function resource(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const stored = await cache.match(request, { ignoreVary: true });
  // Tải trước (force-cache) gọi hàng nghìn file mỗi lần mở nên không kiểm tra lại; ảnh đang hiện thì làm mới ngầm cho lần sau.
  if (stored && request.cache === 'force-cache') return stored;
  const network = fetch(request).then(async response => {
    // Hết dung lượng lưu trữ thì game vẫn chạy bình thường qua mạng.
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  if (!stored) return network;
  event.waitUntil(network.catch(() => {}));
  return stored;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  // Nhạc phát theo từng đoạn (Range) nên để trình duyệt tự xử lý.
  if (request.method !== 'GET' || url.origin !== scope.origin || request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    if (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`) event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith(`${scope.pathname}assets/`)) event.respondWith(resource(event));
});
