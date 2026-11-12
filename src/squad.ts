import { getPlayer, ovr, players } from './game';
import type { Card, Lineup, Lineups, Player, Save } from './game';
import clubHistoryData from './player-club-history.json';
import { marketQuote } from './market';
import { analyzeTeamColors, DEFAULT_TEAM_COLOR_CONFIG, upgradeColorName } from './teamColor';
import type { BuffResult, TeamColorReport } from './teamColor';

// Đội hình riêng: tối đa 50 thẻ, mỗi cầu thủ (playerId) chỉ một thẻ. 310 là mốc lương tham khảo: được phép vượt, chỉ đổi màu cảnh báo.
export const SQUAD_LIMIT = 50;
export const SQUAD_WAGE_CAP = 310;

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
// `LineupSpot` lưu nhãn vị trí (LCM…); role là vị trí dùng để tính OVR (CM…).
const at = (label: string, x: number, y: number): FormationSlot => ({ label, role: ROLE[label] ?? label, x, y });
const GK = at('GK', 50, 92);
const BACK4 = [at('LB', 12, 70), at('LCB', 36, 76), at('RCB', 64, 76), at('RB', 88, 70)];
const BACK3 = [at('LCB', 25, 75), at('CB', 50, 77), at('RCB', 75, 75)];
const BACK5 = [at('LWB', 9, 65), at('LCB', 30, 76), at('CB', 50, 78), at('RCB', 70, 76), at('RWB', 91, 65)];
const FRONT3 = [at('LW', 15, 18), at('ST', 50, 13), at('RW', 85, 18)];
const TWO_ST = [at('LS', 36, 14), at('RS', 64, 14)];
// Đủ 35 sơ đồ như danh sách sơ đồ của game (bổ sung 21 sơ đồ ngày 2026-11-12); xếp theo hàng thủ 3 → 4 → 5 người.
// Hậu tố: C = tiền vệ hẹp (giữa sân), A = thiên công, D = thiên thủ, F = hai tiền đạo lệch (LF / RF).
export const FORMATIONS: Record<string, FormationSlot[]> = {
  '3-1-2-1-3': [...FRONT3, at('CAM', 50, 32), at('LCM', 33, 46), at('RCM', 67, 46), at('CDM', 50, 58), ...BACK3, GK],
  '3-1-4-2': [...TWO_ST, at('LM', 10, 42), at('LCM', 36, 46), at('RCM', 64, 46), at('RM', 90, 42), at('CDM', 50, 58), ...BACK3, GK],
  '3-2-2-1-2': [...TWO_ST, at('CAM', 50, 32), at('LM', 12, 40), at('RM', 88, 40), at('LDM', 36, 56), at('RDM', 64, 56), ...BACK3, GK],
  '3-2-3-2': [...TWO_ST, at('LM', 10, 40), at('CAM', 50, 34), at('RM', 90, 40), at('LDM', 36, 55), at('RDM', 64, 55), ...BACK3, GK],
  '3-4-1-2': [...TWO_ST, at('CAM', 50, 30), at('LM', 10, 46), at('LCM', 36, 50), at('RCM', 64, 50), at('RM', 90, 46), ...BACK3, GK],
  '3-4-3': [...FRONT3, at('LM', 10, 44), at('LCM', 36, 46), at('RCM', 64, 46), at('RM', 90, 44), ...BACK3, GK],
  '3-4-3F': [at('LF', 33, 25), at('ST', 50, 13), at('RF', 67, 25), at('LM', 10, 44), at('LCM', 36, 46), at('RCM', 64, 46), at('RM', 90, 44), ...BACK3, GK],
  '3-5-2': [...TWO_ST, at('CAM', 50, 30), at('LM', 10, 42), at('LDM', 33, 52), at('RDM', 67, 52), at('RM', 90, 42), ...BACK3, GK],
  '4-1-2-1-2': [...TWO_ST, at('CAM', 50, 31), at('LM', 12, 42), at('RM', 88, 42), at('CDM', 50, 58), ...BACK4, GK],
  '4-1-2-1-2C': [...TWO_ST, at('CAM', 50, 31), at('LCM', 33, 45), at('RCM', 67, 45), at('CDM', 50, 58), ...BACK4, GK],
  '4-1-2-3': [...FRONT3, at('LCM', 30, 40), at('RCM', 70, 40), at('CDM', 50, 55), ...BACK4, GK],
  '4-1-2-3F': [at('LF', 33, 25), at('ST', 50, 13), at('RF', 67, 25), at('LCM', 30, 42), at('RCM', 70, 42), at('CDM', 50, 56), ...BACK4, GK],
  '4-1-3-2': [...TWO_ST, at('LM', 12, 40), at('CM', 50, 44), at('RM', 88, 40), at('CDM', 50, 58), ...BACK4, GK],
  '4-1-4-1': [at('ST', 50, 13), at('LM', 12, 36), at('LCM', 37, 42), at('RCM', 63, 42), at('RM', 88, 36), at('CDM', 50, 56), ...BACK4, GK],
  '4-2-1-3': [...FRONT3, at('CAM', 50, 33), at('LDM', 36, 56), at('RDM', 64, 56), ...BACK4, GK],
  '4-2-1-3A': [...FRONT3, at('CAM', 50, 30), at('LCM', 34, 46), at('RCM', 66, 46), ...BACK4, GK],
  '4-2-1-3D': [...FRONT3, at('CM', 50, 44), at('LDM', 36, 58), at('RDM', 64, 58), ...BACK4, GK],
  '4-2-2-1-1': [at('ST', 50, 13), at('CAM', 50, 31), at('LM', 12, 40), at('RM', 88, 40), at('LDM', 36, 56), at('RDM', 64, 56), ...BACK4, GK],
  '4-2-2-2': [...TWO_ST, at('LAM', 28, 33), at('RAM', 72, 33), at('LDM', 36, 52), at('RDM', 64, 52), ...BACK4, GK],
  '4-2-2-2A': [...TWO_ST, at('LM', 12, 38), at('RM', 88, 38), at('LDM', 36, 54), at('RDM', 64, 54), ...BACK4, GK],
  '4-2-3-1': [at('ST', 50, 13), at('LAM', 28, 33), at('CAM', 50, 33), at('RAM', 72, 33), at('LDM', 33, 53), at('RDM', 67, 53), ...BACK4, GK],
  '4-2-4': [at('LW', 12, 18), at('LS', 37, 13), at('RS', 63, 13), at('RW', 88, 18), at('LCM', 33, 45), at('RCM', 67, 45), ...BACK4, GK],
  '4-3-1-2': [...TWO_ST, at('CAM', 50, 30), at('LCM', 24, 46), at('CM', 50, 50), at('RCM', 76, 46), ...BACK4, GK],
  '4-3-2-1': [at('ST', 50, 13), at('LF', 33, 26), at('RF', 67, 26), at('LCM', 26, 46), at('CM', 50, 50), at('RCM', 74, 46), ...BACK4, GK],
  '4-3-3': [...FRONT3, at('LCM', 25, 44), at('CM', 50, 48), at('RCM', 75, 44), ...BACK4, GK],
  '4-3-3F': [at('LF', 33, 25), at('ST', 50, 13), at('RF', 67, 25), at('LCM', 26, 46), at('CM', 50, 50), at('RCM', 74, 46), ...BACK4, GK],
  '4-4-1-1': [at('ST', 50, 13), at('CF', 50, 26), at('LM', 12, 42), at('LCM', 37, 46), at('RCM', 63, 46), at('RM', 88, 42), ...BACK4, GK],
  '4-4-2': [...TWO_ST, at('LM', 12, 42), at('LCM', 37, 46), at('RCM', 63, 46), at('RM', 88, 42), ...BACK4, GK],
  '4-4-2F': [at('LF', 37, 24), at('RF', 63, 24), at('LM', 12, 42), at('LCM', 37, 46), at('RCM', 63, 46), at('RM', 88, 42), ...BACK4, GK],
  '4-5-1': [at('ST', 50, 13), at('LM', 12, 40), at('LCM', 30, 44), at('CM', 50, 48), at('RCM', 70, 44), at('RM', 88, 40), ...BACK4, GK],
  '5-1-2-1-1': [at('ST', 50, 13), at('CAM', 50, 30), at('LCM', 33, 46), at('RCM', 67, 46), at('CDM', 50, 58), ...BACK5, GK],
  '5-2-1-2': [...TWO_ST, at('CAM', 50, 30), at('LCM', 33, 48), at('RCM', 67, 48), ...BACK5, GK],
  '5-2-3': [...FRONT3, at('LCM', 34, 44), at('RCM', 66, 44), ...BACK5, GK],
  '5-3-2': [...TWO_ST, at('LCM', 25, 42), at('CM', 50, 46), at('RCM', 75, 42), ...BACK5, GK],
  '5-4-1': [at('ST', 50, 13), at('LM', 12, 38), at('LCM', 37, 42), at('RCM', 63, 42), at('RM', 88, 38), ...BACK5, GK],
};
export const DEFAULT_FORMATION = '4-1-2-3';
export const LINEUP_NAMES = ['A', 'B', 'C'] as const;
export const XI = 11;

