import { getPlayer, makeCard, money, ovr, players, MAX_LEVEL, uid } from './game';
import type { Card, Entry, Save } from './game';
import priceData from './player-prices.json';
import { calculatePrice, insuranceRate, playerPricingOptions, playerClassification } from './pricing';
import { bestMembership } from './membership';
import { FLAT_PRICE } from './group-price';

// player-prices.json giữ giá chuẩn theo nhóm và OVR (group-price.ts). Giá thật dao động quanh giá chuẩn và đổi mỗi 5 giờ.
export const PRICE_AS_OF = priceData.updatedAt;
const recordedPrices: Record<string, (number | null)[]> = priceData.players;
export const formatMarketPrice = (price: number | null) => price === null ? 'Chưa có giá' : `${money(price)} BP`;

export const PRICE_PERIOD_HOURS = 5;
export const PRICE_SWING_PERCENT = 10;
export const PRICE_PERIOD_MS = PRICE_PERIOD_HOURS * 3_600_000;
// Mốc tính kỳ giá: 00:00 ngày 9/11/2026 giờ Việt Nam. Máy chủ dùng cùng mốc (src/inventory-catalog.ts gửi lên).
export const PRICE_EPOCH = Date.UTC(2026, 10, 8, 17);

// Đồng hồ máy chủ để đổi giờ trên máy không xem hoặc bán được theo giá của kỳ khác. Chưa lấy được thì dùng giờ máy.
let clockOffset = 0;
export const setMarketClock = (serverNow: number, localNow = Date.now()) => { clockOffset = serverNow - localNow; };
export const marketNow = () => Date.now() + clockOffset;
export const pricePeriod = (at = marketNow()) => Math.floor((at - PRICE_EPOCH) / PRICE_PERIOD_MS);
export const nextPriceChange = (at = marketNow()) => PRICE_EPOCH + (pricePeriod(at) + 1) * PRICE_PERIOD_MS;

// Mọi máy cùng kỳ tính ra cùng một giá. Mỗi thẻ ở mỗi mức cộng có độ lệch riêng trong khoảng −1…1.
function priceSwing(playerId: number, level: number, period: number) {
  let hash = 0x811c9dc5;
  for (const value of [playerId, level, period]) {
    hash = Math.imul(hash ^ value, 0x5bd1e995);
    hash ^= hash >>> 15;
  }
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x7fffffff - 1;
}
// Giữ 3 chữ số có nghĩa cho dễ đọc nhưng không để làm tròn đẩy giá ra ngoài biên độ.
function swungPrice(base: number, swing: number) {
  const min = Math.ceil(base * (100 - PRICE_SWING_PERCENT) / 100), max = Math.floor(base * (100 + PRICE_SWING_PERCENT) / 100);
  const raw = base * (1 + swing * PRICE_SWING_PERCENT / 100);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 2);
  return Math.min(max, Math.max(min, Math.round(raw / unit) * unit));
}
// Mùa LIVE giữ đúng giá theo công thức riêng, không dao động theo kỳ. Tra Set vì hàm này chạy cho cả danh sách cầu thủ mỗi lần sắp xếp.
export const fixedPricePlayers: ReadonlySet<number> = new Set(players.filter(p => p.tier === 'live').map(p => p.id));
// Giá thẻ tại một thời điểm (mặc định là bây giờ). Dùng trực tiếp để sắp xếp 3.883 cầu thủ khỏi phải dựng cả báo giá cho mỗi lần so sánh.
export function priceAt(card: Pick<Card, 'playerId' | 'level'>, at = marketNow()) {
  const base = recordedPrices[String(card.playerId)]?.[card.level - 1] ?? null;
  return base === null || base === 0 || base === FLAT_PRICE || fixedPricePlayers.has(card.playerId) ? base : swungPrice(base, priceSwing(card.playerId, card.level, pricePeriod(at)));
}
export function compareMarketPrices(a: Pick<Card, 'playerId' | 'level'>, b: Pick<Card, 'playerId' | 'level'>, descending = false) {
  const first = priceAt(a), second = priceAt(b);
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return descending ? second - first : first - second;
}

