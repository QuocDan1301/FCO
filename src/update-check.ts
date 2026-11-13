// Phát hiện bản cập nhật khi người chơi để game mở lâu (tab không đóng, bản cài về máy chạy nền).
// Mỗi lần build có mã riêng (__BUILD_ID__, vite.config.ts) ghi ra version.json; game hỏi file đó (không lưu đệm) mỗi 2 phút
// và mỗi khi quay lại tab / ứng dụng. Khác mã đang chạy → có bản mới.
// Ép cập nhật (người dùng chốt 2026-11-12): tải lại khi chuyển trang, khi máy chủ báo dữ liệu đã đổi (FCO_CATALOG_STALE),
// hoặc hết hạn chót 2 phút. Không tải lại giữa lúc đang mở gói / đập thẻ / xem trận GLXH / sút Penalty (setUpdateHold):
// chờ xong mới tải.
export const CHECK_EVERY_MS = 120_000;
export const UPDATE_DEADLINE_MS = 120_000;

export const currentBuild = () => (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '');

// Bản mới khi máy chủ trả mã khác mã đang chạy (thiếu mã — chạy dev / mothe.html — thì không báo).
export function isNewer(running: string, remote: unknown) {
  const build = remote && typeof remote === 'object' ? (remote as { build?: unknown }).build : undefined;
  return !!running && typeof build === 'string' && build.length > 0 && build !== running;
}

export async function fetchRemoteBuild(base: string, fetchFn: typeof fetch = fetch) {
  const res = await fetchFn(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

const baseUrl = () => { try { return import.meta.env?.BASE_URL || '/'; } catch { return '/'; } };
// Hỏi máy chủ: đã có bản mới chưa (lỗi mạng → chưa).
export async function checkForUpdate() {
  try { if (isNewer(currentBuild(), await fetchRemoteBuild(baseUrl()))) { markUpdateReady(); return true; } } catch { /* thử lại sau */ }
  return false;
}

// ---- Trạng thái dùng chung: đã có bản mới, đang bận (không được tải lại), đang chờ tải lại. ----
const holds = new Set<string>();
let ready = false, pending = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export const onUpdateChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const updateReady = () => ready;
export const updatePending = () => pending;
export const updateHeld = () => holds.size > 0;
export function markUpdateReady() { if (!ready) { ready = true; emit(); } }
// Đang mở gói, đập thẻ, xem trận GLXH, sút Penalty…: giữ (on = true) để không tải lại giữa chừng; bỏ giữ thì tải lại nếu đang chờ.
export function setUpdateHold(key: string, on: boolean) {
  if (on) holds.add(key); else holds.delete(key);
  if (!on && pending && holds.size === 0) void reloadToLatest();
  emit();
}
// Muốn tải lại sang bản mới: tải ngay nếu không bận, không thì chờ tới khi xong việc đang làm.
export function requestReload() {
  pending = true; emit();
  if (holds.size === 0) void reloadToLatest();
}

// Chống tải lại liên tục (vd. máy chủ lưu đệm bản cũ): cùng một bản đã tự tải lại trong 60 giây thì thôi.
const LOOP_KEY = 'fco-update-reload';
export function reloadAllowed(storage: Pick<Storage, 'getItem' | 'setItem'> | null, running: string, now = Date.now()) {
  try {
    const last = JSON.parse(storage?.getItem(LOOP_KEY) ?? 'null') as { build?: string; at?: number } | null;
    if (last && last.build === running && typeof last.at === 'number' && now - last.at < 60_000) return false;
    storage?.setItem(LOOP_KEY, JSON.stringify({ build: running, at: now }));
  } catch { /* không lưu được: vẫn cho tải lại */ }
  return true;
}

// Tải lại trang lấy bản mới: báo service worker kiểm tra sw.js mới trước (nếu có) rồi tải lại.
export async function reloadToLatest() {
  const storage = (() => { try { return sessionStorage; } catch { return null; } })();
  if (!reloadAllowed(storage, currentBuild())) return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* không có service worker */ }
  window.location.reload();
}

// Chuyển trang khi đã có bản mới: nhớ trang muốn tới rồi tải lại, mở thẳng trang đó sau khi tải.
const NEXT_VIEW_KEY = 'fco-update-next-view';
export function reloadIntoView(view: string) {
  try { sessionStorage.setItem(NEXT_VIEW_KEY, view); } catch { /* về trang chủ cũng được */ }
  requestReload();
}
export function takeNextView(): string | null {
  try { const v = sessionStorage.getItem(NEXT_VIEW_KEY); sessionStorage.removeItem(NEXT_VIEW_KEY); return v; } catch { return null; }
}
