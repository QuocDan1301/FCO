// Cờ tỷ phú — luật chơi do máy chủ quyết (supabase/migrations/202611220001_fco_ctp.sql, fco_ctp_rules). Số ở đây chỉ để hiện giá /
// hướng dẫn và diễn hoạt cảnh; tests/ctp.test.ts so khớp với migration.
export const CTP_RULES = {
  prices: [{ count: 1, price: 20 }, { count: 10, price: 190 }, { count: 50, price: 900 }, { count: 100, price: 1800 }],
  firstPrice: 10,
  potPerPlay: 1,
  jackpotMin: 10000,
  ultimateChance: 0.008,
  miniChance: 0.06,
  winsPerDay: 2,
  maxRollBonus: 1,
  luckyMore: 2,
  luckyLess: 1,
  // Điểm theo số lắc 1..6 (202611220007_fco_ctp_roll_points.sql): 1 vòng 1.800 điểm ≈ 12–13k FC.
  rollPoints: [1, 1, 2, 3, 3, 4],
} as const;
export const ctpRollPoints = (roll: number) => CTP_RULES.rollPoints[roll - 1] ?? 0;
export const CTP_CELLS = 28;
export type CtpCellKind = 'ball' | 'mini' | 'special' | 'ultimate' | 'lucky';
export const ctpCellKind = (n: number): CtpCellKind => n === 7 ? 'mini' : n === 14 ? 'special' : n === 21 ? 'ultimate' : n === 28 ? 'lucky' : 'ball';
// Các ô quân đi qua từ from (không tính) tới to (tính), vòng 28 ô.
export function ctpPath(from: number, steps: number) {
  return Array.from({ length: steps }, (_, i) => (from + i) % CTP_CELLS + 1);
}
// Giá 1 lần bấm: lượt đầu tiên của tài khoản (mua 1 lượt) được giảm.
export const ctpPrice = (count: number, firstDone: boolean) =>
  count === 1 && !firstDone ? CTP_RULES.firstPrice : CTP_RULES.prices.find(p => p.count === count)?.price ?? 0;

// Số lượt còn nhận được của một mốc (khớp fco_ctp_reached + fco_ctp_claim, 202611220002): mốc thường nhận lại mỗi vòng `round` điểm;
// mốc 1 lần (once) / đặc biệt chỉ 1 lần; mốc đặc biệt cần đã nhận ít nhất 1 quà mốc thường; mốc paidOnly cần đã chơi trả FC.
export type CtpMilestoneRule = { idx: number; points: number; once: boolean; paidOnly: boolean; special: boolean };
export function ctpAvailable(points: number, m: CtpMilestoneRule, claimed: number[], milestones: CtpMilestoneRule[], round: number, paid: boolean) {
  if (points < m.points || (m.paidOnly && !paid)) return 0;
  let reached: number;
  if (m.special) reached = milestones.some(n => !n.special && (claimed[n.idx] ?? 0) > 0) ? 1 : 0;
  else if (m.once) reached = 1;
  else reached = 1 + Math.floor((points - m.points) / Math.max(1, round));
  return Math.max(0, reached - (claimed[m.idx] ?? 0));
}

// Tuyển chọn cầu thủ (Huy Hiệu Tuyển Chọn, mốc 12.600 điểm) theo trang sự kiện gốc Tỷ Phú 2.0 T11/2026: mỗi mùa một cấp thẻ cố định
// (+1 PRM / ICON TM, +8 GRU / BLD / CU, +9 MDL / UT / 24EP, +10 HG / RTN / CC / FCA / DC / JNM, +11 FA / LOL / LN / SPL / 23HW,
// +12 EBS / BOE21 / CAP; ICONS +6 và RMA +11 game chưa có). Lượt mở 1 / 2 / 3 / từ 4: chọn đủ 10 / 9 / 7 / 5 người, tổng giá trị ≤ 6 tỷ BP.
// Mở 1 huy hiệu = 1 cầu thủ ngẫu nhiên trong nhóm, tỷ lệ nghịch với giá (đắt gấp 2 → khó ra gấp 2). Máy chủ: 202611220004_fco_ctp_draft.sql.
export const CTP_DRAFT = {
  cap: 6_000_000_000,
  sizes: [10, 9, 7, 5],
  levels: { prm: 1, eternal: 1, gru: 8, bld: 8, cu: 8, mdl: 9, ut: 9, ep24: 9, hg: 10, rtn: 10, cc: 10, amb: 10, dc: 10, jnm: 10,
    fa: 11, lol: 11, ln: 11, spl: 11, hw23: 11, ebs: 12, boe21: 12, cap: 12 } as Record<string, number>,
} as const;
export const ctpDraftSize = (opened: number) => CTP_DRAFT.sizes[Math.min(Math.max(0, opened), CTP_DRAFT.sizes.length - 1)];
// Tỷ lệ ra từng người (theo thứ tự prices): nghịch với giá.
export function ctpDraftChances(prices: number[]) {
  const inv = prices.map(p => p > 0 ? 1 / p : 0), sum = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => sum ? x / sum : 0);
}