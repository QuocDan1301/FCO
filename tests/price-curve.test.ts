import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fcoLevelPrices, parseFcoPrice, resolveAnchors, roundFCOPrice } from '../src/price-curve.ts';
import type { AnchorTable } from '../src/price-curve.ts';
import { players } from '../src/game.ts';

test('roundFCOPrice làm tròn 3 chữ số có nghĩa; parseFcoPrice đọc giá M / B', () => {
  assert.equal(roundFCOPrice(58_159_231), 58_200_000);
  assert.equal(roundFCOPrice(944), 944);
  assert.equal(roundFCOPrice(1_234_567_890_123), 1_230_000_000_000);
  assert.equal(roundFCOPrice(0), 0);
  assert.equal(parseFcoPrice('55.5M'), 55_500_000);
  assert.equal(parseFcoPrice('1,130B'), 1_130_000_000_000);
  assert.equal(parseFcoPrice('824,000'), 824_000);
});

test('fcoLevelPrices: giữ mốc, nội suy / ngoại suy đúng công thức, không giảm, thiếu mốc không lỗi', () => {
  const p1 = 4_610_000, p5 = 251_000_000, p8 = 60_700_000_000, p11 = 198_000_000_000;
  const r = fcoLevelPrices({ p1, p5, p8, p11 });
  assert.equal(r.length, 13);
  assert.deepEqual([r[0], r[4], r[7], r[10]], [p1, p5, p8, p11]);
  assert.equal(r[1], roundFCOPrice(p1 * Math.pow(p5 / p1, 0.15)));
  assert.equal(r[5], roundFCOPrice(p5 * Math.pow(p8 / p5, 0.28)));
  assert.equal(r[9], roundFCOPrice(p8 * Math.pow(p11 / p8, 0.63)));
  assert.equal(r[12], roundFCOPrice(p11 * Math.pow(p11 / p8, 0.80)));
  for (let i = 1; i < 13; i++) assert.ok(r[i]! >= r[i - 1]!, `+${i + 1} không thấp hơn +${i}`);
  const gap = fcoLevelPrices({ p1: 1000, p5: null, p8: 0, p11: null });
  assert.equal(gap.length, 13);
  assert.ok(gap.every(v => v === null || (Number.isFinite(v) && v >= 1000)));
});

for (const [tier, label, file, count] of [['stellar', '26TS', 'scripts/ts26-anchors.json', 158], ['eternal', 'ITM', 'scripts/itm-anchors.json', 133], ['hw23', '23HW', 'scripts/hw23-anchors.json', 178]] as const) {
  test(`Giá ${label} trong player-prices.json khớp ảnh TTCN (+5/+8/+11) và công thức cho các cấp còn lại`, () => {
    const anchors: AnchorTable = JSON.parse(readFileSync(file, 'utf8')).prices;
    const prices: Record<string, (number | null)[]> = JSON.parse(readFileSync('src/player-prices.json', 'utf8')).players;
    const pool = new Map(players.filter(p => p.tier === tier).map(p => [p.name, p]));
    assert.equal(Object.keys(anchors).length, count);
    for (const [name, a] of Object.entries(anchors)) {
      const p = pool.get(name); assert.ok(p, `${name} phải là thẻ ${label}`);
      const row = prices[p.id];
      // Mốc theo ảnh, trừ khi quy tắc không giảm nâng lên bằng cấp trước (vd. +1 cũ cao hơn +5 TTCN).`n      a.forEach((v, k) => { const i = [4, 7, 10][k]; if (v !== null) assert.equal(row[i], Math.max(parseFcoPrice(v), row[i - 1] ?? 0), `${name} +${[5, 8, 11][k]}`); });
      assert.deepEqual(row, fcoLevelPrices(resolveAnchors(row, a, anchors)), `${name} +1…+13`);
    }
  });
}
