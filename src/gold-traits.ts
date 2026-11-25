import data from './gold-traits.json';
import { asset } from './asset';

// Chỉ số ẩn vàng của từng thẻ (theo mã cầu thủ = một mùa), lấy từ vn.fifaaddict.com (trait_gold của thẻ cùng tên, cùng mùa, OVR lệch ≤ 3).
// Dựng lại: node --import tsx scripts/build-gold-traits.mjs <fifaaddict-gold.json>. Thẻ không có trong bảng = không có chỉ số ẩn vàng
// (hoặc chưa có dữ liệu: mùa EL / TSUBASA không có trên fifaaddict VN, một số thẻ VIETNAM / LIVE / khác tên).
// Mùa NARUTO (không có trên fifaaddict): gán tay theo CSA của cầu thủ ở mùa khác + lối chơi, scripts/data/gold-manual.json.
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
// ===== CSA vàng thêm (người dùng 2026-11-16) =====
// Thẻ +11 trở lên: chọn thêm 1 CSA vàng (ô "11"). Mùa ICON TM / INFINITE PRIME / PRIME / EL / NARUTO: thêm 1 ô nữa từ +7 (ô "7").
// Mùa EL thêm 1 ô nữa từ +5 (ô "5", người dùng 2026-11-25; máy chủ 202611250007_fco_gold_el_5.sql) → EL có 3 ô +5 / +7 / +11.
// GK chỉ chọn CSA của GK, cầu thủ khác không chọn CSA của GK. Đổi miễn phí bất cứ lúc nào; thẻ tụt dưới mốc thì mất CSA của ô đó
// (máy chủ xoá — migration 202611160006). Lưu trên thẻ: card.gold = { "5"?: mã, "7"?: mã, "11"?: mã }.
export const GOLD_GK_TRAITS = ['57', '60', '68'] as const;
// NARUTO thêm 2026-11-25 (máy chủ: 202611250006_fco_gold_extra_naruto.sql).
export const GOLD_EXTRA_TIERS = ['eternal', 'prime', 'prm', 'el', 'naruto'] as const;
export const GOLD_EL5_TIERS = ['el'] as const;
export type GoldSlot = '5' | '7' | '11';
export const GOLD_SLOTS: GoldSlot[] = ['5', '7', '11'];
const isGkTrait = (id: string) => (GOLD_GK_TRAITS as readonly string[]).includes(id);
/** Ô CSA thêm của thẻ theo mùa (không tính cấp): ô 7 chỉ ở GOLD_EXTRA_TIERS, ô 5 chỉ ở GOLD_EL5_TIERS. */
export const goldSlotsFor = (tier: string): GoldSlot[] => [
  ...((GOLD_EL5_TIERS as readonly string[]).includes(tier) ? ['5' as const] : []),
  ...((GOLD_EXTRA_TIERS as readonly string[]).includes(tier) ? ['7' as const] : []),
  '11',
];
/** Ô đang mở theo cấp thẻ. */
export const goldSlotOpen = (tier: string, level: number, slot: GoldSlot) => goldSlotsFor(tier).includes(slot) && level >= Number(slot);
/** CSA vàng chọn được cho cầu thủ: GK chỉ CSA GK; cầu thủ khác không có CSA GK. */
export const goldChoicesFor = (pos: string) => Object.keys(gold.names).filter(id => pos === 'GK' ? isGkTrait(id) : !isGkTrait(id)).sort((a, b) => Number(a) - Number(b));
/** CSA vàng thêm đang có hiệu lực của thẻ (đúng mùa, đủ cấp, đúng nhóm GK / không GK, không trùng CSA gốc / ô khác). */
export function goldExtras(card: { playerId: number; level: number; gold?: Partial<Record<GoldSlot, string>> | null }, tier: string, pos: string): string[] {
  const native = gold.cards[String(card.playerId)], ok = new Set(goldChoicesFor(pos)), out: string[] = [];
  for (const slot of GOLD_SLOTS) {
    const id = card.gold?.[slot];
    if (id && ok.has(id) && goldSlotOpen(tier, card.level, slot) && id !== native && !out.includes(id)) out.push(id);
  }
  return out;
}
/** Mọi CSA vàng có hiệu lực của thẻ: CSA gốc + CSA thêm (dùng cho GLXH). */
export const cardGoldTraits = (card: { playerId: number; level: number; gold?: Partial<Record<GoldSlot, string>> | null }, tier: string, pos: string) =>
  [...(gold.cards[String(card.playerId)] ? [gold.cards[String(card.playerId)]] : []), ...goldExtras(card, tier, pos)];
/** Bỏ các ô không còn đủ cấp (thẻ tụt dưới mốc → mất CSA ô đó); không còn ô nào thì bỏ hẳn trường gold. */
export function dropClosedGold<T extends { level: number; gold?: Partial<Record<GoldSlot, string>> | null }>(card: T, tier: string): T {
  if (!card.gold) return card;
  const kept = Object.fromEntries(GOLD_SLOTS.filter(s => card.gold![s] && goldSlotOpen(tier, card.level, s)).map(s => [s, card.gold![s]!]));
  if (Object.keys(kept).length === Object.keys(card.gold).length) return card;
  const { gold: _drop, ...rest } = card;
  return (Object.keys(kept).length ? { ...rest, gold: kept } : rest) as T;
}
export const goldTraitDesc = (id: string) => gold.desc[id] ?? '';