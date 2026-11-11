import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, validateSave } from '../src/game.ts';
import { accountTierOf, isBirthday, playedDays } from '../src/profile.ts';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfileCard from '../src/ProfileCard.tsx';
import { NAME_EFFECTS } from '../src/name-effects.ts';

test('Thông tin HLV: sinh nhật chỉ ngày/tháng hợp lệ, giới tính trong danh sách; phần sai bị bỏ khi đọc bản lưu', () => {
  assert.ok(isBirthday('29-02')); assert.ok(isBirthday('31-12')); assert.ok(isBirthday('01-01'));
  for (const bad of ['30-02', '31-04', '00-05', '12-13', '1-1', '2000-01-01', 5, null]) assert.ok(!isBirthday(bad), String(bad));
  const ok = { ...initialSave(), profile: { gender: 'female' as const, birthday: '15-08' } };
  assert.ok(validateSave(ok)); assert.deepEqual(ok.profile, { gender: 'female', birthday: '15-08' });
  const bad = { ...initialSave(), profile: { gender: 'robot', birthday: '31-02', extra: 1 } } as unknown;
  assert.ok(validateSave(bad)); assert.deepEqual((bad as { profile: unknown }).profile, {});
  const broken = { ...initialSave(), profile: 'x' } as unknown;
  assert.ok(validateSave(broken)); assert.equal((broken as { profile?: unknown }).profile, undefined);
});

test('Số ngày đã chơi theo lịch giờ Việt Nam, tính cả ngày bắt đầu', () => {
  const at = (iso: string) => Date.parse(iso);
  assert.equal(playedDays(at('2026-11-11T01:00:00Z'), at('2026-11-11T10:00:00Z')), 1);
  // 23:30 ngày 10/11 giờ VN rồi 00:30 ngày 11/11 giờ VN: đã sang ngày thứ 2.
  assert.equal(playedDays(at('2026-11-10T16:30:00Z'), at('2026-11-10T17:30:00Z')), 2);
  assert.equal(playedDays(at('2026-10-30T05:00:00Z'), at('2026-11-11T05:00:00Z')), 13);
  assert.equal(playedDays(at('2026-11-12T05:00:00Z'), at('2026-11-11T05:00:00Z')), 1, 'giờ máy lệch về trước vẫn ít nhất 1 ngày');
});

test('Loại tài khoản do admin đặt: chỉ classic / premium, giá trị lạ hoặc chưa có thì Classic; khớp ràng buộc trên máy chủ', () => {
  assert.equal(accountTierOf('premium'), 'premium');
  for (const other of ['classic', 'svip', undefined, null, 1]) assert.equal(accountTierOf(other), 'classic');
  const sql = readFileSync(new URL('../supabase/migrations/202611110003_fco_account_tier.sql', import.meta.url), 'utf8');
  assert.match(sql, /check \(account_tier in \('classic', 'premium'\)\)/);
});
test('Bảng Thông tin HLV hiện đủ số ngày đã chơi, ngày bắt đầu, loại tài khoản và sinh nhật', () => {
  const now = Date.now(), day = 86_400_000;
  const save = { ...initialSave(), profile: { gender: 'male' as const, birthday: '05-09' } };
  const html = renderToStaticMarkup(createElement(ProfileCard, { save, accountId: 'hlv_test', joined: now - 12 * day, tier: 'premium', onSave() {}, onSettings() {}, onClose() {} }));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Đã chơi (12|13) ngày/);
  assert.match(text, /Bắt đầu chơi \d{2}\/\d{2}\/\d{4}/);
  assert.match(text, /Sinh nhật 05\/09/); assert.match(text, /Giới tính Nam/);
  assert.match(text, /Loại tài khoản Premium/); assert.match(text, /ID hlv_test/);
  // Gói thành viên mua trong Shop không đổi loại tài khoản.
  const shop = renderToStaticMarkup(createElement(ProfileCard, { save: { ...save, membership: { premium: now + day, svip: now + day } }, accountId: 'x', joined: null, tier: 'classic', onSave() {}, onSettings() {}, onClose() {} }));
  assert.match(shop.replace(/<[^>]+>/g, ' '), /Loại tài khoản\s+Classic/);
});
test('Thông tin HLV đã lưu thì không còn ô chọn / nút lưu; còn trống mục nào thì chỉ mục đó chọn được', () => {
  const render = (profile?: { gender?: 'male'; birthday?: string }) => renderToStaticMarkup(createElement(ProfileCard, { save: { ...initialSave(), ...(profile ? { profile } : {}) }, accountId: 'x', joined: null, onSave() {}, onSettings() {}, onClose() {} }));
  const empty = render();
  assert.match(empty, /aria-label="Giới tính"/); assert.match(empty, /aria-label="Ngày sinh"/); assert.match(empty, /Lưu thông tin/);
  const full = render({ gender: 'male', birthday: '05-09' });
  assert.doesNotMatch(full, /<select/); assert.doesNotMatch(full, /Lưu thông tin|Sửa thông tin/);
  assert.match(full, /không thể thay đổi/);
  const half = render({ gender: 'male' });
  assert.doesNotMatch(half, /aria-label="Giới tính"/); assert.match(half, /aria-label="Ngày sinh"/);
});
test('Hiệu ứng avatar + tên: danh sách khớp ràng buộc máy chủ; Classic bị khoá, Premium chọn được và hiện trên avatar / tên', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202611110004_fco_name_effect.sql', import.meta.url), 'utf8');
  const ids = NAME_EFFECTS.map(e => `'${e.id}'`).join(', ');
  assert.ok(sql.includes(`check (name_effect in (${ids}))`), 'ràng buộc check trên bảng');
  assert.ok(sql.includes(`p_effect not in (${ids})`), 'kiểm tra trong fco_set_name_effect');
  const render = (tier: 'classic' | 'premium', effect: 'fire' | null) => renderToStaticMarkup(createElement(ProfileCard, { save: initialSave(), accountId: 'abc', joined: null, tier, effect, onEffect: () => true, onSave() {}, onSettings() {}, onClose() {} }));
  const premium = render('premium', 'fire');
  assert.match(premium, /profile-avatar is-premium fx-avatar fx-fire/);
  assert.match(premium, /<b class="fx-name fx-fire">abc<\/b>/);
  assert.match(premium, /aria-pressed="true"[^>]*><span class="fx-preview fx-avatar fx-fire"/);
  const classic = render('classic', 'fire');
  assert.doesNotMatch(classic, /profile-avatar[^"]*fx-avatar/, 'Classic không hiện hiệu ứng dù còn lựa chọn cũ');
  assert.match(classic, /Dành cho tài khoản Premium/);
  assert.equal((classic.match(/class="profile-effect"[^>]*disabled/g) ?? []).length, NAME_EFFECTS.length + 1);
});