// Giá chuẩn theo Giacauthu.xlsx: chỉ phụ thuộc nhóm (phanloai.xlsx) và OVR của thẻ.
// OVR 99 có giá gốc của nhóm, mỗi OVR tăng thêm thì giá nhân 1,5.
export type PriceGroup = 1 | 2 | 3;
export const PRICE_BASE_OVR = 99;
export const PRICE_OVR_STEP = 1.5;
export const GROUP_BASE_PRICE: Record<PriceGroup, number> = { 1: 2000, 2: 4000, 3: 6000 };

// Thẻ dưới OVR 99 đồng giá, không phân nhóm và không dao động theo kỳ (market.ts).
export const FLAT_PRICE = 1000;

// Mùa LIVE có công thức riêng, không theo nhóm và OVR: +1 là 1.000 BP, mỗi cấp nhân 2; giá cố định, không dao động theo kỳ.
export const LIVE_BASE_PRICE = 1000;
export const LIVE_LEVEL_STEP = 2;
export const livePrice = (level: number) => LIVE_BASE_PRICE * LIVE_LEVEL_STEP ** (level - 1);

export function groupPrice(group: PriceGroup, ovr: number) {
  if (!Number.isInteger(ovr) || ovr < 1) throw new Error(`OVR ${ovr} nằm ngoài bảng giá.`);
  if (ovr < PRICE_BASE_OVR) return FLAT_PRICE;
  return Math.round(GROUP_BASE_PRICE[group] * PRICE_OVR_STEP ** (ovr - PRICE_BASE_OVR));
}

// Hệ số giá riêng theo mùa (người dùng chốt 2026-11-09): INFINITE PRIME và PRIME ×1,5, ICON TM (ITM) ×2.
export const SEASON_PRICE_FACTOR: Readonly<Record<string, number>> = { prime: 1.5, prm: 1.5, eternal: 2 };

// Giá chuẩn của một thẻ: LIVE theo công thức riêng, các mùa khác theo nhóm + OVR rồi nhân hệ số mùa.
export function seasonPrice(tier: string, group: PriceGroup, ovr: number, level: number) {
  if (tier === 'live') return livePrice(level);
  const price = groupPrice(group, ovr), factor = SEASON_PRICE_FACTOR[tier];
  return factor && price !== FLAT_PRICE ? Math.round(price * factor) : price;
}
