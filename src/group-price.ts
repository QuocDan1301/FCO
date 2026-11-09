// Giá chuẩn theo Giacauthu.xlsx: chỉ phụ thuộc nhóm (phanloai.xlsx) và OVR của thẻ.
// OVR 99 có giá gốc của nhóm, mỗi OVR tăng thêm thì giá nhân 1,5.
export type PriceGroup = 1 | 2 | 3;
export const PRICE_BASE_OVR = 99;
export const PRICE_OVR_STEP = 1.5;
export const GROUP_BASE_PRICE: Record<PriceGroup, number> = { 1: 2000, 2: 4000, 3: 6000 };

export function groupPrice(group: PriceGroup, ovr: number) {
  if (!Number.isInteger(ovr) || ovr < PRICE_BASE_OVR) throw new Error(`OVR ${ovr} nằm ngoài bảng giá.`);
  return Math.round(GROUP_BASE_PRICE[group] * PRICE_OVR_STEP ** (ovr - PRICE_BASE_OVR));
}
