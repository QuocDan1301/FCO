import type { BilacReward, VqtgMilestone } from './wallet-state';

// Sự kiện Vòng Quanh Thế Giới (VQTG): máy chủ lắc xúc xắc, đi quân và chọn quà (supabase/migrations/202611130004_fco_vqtg.sql);
// game chỉ diễn hoạt cảnh, hiển thị và (khi máy chủ chưa giữ kho) cộng BP / gói như Bi Lắc (grantBilac).

export type VqtgTileKind = 'reward' | 'pick' | 'bp' | 'jackpot';
export type VqtgTile = { idx: number; kind: VqtgTileKind; label: string; rewards: BilacReward[] };

// Cùng số với fco_vqtg_rules() trên máy chủ (tests/vqtg.test.ts so khớp) — dùng cho Hướng dẫn.
// Ô 10 = Mini Jackpot BP = quỹ Jackpot FC × bpPerJackpotFc (1.000 FC → 5B BP), Jackpot nổ thì Mini Jackpot nổ theo (migration 202611130011);
// ô 14 chỉ Giải Đặc Biệt, không Giải Phụ (202611130010).
export const VQTG_RULES = { bpPerJackpotFc: 5_000_000, bpChance: 0.06 } as const;
export const miniJackpotBp = (jackpotFc: number) => jackpotFc * VQTG_RULES.bpPerJackpotFc;
export const VQTG_TILES = 16;
/** Đua top: 7 ngày từ 0h 13/11/2026 tới 0h 20/11/2026 giờ Việt Nam (UTC+7). */
export const VQTG_RACE_START = Date.UTC(2026, 10, 12, 17);
export const VQTG_RACE_END = VQTG_RACE_START + 7 * 24 * 3600 * 1000;
/** Thời gian còn lại của Đua top (ms, không âm) và nhãn ngày / giờ:phút:giây. */
export function raceCountdown(now: number) {
  const left = Math.max(0, VQTG_RACE_END - now), s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { left, started: now >= VQTG_RACE_START, days: Math.floor(s / 86400), clock: `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` };
}
/** Vé nhận theo số lắc 1..6 (fco_vqtg_rules rollTickets, migration 202611130008); vé in cạnh số trên vòng quay. */
export const VQTG_ROLL_TICKETS = [1, 2, 2, 2, 3, 6] as const;
export const rollTickets = (roll: number) => VQTG_ROLL_TICKETS[roll - 1] ?? 0;

// ===== Bàn cờ =====
// Nền là ảnh bàn chơi (public/assets/vqtg/board.webp, VQTG_BOARD px) đã vẽ sẵn đường đua, số ô, ô màu, xúc xắc / huy chương / cúp.
// Toạ độ dưới đây đo trên ảnh đó (dò ô màu bằng OpenCV): mỗi ô quà có 4 ô màu [x, y, cạnh] theo thứ tự món quà và góc xoay
// chung của ô; ô đặc biệt có khung chữ và vùng bấm (tâm, cỡ, góc). Đổi ảnh bàn thì phải đo lại.
export const VQTG_BOARD = { w: 1287, h: 987 } as const;
export type QuadGroup = { rot: number; q: readonly (readonly [number, number, number])[] };
export const VQTG_QUADS: Readonly<Record<number, QuadGroup>> = {
  1: { rot: -17, q: [[157, 530, 59], [210, 508, 54], [229, 565, 57], [175, 596, 63]] },
  2: { rot: 2, q: [[154, 388, 48], [204, 386, 53], [200, 441, 49], [148, 452, 51]] },
  3: { rot: 37, q: [[234, 242, 43], [260, 276, 43], [183, 305, 46], [225, 321, 45]] },
  4: { rot: -7, q: [[309, 208, 42], [370, 198, 41], [317, 250, 43], [371, 242, 44]] },
  5: { rot: 0, q: [[440, 196, 40], [494, 194, 39], [438, 240, 44], [494, 238, 45]] },
  7: { rot: -15, q: [[765, 100, 40], [822, 82, 40], [785, 136, 40], [829, 122, 38]] },
  8: { rot: 23, q: [[893, 86, 39], [946, 110, 38], [886, 124, 37], [931, 145, 36]] },
  9: { rot: 40, q: [[1011, 146, 42], [1059, 186, 43], [984, 178, 39], [1025, 212, 40]] },
  11: { rot: 38, q: [[1137, 479, 44], [1190, 502, 61], [1107, 516, 56], [1148, 559, 65]] },
  12: { rot: -26, q: [[1045, 550, 57], [988, 577, 60], [1077, 603, 64], [1017, 633, 63]] },
  13: { rot: -29, q: [[918, 610, 66], [857, 642, 68], [947, 666, 58], [890, 698, 59]] },
  15: { rot: 33, q: [[352, 732, 55], [406, 768, 56], [316, 789, 76], [375, 830, 76]] },
  16: { rot: -35, q: [[261, 629, 57], [212, 668, 66], [298, 681, 59], [252, 729, 72]] },
};
type Box = { x: number; y: number; w: number; h: number; rot: number };
/** Ô đặc biệt: `text` là khung chữ (Chỉ định còn / quỹ), `hit` là vùng bấm (ô 6) và chỗ quân đứng. */
export const VQTG_SPECIAL: Readonly<Record<6 | 10 | 14, { text: Box; hit: Box }>> = {
  6: { text: { x: 668, y: 160, w: 190, h: 40, rot: -21 }, hit: { x: 645, y: 190, w: 225, h: 92, rot: -19 } },
  10: { text: { x: 1166, y: 432, w: 128, h: 44, rot: 30 }, hit: { x: 1140, y: 355, w: 220, h: 100, rot: 62 } },
  14: { text: { x: 540, y: 838, w: 190, h: 50, rot: -9 }, hit: { x: 600, y: 820, w: 300, h: 110, rot: -12 } },
};
/** Vòng quay (tâm, đường kính) và khung thông tin trong vòng đua. */
export const VQTG_WHEEL = { x: 521, y: 510, d: 400 } as const;
export const VQTG_INFO = { x: 742, y: 262, w: 210 } as const;
/** Ô Bắt đầu (ngoài vòng, trên lối trắng bên trái). */
export const VQTG_START = { x: 82, y: 572 } as const;

