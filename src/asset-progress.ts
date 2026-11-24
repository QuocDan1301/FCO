// Tiến trình tải tài nguyên hiện ở vòng tròn trên thanh trên cùng (src/AssetProgress.tsx).
// Chỉ báo cho giao diện khi số phần trăm hoặc trạng thái đổi: tải gần 5.000 file không làm giao diện vẽ lại gần 5.000 lần.
// Phần trăm làm tròn xuống theo số file (không theo dung lượng), nên chỉ hiện 100 khi đã tải đủ.
export type AssetProgress = { status: 'idle' | 'loading' | 'done' | 'partial'; percent: number; failed: number };

export function createAssetProgress() {
  let snapshot: AssetProgress = { status: 'idle', percent: 0, failed: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: AssetProgress) => {
    if (next.status === snapshot.status && next.percent === snapshot.percent && next.failed === snapshot.failed) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  let last = { loaded: 0, total: 0 };
  return {
    get: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(loaded: number, total: number) {
      last = { loaded, total };
      publish({ status: 'loading', percent: total > 0 ? Math.floor(loaded / total * 100) : 100, failed: 0 });
    },
    finish(failed: number) {
      const percent = last.total > 0 ? Math.floor(last.loaded / last.total * 100) : 100;
      publish(failed > 0 ? { status: 'partial', percent, failed } : { status: 'done', percent: 100, failed: 0 });
    },
  };
}

export const assetProgress = createAssetProgress();
// Tiến độ từng phần (bảng mở ra khi bấm nút tiến độ): mỗi phần đã tải / tổng, phần đang tải. Chỉ báo khi % một phần hoặc phần đang tải đổi.
export type AssetPart = { id: string; label: string; loaded: number; total: number };
export type AssetPartsState = { parts: AssetPart[]; current: string | null };
export function createAssetParts() {
  let snapshot: AssetPartsState = { parts: [], current: null };
  const listeners = new Set<() => void>();
  let parts: AssetPart[] = [];
  let current: string | null = null;
  const pct = (p: AssetPart) => p.total > 0 ? Math.floor(p.loaded / p.total * 100) : 100;
  const publish = () => { snapshot = { parts: parts.map(p => ({ ...p })), current }; listeners.forEach(listener => listener()); };
  return {
    get: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Danh sách phần theo thứ tự tải; phần không có file thì bỏ.
    init(list: AssetPart[]) { parts = list.filter(p => p.total > 0).map(p => ({ ...p })); current = parts.find(p => p.loaded < p.total)?.id ?? null; publish(); },
    loaded(id: string) {
      const part = parts.find(p => p.id === id);
      if (!part || part.loaded >= part.total) return;
      const before = pct(part);
      part.loaded++;
      const next = part.loaded < part.total ? id : parts.find(p => p.loaded < p.total)?.id ?? null;
      if (pct(part) !== before || next !== current) { current = next; publish(); }
    },
    finish() { if (current !== null) { current = null; publish(); } },
  };
}
export const assetParts = createAssetParts();
