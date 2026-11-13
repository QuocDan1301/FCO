import { players } from './game';
import type { Card, Lineup } from './game';
import { getLineups, lineupSlots, lineupSummary, XI } from './squad';

// Xem đội hình HLV khác từ BXH (fco_view_lineup, migration 202611120012). Máy chủ chỉ gửi cầu thủ + cấp của 11 ô (không mã thẻ).
export type LineupBoardId = 'ovr' | 'squad' | 'penalty' | 'ranked';
export type PublicLineup = { formation: string; custom?: unknown; slots: ({ playerId: number; level: number } | null)[] };
export type PublicLineupView = { name: string; club?: string | null; effect?: string | null; mine?: boolean; lineup: PublicLineup | null };

const known = new Set(players.map(p => p.id));

// Dựng bản lưu tạm từ dữ liệu máy chủ để tính vị trí, OVR theo vị trí, team color, lương, giá trị giống hệt màn Đội hình.
// Cầu thủ không còn trong bộ dữ liệu / cấp sai thì bỏ trống ô đó; vị trí tuỳ chỉnh sai thì về sơ đồ (getLineups tự làm sạch).
export function publicLineupState(lineup: PublicLineup) {
  const cards: Card[] = [], slots: (string | null)[] = [];
  for (let i = 0; i < XI; i++) {
    const s = Array.isArray(lineup.slots) ? lineup.slots[i] : null;
    if (s && known.has(s.playerId) && Number.isInteger(s.level) && s.level >= 1) {
      const card: Card = { uid: `v${i}`, playerId: s.playerId, level: s.level, received: 0 };
      cards.push(card); slots.push(card.uid);
    } else slots.push(null);
  }
  const raw = { formation: String(lineup.formation ?? ''), slots, custom: Array.isArray(lineup.custom) ? lineup.custom : undefined } as Lineup;
  const state = { cards, squad: cards.map(c => c.uid), lineups: { active: 0, sets: [raw] } };
  const set = getLineups(state).sets[0], byUid = new Map(cards.map(c => [c.uid, c]));
  return { set, slots: lineupSlots(set), cards: set.slots.map(uid => uid ? byUid.get(uid) ?? null : null), summary: lineupSummary(state, set) };
}
