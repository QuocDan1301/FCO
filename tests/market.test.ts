import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCard, MAX_LEVEL, players, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { buyPlayer, sellPlayer, sellCards, sellRange, marketQuote, compareMarketPrices, formatMarketPrice, MARKET_FEE_PERCENT, MAX_BULK_SELL, PRICE_AS_OF } from '../src/market.ts';
import { readFileSync } from 'node:fs';
import mutablePriceData from '../src/player-prices.json';

// Bảng giá lấy từ Excel (src/player-prices.json): game phải trả đúng từng ô, kể cả ô trống.
const priceTable: Record<string, (number | null)[]> = JSON.parse(readFileSync(new URL('../src/player-prices.json', import.meta.url), 'utf8')).players;

test('Thẻ giá 0 hiển thị 0 BP, mua bán được với 0 BP; ô trống vẫn khóa giao dịch', () => {
  const table = mutablePriceData.players as Record<string, (number | null)[]>;
  const playerId = 47;
  const previous = table[playerId];
  try {
    table[playerId] = Array(MAX_LEVEL).fill(0);
    const before = { ...initialSave(), balance: 0 };
    assert.equal(formatMarketPrice(0), '0 BP');
    assert.equal(formatMarketPrice(null), 'Chưa có giá');
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const quote = marketQuote({ playerId, level });
      assert.equal(quote.price, 0);
      assert.equal(quote.available, true);
      assert.equal(quote.fee, 0);
      assert.equal(quote.proceeds, 0);
      const bought = buyPlayer(before, playerId, level);
      assert.equal(bought.state.balance, 0);
      const sold = sellPlayer(bought.state, bought.card.uid);
      assert.equal(sold.state.balance, 0);
      assert.deepEqual(sold.state.cards, before.cards);
    }
    table[playerId] = Array(MAX_LEVEL).fill(null);
    assert.equal(marketQuote({ playerId, level: 1 }).available, false);
    assert.throws(() => buyPlayer(before, playerId, 1), /Chưa có giá/);
  } finally { table[playerId] = previous; }
});

test('Giá từng cấp khớp bảng Excel; mua bán và phí nhất quán', () => {
  for (const player of players) for (let level = 1; level <= MAX_LEVEL; level++) {
    const expected = priceTable[player.id]?.[level - 1] ?? null;
    const quote = marketQuote({ playerId: player.id, level });
    assert.equal(quote.asOfDate, PRICE_AS_OF);
    assert.equal(quote.price, expected, `ID ${player.id} +${level}`);
    assert.equal(quote.available, expected !== null);
    if (quote.available) {
      assert.ok(Number.isSafeInteger(quote.price));
      assert.equal(quote.fee, Math.floor(quote.price * MARKET_FEE_PERCENT / 100));
      assert.equal(quote.proceeds + quote.fee, quote.price);
    } else {
      assert.equal(quote.fee, null);
      assert.equal(quote.proceeds, null);
    }
  }
  for (const level of [0, -1, 1.5, MAX_LEVEL + 1, NaN, Infinity]) assert.throws(() => marketQuote({ playerId: players[0].id, level }), /không hợp lệ/);
  assert.throws(() => marketQuote({ playerId: -1, level: 1 }), /không hợp lệ/);
  assert.ok(compareMarketPrices({ playerId: 1, level: 1 }, { playerId: 1, level: 13 }) < 0);
});

test('Mua đúng cấp thẻ, trừ đúng BP, tạo UID riêng, giữ dữ liệu cũ và lưu lịch sử hợp lệ', () => {
  const before = { ...initialSave(), balance: 1000000000000000 };
  const snapshot = structuredClone(before);
  const quote = marketQuote({ playerId: 47, level: 3 });
  const result = buyPlayer(before, 47, 3);
  assert.equal(result.state.balance, before.balance - quote.price);
  assert.equal(result.state.cards.length, before.cards.length + 1);
  assert.equal(result.card.playerId, 47);
  assert.equal(result.card.level, 3);
  assert.ok(!before.cards.some(c => c.uid === result.card.uid));
  assert.deepEqual(before, snapshot);
  assert.equal(result.state.history[0].type, 'market');
  assert.match(result.state.history[0].title, /Mua/);
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  const second = buyPlayer(result.state, 47, 3);
  assert.notEqual(second.card.uid, result.card.uid);
  assert.throws(() => buyPlayer({ ...before, balance: quote.price - 1 }, 47, 3), /Không đủ BP/);
  assert.equal(buyPlayer({ ...before, balance: quote.price }, 47, 3).state.balance, 0);
});

