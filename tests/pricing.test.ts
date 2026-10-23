import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, insuranceRate } from '../src/pricing';

test('Giá 0 hợp lệ cho mọi nhóm/cấp; ô trống và giá âm được xử lý riêng', () => {
  for (const group of [1, 2, 3] as const) for (let level = 1; level <= 13; level++) {
    assert.equal(calculatePrice(0, level, { group }).price, 0);
    assert.equal(calculatePrice(0, level, { group }).theoreticalPrice, 0);
    assert.equal(calculatePrice(null, level, { group }).price, null);
  }
  for (const value of [-1, -100, 0.5, NaN, Infinity]) assert.throws(() => calculatePrice(value, 1));
});

test('Chuỗi chuẩn và phần trăm +2 tùy chọn, không làm tròn giữa các cấp', () => {
  const ratios = [1, 1.637, 1.75, 2.1, 2.3, 2.6, 3.2, 4.2, 2.4, 2.5, 2.8, 3.2, 3.8];
  let expected = 1000000000;
  for (let level = 1; level <= 13; level++) {
    expected *= ratios[level - 1];
    assert.equal(calculatePrice(1000000000, level).price, Math.round(expected));
  }
  assert.equal(calculatePrice(1000, 2, { plus2IncreasePercent: 50 }).price, 1500);
  assert.equal(calculatePrice(null, 13).price, null);
});
test('Meta: biên nhiệt tại +5, +8 và giữ biên ở cấp sau, không cộng dồn hai lần', () => {
  for (const level of [5, 6, 7, 8, 9, 13]) {
    assert.equal(calculatePrice(1e9, level, { group: 1 }).price, Math.round(calculatePrice(1e9, level).theoreticalPrice! * 1.25));
  }
  assert.equal(calculatePrice(1000, 4, { group: 1 }).price, calculatePrice(1000, 4).price);
});
test('Phôi: giảm giá sớm, +5 = 7.5 lần gốc, +8 giảm 45%, +9 đóng băng', () => {
  assert.equal(calculatePrice(1e9, 5, { group: 3 }).price, 7.5e9);
  assert.equal(calculatePrice(1e9, 3, { group: 3 }).price, Math.round(1e9 * 1.637 * 1.75 * .8));
  assert.equal(calculatePrice(1e9, 8, { group: 3 }).price, Math.round(calculatePrice(1e9, 8).theoreticalPrice! * .55));
  assert.equal(calculatePrice(1e9, 8, { group: 3 }).liquidityNote, null);
  assert.equal(calculatePrice(1e9, 9, { group: 3 }).liquidityNote, 'Đóng băng thanh khoản');
  for (let level = 2; level <= 13; level++) assert.ok(calculatePrice(1e9, level, { group: 3 }).price! > calculatePrice(1e9, level - 1, { group: 3 }).price!);
});
test('Bảo hiểm dùng OVR gốc ở đúng các ranh giới; chặn cấu hình sai và tràn số', () => {
  assert.deepEqual([92, 93, 100, 101].map(insuranceRate), [.95, .8, .8, .6]);
  for (const level of [0, 14, 1.5, NaN]) assert.throws(() => calculatePrice(1000, level));
  assert.throws(() => calculatePrice(1000, 5, { group: 1, metaHeatPercent: 40 }));
  assert.throws(() => calculatePrice(Number.MAX_SAFE_INTEGER, 13));
});
