import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCard, players, validateSave } from '../src/game.ts';
import { LUXURY_TAX_DISCOUNT, MARKET_FEE_PERCENT, PREMIUM_TAX_DISCOUNT, marketQuote, saleTaxPercent, sellCards, sellRange, taxFor, voucherHelps } from '../src/market.ts';
import { applyWallet } from '../src/wallet-state.ts';
import { initialSave } from './stocked-save.ts';

const NOW = Date.now(), DAY = 86_400_000;
const premium = { premiumUntil: NOW + DAY };

test('Premium giảm 65% thuế bán (40% → 14%), không cộng dồn gói thành viên; hết hạn thì về thuế thường', () => {
  assert.equal(PREMIUM_TAX_DISCOUNT, 65);
  assert.equal(saleTaxPercent({ ...premium }, NOW), 14);
  // Có cả gói SVIP / Premium Shop vẫn chỉ 14%.
  assert.equal(saleTaxPercent({ ...premium, membership: { svip: NOW + DAY, premium: NOW + DAY } }, NOW), 14);
  assert.equal(saleTaxPercent({ premiumUntil: NOW - 1, membership: { premium: NOW + DAY } }, NOW), 20);
  assert.equal(saleTaxPercent({ premiumUntil: null }, NOW), MARKET_FEE_PERCENT);
  // Máy chủ tính cùng mức (migration 202611110013).
  const sql = readFileSync('supabase/migrations/202611110013_fco_premium_tax.sql', 'utf8');
  assert.match(sql, /\* \(100 - 65\) \/ 100/);
  assert.match(sql, /interval '7 days'/);
});

test('Phiếu giảm thuế với Premium: không cộng dồn; phiếu giảm theo % của thuế nên không phiếu nào thấp hơn 14%', () => {
  assert.equal(taxFor(premium, 30, NOW), 14);
  assert.equal(voucherHelps(premium, 30, NOW), false);
  assert.equal(voucherHelps(premium, 20, NOW), false);
  assert.equal(voucherHelps(premium, 10, NOW), false);
  // Tài khoản thường: thuế × (100 − phiếu)%.
  assert.equal(taxFor({}, 20, NOW), 32);
  const priced = players.filter(p => marketQuote({ playerId: p.id, level: 1 }).available).slice(0, 2);
  const cards = priced.map(p => makeCard(p.id));
  const state = { ...initialSave(), balance: 0, cards, taxVouchers: { 20: 1, 30: 1 }, premiumUntil: Date.now() + DAY };
  const price = sellRange(cards[0])!.max;
  assert.throws(() => sellCards(state, [{ uid: cards[0].uid, price }], false, 20), /không cộng dồn/);
  const sold = sellCards(state, [{ uid: cards[0].uid, price }]);
  assert.equal(sold.fees, Math.floor(price * 14 / 100));
  assert.throws(() => sellCards(state, [{ uid: cards[1].uid, price: sellRange(cards[1])!.max }], false, 30), /không cộng dồn/);
});

test('Ví máy chủ đặt hạn Premium vào bản lưu; về Classic thì xoá hạn', () => {
  const base = { fc: 0, dailyClaimed: false, event: { points: 0, free: 0, paid: 0, missions: [] }, admin: false };
  const p = applyWallet(initialSave(), { ...base, tier: 'premium', tierUntil: NOW + 7 * DAY });
  assert.equal(p.premiumUntil, NOW + 7 * DAY);
  assert.equal(applyWallet(p, { ...base, tier: 'classic', tierUntil: null }).premiumUntil, null);
  assert.equal(applyWallet(p, base).premiumUntil, NOW + 7 * DAY, 'máy chủ cũ không gửi tier thì giữ nguyên');
  const dirty = JSON.parse(JSON.stringify({ ...initialSave(), premiumUntil: 'x' }));
  assert.ok(validateSave(dirty)); assert.equal(dirty.premiumUntil, undefined);
});

test('Luxury giảm 75% thuế bán (40% → 10%), hạn 30 ngày; không cộng dồn; ví máy chủ đặt hạn Luxury', () => {
  assert.equal(LUXURY_TAX_DISCOUNT, 75);
  const lux = { luxuryUntil: NOW + DAY };
  assert.equal(saleTaxPercent(lux, NOW), 10);
  assert.equal(saleTaxPercent({ ...lux, membership: { svip: NOW + DAY } }, NOW), 10);
  assert.equal(saleTaxPercent({ luxuryUntil: NOW - 1 }, NOW), MARKET_FEE_PERCENT);
  assert.equal(voucherHelps(lux, 30, NOW), false, 'phiếu 30% cho 10% bằng Luxury → không dùng');
  const sql = readFileSync('supabase/migrations/202611120011_fco_luxury.sql', 'utf8');
  assert.match(sql, /\* \(100 - 75\) \/ 100/);
  assert.match(sql, /interval '30 days'/);
  const base = { fc: 0, dailyClaimed: false, event: { points: 0, free: 0, paid: 0, missions: [] }, admin: false };
  const s = applyWallet(initialSave(), { ...base, tier: 'luxury', tierUntil: NOW + 30 * DAY });
  assert.deepEqual([s.luxuryUntil, s.premiumUntil], [NOW + 30 * DAY, null]);
  const back = applyWallet(s, { ...base, tier: 'classic', tierUntil: null });
  assert.deepEqual([back.luxuryUntil, back.premiumUntil], [null, null]);
});

test('Phiếu giảm thuế không cộng dồn với gói thành viên SVIP Class / Premium (202611270002): lấy mức thấp hơn', () => {
  const svip = { membership: { svip: NOW + DAY } }, prem = { membership: { premium: NOW + DAY } };
  assert.equal(saleTaxPercent(svip, NOW), 28);
  assert.equal(taxFor(svip, 40, NOW), 24, 'SVIP 28% + phiếu 40% → 24%, không phải 16,8%');
  assert.equal(taxFor(svip, 35, NOW), 26);
  assert.equal(voucherHelps(svip, 30, NOW), false, 'phiếu 30% (28%) không thấp hơn SVIP 28%');
  assert.equal(voucherHelps(svip, 10, NOW), false);
  for (const v of [10, 20, 30, 35, 40] as const) assert.equal(voucherHelps(prem, v, NOW), false, `gói Premium 20%: phiếu ${v}% không giảm thêm`);
  assert.equal(taxFor({}, 40, NOW), 24, 'không gói: phiếu vẫn giảm đủ');
  const sql = readFileSync('supabase/migrations/202611270002_fco_voucher_no_stack_membership.sql', 'utf8');
  assert.match(sql, /fco_account_tier\(uid\) is not null/);
});