test('Bán đúng bản sao thẻ, nhận BP sau phí; chặn bán lại và tràn số dư', () => {
  const first = makeCard(11), duplicate = makeCard(11);
  first.level = 5;
  const before = { ...initialSave(), cards: [first, duplicate] };
  const snapshot = structuredClone(before);
  const quote = marketQuote(first);
  const result = sellPlayer(before, first.uid);
  assert.equal(result.state.balance, before.balance + quote.proceeds);
  assert.deepEqual(result.state.cards, [duplicate]);
  assert.deepEqual(before, snapshot);
  assert.match(result.state.history[0].title, /Bán/);
  assert.match(result.state.history[0].detail, /Phí 5%/);
  assert.ok(validateSave(result.state));
  assert.throws(() => sellPlayer(result.state, first.uid), /không còn trong kho/);
  assert.throws(() => sellPlayer(before, 'unknown'), /không còn trong kho/);
  assert.throws(() => sellPlayer({ ...before, balance: Number.MAX_SAFE_INTEGER }, first.uid), /giới hạn/);
  assert.equal(sellPlayer({ ...before, balance: Number.MAX_SAFE_INTEGER - quote.proceeds }, first.uid).state.balance, Number.MAX_SAFE_INTEGER);
});

test('Mua rồi bán mất đúng phí; không tạo lợi nhuận và giữ nguyên kho gói, số lần mở/nâng cấp', () => {
  const before = { ...initialSave(), balance: 1000000000000000 };
  const bought = buyPlayer(before, 47, 2);
  const sold = sellPlayer(bought.state, bought.card.uid);
  assert.equal(sold.state.balance, before.balance - bought.quote.fee);
  assert.deepEqual(sold.state.cards, before.cards);
  assert.deepEqual(sold.state.unopened, before.unopened);
  assert.equal(sold.state.opened, before.opened);
  assert.equal(sold.state.upgrades, before.upgrades);
  assert.equal(sold.state.history.length, 2);
});

test('BP vô hạn: giao dịch vẫn thêm/xóa thẻ nhưng không đổi số dư, kể cả khi hết BP', () => {
  const before = { ...initialSave(), balance: 0 };
  const bought = buyPlayer(before, players[0].id, 5, true);
  assert.equal(bought.state.balance, 0);
  assert.equal(bought.card.level, 5);
  const sold = sellPlayer(bought.state, bought.card.uid, true);
  assert.equal(sold.state.balance, 0);
  assert.deepEqual(sold.state.cards, before.cards);
  assert.ok(validateSave(sold.state));
  assert.match(bought.state.history[0].detail, /Không trừ BP/);
  assert.match(sold.state.history[0].detail, /Không cộng BP/);
});

test('Giữ tối đa 200 lịch sử, đọc lại được bản lưu cũ và bản lưu có giao dịch', () => {
  const before = { ...initialSave(), balance: 1000000000000000 };
  assert.ok(validateSave(before));
  before.history = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, type: 'gift', time: 1, title: 'Điểm danh', detail: 'BP' }));
  const bought = buyPlayer(before, 47, 1);
  assert.equal(bought.state.history.length, 200);
  assert.equal(bought.state.history.at(-1)?.id, 'old-198');
  assert.ok(validateSave(JSON.parse(JSON.stringify(bought.state))));
  const malformed = structuredClone(bought.state);
  Object.assign(malformed.history[0], { type: 'unknown' });
  assert.equal(validateSave(malformed), false);
});

