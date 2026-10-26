export type LoadProgress = { loaded: number; total: number };

// Giới hạn kết nối; chỉ đánh dấu xong sau khi đã nhận đủ nội dung phản hồi.
export async function preloadResources(
  urls: string[],
  onProgress: (progress: LoadProgress) => void,
  completed = new Set<string>(),
  fetcher: typeof fetch = fetch,
  concurrency = 6,
): Promise<string[]> {
  const unique = [...new Set(urls)];
  const pending = unique.filter(url => !completed.has(url));
  const failed: string[] = [];
  let loaded = unique.length - pending.length;
  let next = 0;
  onProgress({ loaded, total: unique.length });
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), pending.length) }, async () => {
    while (next < pending.length) {
      const url = pending[next++];
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
  return failed;
}
