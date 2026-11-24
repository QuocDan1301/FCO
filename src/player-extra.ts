import data from './player-extra.json';
import { asset } from './asset';

// Ngày sinh / kỹ thuật (sao) / danh tiếng / chỉ số ẩn gốc của thẻ (src/player-extra.json, nguồn fifaaddict, scripts/build-player-extra.mjs). Chỉ để hiển thị.
export type Extra = { birth: string | null; skill: number; reputation: string; traits: number[] };
const table = data as unknown as { reps: string[]; traits: Record<string, [string, string]>; cards: Record<string, [string | null, number, number, number[]]> };
// Danh tiếng fifaaddict → tiếng Việt (Messi PRM = World Class = "Siêu sao" theo ảnh mẫu của người dùng).
const REPUTATION: Record<string, string> = { Legendary: 'Huyền thoại', 'World Class': 'Siêu sao', 'Top Class': 'Ngôi sao', 'Famous Player': 'Nổi tiếng', 'Regular Player': 'Bình thường' };
export function extraOf(playerId: number): Extra | null {
  const row = table.cards[String(playerId)];
  if (!row) return null;
  // Chỉ số ẩn gốc = chỉ số thường (mã < 50); mã 50+ là CSA vàng, hiện riêng ở dòng Chỉ số ẩn mới.
  return { birth: row[0], skill: row[1], reputation: REPUTATION[table.reps[row[2]]] ?? table.reps[row[2]] ?? '', traits: row[3].filter(id => id < 50) };
}
export const baseTraitName = (id: number) => table.traits[String(id)]?.[0] ?? '';
export const baseTraitDesc = (id: number) => table.traits[String(id)]?.[1] ?? '';
// Icon chỉ số ẩn thường: ảnh chính thức của game (người dùng gửi thư mục externalAssets/common/traits, 2026-11-24) cho 28 mã; 8 mã game không có
// (2, 8, 10, 40, 45–48) dùng ảnh fifaaddict tô lại cùng màu nền. Bộ đặc điểm đào tạo / bản bạc để ở public/assets/training-traits (t-NNN, s-NNN).
export const baseTraitIcon = (id: number) => asset(`/assets/traits/trait-${id}-v2.png`);

// Mọi mã chỉ số ẩn của thẻ (gồm cả CSA vàng, mã 50+) để lọc ở TTCN; danh sách chọn gồm tên và mã.
export const traitIdsOf = (playerId: number): number[] => table.cards[String(playerId)]?.[3] ?? [];
export const traitOptions = (): { id: number; name: string }[] => Object.entries(table.traits).map(([id, v]) => ({ id: Number(id), name: v[0] })).sort((a, b) => a.id - b.id);
