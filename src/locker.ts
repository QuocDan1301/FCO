import type { Card, Outfit, Save, TeamKit } from './game';
import { getLineups, lineupSlots } from './squad';

// Phòng thay đồ (2026-11-24): danh sách lựa chọn trang phục. Chỉ để hiển thị, không ảnh hưởng chỉ số hay kết quả trận.
// Thứ tự trong từng danh sách là giá trị lưu ở Save.outfits: chỉ thêm lựa chọn mới vào cuối, không đổi thứ tự.
export const OUTFIT_ROWS = {
  style: { label: 'Phong cách', options: ['Nghiêm túc', 'Thoải mái', 'Sơ vin', 'Xắn tay áo'] },
  fit: { label: 'Thân người', options: ['Vừa vặn', 'Bó sát', 'Rộng'] },
  sleeve: { label: 'Chiều dài tay áo / Đồng phục mùa đông', options: ['Áo ngắn tay', 'Áo dài tay', 'Áo giữ nhiệt ngắn tay', 'Áo giữ nhiệt dài tay'] },
  shorts: { label: 'Độ dài quần', options: ['Vừa', 'Ngắn', 'Dài'] },
  under: { label: 'Quần giữ nhiệt', options: ['Không mặc', 'Ngắn', 'Dài'] },
  underColor: { label: 'Màu quần giữ nhiệt', options: ['Theo màu quần', 'Đen', 'Trắng'] },
  socks: { label: 'Độ dài tất', options: ['Ngang gối', 'Thấp', 'Kéo qua gối'] },
  tape: { label: 'Băng cố định tất', options: ['Không dùng', 'Băng trắng', 'Băng đen'] },
} as const;
export type OutfitRow = keyof typeof OUTFIT_ROWS;
export const GEAR = ['Không sử dụng', 'Băng', 'Băng mồ hôi', 'Găng tay', 'Băng ngón tay', 'Băng quấn dài', 'Dây cao su'] as const;
export const BOOTS: { name: string; color: string; accent: string }[] = [
  { name: 'Trắng', color: '#f2f4f7', accent: '#11161c' }, { name: 'Đen', color: '#16191e', accent: '#e8edf3' }, { name: 'Đỏ', color: '#d7263d', accent: '#ffffff' },
  { name: 'Xanh dương', color: '#1f6feb', accent: '#ffffff' }, { name: 'Vàng', color: '#f5c518', accent: '#11161c' }, { name: 'Hồng', color: '#ff5fa2', accent: '#ffffff' },
  { name: 'Xanh lá', color: '#19c37d', accent: '#0b1d14' }, { name: 'Cam', color: '#ff7a1a', accent: '#ffffff' },
];
export const TEAM_KITS = ['Sân nhà', 'Sân khách', 'Áo thứ ba'] as const;
export const GK_KITS = ['Theo bộ áo', 'Đen', 'Xanh lá', 'Vàng', 'Hồng'] as const;

export const outfitOf = (state: Pick<Save, 'outfits'>, uid: string): Outfit => state.outfits?.[uid] ?? {};
export const teamKitOf = (state: Pick<Save, 'teamKit'>): TeamKit => state.teamKit ?? {};

// Thành viên bộ đội hình đang dùng, theo thứ tự: đá chính (thủ môn trước, rồi theo ô), Thay thế, Dự bị.
export type Member = { card: Card; group: 'start' | 'sub' | 'reserve'; role: string; label: string };
export function lockerMembers(state: Save): Member[] {
  const lineups = getLineups(state), set = lineups.sets[lineups.active], byUid = new Map(state.cards.map(c => [c.uid, c]));
  const slots = lineupSlots(set), out: Member[] = [];
  const starters = set.slots.map((uid, i) => ({ uid, slot: slots[i] })).filter(x => x.uid && byUid.has(x.uid));
  starters.sort((a, b) => Number(b.slot.role === 'GK') - Number(a.slot.role === 'GK'));
  for (const s of starters) out.push({ card: byUid.get(s.uid!)!, group: 'start', role: s.slot.role, label: s.slot.label });
  for (const uid of set.subs ?? []) { const c = byUid.get(uid); if (c) out.push({ card: c, group: 'sub', role: '', label: 'TT' }); }
  for (const uid of set.reserve ?? []) { const c = byUid.get(uid); if (c) out.push({ card: c, group: 'reserve', role: '', label: 'DB' }); }
  return out;
}

// Số áo: số người chơi đã chọn, còn lại tự cấp số nhỏ nhất chưa ai dùng (thủ môn đá chính ưu tiên số 1).
export function jerseyNumbers(state: Save, members: Member[] = lockerMembers(state), override: Record<string, Outfit> = {}): Map<string, number> {
  const out = new Map<string, number>(), used = new Set<number>();
  const chosen = (uid: string) => (override[uid] ?? outfitOf(state, uid)).number;
  for (const m of members) { const n = chosen(m.card.uid); if (n && !used.has(n)) { out.set(m.card.uid, n); used.add(n); } }
  const gk = members.find(m => m.role === 'GK' && !out.has(m.card.uid));
  if (gk && !used.has(1)) { out.set(gk.card.uid, 1); used.add(1); }
  let next = 1;
  for (const m of members) {
    if (out.has(m.card.uid)) continue;
    while (used.has(next)) next++;
    if (next > 99) break;
    out.set(m.card.uid, next); used.add(next);
  }
  return out;
}

// Lưu các thay đổi đang soạn (uid → trang phục) và thiết lập đội. Số áo không được trùng trong bộ đội hình đang dùng.
export function saveOutfits(state: Save, drafts: Record<string, Outfit>, team?: TeamKit): Save {
  const owned = new Set(state.cards.map(c => c.uid)), outfits = { ...(state.outfits ?? {}) };
  for (const [uid, o] of Object.entries(drafts)) if (owned.has(uid)) outfits[uid] = { ...outfits[uid], ...o };
  const seen = new Set<number>();
  for (const m of lockerMembers(state)) {
    const n = outfits[m.card.uid]?.number;
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('Số áo phải từ 1 đến 99.');
    if (seen.has(n)) throw new Error(`Số áo ${n} đã có cầu thủ khác dùng.`);
    seen.add(n);
  }
  const next: Save = { ...state, outfits };
  if (team) next.teamKit = { ...teamKitOf(state), ...team };
  return next;
}