// ---- Vùng vị trí trên sân: kéo cầu thủ tới đâu thì đá vị trí của vùng đó. Toạ độ cùng hệ với FormationSlot. ----
export type Zone = { label: string; role: string; x0: number; y0: number; x1: number; y1: number };
const WING_LEFT = 22, WING_RIGHT = 78;
// Hai biên, mỗi hàng một vùng.
const WING_ROWS: [string, string, number, number][] = [['LW', 'RW', 0, 30], ['LM', 'RM', 30, 52], ['LWB', 'RWB', 52, 66], ['LB', 'RB', 66, 100]];
// Giữa sân, mỗi hàng có ba vị trí trái / giữa / phải; cách chia phụ thuộc hàng đó đã có ai (xem zoneAt).
const CENTER_ROWS: [string, string, string, number, number][] = [['LS', 'ST', 'RS', 0, 21], ['LF', 'CF', 'RF', 21, 30], ['LAM', 'CAM', 'RAM', 30, 40], ['LCM', 'CM', 'RCM', 40, 52], ['LDM', 'CDM', 'RDM', 52, 66], ['LCB', 'CB', 'RCB', 66, 84]];
const GK_TOP = 84;
const ZONE_LABELS = new Set(['GK', ...WING_ROWS.flatMap(r => [r[0], r[1]]), ...CENTER_ROWS.flatMap(r => [r[0], r[1], r[2]])]);
const zone = (label: string, x0: number, y0: number, x1: number, y1: number): Zone => ({ label, role: ROLE[label] ?? label, x0, y0, x1, y1 });
// Vùng tại điểm (x, y). taken = vị trí của 10 ô còn lại, quyết định cách chia hàng giữa sân:
// hàng trống là một vùng rộng (ST, CDM…); có người bên trái / phải thì chia đôi (LCM | RCM); có người ở giữa thì chia ba.
export function zoneAt(x: number, y: number, taken: ReadonlySet<string>): Zone | null {
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  if (x < WING_LEFT || x >= WING_RIGHT) {
    const row = WING_ROWS.find(r => y >= r[2] && y < r[3]) ?? WING_ROWS[WING_ROWS.length - 1];
    return x < WING_LEFT ? zone(row[0], 0, row[2], WING_LEFT, row[3]) : zone(row[1], WING_RIGHT, row[2], 100, row[3]);
  }
  if (y >= GK_TOP) return zone('GK', WING_LEFT, GK_TOP, WING_RIGHT, 100);
  const [left, mid, right, y0, y1] = CENTER_ROWS.find(r => y >= r[3] && y < r[4])!;
  if (taken.has(mid)) {
    const third = (WING_RIGHT - WING_LEFT) / 3, a = WING_LEFT + third, b = WING_LEFT + 2 * third;
    return x < a ? zone(left, WING_LEFT, y0, a, y1) : x < b ? zone(mid, a, y0, b, y1) : zone(right, b, y0, WING_RIGHT, y1);
  }
  if (taken.has(left) || taken.has(right)) return x < 50 ? zone(left, WING_LEFT, y0, 50, y1) : zone(right, 50, y0, WING_RIGHT, y1);
  return zone(mid, WING_LEFT, y0, WING_RIGHT, y1);
}
// 11 ô thực tế của một bộ: vị trí người chơi đã kéo, còn lại theo sơ đồ.
export function lineupSlots(set: Lineup): FormationSlot[] {
  const base = FORMATIONS[set.formation] ?? FORMATIONS[DEFAULT_FORMATION];
  return base.map((slot, i) => { const spot = set.custom?.[i]; return spot ? at(spot.label, spot.x, spot.y) : slot; });
}
// Bản lưu có thể bị sửa hoặc cũ: vị trí sai kiểu hoặc hai ô trùng vị trí thì bỏ cả phần tuỳ chỉnh, quay về sơ đồ.
function cleanCustom(set: Lineup, formation: string): Lineup['custom'] {
  const custom = set.custom;
  if (!Array.isArray(custom) || !custom.some(Boolean)) return undefined;
  const spots = Array.from({ length: XI }, (_, i) => custom[i] ?? null);
  const valid = spots.every(s => s === null || (typeof s === 'object' && ZONE_LABELS.has(s.label) && Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100));
  if (!valid) return undefined;
  const labels = lineupSlots({ formation, slots: [], custom: spots }).map(s => s.label);
  return new Set(labels).size === labels.length ? spots : undefined;
}