const tileCenterOf = (idx: number) => {
  const g = VQTG_QUADS[idx];
  if (g) return { x: Math.round(g.q.reduce((s, q) => s + q[0], 0) / 4), y: Math.round(g.q.reduce((s, q) => s + q[1], 0) / 4) };
  const sp = VQTG_SPECIAL[idx as 6 | 10 | 14];
  return { x: sp.hit.x, y: sp.hit.y };
};
/** Chỗ đặt quân: tâm ô (0 = ô Bắt đầu). */
export function tokenPoint(idx: number): { x: number; y: number } {
  return idx === 0 ? { ...VQTG_START } : tileCenterOf(((idx - 1) % VQTG_TILES) + 1);
}

/** Số lần còn nhận được quà mốc (cùng luật fco_vqtg_claim): mỗi vòng (round vé) thêm 1 lần, mốc once chỉ 1 lần; vé không bị trừ.
 *  Mốc paidOnly (1 vé) còn cần đã từng chơi trả phí. */
export function vqtgAvailable(tickets: number, m: Pick<VqtgMilestone, 'tickets' | 'once' | 'paidOnly'>, claimed: number | null | undefined, round: number, paid: boolean) {
  if (tickets < m.tickets || (m.paidOnly && !paid)) return 0;
  const reached = m.once ? 1 : 1 + Math.floor((tickets - m.tickets) / Math.max(1, round));
  return Math.max(0, reached - (claimed ?? 0));
}

/** Ô đến sau khi đi `roll` bước từ `from` (ô 16 → ô 1; 0 = Bắt đầu), cùng công thức máy chủ. */
export const vqtgNext = (from: number, roll: number) => (from + roll - 1) % VQTG_TILES + 1;
/** Các ô quân đi qua (không gồm ô xuất phát) — dùng cho hoạt cảnh đi từng bước. */
export const vqtgPath = (from: number, roll: number) => Array.from({ length: roll }, (_, i) => vqtgNext(from, i + 1));
/** Số xúc xắc Chỉ định được phép: không dừng ở ô Quỹ BP / Giải Đặc Biệt (máy chủ chặn FCO_PICK_BLOCKED). */
export const vqtgPickAllowed = (tiles: VqtgTile[], from: number, roll: number) => {
  const kind = tiles.find(t => t.idx === vqtgNext(from, roll))?.kind;
  return kind !== 'bp' && kind !== 'jackpot';
};
/** Góc quay (độ, theo chiều kim đồng hồ, luôn tăng) để số `roll` (1..6) dừng dưới kim ở đỉnh; số 1 ở đỉnh khi góc 0,
 *  các số xếp theo chiều kim đồng hồ, mỗi số 60°. Quay thêm ít nhất `turns` vòng cho đẹp. */
export function wheelAngle(current: number, roll: number, turns = 4) {
  const mod = (n: number) => ((n % 360) + 360) % 360;
  const target = mod(-(roll - 1) * 60);
  let next = current + 360 * turns;
  next = next - mod(next) + target;
  if (next < current + 360 * turns) next += 360;
  return next;
}
