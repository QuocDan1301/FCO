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

export type RankedSlot = { uid?: string; role: string; ovr: number; x?: number; y?: number };
export type RankedGoal = { minute: number; side: 'me' | 'opp'; scorer: number; assist: number | null };
export type RankedMe = { points: number; tier: RankedTierId; wins: number; draws: number; losses: number; rank: number | null };
export type RankedMatch = {
  seed: number; score: [number, number]; goals: RankedGoal[];
  // effect: viền Premium của chủ đội (name-effects.ts), migration 202611120007.
  me: { ovr: number; formation: string; slots: RankedSlot[]; club?: string | null; effect?: string | null };
  opp: { name: string; ovr: number; bot: boolean; formation: string | null; slots: RankedSlot[]; club?: string | null; effect?: string | null };
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
