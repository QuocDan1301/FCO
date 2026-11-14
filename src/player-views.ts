// Lượt xem thẻ (Tâm điểm TTCN "Được xem nhiều nhất"): gom lượt mở Thông tin cầu thủ trên máy, gửi kèm heartbeat mỗi phút
// (fco_heartbeat p_views, migration 202611140004) — không thêm lệnh máy chủ riêng để đỡ Disk IO.
const pending = new Map<number, number>();
const MAX_KINDS = 20, MAX_EACH = 3; // khớp giới hạn máy chủ

export function noteView(playerId: number) {
  if (!Number.isInteger(playerId) || playerId <= 0) return;
  if (!pending.has(playerId) && pending.size >= MAX_KINDS) return;
  pending.set(playerId, Math.min(MAX_EACH, (pending.get(playerId) ?? 0) + 1));
}
/** Lấy và xoá lượt xem đang chờ gửi; null nếu không có. Gửi lỗi thì gọi restoreViews để không mất. */
export function takeViews(): Record<string, number> | null {
  if (!pending.size) return null;
  const out = Object.fromEntries([...pending].map(([id, n]) => [String(id), n]));
  pending.clear();
  return out;
}
export function restoreViews(views: Record<string, number> | null) {
  if (views) for (const [id, n] of Object.entries(views)) { noteView(Number(id)); if (n > 1) pending.set(Number(id), Math.min(MAX_EACH, (pending.get(Number(id)) ?? 0) + n - 1)); }
}
