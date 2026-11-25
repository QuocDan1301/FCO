import data from './player-physical.json';
import { latestSourceId } from './latest-season';
import manualData from './player-info-manual.json';

// Chiều cao / cân nặng / thể hình / hai chân của thẻ (src/player-physical.json, nguồn fifaaddict). Chỉ để hiển thị ở Thông tin cầu thủ.
// weight / left / right = 0: chưa rõ (thông tin điền tay, src/player-info-manual.json) → giao diện ẩn.
export type Physical = { height: number; weight: number; body: string | null; left: number; right: number };
type Manual = { height?: number; weight?: number; left?: number; right?: number };
const manual = (manualData as unknown as { cards: Record<string, Manual> }).cards;
const table = data as unknown as { bodies: string[]; cards: Record<string, [number, number, number, number, number]> };
export function physicalOf(playerId: number): Physical | null {
  // Thẻ NARUTO… chưa có dữ liệu: lấy của mùa mới nhất cùng cầu thủ (src/latest-season.ts).
  const src = String(playerId) in table.cards ? playerId : latestSourceId(playerId, id => String(id) in table.cards);
  const row = src === null ? undefined : table.cards[String(src)];
  if (!row) {
    const m = manual[String(playerId)];
    return m?.height ? { height: m.height, weight: m.weight ?? 0, body: null, left: m.left ?? 0, right: m.right ?? 0 } : null;
  }
  const [height, weight, body, left, right] = row;
  return { height, weight, body: table.bodies[body] ?? null, left, right };
}
