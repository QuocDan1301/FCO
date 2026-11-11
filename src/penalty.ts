// Phần thuần của mini game Sút phạt đền (src/PenaltyPage.tsx). Vị trí tính theo % sân khấu 16:10, khớp hình vẽ khung thành:
// cột trái 24%, cột phải 76%, xà ngang 20%, vạch cầu môn 56% (theo chiều cao).
export type ShotKind = 'normal' | 'curl' | 'power' | 'trivela';
export type PenaltyStart = { streak: number; best: number };
// miss: 'bar' vọt xà / 'post' dội cột (máy chủ, migration 202611110006). Bản máy chủ cũ không có saved / miss / kind.
export type PenaltyShot = { goal: boolean; over: boolean; streak: number; best: number; keeper: { x: number; y: number }; saved?: boolean; miss?: 'bar' | 'post' | null; kind?: ShotKind };

// Kiểu sút: phím tắt 1–4. Tỷ lệ phải khớp fco_penalty_save_chance / fco_penalty_miss_chance (tests/penalty.test.ts kiểm tra).
export const SHOT_KINDS: { id: ShotKind; name: string; key: string; hint: string }[] = [
  { id: 'normal', name: 'Thường', key: '1', hint: 'Vòng cung nhẹ, không rủi ro.' },
  { id: 'curl', name: 'Xoáy', key: '2', hint: 'Cong vào góc: sát cột càng khó bắt, sút giữa khung dễ bị bắt.' },
  { id: 'power', name: 'Căng', key: '3', hint: 'Rất nhanh, thủ môn khó phản xạ; ngắm quá cao dễ vọt xà.' },
  { id: 'trivela', name: 'Trivela', key: '4', hint: 'Má ngoài cong ngược, khó bắt; sát cột dễ dội cột.' },
];
export const isShotKind = (value: unknown): value is ShotKind => SHOT_KINDS.some(kind => kind.id === value);

// Điểm ngắm x: −1 (sát cột trái) … 1 (sát cột phải), y: 0 (sát đất) … 1 (sát xà) → vị trí trên sân khấu.
export const aimToStage = (x: number, y: number) => ({ left: 50 + Math.max(-1, Math.min(1, x)) * 23.5, top: 52.5 - Math.max(0, Math.min(1, y)) * 28.5 });
// Thủ môn đứng giữa vạch cầu môn; bay theo hướng máy chủ trả về (x −1…1, y 0…1).
export const keeperToStage = (x: number, y: number) => ({ left: 50 + x * 19, bottom: 44 + y * 14 });
// Tốc độ lắc của vạch ngắm (rad/giây): chuỗi càng cao càng nhanh, +0,3 mỗi bàn (người dùng yêu cầu 2026-11-11), tối đa 7 từ chuỗi 18.
export const SWEEP_BASE = 1.7, SWEEP_STEP = .3, SWEEP_MAX = 7;
export const goalSweepSpeed = (streak: number) => Math.min(SWEEP_MAX, SWEEP_BASE + SWEEP_STEP * Math.max(0, streak));
// Hệ số so với lúc bắt đầu, hiện trên màn chơi (×1,0 … ×4,1).
export const sweepMultiplier = (streak: number) => Math.round(goalSweepSpeed(streak) / SWEEP_BASE * 10) / 10;

// Tỷ lệ thủ môn bắt / sút hỏng — giống máy chủ (chỉ để hiển thị / kiểm thử, máy chủ mới là nơi quyết định).
export function saveChance(x: number, y: number, streak: number, kind: ShotKind = 'normal') {
  const base = Math.max(.15, .8 - .45 * Math.abs(x) - .15 * y - .05 * Math.abs(x) * y) + Math.min(.15, .01 * Math.max(0, streak));
  const bonus = kind === 'curl' ? -.12 * Math.abs(x) + (Math.abs(x) < .3 ? .06 : 0) : kind === 'power' ? -.12 : kind === 'trivela' ? -.08 : 0;
  return Math.min(.95, Math.max(.1, base + bonus));
}
export function missChance(x: number, y: number, kind: ShotKind = 'normal') {
  if (kind === 'power') return Math.min(.3, Math.max(0, (y - .75) * 1.2));
  if (kind === 'trivela') return Math.min(.2, Math.max(0, Math.abs(x) - .8));
  return 0;
}

// Đường bay: đường cong bậc hai từ chấm phạt đền tới đích, điểm điều khiển lệch theo kiểu sút (xoáy cong ra rồi cuộn vào, trivela cong ngược,
// căng gần như thẳng và nhanh). Thời gian tính bằng mili giây.
export type Point = { left: number; top: number };
export const BALL_SPOT: Point = { left: 50, top: 87 };
export function flightPath(kind: ShotKind, to: Point, from: Point = BALL_SPOT) {
  const side = to.left > 50.5 ? 1 : to.left < 49.5 ? -1 : 1;
  const mid = { left: (from.left + to.left) / 2, top: (from.top + to.top) / 2 };
  const top = Math.min(from.top, to.top);
  if (kind === 'power') return { duration: 380, control: { left: mid.left, top: mid.top - 3 } };
  if (kind === 'curl') return { duration: 760, control: { left: mid.left - side * 17, top: top - 12 } };
  if (kind === 'trivela') return { duration: 700, control: { left: mid.left + side * 15, top: top - 8 } };
  return { duration: 620, control: { left: mid.left, top: top - 14 } };
}
export const bezier = (a: Point, c: Point, b: Point, t: number): Point => ({
  left: (1 - t) ** 2 * a.left + 2 * (1 - t) * t * c.left + t ** 2 * b.left,
  top: (1 - t) ** 2 * a.top + 2 * (1 - t) * t * c.top + t ** 2 * b.top,
});
// Đích của cú sút hỏng: vọt xà = chạm mép trên xà rồi bay lên khán đài; dội cột = chạm cột gần điểm ngắm rồi bật ra ngoài.
export function missTargets(miss: 'bar' | 'post', aim: Point) {
  if (miss === 'bar') return { hit: { left: aim.left, top: 18.6 }, after: { left: aim.left + (aim.left - 50) * .3, top: 2 } };
  const post = aim.left >= 50 ? 76 : 24, out = aim.left >= 50 ? 1 : -1;
  return { hit: { left: post - out * 1.4, top: aim.top }, after: { left: post + out * 13, top: Math.min(70, aim.top + 18) } };
}
