// Giá các cấp +1…+13 từ 4 mốc giá thật (+1, +5, +8, +11) theo kiểu TTCN FC Online (26TS, ITM, 23HW từ 2026-11-08):
// nội suy hình học có trọng số giữa hai mốc, ngoại suy +12 / +13 theo tỉ lệ +8→+11. Mốc giữ nguyên số gốc;
// giá tính ra làm tròn 3 chữ số có nghĩa như TTCN (58.159.231 → 58.200.000); dãy giá không bao giờ giảm theo cấp.

export type PriceAnchors = { p1: number | null; p5: number | null; p8: number | null; p11: number | null };

// Làm tròn tới 3 chữ số có nghĩa (giá TTCN hiển thị 58.2M, 9.44B, 1,130B…).
export function roundFCOPrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(price)) - 2);
  return Math.round(price / step) * step;
}

// Đọc giá kiểu TTCN: "55.5M" → 55.500.000, "1,130B" → 1.130.000.000.000 (M = triệu, B = tỉ); "824,000" → 824.000 BP.
export function parseFcoPrice(text: string): number {
  const m = /^([\d.,]+)\s*([MB]?)$/i.exec(text.trim());
  if (!m) throw new Error(`Giá không hợp lệ: ${text}`);
  if (!m[2]) return Number(m[1].replace(/,/g, ''));
  return Math.round(Number(m[1].replace(/,/g, '')) * (m[2].toUpperCase() === 'B' ? 1e9 : 1e6));
}

// Bảng mốc giá một mùa: tên → [+5, +8, +11] dạng chữ TTCN; null = ảnh không có.
export type AnchorTable = Record<string, [string | null, string | null, string | null]>;

// Tỉ lệ trung vị cột `to` / cột `from` (0 = +5, 1 = +8, 2 = +11) trên các thẻ có đủ hai cột.
export function medianRatio(anchors: AnchorTable, from: 0 | 1, to: 1 | 2): number {
  const r = Object.values(anchors).filter(a => a[from] !== null && a[to] !== null).map(a => parseFcoPrice(a[to]!) / parseFcoPrice(a[from]!)).sort((x, y) => x - y);
  if (!r.length) throw new Error('Không có thẻ nào đủ giá để ước tính.');
  return r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
}
export const medianPlus11Ratio = (anchors: AnchorTable) => medianRatio(anchors, 1, 2);

// 4 mốc của một thẻ: +1 giữ giá cũ; +5 thiếu → giữ +5 cũ; +8 thiếu → +5 × tỉ lệ +8/+5 trung vị; +11 thiếu → +8 × tỉ lệ +11/+8 trung vị.
export function resolveAnchors(old: (number | null)[], [p5, p8, p11]: AnchorTable[string], anchors: AnchorTable): PriceAnchors {
  const v5 = p5 === null ? old[4] : parseFcoPrice(p5);
  const v8 = p8 !== null ? parseFcoPrice(p8) : v5 ? roundFCOPrice(v5 * medianRatio(anchors, 0, 1)) : null;
  const v11 = p11 !== null ? parseFcoPrice(p11) : v8 ? roundFCOPrice(v8 * medianRatio(anchors, 1, 2)) : null;
  return { p1: old[0], p5: v5, p8: v8, p11: v11 };
}

const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

// from · (to / from)^w; thiếu một mốc (hoặc mốc bằng 0) thì không chia, giữ giá mốc còn lại.
function between(from: number | null, to: number | null, w: number): number | null {
  if (valid(from) && valid(to)) return roundFCOPrice(from * Math.pow(to / from, w));
  return valid(from) ? from : valid(to) ? to : null;
}

// Trả về 13 giá (+1 … +13); chỉ số i = cấp − 1. Cấp không tính được (thiếu mọi mốc) là null.
export function fcoLevelPrices({ p1, p5, p8, p11 }: PriceAnchors): (number | null)[] {
  const r8_11 = valid(p8) && valid(p11) ? p11 / p8 : null;
  const extra = (w: number) => valid(p11) && r8_11 !== null ? roundFCOPrice(p11 * Math.pow(r8_11, w)) : (valid(p11) ? p11 : null);
  const raw: (number | null)[] = [
    valid(p1) ? p1 : null,
    between(p1, p5, 0.15), between(p1, p5, 0.38), between(p1, p5, 0.65),
    valid(p5) ? p5 : null,
    between(p5, p8, 0.28), between(p5, p8, 0.60),
    valid(p8) ? p8 : null,
    between(p8, p11, 0.30), between(p8, p11, 0.63),
    valid(p11) ? p11 : null,
    extra(0.38), extra(0.80),
  ];
  // Không giảm theo cấp: cấp sau ít nhất bằng cấp trước.
  let floor = 0;
  return raw.map(price => price === null ? null : (floor = Math.max(price, floor)));
}
