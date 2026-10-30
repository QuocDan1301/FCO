import { getPlayer, ovr } from './game';
import type { Card, Lineup, Lineups, Save } from './game';
import { marketQuote } from './market';
import { analyzeTeamColors } from './teamColor';
import type { TeamColorReport } from './teamColor';

// Đội hình riêng: tối đa 50 thẻ, mỗi cầu thủ (playerId) chỉ một thẻ. 305 là mốc lương tham khảo: được phép vượt, chỉ đổi màu cảnh báo.
export const SQUAD_LIMIT = 50;
export const SQUAD_WAGE_CAP = 305;

export const positionGroup = (pos: string) => pos === 'GK' ? 'gk' : ['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].includes(pos) ? 'df' : ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(pos) ? 'fw' : 'mf';
const wage = (card: Card) => getPlayer(card).wage ?? 0;

// Thẻ đã bán hoặc dùng làm nguyên liệu tự rơi khỏi đội hình; giữ đúng thứ tự thêm vào.
export function squadCards(state: Pick<Save, 'cards' | 'squad'>): Card[] {
  const byUid = new Map(state.cards.map(card => [card.uid, card]));
  return (state.squad ?? []).map(uid => byUid.get(uid)).filter((card): card is Card => !!card);
}

export function squadSummary(cards: Card[]) {
  const counts = { fw: 0, mf: 0, df: 0, gk: 0 };
  for (const card of cards) counts[positionGroup(getPlayer(card).pos)]++;
  return { counts, size: cards.length, wage: cards.reduce((sum, card) => sum + wage(card), 0) };
}

export function addToSquad(state: Save, uid: string): Save {
  const card = state.cards.find(c => c.uid === uid);
  if (!card) throw new Error('Thẻ không còn trong kho.');
  const current = squadCards(state);
  if (current.some(c => c.uid === uid)) throw new Error('Cầu thủ đã có trong đội hình.');
  if (current.length >= SQUAD_LIMIT) throw new Error(`Đội hình đã đủ ${SQUAD_LIMIT} cầu thủ.`);
  if (current.some(c => c.playerId === card.playerId)) throw new Error(`${getPlayer(card).name} đã có một thẻ khác trong đội hình.`);
  return { ...state, squad: [...current.map(c => c.uid), uid] };
}

export function removeFromSquad(state: Save, uid: string): Save {
  return { ...state, squad: squadCards(state).map(c => c.uid).filter(id => id !== uid) };
}

// Khóa thẻ: thẻ đã khóa không xóa, không bán và không dùng làm nguyên liệu nâng cấp được.
export const isLocked = (state: Pick<Save, 'locked'>, uid: string) => !!state.locked?.includes(uid);
export function toggleLock(state: Save, uid: string): Save {
  if (!state.cards.some(c => c.uid === uid)) throw new Error('Thẻ không còn trong kho.');
  const locked = state.locked ?? [];
  return { ...state, locked: locked.includes(uid) ? locked.filter(id => id !== uid) : [...locked, uid] };
}

// Xóa hẳn thẻ khỏi kho (không nhận BP); bỏ luôn khỏi đội hình.
export function releaseCard(state: Save, uid: string): Save {
  const card = state.cards.find(c => c.uid === uid);
  if (!card) throw new Error('Thẻ không còn trong kho.');
  if (isLocked(state, uid)) throw new Error(`${getPlayer(card).name} đang bị khóa. Mở khóa trước khi xóa.`);
  return { ...state, cards: state.cards.filter(c => c.uid !== uid), squad: (state.squad ?? []).filter(id => id !== uid) };
}

// ---- Sơ đồ đội hình (màn Đội hình): 3 bộ A/B/C, mỗi bộ 11 ô lấy cầu thủ từ đội hình riêng; cầu thủ còn lại là dự bị (Thay thế). ----
// x: 0 biên trái → 100 biên phải; y: 0 khung thành đối phương → 100 khung thành nhà. Ô xếp từ hàng công xuống thủ môn, trái sang phải.
export type FormationSlot = { label: string; role: string; x: number; y: number };
const ROLE: Record<string, string> = { LS: 'ST', RS: 'ST', LCM: 'CM', RCM: 'CM', LDM: 'CDM', RDM: 'CDM', LAM: 'CAM', RAM: 'CAM', LCB: 'CB', RCB: 'CB' };
const at = (label: string, x: number, y: number): FormationSlot => ({ label, role: ROLE[label] ?? label, x, y });
const GK = at('GK', 50, 92);
const BACK4 = [at('LB', 12, 70), at('LCB', 36, 76), at('RCB', 64, 76), at('RB', 88, 70)];
const BACK3 = [at('LCB', 25, 75), at('CB', 50, 77), at('RCB', 75, 75)];
const BACK5 = [at('LWB', 9, 65), at('LCB', 30, 76), at('CB', 50, 78), at('RCB', 70, 76), at('RWB', 91, 65)];
const FRONT3 = [at('LW', 15, 18), at('ST', 50, 13), at('RW', 85, 18)];
const TWO_ST = [at('LS', 36, 14), at('RS', 64, 14)];
export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-1-2-3': [...FRONT3, at('LCM', 30, 40), at('RCM', 70, 40), at('CDM', 50, 55), ...BACK4, GK],
  '4-3-3': [...FRONT3, at('LCM', 25, 44), at('CM', 50, 48), at('RCM', 75, 44), ...BACK4, GK],
  '4-2-3-1': [at('ST', 50, 13), at('LAM', 18, 30), at('CAM', 50, 32), at('RAM', 82, 30), at('LDM', 33, 53), at('RDM', 67, 53), ...BACK4, GK],
  '4-4-2': [...TWO_ST, at('LM', 12, 42), at('LCM', 37, 46), at('RCM', 63, 46), at('RM', 88, 42), ...BACK4, GK],
  '4-1-4-1': [at('ST', 50, 13), at('LM', 12, 36), at('LCM', 37, 38), at('RCM', 63, 38), at('RM', 88, 36), at('CDM', 50, 56), ...BACK4, GK],
  '4-2-2-2': [...TWO_ST, at('LAM', 22, 32), at('RAM', 78, 32), at('LDM', 36, 52), at('RDM', 64, 52), ...BACK4, GK],
  '4-3-1-2': [...TWO_ST, at('CAM', 50, 30), at('LCM', 24, 48), at('CM', 50, 53), at('RCM', 76, 48), ...BACK4, GK],
  '4-2-4': [at('LW', 12, 18), at('LS', 37, 13), at('RS', 63, 13), at('RW', 88, 18), at('LCM', 33, 45), at('RCM', 67, 45), ...BACK4, GK],
  '3-5-2': [...TWO_ST, at('CAM', 50, 30), at('LM', 10, 42), at('LDM', 33, 52), at('RDM', 67, 52), at('RM', 90, 42), ...BACK3, GK],
  '3-4-3': [...FRONT3, at('LM', 10, 44), at('LCM', 36, 46), at('RCM', 64, 46), at('RM', 90, 44), ...BACK3, GK],
  '3-4-1-2': [...TWO_ST, at('CAM', 50, 30), at('LM', 10, 46), at('LCM', 36, 50), at('RCM', 64, 50), at('RM', 90, 46), ...BACK3, GK],
  '5-3-2': [...TWO_ST, at('LCM', 25, 42), at('CM', 50, 46), at('RCM', 75, 42), ...BACK5, GK],
  '5-2-1-2': [...TWO_ST, at('CAM', 50, 30), at('LCM', 33, 48), at('RCM', 67, 48), ...BACK5, GK],
  '5-4-1': [at('ST', 50, 13), at('LM', 12, 38), at('LCM', 37, 42), at('RCM', 63, 42), at('RM', 88, 38), ...BACK5, GK],
};
export const DEFAULT_FORMATION = '4-1-2-3';
export const LINEUP_NAMES = ['A', 'B', 'C'] as const;
export const XI = 11;