// Đổi vị trí trong cùng hàng (công / giữa / thủ, theo positionGroup) không bị trừ OVR. Sang hàng khác bị trừ theo khoảng cách trên sân
// (ngang ×3, dọc ×2, tối đa 25); thủ môn ↔ cầu thủ trên sân trừ 40.
const SPOT: Record<string, [number, number]> = { CB: [0, 1], LB: [-1, 1], RB: [1, 1], LWB: [-1, 2], RWB: [1, 2], CDM: [0, 2], CM: [0, 3], LM: [-1, 3.5], RM: [1, 3.5], CAM: [0, 4], LW: [-1, 5], RW: [1, 5], CF: [0, 5], LF: [-1, 5.5], RF: [1, 5.5], ST: [0, 6] };
export function positionPenalty(pos: string, role: string): number {
  if (positionGroup(pos) === positionGroup(role)) return 0;
  if (pos === 'GK' || role === 'GK') return 40;
  const a = SPOT[pos], b = SPOT[role];
  if (!a || !b) return 10;
  return Math.min(25, Math.round(Math.abs(a[0] - b[0]) * 3 + Math.abs(a[1] - b[1]) * 2));
}
// Mọi vị trí của một cầu thủ qua tất cả mùa thẻ: có mùa đá ở đâu thì thẻ mùa nào cũng đá được ở đó (Messi: CF, CAM, RW).
// Gộp theo tên + quốc tịch vì có tên trùng nhưng là hai người (A. Onana, L. Suárez); thủ môn không gộp với cầu thủ trên sân (Diego López).
const positionKey = (p: Pick<Player, 'name' | 'nation'>) => `${p.name}|${p.nation}`;
let careerPositions: Map<string, Set<string>> | null = null;
export function playerPositions(p: Pick<Player, 'name' | 'nation' | 'pos'>): string[] {
  if (p.pos === 'GK') return ['GK'];
  if (!careerPositions) {
    careerPositions = new Map();
    for (const player of players) {
      if (player.pos === 'GK') continue;
      const key = positionKey(player), known = careerPositions.get(key);
      if (known) known.add(player.pos); else careerPositions.set(key, new Set([player.pos]));
    }
  }
  return [...new Set([p.pos, ...(careerPositions.get(positionKey(p)) ?? [])])];
}
// Mức trừ của cầu thủ ở một vị trí: tính theo vị trí gần nhất trong các vị trí cầu thủ có.
export const playerPenalty = (p: Pick<Player, 'name' | 'nation' | 'pos'>, role: string) => Math.min(...playerPositions(p).map(pos => positionPenalty(pos, role)));
export const slotOvr = (card: Card, role: string) => Math.max(1, ovr(card) - playerPenalty(getPlayer(card), role));

