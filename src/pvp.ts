// Penalty đối kháng giữa người chơi (migration 202611240006_fco_penalty_pvp.sql): kiểu dữ liệu, luật và phần tính thuần.
// Kết quả mỗi quả do máy chủ quyết (giữ kín lựa chọn hai bên tới khi đủ), game chỉ hiển thị.
import type { ShotKind } from './penalty';

// Khớp fco_pvp_rules() trên máy chủ (tests/pvp.test.ts kiểm tra).
export const PVP_RULES = { kicks: 5, maxKicks: 30, roundSeconds: 20, graceSeconds: 3, awaySeconds: 45, queueSeconds: 20, k: 24, start: 1000 } as const;
// Game hỏi trạng thái mỗi 1,5 giây khi đang chờ / đang đá (máy chủ chỉ ghi "còn online" tối đa 10 giây/lần).
export const PVP_POLL_MS = 1500;

export type PvpPoint = { x: number; y: number };
export type PvpShot = PvpPoint & { kind: ShotKind };
export type PvpOutcome = 'goal' | 'save' | 'miss';
// Luân phiên (202611240009): mỗi quả một người sút (shooter), người kia bắt.
export type PvpRound = { r: number; shooter: 'me' | 'opp'; shot: PvpShot; dive: PvpPoint; o: PvpOutcome };
export type PvpMatch = {
  id: number; mode: 'random' | 'room'; status: 'waiting' | 'playing' | 'done' | 'cancelled'; code: string | null;
  round: number; now: number; deadline: number | null; iShoot: boolean; score: [number, number]; picked: boolean; oppPicked: boolean; rounds: PvpRound[];
  opponent: { name: string; club: string | null; points: number } | null;
  winner: 'me' | 'opp' | 'draw' | null; reason: 'score' | 'draw' | 'leave' | 'away' | null; delta: number | null;
};
// Chế độ thử nghiệm (202611240008): open = đã mở cho mọi người; allowed = tài khoản này chơi được (thử nghiệm: admin + acc phụ).
export type PvpAccess = { open: boolean; allowed: boolean; admin: boolean };
export type PvpBoardRow = { rank: number; name: string; club: string | null; effect: string | null; points: number; wins: number; losses: number; draws: number; mine: boolean };
export type PvpBoard = { top: PvpBoardRow[]; me: { rank: number; points: number; wins: number; losses: number; draws: number } | null };

// Toạ độ khung thành trong SVG (viewBox 300 × 110): x −1…1 → 10…290, y 0…1 → 100…10.
export const GOAL = { left: 10, right: 290, top: 10, bottom: 100 } as const;
export const toSvg = (p: PvpPoint) => ({ cx: 150 + Math.max(-1, Math.min(1, p.x)) * 140, cy: 100 - Math.max(0, Math.min(1, p.y)) * 90 });
export const fromSvg = (cx: number, cy: number): PvpPoint => ({ x: Math.round(Math.max(-1, Math.min(1, (cx - 150) / 140)) * 1000) / 1000, y: Math.round(Math.max(0, Math.min(1, (100 - cy) / 90)) * 1000) / 1000 });

export const OUTCOME_LABEL: Record<PvpOutcome, string> = { goal: 'VÀO', save: 'Cản phá', miss: 'Ra ngoài' };
// Nhãn lượt: 5 lượt chính, sau đó là luân lưu.
// Quả thứ round (mỗi lượt gồm 2 quả, mỗi người sút 1 quả): 10 quả chính, sau đó là luân lưu.
export const roundLabel = (round: number) => round <= PVP_RULES.kicks * 2 ? `Lượt ${Math.ceil(round / 2)}/${PVP_RULES.kicks}` : `Luân lưu · lượt ${Math.ceil(round / 2)}`;
// Người sút quả thứ n (khớp fco_pvp_shooter): id trận chẵn → người 1 sút quả lẻ.
export const shooterOf = (matchId: number, n: number): 1 | 2 => (matchId % 2 === 0) === (n % 2 === 1) ? 1 : 2;
// Giây còn lại của lượt theo đồng hồ máy chủ (offset = giờ máy chủ − giờ máy này lúc nhận trạng thái).
export const secondsLeft = (deadline: number | null, offset: number, now = Date.now()) => deadline === null ? 0 : Math.max(0, Math.ceil((deadline - (now + offset)) / 1000));
export const REASON_LABEL: Record<string, string> = { leave: 'Đối thủ rời trận', away: 'Đối thủ mất kết nối', score: '', draw: 'Hết 30 quả vẫn hoà' };
// Nhãn kết quả một quả theo góc nhìn người chơi.
export const kickLabel = (r: Pick<PvpRound, 'shooter' | 'o'>) => r.shooter === 'me'
  ? (r.o === 'goal' ? 'VÀO!' : r.o === 'save' ? 'Bị cản phá' : 'Ra ngoài')
  : (r.o === 'goal' ? 'Thủng lưới' : r.o === 'save' ? 'Bạn cản phá!' : 'Đối thủ sút hỏng');
// Ô tròn diễn biến mỗi bên: kết quả các quả người đó sút (thành công = vào lưới).
export const kicksOf = (rounds: PvpRound[], who: 'me' | 'opp') => rounds.filter(x => x.shooter === who).map(x => x.o);