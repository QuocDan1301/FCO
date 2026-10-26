import { getPlayer } from './game';
import type { Card, Save } from './game';

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