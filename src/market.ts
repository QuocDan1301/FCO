import { getPlayer, makeCard, money, ovr, players, MAX_LEVEL, uid } from './game';
import type { Card, Entry, Save } from './game';

export type MarketTrade = { kind: 'buy' | 'sell'; card: Card };
export const MARKET_FEE_PERCENT = 5;

// Giá cố định trong game; không sử dụng giá của thị trường FC Online.
export function marketQuote(card: Pick<Card, 'playerId' | 'level'>) {
  const player = players.find(p => p.id === card.playerId);
  if (!player || !Number.isInteger(card.level) || card.level < 1 || card.level > MAX_LEVEL) throw new Error('Cầu thủ hoặc cấp thẻ không hợp lệ.');
  const price = Math.max(50000, Math.round(50000 * 1.16 ** (player.ovr - 80) * 1.6 ** (card.level - 1) / 1000) * 1000);
  const fee = Math.floor(price * MARKET_FEE_PERCENT / 100);
  return { price, fee, proceeds: price - fee };
}

export function buyPlayer(state: Save, playerId: number, level: number, free = false) {
  const quote = marketQuote({ playerId, level });
  if (!free && state.balance < quote.price) throw new Error('Không đủ xu để mua thẻ này. Hãy bán thẻ khác hoặc nhận quà điểm danh.');
  const card: Card = { ...makeCard(playerId), level };
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Mua · ${getPlayer(card).name} +${level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} xu · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(quote.price)} xu`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - quote.price, cards: [card, ...state.cards], history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

export function sellPlayer(state: Save, cardId: string, free = false) {
  const card = state.cards.find(c => c.uid === cardId);
  if (!card) throw new Error('Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.');
  const quote = marketQuote(card);
  const balance = free ? state.balance : state.balance + quote.proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Bán · ${getPlayer(card).name} +${card.level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} xu · Phí ${MARKET_FEE_PERCENT}%: ${money(quote.fee)} xu · ${free ? 'Thử nghiệm · Không cộng xu' : `+${money(quote.proceeds)} xu`}` };
  return { state: { ...state, balance, cards: state.cards.filter(c => c.uid !== cardId), history: [entry, ...state.history].slice(0, 200) }, card, quote };
}