// Đá trái vị trí bị trừ OVR theo khoảng cách trên sân (ngang ×3, dọc ×2, tối đa 25); thủ môn ↔ cầu thủ trên sân trừ 40.
const SPOT: Record<string, [number, number]> = { CB: [0, 1], LB: [-1, 1], RB: [1, 1], LWB: [-1, 2], RWB: [1, 2], CDM: [0, 2], CM: [0, 3], LM: [-1, 3.5], RM: [1, 3.5], CAM: [0, 4], LW: [-1, 5], RW: [1, 5], CF: [0, 5], LF: [-1, 5.5], RF: [1, 5.5], ST: [0, 6] };
export function positionPenalty(pos: string, role: string): number {
  if (pos === role) return 0;
  if (pos === 'GK' || role === 'GK') return 40;
  const a = SPOT[pos], b = SPOT[role];
  if (!a || !b) return 10;
  return Math.min(25, Math.round(Math.abs(a[0] - b[0]) * 3 + Math.abs(a[1] - b[1]) * 2));
}
export const slotOvr = (card: Card, role: string) => Math.max(1, ovr(card) - positionPenalty(getPlayer(card).pos, role));

const blankLineup = (): Lineup => ({ formation: DEFAULT_FORMATION, slots: Array(XI).fill(null) });
// Đọc 3 bộ đội hình đã chuẩn hoá: sơ đồ lạ về mặc định, ô trỏ tới thẻ không còn trong đội hình riêng (hoặc trùng) thành trống.
export function getLineups(state: Pick<Save, 'cards' | 'squad' | 'lineups'>): Lineups {
  const members = new Set(squadCards(state).map(c => c.uid));
  const sets = LINEUP_NAMES.map((_, i) => {
    const set = state.lineups?.sets[i];
    if (!set) return blankLineup();
    const seen = new Set<string>();
    const slots = Array.from({ length: XI }, (_, n) => { const uid = set.slots[n]; if (!uid || !members.has(uid) || seen.has(uid)) return null; seen.add(uid); return uid; });
    return { formation: FORMATIONS[set.formation] ? set.formation : DEFAULT_FORMATION, slots };
  });
  const active = state.lineups?.active ?? 0;
  return { active: Number.isInteger(active) && active >= 0 && active < sets.length ? active : 0, sets };
}
const checkSet = (index: number) => { if (!Number.isInteger(index) || index < 0 || index >= LINEUP_NAMES.length) throw new Error('Đội hình không tồn tại.'); };
const withSet = (state: Save, index: number, set: Lineup): Save => {
  checkSet(index);
  const lineups = getLineups(state);
  return { ...state, lineups: { ...lineups, sets: lineups.sets.map((s, i) => i === index ? set : s) } };
};
export function selectLineup(state: Save, index: number): Save {
  checkSet(index);
  return { ...state, lineups: { ...getLineups(state), active: index } };
}
// Đặt thẻ vào ô: thẻ đang đá ô khác thì hai ô đổi chỗ; cầu thủ cũ của ô (nếu có) về dự bị. uid null = để trống ô.
export function placeCard(state: Save, index: number, slot: number, uid: string | null): Save {
  checkSet(index);
  if (!Number.isInteger(slot) || slot < 0 || slot >= XI) throw new Error('Vị trí không tồn tại.');
  if (uid && !squadCards(state).some(c => c.uid === uid)) throw new Error('Cầu thủ không còn trong đội hình.');
  const set = getLineups(state).sets[index], slots = [...set.slots];
  const from = uid ? slots.indexOf(uid) : -1;
  if (from >= 0) slots[from] = slots[slot];
  slots[slot] = uid;
  return withSet(state, index, { ...set, slots });
}
export const clearLineup = (state: Save, index: number): Save => withSet(state, index, { ...getLineups(state).sets[index], slots: Array(XI).fill(null) });

