export type LoadProgress = { loaded: number; total: number };

// Thiếu vài file không chặn vào game (trình duyệt tự tải lại khi cần hiện); lỗi trên tỷ lệ này thì gần như chắc chắn là mất mạng.
const MAX_FAILED_RATIO = .05;
export const tooManyFailed = (failed: number, total: number) => failed > total * MAX_FAILED_RATIO;

// Giới hạn kết nối; chỉ đánh dấu xong sau khi đã nhận đủ nội dung phản hồi. File lỗi lẻ tẻ được tải lại tối đa attempts lượt;
// lỗi hàng loạt thì trả về ngay, không thử lại để khỏi bắt người chơi chờ lâu khi mất mạng.
export async function preloadResources(
  urls: string[],
  onProgress: (progress: LoadProgress) => void,
  completed = new Set<string>(),
  fetcher: typeof fetch = fetch,
  concurrency = 6,
  attempts = 3,
): Promise<string[]> {
  const unique = [...new Set(urls)];
  let pending = unique.filter(url => !completed.has(url));
  let loaded = unique.length - pending.length;
  onProgress({ loaded, total: unique.length });
  for (let attempt = 1; ; attempt++) {
    const failed: string[] = [];
    let next = 0;
    const batch = pending;
    await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), batch.length) }, async () => {
      while (next < batch.length) {
        const url = batch[next++];
        try {
          const response = await fetcher(url, { cache: 'force-cache', signal: AbortSignal.timeout(30_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await response.arrayBuffer();
          completed.add(url);
          onProgress({ loaded: ++loaded, total: unique.length });
        } catch {
          failed.push(url);
        }
      }
    }));
    if (!failed.length || attempt >= attempts || tooManyFailed(failed.length, unique.length)) return failed;
    pending = failed;
  }
}

// Tải nền chỉ chạy khi mạng đủ khoẻ và người dùng không bật tiết kiệm dữ liệu; máy không báo thông tin mạng thì coi như được.
export const canLoadInBackground = (connection?: { saveData?: boolean; effectiveType?: string }) => !connection?.saveData && !/2g|3g/.test(connection?.effectiveType ?? '');
// Điện thoại / máy tính bảng / trình duyệt trong app (Zalo, Facebook…) KHÔNG tải nền ~270 MB ảnh (2026-11-14: Safari iPhone mở từ Zalo
// báo "Đã có sự cố xảy ra liên tục" — trang bị tắt vì quá bộ nhớ; còn tốn 4G). Ảnh vẫn tải khi cần hiện. Chỉ máy tính để bàn / laptop tải nền.
export function isConstrainedDevice(nav: { userAgent?: string; maxTouchPoints?: number; deviceMemory?: number } = typeof navigator === 'undefined' ? {} : navigator as never) {
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod|Android|Mobile|Zalo|FBAN|FBAV|Instagram|Line\/|wv\)/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true; // iPad báo là Mac
  return typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
}

// Tải sẵn ảnh sắp dùng vào bộ nhớ đệm trình duyệt (không chờ).
export function prefetchImages(urls: (string | undefined)[]) {
  for (const url of new Set(urls)) { if (url) { const image = new Image(); image.decoding = 'async'; image.src = url; } }
}
