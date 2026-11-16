import { getPlayer } from './game';
import type { Save } from './game';
import { getLineups, lineupSlots, lineupTeamColor, squadCards, SQUAD_WAGE_CAP, XI } from './squad';

// Xếp hạng giả lập (supabase/migrations/202611120002_fco_ranked.sql). Máy chủ ghép đối thủ và quyết định kết quả; game diễn lại (ranked-sim.ts).
export type RankedTierId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'elite' | 'legend';
// Bậc theo điểm, khớp fco_ranked_tier. Điểm bắt đầu 1000 (Bạc).
export const RANKED_TIERS: readonly { id: RankedTierId; name: string; min: number; color: string }[] = [
  { id: 'bronze', name: 'Đồng', min: 0, color: '#c98a5a' },
  { id: 'silver', name: 'Bạc', min: 900, color: '#c9d2dc' },
  { id: 'gold', name: 'Vàng', min: 1100, color: '#f2c94c' },
  { id: 'platinum', name: 'Bạch kim', min: 1300, color: '#5fe0d0' },
  { id: 'diamond', name: 'Kim cương', min: 1500, color: '#7fb4ff' },
  { id: 'elite', name: 'Tinh anh', min: 1700, color: '#c58bff' },
  { id: 'legend', name: 'Huyền thoại', min: 1900, color: '#ff7a59' },
];
export const RANKED_START = 1000;
export const tierOf = (points: number) => [...RANKED_TIERS].reverse().find(t => points >= t.min) ?? RANKED_TIERS[0];
export const tierById = (id: string) => RANKED_TIERS.find(t => t.id === id) ?? RANKED_TIERS[0];
// Điểm còn thiếu tới bậc sau (null khi đã ở bậc cao nhất).
export function nextTier(points: number) {
  const next = RANKED_TIERS.find(t => t.min > points);
  return next ? { tier: next, need: next.min - points } : null;
}

// pid / lv: cầu thủ + cấp thẻ của ô đối thủ người thật (migration 202611120012); đội máy / thẻ đã bán thì không có.
// att / cre / def / pace / gk: chỉ số ô do máy chủ tính (migration 202611130001); trận cũ không có.
export type RankedSlot = { uid?: string; role: string; ovr: number; x?: number; y?: number; pid?: number; lv?: number; pos?: string; att?: number; cre?: number; def?: number; pace?: number; gk?: number };
export type RankedGoal = { minute: number; side: 'me' | 'opp'; scorer: number; assist: number | null };
export type RankedMe = { points: number; tier: RankedTierId; wins: number; draws: number; losses: number; rank: number | null };
export type RankedMatch = {
  seed: number; score: [number, number]; goals: RankedGoal[];
  // effect: viền Premium của chủ đội (name-effects.ts), migration 202611120007.
  me: { ovr: number; formation: string; slots: RankedSlot[]; club?: string | null; effect?: string | null; attack?: number; defense?: number };
  opp: { name: string; ovr: number; bot: boolean; formation: string | null; slots: RankedSlot[]; club?: string | null; effect?: string | null; attack?: number; defense?: number; faces?: Record<string, string> | null };
  // Chưa có điểm lúc bắt đầu: điểm tính khi hết trận (RankedFinish, migration 202611120005). elapsed = số giây trận đã diễn (xem tiếp).
  minSeconds?: number; elapsed?: number;
};
export type RankedFinish = { delta: number; points: number; tier: RankedTierId; score: [number, number]; state: RankedMe };
export type RankedTop = { name: string; points: number; tier: RankedTierId; wins: number; draws: number; losses: number; mine: boolean; effect?: string | null; club?: string | null };
export type RankedHistory = { time: number; opponent: string; for: number; against: number; delta: number; points: number };
// live: trận đang diễn (tải lại tab / tắt máy giữa trận) để xem tiếp đúng thời điểm.
export type RankedState = { me: RankedMe; top: RankedTop[]; history: RankedHistory[]; live?: RankedMatch | null };

