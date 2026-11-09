import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_LEVEL, makeCard, ovr, players } from '../src/game.ts';
import { groupPrice } from '../src/group-price.ts';
import type { PriceGroup } from '../src/group-price.ts';
import { MARKET_FEE_PERCENT, buyPlayer, marketQuote, nextPriceChange, priceAt, pricePeriod, saleFee, sellCards, sellRange, setMarketClock } from '../src/market.ts';
import { initialSave } from './stocked-save.ts';

const { groups } = JSON.parse(readFileSync('src/player-groups.json', 'utf8')) as { groups: Record<string, PriceGroup> };
const table: Record<string, number[]> = JSON.parse(readFileSync('src/player-prices.json', 'utf8')).players;
const HOUR = 3_600_000, START = Date.UTC(2026, 10, 9);

test('Giá chuẩn theo Giacauthu.xlsx: gốc OVR 99 của từng nhóm, mỗi OVR nhân 1,5', () => {
  assert.deepEqual([groupPrice(1, 99), groupPrice(2, 99), groupPrice(3, 99)], [2000, 4000, 6000]);
  assert.deepEqual([groupPrice(1, 100), groupPrice(2, 100), groupPrice(3, 100)], [3000, 6000, 9000]);
  assert.equal(groupPrice(2, 101), 9000);
  assert.throws(() => groupPrice(1, 98), /ngoài bảng giá/);
});

test('Mọi thẻ đều có nhóm và giá chuẩn đúng công thức', () => {
  for (const p of players) {
    assert.ok(groups[p.name], `${p.name} chưa có nhóm`);
    for (let level = 1; level <= MAX_LEVEL; level++) assert.equal(table[p.id][level - 1], groupPrice(groups[p.name], ovr({ playerId: p.id, level })), `${p.name} +${level}`);
  }
  assert.equal(marketQuote({ playerId: players.find(p => groups[p.name] === 3)!.id, level: 1 }).group, 3);
});

test('Giá luôn nằm trong ±10% giá chuẩn, là số nguyên và vừa số an toàn ở nhiều kỳ', () => {
  for (const period of [0, 1, 7, 50, 1000]) {
    const at = START + period * 5 * HOUR;
    for (const p of players) for (let level = 1; level <= MAX_LEVEL; level++) {
      const base = table[p.id][level - 1], price = priceAt({ playerId: p.id, level }, at)!;
      assert.ok(Number.isSafeInteger(price), `${p.name} +${level}`);
      assert.ok(price >= base * .9 && price <= base * 1.1, `${p.name} +${level}: ${price} so với ${base}`);
    }
  }
});

test('Giá đứng yên trong một kỳ 5 giờ và đổi sang kỳ sau; thẻ khác nhau, mức cộng khác nhau có độ lệch khác nhau', () => {
  const card = { playerId: players[100].id, level: 3 };
  const start = nextPriceChange(START), end = nextPriceChange(start);
  assert.equal(end - start, 5 * HOUR);
  assert.equal(priceAt(card, start), priceAt(card, end - 1));
  const rows = players.map(p => ({ id: p.id, level: 1 })).concat(players.map(p => ({ id: p.id, level: 8 })));
  const ratio = (id: number, level: number, at: number) => priceAt({ playerId: id, level }, at)! / table[id][level - 1];
  const changed = rows.filter(r => ratio(r.id, r.level, start) !== ratio(r.id, r.level, end)).length;
  assert.ok(changed / rows.length > .97, `chỉ ${changed}/${rows.length} thẻ đổi giá`);
  const differs = players.filter(p => ratio(p.id, 1, start) !== ratio(p.id, 8, start)).length;
  assert.ok(differs / players.length > .97, `chỉ ${differs}/${players.length} thẻ lệch khác nhau giữa các mức`);
});

test('Độ lệch phân bố đều: có đủ thẻ tăng, giảm và gần biên ±10%', () => {
  const ratios = players.map(p => priceAt({ playerId: p.id, level: 5 }, START)! / table[p.id][4]);
  const share = (test: (r: number) => boolean) => ratios.filter(test).length / ratios.length;
  assert.ok(Math.abs(share(r => r < 1) - .5) < .05);
  assert.ok(Math.abs(share(r => r < .95) - .25) < .05);
  assert.ok(Math.abs(share(r => r > 1.05) - .25) < .05);
});

test('Giá dùng đồng hồ máy chủ: đổi giờ trên máy không đổi kỳ giá', () => {
  const realNow = Date.now();
  try {
    setMarketClock(realNow + 10 * 5 * HOUR, realNow);
    assert.equal(pricePeriod(), pricePeriod(realNow) + 10);
  } finally { setMarketClock(realNow, realNow); }
});

test('Mọi thẻ chịu cùng thuế bán 40%, dù mua từ chợ hay mở từ gói', () => {
  assert.equal(MARKET_FEE_PERCENT, 40);
  const base = initialSave();
  const bought = buyPlayer({ ...base, balance: Number.MAX_SAFE_INTEGER }, 47, 3);
  assert.equal(bought.card.fromMarket, true);
  const quote = marketQuote(bought.card);
  assert.equal(quote.feePercent, 40);
  assert.equal(quote.fee, Math.floor(quote.price! * 40 / 100));
  assert.equal(marketQuote(makeCard(47)).feePercent, 40);
  assert.ok(JSON.parse(JSON.stringify(bought.card)).fromMarket, 'dấu phải còn sau khi lưu');
});

test('Vòng mua đáy, bán đỉnh với giá tự đặt tối đa không còn lãi', () => {
  // Trường hợp xấu nhất: mua ở −10%, kỳ sau giá +10% và tự đặt thêm +10%.
  for (const standard of [3000, 115_330, 1_000_000_000, 1_000_000_000_000]) {
    const paid = Math.ceil(standard * .9), sale = Math.floor(Math.floor(standard * 1.1) * 1.1);
    assert.ok(sale - saleFee(sale) <= paid, `giá ${standard}`);
  }
});

test('Bán hàng loạt tính phí riêng từng thẻ và lịch sử ghi đúng mức thuế', () => {
  const pack = makeCard(47), market = { ...makeCard(47), fromMarket: true };
  const state = { ...initialSave(), balance: 0, cards: [pack, market] };
  const price = sellRange(pack)!.price;
  const result = sellCards(state, [{ uid: pack.uid, price }, { uid: market.uid, price }]);
  assert.equal(result.fees, saleFee(price) * 2);
  assert.match(result.state.history[0].detail, /Phí 40%/);
  assert.match(sellCards(state, [{ uid: market.uid, price }]).state.history[0].detail, /Phí 40%/);
});
