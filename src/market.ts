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

// Phần không đổi của báo giá (phân loại, nhóm giá, tỷ lệ bảo hiểm) chỉ phụ thuộc cầu thủ + cấp nên tính một lần;
// giá vẫn đọc trực tiếp từ bảng mỗi lần gọi.
const quoteBases = new Map<string, { player: typeof players[number]; calculated: ReturnType<typeof calculatePrice>; rate: number; classification: ReturnType<typeof playerClassification>; groupNote: string }>();
function quoteBase(card: Pick<Card, 'playerId' | 'level'>) {
  const key = `${card.playerId}:${card.level}`;
  let base = quoteBases.get(key);
  if (base) return base;
  const player = getPlayer(card);
  if (!player || !Number.isInteger(card.level) || card.level < 1 || card.level > MAX_LEVEL) throw new Error('Cầu thủ hoặc cấp thẻ không hợp lệ.');
  const calculated = calculatePrice(null, card.level, playerPricingOptions(player.id, player));
  const classification = playerClassification(player);
  const groupNote = `Nhóm ${calculated.group}${classification.provisional && calculated.group === classification.group ? ' · Tạm tính, thiếu dữ liệu tiêu chí' : ''}`;
  base = { player, calculated, rate: insuranceRate(player.ovr), classification, groupNote };
  quoteBases.set(key, base);
  return base;
}

// Không có giá +1 thì không suy đoán giá các cấp sau. Bảo hiểm chỉ là báo phí, không cộng vào giá thẻ.
export function marketQuote(card: Pick<Card, 'playerId' | 'level'>) {
  const { player, calculated, rate, classification, groupNote } = quoteBase(card);
  const price = recordedPrices[String(player.id)]?.[card.level - 1] ?? null;
  const metadata = { groupNote, classification, asOfDate: PRICE_AS_OF, group: calculated.group, liquidityNote: calculated.liquidityNote, insuranceRate: rate, insuranceFee: price !== null && card.level >= 8 && card.level < MAX_LEVEL ? Math.round(price * rate) : null };
  if (price === null) return { ...metadata, available: false as const, price: null, fee: null, proceeds: null, reason: `Chưa có giá ${player.name} +${card.level} trong bảng giá.` };
  const fee = Math.floor(price * MARKET_FEE_PERCENT / 100);
  return { ...metadata, available: true as const, price, fee, proceeds: price - fee, reason: null };
}

export function buyPlayer(state: Save, playerId: number, level: number, free = false) {
  const quote = marketQuote({ playerId, level });
  if (!quote.available) throw new Error(quote.reason);
  if (!free && state.balance < quote.price) throw new Error('Không đủ BP để mua thẻ này. Hãy bán thẻ khác hoặc nhận quà điểm danh.');
  const card: Card = { ...makeCard(playerId), level };
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Mua · ${getPlayer(card).name} +${level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · ${free ? 'Thử nghiệm · Không trừ BP' : `−${money(quote.price)} BP`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - quote.price, cards: [card, ...state.cards], history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

export function sellPlayer(state: Save, cardId: string, free = false) {
  const card = state.cards.find(c => c.uid === cardId);
  if (!card) throw new Error('Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.');
  if (state.locked?.includes(cardId)) throw new Error('Thẻ đang bị khóa. Mở khóa trước khi bán.');
  const quote = marketQuote(card);
  if (!quote.available) throw new Error(quote.reason);
  const balance = free ? state.balance : state.balance + quote.proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Bán · ${getPlayer(card).name} +${card.level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · Phí ${MARKET_FEE_PERCENT}%: ${money(quote.fee)} BP · ${free ? 'Thử nghiệm · Không cộng BP' : `+${money(quote.proceeds)} BP`}` };
  return { state: { ...state, balance, cards: state.cards.filter(c => c.uid !== cardId), history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

// Bán theo giá tự đặt (cửa sổ Bán): giá phải nằm trong ±SELL_BAND_PERCENT% quanh giá thị trường, bán ngay theo giá đã đặt, trừ phí MARKET_FEE_PERCENT%.
// Bán hàng loạt tối đa MAX_BULK_SELL thẻ mỗi lần, mỗi thẻ một giá riêng.
export const SELL_BAND_PERCENT = 10;
export const MAX_BULK_SELL = 99;
export function sellRange(card: Pick<Card, 'playerId' | 'level'>) {
  const quote = marketQuote(card);
  if (!quote.available) return null;
  return { price: quote.price, min: Math.ceil(quote.price * (100 - SELL_BAND_PERCENT) / 100), max: Math.floor(quote.price * (100 + SELL_BAND_PERCENT) / 100) };
}
export type SellItem = { uid: string; price: number };
export function sellCards(state: Save, items: SellItem[], free = false) {
  if (!items.length) throw new Error('Hãy chọn cầu thủ để bán.');
  if (items.length > MAX_BULK_SELL) throw new Error(`Mỗi lần bán tối đa ${MAX_BULK_SELL} cầu thủ.`);
  if (new Set(items.map(item => item.uid)).size !== items.length) throw new Error('Danh sách bán có thẻ bị trùng.');
  const byUid = new Map(state.cards.map(card => [card.uid, card]));
  const sold: Card[] = [];
  let total = 0, fees = 0;
  for (const item of items) {
    const card = byUid.get(item.uid);
    if (!card) throw new Error('Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.');
    const name = `${getPlayer(card).name} +${card.level}`;
    if (state.locked?.includes(item.uid)) throw new Error(`${name} đang bị khóa. Mở khóa trước khi bán.`);
    const range = sellRange(card);
    if (!range) throw new Error(marketQuote(card).reason ?? `Chưa có giá ${name}.`);
    if (!Number.isInteger(item.price) || item.price < range.min || item.price > range.max) throw new Error(`Giá bán ${name} phải từ ${money(range.min)} đến ${money(range.max)} BP.`);
    total += item.price;
    fees += Math.floor(item.price * MARKET_FEE_PERCENT / 100);
    sold.push(card);
  }
  const proceeds = total - fees, balance = free ? state.balance : state.balance + proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const tail = `Phí ${MARKET_FEE_PERCENT}%: ${money(fees)} BP · ${free ? 'Thử nghiệm · Không cộng BP' : `+${money(proceeds)} BP`}`;
  const entry: Entry = sold.length === 1
    ? { id: uid(), time: Date.now(), type: 'market', title: `Bán · ${getPlayer(sold[0]).name} +${sold[0].level}`, detail: `OVR ${ovr(sold[0])} · Giá ${money(total)} BP · ${tail}` }
    : { id: uid(), time: Date.now(), type: 'market', title: `Bán hàng loạt · ${sold.length} cầu thủ`, detail: `Tổng giá ${money(total)} BP · ${tail}` };
  const soldIds = new Set(items.map(item => item.uid));
  return { state: { ...state, balance, cards: state.cards.filter(card => !soldIds.has(card.uid)), history: [entry, ...state.history].slice(0, 200) }, sold, total, fees, proceeds };
}
// Thẻ giá trị nhất đứng đầu (thẻ chưa có giá xếp sau); bằng giá thì OVR cao hơn đứng trước.
export function byMarketValue<T extends Pick<Card, 'playerId' | 'level'>>(cards: readonly T[]): T[] {
  const value = (card: T) => marketQuote(card).price ?? -1;
  return [...cards].sort((a, b) => value(b) - value(a) || ovr(b) - ovr(a));
}