const blankLineup = (): Lineup => ({ formation: DEFAULT_FORMATION, slots: Array(XI).fill(null) });
// Đọc 3 bộ đội hình đã chuẩn hoá: sơ đồ lạ về mặc định, ô trỏ tới thẻ không còn trong đội hình riêng (hoặc trùng) thành trống.
export function getLineups(state: Pick<Save, 'cards' | 'squad' | 'lineups'>): Lineups {
  const members = new Set(squadCards(state).map(c => c.uid));
  const sets = LINEUP_NAMES.map((_, i) => {
    const set = state.lineups?.sets[i];
    if (!set) return blankLineup();
    const seen = new Set<string>();
    const slots = Array.from({ length: XI }, (_, n) => { const uid = set.slots[n]; if (!uid || !members.has(uid) || seen.has(uid)) return null; seen.add(uid); return uid; });
    const formation = FORMATIONS[set.formation] ? set.formation : DEFAULT_FORMATION, custom = cleanCustom(set, formation);
    return custom ? { formation, slots, custom } : { formation, slots };
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
// Kéo một ô tới vị trí mới trên sân. Hai ô không thể cùng vị trí: đổi chỗ với người đang đứng đó thì dùng placeCard.
export function moveSlot(state: Save, index: number, slot: number, label: string, x: number, y: number): Save {
  checkSet(index);
  if (!Number.isInteger(slot) || slot < 0 || slot >= XI) throw new Error('Vị trí không tồn tại.');
  if (!ZONE_LABELS.has(label) || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Vị trí không tồn tại.');
  const set = getLineups(state).sets[index];
  if (lineupSlots(set).some((s, i) => i !== slot && s.label === label)) throw new Error(`Vị trí ${label} đã có người.`);
  const custom = Array.from({ length: XI }, (_, i) => set.custom?.[i] ?? null);
  custom[slot] = { label, x: Math.round(Math.min(100, Math.max(0, x)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, y)) * 10) / 10 };
  return withSet(state, index, { ...set, custom });
}
// Bỏ mọi vị trí đã kéo, về đúng sơ đồ; cầu thủ giữ nguyên ô.
export function resetPositions(state: Save, index: number): Save {
  const { formation, slots } = getLineups(state).sets[index];
  return withSet(state, index, { formation, slots });
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
export function arrange(cards: Card[], formation: string, slots: FormationSlot[] = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION]): (string | null)[] {
  const result: (string | null)[] = Array(XI).fill(null);
  if (!cards.length) return result;
  // Hàng là phía ít hơn (ô hoặc thẻ); lệch nhẹ theo OVR gốc để thẻ mạnh hơn được ưu tiên khi hoà điểm.
  const score = (card: Card, slot: FormationSlot) => slotOvr(card, slot.role) + ovr(card) / 1000;
  if (cards.length >= XI) hungarian(slots.map(slot => cards.map(card => -score(card, slot)))).forEach((c, s) => { result[s] = cards[c].uid; });
  else hungarian(cards.map(card => slots.map(slot => -score(card, slot)))).forEach((s, c) => { result[s] = cards[c].uid; });
  return result;
}
// Đổi sơ đồ: giữ nguyên các cầu thủ đang đá chính, xếp lại vào ô hợp nhất của sơ đồ mới; vị trí đã kéo tay bị bỏ.
export function setFormation(state: Save, index: number, formation: string): Save {
  if (!FORMATIONS[formation]) throw new Error('Sơ đồ không tồn tại.');
  checkSet(index);
  const set = getLineups(state).sets[index], byUid = new Map(squadCards(state).map(c => [c.uid, c]));
  const starters = set.slots.flatMap(uid => uid && byUid.has(uid) ? [byUid.get(uid)!] : []);
  return withSet(state, index, { formation, slots: arrange(starters, formation) });
}
// Tối ưu ĐH: chọn 11 cầu thủ trong đội hình riêng cho tổng OVR theo vị trí cao nhất ở sơ đồ hiện tại, tính cả vị trí đã kéo tay.
export function optimizeLineup(state: Save, index: number): Save {
  checkSet(index);
  const set = getLineups(state).sets[index];
  return withSet(state, index, { ...set, slots: arrange(squadCards(state), set.formation, lineupSlots(set)) });
}
// Trường CLB trong dữ liệu đôi khi không phải CLB thật: cầu thủ tự do, hoặc tên mùa in thay logo CLB — không tạo team color CLB.
export const NOT_CLUBS = new Set(['Tự do', 'Ballon d’Or', 'Champions of Europe', 'Century Club', 'Decade', 'Returnees', 'Wonderboys', 'Unexpected Transfer', 'Greatest Runner-Ups', 'Spartan', '23 Hard Worker', '24 Energetic Player']);
// CLB tính team color: CLB ghi trên thẻ (nếu là CLB thật) cộng mọi CLB cầu thủ từng thi đấu (player-club-history.json, theo tên nên áp dụng mọi mùa thẻ).
const clubHistory: Readonly<Record<string, readonly string[]>> = clubHistoryData.clubs;
// Tên trùng nhưng là hai người (A. Onana, L. Suárez…) được khoá theo "tên|quốc tịch".
export const playerClubs = (p: Pick<Player, 'name' | 'club'> & Partial<Pick<Player, 'nation'>>) => [...new Set([...(p.club && !NOT_CLUBS.has(p.club) ? [p.club] : []), ...(clubHistory[`${p.name}|${p.nation}`] ?? clubHistory[p.name] ?? [])])];
// Team color của 11 cầu thủ đá chính (teamColor.ts): OVR gốc là OVR theo vị trí đang đá, CLB / quốc gia theo dữ liệu cầu thủ, cấp = cấp cộng của thẻ.
// Mọi cầu thủ trong đội hình riêng (đá chính lẫn dự bị) được cộng cố định LINEUP_BONUS OVR; team color chỉ cộng thêm cho người đá chính.
export const LINEUP_BONUS = 5;
const LINEUP_BUFF = { kind: 'lineup' as const, key: 'lineup', tier: 1, ovr: LINEUP_BONUS, stats: {} };
export function lineupTeamColor(state: Pick<Save, 'cards' | 'squad'>, set: Lineup): TeamColorReport {
  const byUid = new Map(squadCards(state).map(c => [c.uid, c])), slots = lineupSlots(set);
  const report = analyzeTeamColors(set.slots.flatMap((uid, i) => {
    const card = uid ? byUid.get(uid) : undefined;
    if (!card) return [];
    const p = getPlayer(card);
    return [{ id: card.uid, baseOvr: slotOvr(card, slots[i].role), upgradeLevel: card.level, clubIds: playerClubs(p), nationId: p.nation ?? '' }];
  }));
  return { ...report, players: report.players.map(r => ({ ...r, ovrBonus: r.ovrBonus + LINEUP_BONUS, finalOvr: r.finalOvr + LINEUP_BONUS, applied: [LINEUP_BUFF, ...r.applied] })) };
}
// CLB và quốc gia của team color mạnh nhất đang kích hoạt ở bộ đang dùng (cấp cao hơn, rồi đông người hơn); undefined nếu chưa kích hoạt.
export function activeTeamColors(state: Pick<Save, 'cards' | 'squad' | 'lineups'>) {
  const lineups = getLineups(state), active = lineupTeamColor(state, lineups.sets[lineups.active]).active;
  // Màu cấp thẻ mạnh nhất (danh sách đã sắp mức thẻ giảm dần): màu (bronze / silver / gold / platinum) và số thẻ tối thiểu của mốc đang đạt.
  const level = active.find(c => c.kind === 'upgrade'), rule = level && DEFAULT_TEAM_COLOR_CONFIG.upgrade.find(r => r.id === level.key);
  return { club: active.find(c => c.kind === 'club')?.key, nation: active.find(c => c.kind === 'nation')?.key,
    upgrade: level && rule ? { color: level.key.replace(/-\d+$/, ''), name: upgradeColorName(rule.minLevel), tier: level.tier, minPlayers: rule.minPlayers, ovr: level.ovr } : undefined };
}
// Phần OVR cộng thẳng và từng nguồn cộng của mọi cầu thủ trong đội hình riêng: người đá chính ở bộ đang dùng có +5 và team color,
// dự bị chỉ có +5. Thẻ không nằm trong đội hình riêng không có trong bảng.
export const benchBuff = (card: Card): BuffResult => ({ playerId: card.uid, baseOvr: ovr(card), ovrBonus: LINEUP_BONUS, finalOvr: ovr(card) + LINEUP_BONUS, stats: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 }, applied: [LINEUP_BUFF] });
export function teamColorDetails(state: Pick<Save, 'cards' | 'squad' | 'lineups'>): Map<string, BuffResult> {
  const lineups = getLineups(state), result = new Map(lineupTeamColor(state, lineups.sets[lineups.active]).players.map(r => [r.playerId, r]));
  for (const card of squadCards(state)) if (!result.has(card.uid)) result.set(card.uid, benchBuff(card));
  return result;
}
export const teamColorBonuses = (state: Pick<Save, 'cards' | 'squad' | 'lineups'>) => new Map([...teamColorDetails(state)].map(([uid, r]) => [uid, r.ovrBonus]));
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
