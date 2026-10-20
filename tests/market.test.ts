import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, makeCard, MAX_LEVEL, players, validateSave } from '../src/game.ts';
import { buyPlayer, sellPlayer, marketQuote, MARKET_FEE_PERCENT } from '../src/market.ts';

test('Giá thị trường là số nguyên an toàn; tăng theo OVR và cấp thẻ; phí bán đối chiếu đúng', () => {
  for (const player of players) {
    let previous = 0;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const quote = marketQuote({ playerId: player.id, level });
      assert.ok(Number.isSafeInteger(quote.price) && quote.price > previous);
      assert.equal(quote.fee, Math.floor(quote.price * MARKET_FEE_PERCENT / 100));
      assert.equal(quote.proceeds + quote.fee, quote.price);
      previous = quote.price;
    }
  }
  const ordered = [...players].sort((a, b) => a.ovr - b.ovr);
  for (let i = 1; i < ordered.length; i++) assert.ok(marketQuote({ playerId: ordered[i].id, level: 1 }).price >= marketQuote({ playerId: ordered[i - 1].id, level: 1 }).price);
  for (const level of [0, -1, 1.5, MAX_LEVEL + 1, NaN, Infinity]) assert.throws(() => marketQuote({ playerId: players[0].id, level }), /không hợp lệ/);
  assert.throws(() => marketQuote({ playerId: -1, level: 1 }), /không hợp lệ/);
});

test('Mua đúng cấp thẻ, trừ đúng xu, tạo UID riêng, giữ dữ liệu cũ và lưu lịch sử hợp lệ', () => {
  const before = initialSave();
  const snapshot = structuredClone(before);
  const quote = marketQuote({ playerId: 30, level: 3 });
  const result = buyPlayer(before, 30, 3);
  assert.equal(result.state.balance, before.balance - quote.price);
  assert.equal(result.state.cards.length, before.cards.length + 1);
  assert.equal(result.card.playerId, 30);
  assert.equal(result.card.level, 3);
  assert.ok(!before.cards.some(c => c.uid === result.card.uid));
  assert.deepEqual(before, snapshot);
  assert.equal(result.state.history[0].type, 'market');
  assert.match(result.state.history[0].title, /Mua/);
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  const second = buyPlayer(result.state, 30, 3);
  assert.notEqual(second.card.uid, result.card.uid);
  assert.throws(() => buyPlayer({ ...before, balance: quote.price - 1 }, 30, 3), /Không đủ xu/);
  assert.equal(buyPlayer({ ...before, balance: quote.price }, 30, 3).state.balance, 0);
});

test('Bán đúng bản sao thẻ, nhận xu sau phí; chặn bán lại và tràn số dư', () => {
  const first = makeCard(21), duplicate = makeCard(21);
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
  const before = initialSave();
  const bought = buyPlayer(before, 30, 2);
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
  const bought = buyPlayer(before, players[0].id, MAX_LEVEL, true);
  assert.equal(bought.state.balance, 0);
  assert.equal(bought.card.level, MAX_LEVEL);
  const sold = sellPlayer(bought.state, bought.card.uid, true);
  assert.equal(sold.state.balance, 0);
  assert.deepEqual(sold.state.cards, before.cards);
  assert.ok(validateSave(sold.state));
  assert.match(bought.state.history[0].detail, /Không trừ xu/);
  assert.match(sold.state.history[0].detail, /Không cộng xu/);
});

test('Giữ tối đa 200 lịch sử, đọc lại được bản lưu cũ và bản lưu có giao dịch', () => {
  const before = initialSave();
  assert.ok(validateSave(before));
  before.history = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, type: 'gift', time: 1, title: 'Điểm danh', detail: 'Xu' }));
  const bought = buyPlayer(before, 30, 1);
  assert.equal(bought.state.history.length, 200);
  assert.equal(bought.state.history.at(-1)?.id, 'old-198');
  assert.ok(validateSave(JSON.parse(JSON.stringify(bought.state))));
  const malformed = structuredClone(bought.state);
  Object.assign(malformed.history[0], { type: 'unknown' });
  assert.equal(validateSave(malformed), false);
});
