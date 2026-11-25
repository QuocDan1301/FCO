import data from './player-extra.json';
import { asset } from './asset';
import { latestSourceId } from './latest-season';
import { goldTraitId } from './gold-traits';
import manualData from './player-info-manual.json';

// Ngày sinh / kỹ thuật (sao) / danh tiếng / chỉ số ẩn gốc của thẻ (src/player-extra.json, nguồn fifaaddict, scripts/build-player-extra.mjs). Chỉ để hiển thị.
export type Extra = { birth: string | null; skill: number; reputation: string; traits: number[] };
const table = data as unknown as { reps: string[]; traits: Record<string, [string, string]>; cards: Record<string, [string | null, number, number, number[]]> };
// Danh tiếng fifaaddict → tiếng Việt (Messi PRM = World Class = "Siêu sao" theo ảnh mẫu của người dùng).
const REPUTATION: Record<string, string> = { Legendary: 'Huyền thoại', 'World Class': 'Siêu sao', 'Top Class': 'Ngôi sao', 'Famous Player': 'Nổi tiếng', 'Regular Player': 'Bình thường' };
// Thẻ NARUTO… chưa có dữ liệu: lấy hàng của mùa mới nhất cùng cầu thủ (src/latest-season.ts); CSA vàng (mã 50+) của mùa đó KHÔNG lấy,
// thay bằng CSA vàng của chính thẻ (gold-traits.json).
// Mỗi cầu thủ chỉ có tối đa 7 chỉ số ẩn phụ (chỉ số ẩn thường, mã < 50; người dùng 2026-11-25). Dữ liệu fifaaddict có 43 thẻ 8 chỉ số: giữ 7 chỉ số đầu theo thứ tự dữ liệu,
// bỏ chỉ số thứ 8. CSA vàng (mã 50+) không tính vào giới hạn này.
export const MAX_BASE_TRAITS = 7;
const capBase = (ids: number[]) => ids.filter(id => id < 50).slice(0, MAX_BASE_TRAITS);
function rowOf(playerId: number): [string | null, number, number, number[]] | undefined {
  const own = table.cards[String(playerId)];
  if (own) return own;
  const src = latestSourceId(playerId, id => String(id) in table.cards);
  if (src === null) {
    // Không có mùa nào khác: thông tin điền tay (src/player-info-manual.json) — chỉ ngày sinh; sao 0 = chưa rõ, danh tiếng trống.
    const m = (manualData as unknown as { cards: Record<string, { birth?: string; skill?: number }> }).cards[String(playerId)];
    const gold = goldTraitId(playerId);
    return m?.birth ? [m.birth, m.skill ?? 0, -1, gold ? [Number(gold)] : []] : undefined;
  }
  const [birth, skill, rep, traits] = table.cards[String(src)];
  const gold = goldTraitId(playerId);
  return [birth, skill, rep, [...traits.filter(id => id < 50), ...(gold ? [Number(gold)] : [])]];
}
export function extraOf(playerId: number): Extra | null {
  const row = rowOf(playerId);
  if (!row) return null;
  // Chỉ số ẩn gốc = chỉ số thường (mã < 50); mã 50+ là CSA vàng, hiện riêng ở dòng Chỉ số ẩn mới.
  return { birth: row[0], skill: row[1], reputation: REPUTATION[table.reps[row[2]]] ?? table.reps[row[2]] ?? '', traits: capBase(row[3]) };
}
export const baseTraitName = (id: number) => table.traits[String(id)]?.[0] ?? '';
export const baseTraitDesc = (id: number) => table.traits[String(id)]?.[1] ?? '';
// Icon chỉ số ẩn thường: ảnh chính thức của game (người dùng gửi thư mục externalAssets/common/traits, 2026-11-24) cho 28 mã; 8 mã game không có
// (2, 8, 10, 40, 45–48) dùng ảnh fifaaddict tô lại cùng màu nền. Bộ đặc điểm đào tạo / bản bạc để ở public/assets/training-traits (t-NNN, s-NNN).
export const baseTraitIcon = (id: number) => asset(`/assets/traits/trait-${id}-v2.png`);

// Mọi mã chỉ số ẩn của thẻ (gồm cả CSA vàng, mã 50+) để lọc ở TTCN; danh sách chọn gồm tên và mã.
export const traitIdsOf = (playerId: number): number[] => { const ids = rowOf(playerId)?.[3] ?? []; return [...capBase(ids), ...ids.filter(id => id >= 50)]; };
export const traitOptions = (): { id: number; name: string }[] => Object.entries(table.traits).map(([id, v]) => ({ id: Number(id), name: v[0] })).sort((a, b) => a.id - b.id);