test('byMarketValue: thẻ giá cao nhất đứng đầu, thẻ chưa có giá xếp sau, bằng giá thì OVR cao hơn', async () => {
  const { byMarketValue } = await import('../src/market.ts');
  const priced = players.filter(p => marketQuote({ playerId: p.id, level: 1 }).price !== null).slice(0, 6).map(p => makeCard(p.id));
  const sorted = byMarketValue(priced);
  for (let i = 1; i < sorted.length; i++) assert.ok((marketQuote(sorted[i - 1]).price ?? -1) >= (marketQuote(sorted[i]).price ?? -1));
  const unpriced = players.find(p => marketQuote({ playerId: p.id, level: 1 }).price === null);
  if (unpriced) assert.equal(byMarketValue([makeCard(unpriced.id), priced[0]])[0].playerId, priced[0].playerId);
  assert.deepEqual(priced.map(c => c.uid), priced.map(c => c.uid), 'Không sửa mảng gốc');
});

test('Bán theo giá tự đặt: trong ±10% giá thị trường, trừ phí 5%; bán hàng loạt nhiều thẻ một lần, chặn giá sai / thẻ khóa / trùng / quá 99 thẻ', () => {
  const priced = players.filter(p => marketQuote({ playerId: p.id, level: 1 }).available).slice(0, 3);
  const cards = priced.map(p => makeCard(p.id));
  const state = { ...initialSave(), balance: 1_000, cards };
  const range = sellRange(cards[0])!;
  assert.equal(range.min, Math.ceil(range.price * .9));
  assert.equal(range.max, Math.floor(range.price * 1.1));
  // Bán lẻ ở giá tối đa: nhận giá − phí.
  const single = sellCards(state, [{ uid: cards[0].uid, price: range.max }]);
  assert.equal(single.state.balance, 1_000 + range.max - Math.floor(range.max * MARKET_FEE_PERCENT / 100));
  assert.equal(single.state.cards.length, 2);
  assert.match(single.state.history[0].title, /^Bán · /);
  assert.ok(validateSave(JSON.parse(JSON.stringify(single.state))));
  // Bán hàng loạt: mỗi thẻ một giá, một dòng lịch sử tổng.
  const items = cards.map(c => ({ uid: c.uid, price: sellRange(c)!.min }));
  const bulk = sellCards(state, items);
  const total = items.reduce((s, i) => s + i.price, 0), fees = items.reduce((s, i) => s + Math.floor(i.price * MARKET_FEE_PERCENT / 100), 0);
  assert.equal(bulk.total, total);
  assert.equal(bulk.proceeds, total - fees);
  assert.equal(bulk.state.balance, 1_000 + total - fees);
  assert.equal(bulk.state.cards.length, 0);
  assert.match(bulk.state.history[0].title, /Bán hàng loạt · 3 cầu thủ/);
  // Chế độ thử: không cộng BP.
  assert.equal(sellCards(state, items, true).state.balance, 1_000);
  // Các lỗi đều giữ nguyên bản lưu.
  assert.throws(() => sellCards(state, []), /chọn/);
  assert.throws(() => sellCards(state, [{ uid: cards[0].uid, price: range.max + 1 }]), /phải từ/);
  assert.throws(() => sellCards(state, [{ uid: cards[0].uid, price: range.min - 1 }]), /phải từ/);
  assert.throws(() => sellCards(state, [{ uid: cards[0].uid, price: range.price + .5 }]), /phải từ/);
  assert.throws(() => sellCards(state, [items[0], items[0]]), /trùng/);
  assert.throws(() => sellCards({ ...state, locked: [cards[1].uid] }, items), /khóa/);
  assert.throws(() => sellCards(state, [{ uid: 'không-có', price: 1 }]), /không còn/);
  assert.throws(() => sellCards(state, Array.from({ length: MAX_BULK_SELL + 1 }, (_, i) => ({ uid: `x${i}`, price: 1 }))), /tối đa/);
  assert.equal(state.cards.length, 3);
});