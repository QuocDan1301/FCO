import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, validateSave } from '../src/game.ts';
import { BOT_HUNTERS, JACKPOT_MAX, JACKPOT_MIN, JACKPOT_RESET, botSpecialOdds, JACKPOT_TICK_MS, botName, grantJackpot, mini, newJackpot, rollJackpot, tickJackpot } from '../src/jackpot.ts';

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

test('Quỹ Giải Đặc Biệt tự tăng theo thời gian, có đợt tăng nhanh; Giải Mini luôn bằng 1/10 quỹ', () => {
  const start = { ...newJackpot(0), pot: 1_000 };
  const slow = tickJackpot(start, 10 * JACKPOT_TICK_MS, () => .5);
  assert.ok(slow.pot >= start.pot + 10 * 8 && slow.pot <= start.pot + 10 * 24);
  assert.equal(slow.at, 10 * JACKPOT_TICK_MS);
  // rng < .05 mở đợt tăng nhanh: mỗi nhịp +80…200.
  const fast = tickJackpot(start, 5 * JACKPOT_TICK_MS, seq(.01, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5));
  assert.ok(fast.pot - start.pot >= 5 * 80);
  assert.equal(mini({ pot: 12_345 }), 1_234);
  assert.equal(tickJackpot(start, JACKPOT_TICK_MS - 1, Math.random), start);
});

test('Bot chỉ săn được giải khi quỹ từ 10.000 FC; trúng đặc biệt thì quỹ về mức đầu', () => {
  const low = tickJackpot({ ...newJackpot(0), pot: 100 }, 50 * JACKPOT_TICK_MS, () => 0.2);
  assert.equal(low.feed.length, 0);
  const high = tickJackpot({ ...newJackpot(0), pot: JACKPOT_MIN + 5_000 }, JACKPOT_TICK_MS, seq(.5, .5, .0001, .3, .3, .3, .3, .3));
  assert.equal(high.feed[0].kind, 'special');
  assert.ok(high.feed[0].amount >= JACKPOT_MIN + 5_000);
  assert.equal(high.pot, JACKPOT_RESET);
  assert.match(botName(seq(.1, .2, .3, .4, .5, .6)), /^[A-Za-z]+\d*$/);
  // Quỹ càng lớn bot càng dễ nổ; chạm JACKPOT_MAX thì chắc chắn có bot trúng Giải Đặc Biệt.
  assert.ok(botSpecialOdds(20_000) > botSpecialOdds(12_000) && botSpecialOdds(12_000) > botSpecialOdds(10_000));
  assert.equal(botSpecialOdds(JACKPOT_MAX), 1);
  const capped = tickJackpot({ ...newJackpot(0), pot: JACKPOT_MAX + 1_000 }, JACKPOT_TICK_MS, () => .99);
  assert.equal(capped.feed[0].kind, 'special');
  assert.equal(capped.pot, JACKPOT_RESET);
});

test('FC trả để chơi cộng hết vào quỹ; đủ 10.000 FC mới có thể trúng; tiền thưởng cộng vào FC và lịch sử', () => {
  const below = rollJackpot({ ...newJackpot(0), pot: 100 }, 10, 190, () => 0);
  assert.equal(below.jackpot.pot, 100 + 190);
  assert.equal(rollJackpot({ ...newJackpot(0), pot: 100 }, 100, 1800, () => .9).jackpot.pot, 100 + 1800);
  assert.equal(rollJackpot({ ...newJackpot(0), pot: 100 }, 1, 0, () => .9).jackpot.pot, 100);
  assert.equal(below.wins.length, 0);
  const special = rollJackpot({ ...newJackpot(0), pot: 20_000 }, 1, 20, () => 0, 5);
  assert.deepEqual(special.wins.map(w => [w.kind, w.amount, w.mine]), [['special', 20_000 + 20, true]]);
  assert.equal(special.jackpot.pot, JACKPOT_RESET);
  // Quỹ 20.000 FC: tỷ lệ đặc biệt ~0,45%, mini thêm 0,4% → rng .006 rơi vào mini.
  const small = rollJackpot({ ...newJackpot(0), pot: 20_000 }, 1, 20, () => .006);
  assert.equal(small.wins[0].kind, 'mini');
  assert.equal(small.wins[0].amount, Math.floor((20_000 + 20) / 10));
  assert.equal(small.jackpot.pot, 20_000 + 20 - small.wins[0].amount);
  const none = rollJackpot({ ...newJackpot(0), pot: 20_000 }, 3, 60, () => .9);
  assert.equal(none.wins.length, 0);
  const save = { ...initialSave(), fc: 50 }, paid = grantJackpot(save, special.wins);
  assert.equal(paid.fc, 50 + special.wins[0].amount);
  assert.equal(paid.history[0].title, 'Trúng Giải Đặc Biệt');
  assert.ok(validateSave(JSON.parse(JSON.stringify(paid))));
  assert.equal(grantJackpot(save, []), save);
  // Quỹ mới bắt đầu từ cùng mức với sau khi có người trúng Giải Đặc Biệt.
  assert.equal(newJackpot(0).pot, JACKPOT_RESET);
});

test('Nhiều bot cùng săn: quỹ vừa qua 10.000 FC thì Giải Đặc Biệt bị bot ăn rất nhanh (trung bình dưới 30 giây)', () => {
  assert.ok(BOT_HUNTERS >= 30);
  // rng cố định (LCG) để kết quả lặp lại được.
  let seed = 12345;
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const waits: number[] = [];
  for (let run = 0; run < 200; run++) {
    let jackpot = { ...newJackpot(0), pot: JACKPOT_MIN };
    let ticks = 0;
    while (!jackpot.feed.some(w => w.kind === 'special') && ticks < 1_000) { ticks++; jackpot = tickJackpot(jackpot, ticks * JACKPOT_TICK_MS, rng); }
    waits.push(ticks * JACKPOT_TICK_MS / 1000);
  }
  const average = waits.reduce((a, b) => a + b, 0) / waits.length;
  assert.ok(average < 30, `trung bình ${average.toFixed(1)} giây`);
  assert.ok([...waits].sort((a, b) => a - b)[Math.floor(waits.length * .95)] < 90, '95% số đợt mất giải trong 1,5 phút');
});