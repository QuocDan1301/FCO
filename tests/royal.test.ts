import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MARKET_FEE_PERCENT, ROYAL_TAX_DISCOUNT, ROYAL_TOPUP_FC, SYSTEM_SALE_FEE_PERCENT, saleTaxPercent, voucherHelps } from '../src/market.ts';
import { applyWallet } from '../src/wallet-state.ts';
import { accountTierOf, paidTier } from '../src/profile.ts';
import { NAME_EFFECTS, avatarEffectClass, isRoyalEffect } from '../src/name-effects.ts';
import { CURSOR_COLORS } from '../src/fx-cursor.ts';
import ProfileCard, { EffectPicker } from '../src/ProfileCard.tsx';
import { initialSave } from './stocked-save.ts';

// Hạng Royal (202611240003_fco_royal.sql): tự lên khi tổng FC nạp ≥ 100.000, vĩnh viễn, giảm 85% thuế bán, 6 hiệu ứng độc quyền.
const sql = readFileSync('supabase/migrations/202611240003_fco_royal.sql', 'utf8');
const NOW = Date.now();

test('Royal: mốc nạp và mức giảm thuế khớp máy chủ; thuế 40% → 6%, bán hệ thống 50% → 7,5%; phiếu không cộng dồn', () => {
  assert.equal(ROYAL_TOPUP_FC, 100_000);
  assert.match(sql, /select 100000::bigint/);
  assert.equal(ROYAL_TAX_DISCOUNT, 85);
  assert.match(sql, /when 'royal' then \(p_rules->>'marketFee'\)::double precision \* \(100 - 85\) \/ 100/);
  const royal = { royal: true };
  assert.equal(saleTaxPercent(royal, NOW), MARKET_FEE_PERCENT * .15);
  assert.equal(saleTaxPercent(royal, NOW, SYSTEM_SALE_FEE_PERCENT), 7.5);
  // Royal đứng trên Luxury còn hạn.
  assert.equal(saleTaxPercent({ royal: true, luxuryUntil: NOW + 1e6 }, NOW), 6);
  for (const v of [10, 20, 30] as const) assert.equal(voucherHelps(royal, v, NOW), false, `phiếu ${v}% không giảm thêm cho Royal`);
  assert.match(sql, /fco_account_tier\(uid\) in \(''premium'', ''luxury'', ''royal''\)/, 'các hàm bán nhận Royal như Premium / Luxury (không cộng dồn phiếu)');
});

test('Royal: ví máy chủ trả tier royal → bản lưu bật royal, bỏ hạn Premium / Luxury; hạng trả phí', () => {
  const base = { fc: 0, dailyClaimed: false, event: { points: 0, free: 0, paid: 0, missions: [] }, admin: false };
  const s = applyWallet(initialSave(), { ...base, tier: 'royal', tierUntil: null });
  assert.deepEqual([s.royal, s.premiumUntil, s.luxuryUntil], [true, null, null]);
  assert.equal(applyWallet(s, { ...base, tier: 'classic', tierUntil: null }).royal, false);
  assert.equal(accountTierOf('royal'), 'royal');
  assert.ok(paidTier('royal'));
});

test('Royal: 6 hiệu ứng độc quyền khớp máy chủ, có màu con trỏ và lớp fx-rx', () => {
  const ids = NAME_EFFECTS.filter(e => e.royal).map(e => e.id);
  assert.equal(ids.length, 6);
  assert.ok(sql.includes(`select p_effect in (${ids.map(i => `'${i}'`).join(', ')})`), 'danh sách hiệu ứng Royal');
  for (const e of NAME_EFFECTS) assert.ok(sql.includes(`'${e.id}'`), `ràng buộc name_effect thiếu ${e.id}`);
  for (const id of ids) { assert.ok(CURSOR_COLORS[id]); assert.ok(isRoyalEffect(id)); assert.match(avatarEffectClass(id), /fx-lux fx-rx/); }
  const css = readFileSync('src/name-effects.css', 'utf8');
  for (const id of ids) assert.match(css, new RegExp(`\\.fx-${id}\\{--fx-a`), `thiếu màu CSS ${id}`);
});

test('Royal: lưới hiệu ứng mở nhóm Royal cho Royal, khoá với Luxury; Thông tin HLV ghi vĩnh viễn + giảm 85%', () => {
  const picker = (luxury: boolean, royal: boolean) => renderToStaticMarkup(createElement(EffectPicker, { premium: true, luxury, royal, shown: null, initials: 'AB', busy: false, onPick() {} }));
  const lockedRoyal = (html: string) => (html.match(/class="profile-effect is-royal"[^>]*disabled/g) ?? []).length;
  assert.equal(lockedRoyal(picker(true, false)), 6, 'Luxury: nhóm Royal bị khoá');
  assert.equal(lockedRoyal(picker(false, true)), 0, 'Royal: mở hết');
  assert.equal((picker(false, true).match(/disabled=""/g) ?? []).length, 0, 'Royal dùng được mọi hiệu ứng');
  const card = renderToStaticMarkup(createElement(ProfileCard, { save: initialSave(), accountId: 'abc', joined: null, tier: 'royal', effect: 'emperor', onEffect: () => true, onSave() {}, onSettings() {}, onClose() {} }));
  assert.match(card, /profile-tier is-royal/);
  assert.match(card, /profile-avatar is-royal fx-avatar fx-emperor fx-lux fx-rx/);
  assert.match(card, /vĩnh viễn · giảm 85% thuế bán/);
  const lux = renderToStaticMarkup(createElement(ProfileCard, { save: initialSave(), accountId: 'abc', joined: null, tier: 'luxury', effect: 'emperor', onEffect: () => true, onSave() {}, onSettings() {}, onClose() {} }));
  assert.doesNotMatch(lux, /fx-emperor/, 'Luxury để hiệu ứng Royal thì không hiện');
});