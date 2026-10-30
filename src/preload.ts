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

// Tải sẵn ảnh sắp dùng vào bộ nhớ đệm trình duyệt (không chờ).
export function prefetchImages(urls: (string | undefined)[]) {
  for (const url of new Set(urls)) { if (url) { const image = new Image(); image.decoding = 'async'; image.src = url; } }
}
