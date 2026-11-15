import data from './gold-traits.json';
import { asset } from './asset';

// Chỉ số ẩn vàng của từng thẻ (theo mã cầu thủ = một mùa), lấy từ vn.fifaaddict.com (trait_gold của thẻ cùng tên, cùng mùa, OVR lệch ≤ 3).
// Dựng lại: node --import tsx scripts/build-gold-traits.mjs <fifaaddict-gold.json>. Thẻ không có trong bảng = không có chỉ số ẩn vàng
// (hoặc chưa có dữ liệu: mùa EL / TSUBASA không có trên fifaaddict VN, một số thẻ VIETNAM / LIVE / khác tên).
type GoldData = { names: Record<string, string>; desc: Record<string, string>; cards: Record<string, string> };
const gold = data as unknown as GoldData;
export type GoldTrait = { id: string; name: string; desc: string; icon: string };
// Biểu tượng vàng người dùng gửi 2026-11-15 (public/assets/traits/gold-<mã>.png, đối chiếu trait_icon_<mã> của fifaaddict).
export const goldTraitIcon = (id: string) => asset(`/assets/traits/gold-${id}.png`);
// Mã CSA vàng của thẻ (cho engine GLXH), tên ngắn theo mã.
export const goldTraitId = (playerId: number | null | undefined): string | undefined => playerId ? gold.cards[String(playerId)] : undefined;
export const goldTraitName = (id: string) => gold.names[id] ?? '';
export function goldTraitOf(playerId: number): GoldTrait | null {
  const id = gold.cards[String(playerId)];
  return id && gold.names[id] ? { id, name: gold.names[id], desc: gold.desc[id] ?? '', icon: goldTraitIcon(id) } : null;
}