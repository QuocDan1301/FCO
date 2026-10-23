import { getPlayer, makeCard, money, ovr, players, MAX_LEVEL, uid } from './game';
import type { Card, Entry, Save } from './game';
import priceData from './player-prices.json';
import { calculatePrice, insuranceRate, playerPricingOptions, playerClassification } from './pricing';

// Giá +1 lấy từ Excel; +2…+13 tính theo pricing.ts và cấu hình nhóm người dùng.
export const PRICE_AS_OF = priceData.updatedAt;
const recordedPrices: Record<string, (number | null)[]> = priceData.players;
export const formatMarketPrice = (price: number | null) => price === null ? 'Chưa có giá' : `${money(price)} BP`;
export function compareMarketPrices(a: Pick<Card, 'playerId' | 'level'>, b: Pick<Card, 'playerId' | 'level'>, descending = false) {
  const first = marketQuote(a).price, second = marketQuote(b).price;
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return descending ? second - first : first - second;
}

export type MarketTrade = { kind: 'buy' | 'sell'; card: Card };
export const MARKET_FEE_PERCENT = 5;

// Không có giá +1 thì không suy đoán giá các cấp sau. Bảo hiểm chỉ là báo phí, không cộng vào giá thẻ.
export function marketQuote(card: Pick<Card, 'playerId' | 'level'>) {
  const player = players.find(p => p.id === card.playerId);
  if (!player || !Number.isInteger(card.level) || card.level < 1 || card.level > MAX_LEVEL) throw new Error('Cầu thủ hoặc cấp thẻ không hợp lệ.');
  const calculated = calculatePrice(recordedPrices[String(player.id)]?.[0] ?? null, card.level, playerPricingOptions(player.id, player));
  const { price } = calculated;
  const rate = insuranceRate(player.ovr);
  const classification = playerClassification(player);
  const groupNote = `Nhóm ${calculated.group}${classification.provisional && calculated.group === classification.group ? ' · Tạm tính, thiếu dữ liệu tiêu chí' : ''}`;
  const metadata = { groupNote, classification, asOfDate: PRICE_AS_OF, group: calculated.group, liquidityNote: calculated.liquidityNote, insuranceRate: rate, insuranceFee: price !== null && card.level >= 8 && card.level < MAX_LEVEL ? Math.round(price * rate) : null };
  if (price === null) return { ...metadata, available: false as const, price: null, fee: null, proceeds: null, reason: `Chưa có giá ${player.name} +${card.level} trong bảng giá.` };
  const fee = Math.floor(price * MARKET_FEE_PERCENT / 100);
  return { ...metadata, available: true as const, price, fee, proceeds: price - fee, reason: null };
}

export function buyPlayer(state: Save, playerId: number, level: number, free = false) {
  const quote = marketQuote({ playerId, level });
  if (!quote.available) throw new Error(quote.reason);
  if (!free && state.balance < quote.price) throw new Error('Không đủ xu để mua thẻ này. Hãy bán thẻ khác hoặc nhận quà điểm danh.');
  const card: Card = { ...makeCard(playerId), level };
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Mua · ${getPlayer(card).name} +${level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · ${free ? 'Thử nghiệm · Không trừ xu' : `−${money(quote.price)} BP`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - quote.price, cards: [card, ...state.cards], history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

export function sellPlayer(state: Save, cardId: string, free = false) {
  const card = state.cards.find(c => c.uid === cardId);
  if (!card) throw new Error('Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.');
  const quote = marketQuote(card);
  if (!quote.available) throw new Error(quote.reason);
  const balance = free ? state.balance : state.balance + quote.proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Bán · ${getPlayer(card).name} +${card.level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · Phí ${MARKET_FEE_PERCENT}%: ${money(quote.fee)} BP · ${free ? 'Thử nghiệm · Không cộng xu' : `+${money(quote.proceeds)} BP`}` };
  return { state: { ...state, balance, cards: state.cards.filter(c => c.uid !== cardId), history: [entry, ...state.history].slice(0, 200) }, card, quote };
}
