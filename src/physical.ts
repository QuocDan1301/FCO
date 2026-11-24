import data from './player-physical.json';

// Chiều cao / cân nặng / thể hình / hai chân của thẻ (src/player-physical.json, nguồn fifaaddict). Chỉ để hiển thị ở Thông tin cầu thủ.
export type Physical = { height: number; weight: number; body: string | null; left: number; right: number };
const table = data as unknown as { bodies: string[]; cards: Record<string, [number, number, number, number, number]> };
export function physicalOf(playerId: number): Physical | null {
  const row = table.cards[String(playerId)];
  if (!row) return null;
  const [height, weight, body, left, right] = row;
  return { height, weight, body: table.bodies[body] ?? null, left, right };
}