// Mức lương GLXH: tổng lương 11 người đá chính vượt mức này thì máy chủ không cho đá (FCO_RANKED_WAGE, migration 202611120006).
export const RANKED_WAGE_CAP = SQUAD_WAGE_CAP;

// 11 ô của bộ đội hình đang dùng để gửi lên máy chủ: OVR theo vị trí đã cộng team color (như màn Đội hình). null = chưa đủ 11 người.
export function rankedTeam(state: Pick<Save, 'cards' | 'squad' | 'lineups'>) {
  const lineups = getLineups(state), set = lineups.sets[lineups.active], slots = lineupSlots(set);
  const byUid = new Map(squadCards(state).map(c => [c.uid, c]));
  const colors = new Map(lineupTeamColor(state, set).players.map(r => [r.playerId, r.finalOvr]));
  const out: (RankedSlot & { uid: string; name: string })[] = [];
  for (let i = 0; i < XI; i++) {
    const uid = set.slots[i], card = uid ? byUid.get(uid) : undefined;
    if (!uid || !card) return { ready: false as const, filled: set.slots.filter(u => u && byUid.has(u)).length, formation: set.formation, slots: out };
    out.push({ uid, role: slots[i].label, x: slots[i].x, y: slots[i].y, ovr: Math.round(colors.get(uid) ?? 0), name: getPlayer(card).name });
  }
  const ovr = Math.round(out.reduce((s, x) => s + x.ovr, 0) / XI);
  const wage = out.reduce((s, x) => s + (getPlayer(byUid.get(x.uid)!).wage ?? 0), 0);
  return { ready: true as const, filled: XI, formation: set.formation, slots: out, ovr, wage, overWage: wage > RANKED_WAGE_CAP };
}

// Chế độ tự đá (Auto, người dùng 2026-11-15): hết trận và đã lưu kết quả thì sau RANKED_AUTO_DELAY giây tự tìm trận mới,
// tới khi người chơi tắt, bỏ trận hoặc đội hình không hợp lệ. Mỗi trận vẫn chạy đủ thời gian thật như đá tay (máy chủ kiểm tra).
// Lưu bật / tắt trên máy này (tiện ích riêng mỗi máy).
export const RANKED_AUTO_DELAY = 5;
// Màn chờ vào trận (RankedIntro.tsx, 2026-11-16): tìm đối thủ tối thiểu RANKED_INTRO_SEARCH giây (+ ngẫu nhiên tới 1,5 giây), "Đã tìm thấy"
// RANKED_INTRO_FOUND giây, sơ đồ hai đội RANKED_INTRO_PREVIEW giây. Máy chủ tính giờ trận từ lúc bấm Tìm trận nên mở lại trận đang dở
// thì trừ RANKED_INTRO_SECONDS (≈ tổng màn chờ) khỏi thời gian máy chủ báo — xem tiếp đúng chỗ đang diễn.
export const RANKED_INTRO_SEARCH = 2.5;
export const RANKED_INTRO_FOUND = 1.6;
export const RANKED_INTRO_PREVIEW = 5;
export const RANKED_INTRO_SECONDS = RANKED_INTRO_SEARCH + .75 + RANKED_INTRO_FOUND + RANKED_INTRO_PREVIEW;
// Giây trận đã diễn khi mở lại (0 = trận vừa tìm được, xem từ đầu sau màn chờ).
export const rankedPlayed = (elapsed: number | undefined) => elapsed && elapsed > 0 ? Math.max(0, elapsed - RANKED_INTRO_SECONDS) : 0;
const AUTO_KEY = 'fco-ranked-auto';
export function savedRankedAuto() { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } }
export function saveRankedAuto(on: boolean) { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* không lưu được thì chỉ giữ trong phiên */ } }
/** Số giây còn lại trước khi tự đá trận tiếp (0 = đá ngay). */
export const autoLeft = (startedAt: number, now: number, delay = RANKED_AUTO_DELAY) => Math.max(0, delay - Math.floor((now - startedAt) / 1000));