// Ghép cầu thủ vào ô sao cho tổng OVR theo vị trí cao nhất (thuật toán Hungary; ≤ 50 thẻ × 11 ô nên rất nhanh).
function hungarian(cost: number[][]): number[] {
  const n = cost.length, m = cost[0].length;
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const match = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) match[p[j] - 1] = j - 1;
  return match;
}
export function arrange(cards: Card[], formation: string): (string | null)[] {
  const slots = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];
  const result: (string | null)[] = Array(XI).fill(null);
  if (!cards.length) return result;
  // Hàng là phía ít hơn (ô hoặc thẻ); lệch nhẹ theo OVR gốc để thẻ mạnh hơn được ưu tiên khi hoà điểm.
  const score = (card: Card, slot: FormationSlot) => slotOvr(card, slot.role) + ovr(card) / 1000;
  if (cards.length >= XI) hungarian(slots.map(slot => cards.map(card => -score(card, slot)))).forEach((c, s) => { result[s] = cards[c].uid; });
  else hungarian(cards.map(card => slots.map(slot => -score(card, slot)))).forEach((s, c) => { result[s] = cards[c].uid; });
  return result;
}
// Đổi sơ đồ: giữ nguyên các cầu thủ đang đá chính, xếp lại vào ô hợp nhất của sơ đồ mới.
export function setFormation(state: Save, index: number, formation: string): Save {
  if (!FORMATIONS[formation]) throw new Error('Sơ đồ không tồn tại.');
  checkSet(index);
  const set = getLineups(state).sets[index], byUid = new Map(squadCards(state).map(c => [c.uid, c]));
  const starters = set.slots.flatMap(uid => uid && byUid.has(uid) ? [byUid.get(uid)!] : []);
  return withSet(state, index, { formation, slots: arrange(starters, formation) });
}
// Tối ưu ĐH: chọn 11 cầu thủ trong đội hình riêng cho tổng OVR theo vị trí cao nhất ở sơ đồ hiện tại.
export function optimizeLineup(state: Save, index: number): Save {
  checkSet(index);
  const set = getLineups(state).sets[index];
  return withSet(state, index, { formation: set.formation, slots: arrange(squadCards(state), set.formation) });
}
// Trường CLB trong dữ liệu đôi khi không phải CLB thật: cầu thủ tự do, hoặc tên mùa in thay logo CLB — không tạo team color CLB.
export const NOT_CLUBS = new Set(['Tự do', 'Ballon d’Or', 'Champions of Europe', 'Century Club', 'Decade', 'Returnees', 'Wonderboys', 'Unexpected Transfer', 'Greatest Runner-Ups', 'Spartan', '23 Hard Worker', '24 Energetic Player']);
// Team color của 11 cầu thủ đá chính (teamColor.ts): OVR gốc là OVR theo vị trí đang đá, CLB / quốc gia theo dữ liệu cầu thủ, cấp = cấp cộng của thẻ.
export function lineupTeamColor(state: Pick<Save, 'cards' | 'squad'>, set: Lineup): TeamColorReport {
  const byUid = new Map(squadCards(state).map(c => [c.uid, c])), slots = FORMATIONS[set.formation] ?? FORMATIONS[DEFAULT_FORMATION];
  return analyzeTeamColors(set.slots.flatMap((uid, i) => {
    const card = uid ? byUid.get(uid) : undefined;
    if (!card) return [];
    const p = getPlayer(card);
    return [{ id: card.uid, baseOvr: slotOvr(card, slots[i].role), upgradeLevel: card.level, clubIds: p.club && !NOT_CLUBS.has(p.club) ? [p.club] : [], nationId: p.nation ?? '' }];
  }));
}
// OVR đội = trung bình OVR theo vị trí (đã cộng team color) của các ô đã có người; lương và giá trị tính trên 11 cầu thủ đá chính.
export function lineupSummary(state: Pick<Save, 'cards' | 'squad'>, set: Lineup) {
  const byUid = new Map(squadCards(state).map(c => [c.uid, c])), colors = lineupTeamColor(state, set);
  let wageSum = 0, value = 0;
  for (const uid of set.slots) {
    const card = uid ? byUid.get(uid) : undefined;
    if (!card) continue;
    wageSum += wage(card);
    value += marketQuote(card).price ?? 0;
  }
  const filled = colors.players.length;
  return { ovr: filled ? Math.round(colors.players.reduce((sum, r) => sum + r.finalOvr, 0) / filled) : 0, wage: wageSum, value, filled, colors };
}
