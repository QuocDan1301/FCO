import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, makeCard, MAX_LEVEL, players, validateSave } from '../src/game.ts';
import { buyPlayer, sellPlayer, marketQuote, compareMarketPrices, formatMarketPrice, MARKET_FEE_PERCENT, PRICE_AS_OF } from '../src/market.ts';
import { readFileSync } from 'node:fs';
import mutablePriceData from '../src/player-prices.json';

// Bảng giá lấy từ Excel (src/player-prices.json): game phải trả đúng từng ô, kể cả ô trống.
const priceTable: Record<string, (number | null)[]> = JSON.parse(readFileSync(new URL('../src/player-prices.json', import.meta.url), 'utf8')).players;

test('Thẻ giá 0 hiển thị 0 BP, mua bán được với 0 xu; ô trống vẫn khóa giao dịch', () => {
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

test('Giữ giá +1 Excel; giá +2 đến +13 theo hệ số, mua bán và phí nhất quán', () => {
  const ratios = [1, 1.637, 1.75, 2.1, 2.3, 2.6, 3.2, 4.2, 2.4, 2.5, 2.8, 3.2, 3.8];
  for (const player of players) {
    const basePrice = priceTable[player.id]?.[0] ?? null;
    if (basePrice === null) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const quote = marketQuote({ playerId: player.id, level });
        assert.equal(quote.price, null);
        assert.equal(quote.available, false);
        assert.equal(quote.fee, null);
        assert.equal(quote.proceeds, null);
      }
      continue;
    }
    let expected = basePrice;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expected *= ratios[level - 1];
      const quote = marketQuote({ playerId: player.id, level });
      assert.equal(quote.asOfDate, PRICE_AS_OF);
      const factor = quote.group === 1 && level >= 5 ? 1.25 : quote.group === 3 && level > 1 ? level <= 4 ? .8 : level >= 8 ? .55 : 7.5 / (1.637 * 1.75 * 2.1 * 2.3) + (.55 - 7.5 / (1.637 * 1.75 * 2.1 * 2.3)) * (level - 5) / 3 : 1;
      assert.equal(quote.price, Math.round(expected * factor));
      assert.ok(quote.available);
      if (quote.available) {
        assert.ok(Number.isSafeInteger(quote.price));
        assert.equal(quote.fee, Math.floor(quote.price * MARKET_FEE_PERCENT / 100));
        assert.equal(quote.proceeds + quote.fee, quote.price);
      }
    }
  }
  for (const level of [0, -1, 1.5, MAX_LEVEL + 1, NaN, Infinity]) assert.throws(() => marketQuote({ playerId: players[0].id, level }), /không hợp lệ/);
  assert.throws(() => marketQuote({ playerId: -1, level: 1 }), /không hợp lệ/);
  assert.ok(compareMarketPrices({ playerId: 1, level: 1 }, { playerId: 1, level: 13 }) < 0);
});

test('Mua đúng cấp thẻ, trừ đúng xu, tạo UID riêng, giữ dữ liệu cũ và lưu lịch sử hợp lệ', () => {
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
  assert.throws(() => buyPlayer({ ...before, balance: quote.price - 1 }, 47, 3), /Không đủ xu/);
  assert.equal(buyPlayer({ ...before, balance: quote.price }, 47, 3).state.balance, 0);
});

test('Bán đúng bản sao thẻ, nhận xu sau phí; chặn bán lại và tràn số dư', () => {
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

test('Xu vô hạn: giao dịch vẫn thêm/xóa thẻ nhưng không đổi số dư, kể cả khi hết xu', () => {
  const before = { ...initialSave(), balance: 0 };
  const bought = buyPlayer(before, players[0].id, 5, true);
  assert.equal(bought.state.balance, 0);
  assert.equal(bought.card.level, 5);
  const sold = sellPlayer(bought.state, bought.card.uid, true);
  assert.equal(sold.state.balance, 0);
  assert.deepEqual(sold.state.cards, before.cards);
  assert.ok(validateSave(sold.state));
  assert.match(bought.state.history[0].detail, /Không trừ xu/);
  assert.match(sold.state.history[0].detail, /Không cộng xu/);
});

test('Giữ tối đa 200 lịch sử, đọc lại được bản lưu cũ và bản lưu có giao dịch', () => {
  const before = { ...initialSave(), balance: 1000000000000000 };
  assert.ok(validateSave(before));
  before.history = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, type: 'gift', time: 1, title: 'Điểm danh', detail: 'Xu' }));
  const bought = buyPlayer(before, 47, 1);
  assert.equal(bought.state.history.length, 200);
  assert.equal(bought.state.history.at(-1)?.id, 'old-198');
  assert.ok(validateSave(JSON.parse(JSON.stringify(bought.state))));
  const malformed = structuredClone(bought.state);
  Object.assign(malformed.history[0], { type: 'unknown' });
  assert.equal(validateSave(malformed), false);
});