export type MarketTrade = { kind: 'buy' | 'sell'; card: Card };
// Thuế bán chung cho mọi thẻ. Mua lúc −10% rồi bán ở +10% và tự đặt thêm +10% được 1,21 / 0,9 lần, thấp hơn nhiều so với mức thuế này nên không có lãi.
export const MARKET_FEE_PERCENT = 40;
// Thuế người chơi này phải trả, sau khi trừ phần giảm của gói thành viên còn hạn: SVIP Class 28%, Premium 20%.
export const saleTaxPercent = (state: Pick<Save, 'membership'>, at = marketNow()) => MARKET_FEE_PERCENT * (100 - (bestMembership(state.membership, at)?.discount ?? 0)) / 100;
export const saleFee = (price: number, taxPercent = MARKET_FEE_PERCENT) => Math.floor(price * taxPercent / 100);

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
export function marketQuote(card: Pick<Card, 'playerId' | 'level'>, taxPercent = MARKET_FEE_PERCENT) {
  const { player, calculated, rate, classification, groupNote } = quoteBase(card);
  const price = priceAt(card);
  const metadata = { groupNote, classification, asOfDate: PRICE_AS_OF, group: calculated.group, liquidityNote: calculated.liquidityNote, insuranceRate: rate, insuranceFee: price !== null && card.level >= 8 && card.level < MAX_LEVEL ? Math.round(price * rate) : null, feePercent: taxPercent };
  if (price === null) return { ...metadata, available: false as const, price: null, fee: null, proceeds: null, reason: `Chưa có giá ${player.name} +${card.level} trong bảng giá.` };
  const fee = saleFee(price, taxPercent);
  return { ...metadata, available: true as const, price, fee, proceeds: price - fee, reason: null };
}

export function buyPlayer(state: Save, playerId: number, level: number, free = false) {
  const quote = marketQuote({ playerId, level });
  if (!quote.available) throw new Error(quote.reason);
  if (!free && state.balance < quote.price) throw new Error('Không đủ BP để mua thẻ này. Hãy bán thẻ khác hoặc nhận quà điểm danh.');
  const card: Card = { ...makeCard(playerId), level, fromMarket: true };
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Mua · ${getPlayer(card).name} +${level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · ${free ? 'Thử nghiệm · Không trừ BP' : `−${money(quote.price)} BP`}` };
  return { state: { ...state, balance: free ? state.balance : state.balance - quote.price, cards: [card, ...state.cards], history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

export function sellPlayer(state: Save, cardId: string, free = false) {
  const card = state.cards.find(c => c.uid === cardId);
  if (!card) throw new Error('Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.');
  if (state.locked?.includes(cardId)) throw new Error('Thẻ đang bị khóa. Mở khóa trước khi bán.');
  const quote = marketQuote(card, saleTaxPercent(state));
  if (!quote.available) throw new Error(quote.reason);
  const balance = free ? state.balance : state.balance + quote.proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const entry: Entry = { id: uid(), time: Date.now(), type: 'market', title: `Bán · ${getPlayer(card).name} +${card.level}`, detail: `OVR ${ovr(card)} · Giá ${money(quote.price)} BP · Phí ${quote.feePercent}%: ${money(quote.fee)} BP · ${free ? 'Thử nghiệm · Không cộng BP' : `+${money(quote.proceeds)} BP`}` };
  return { state: { ...state, balance, cards: state.cards.filter(c => c.uid !== cardId), history: [entry, ...state.history].slice(0, 200) }, card, quote };
}

// Bán theo giá tự đặt (cửa sổ Bán): giá phải nằm trong ±SELL_BAND_PERCENT% quanh giá thị trường, bán ngay theo giá đã đặt, trừ phí của từng thẻ.
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
  const taxPercent = saleTaxPercent(state);
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
    fees += saleFee(item.price, taxPercent);
    sold.push(card);
  }
  const proceeds = total - fees, balance = free ? state.balance : state.balance + proceeds;
  if (!Number.isSafeInteger(balance)) throw new Error('Số dư đã đạt giới hạn. Không thể bán thêm thẻ.');
  const tail = `Phí ${taxPercent}%: ${money(fees)} BP · ${free ? 'Thử nghiệm · Không cộng BP' : `+${money(proceeds)} BP`}`;
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
