import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, initialSave, validateSave } from '../src/game.ts';
import { recordEventPlay, playEvent, eventState } from '../src/event.ts';
import { applyWallet, walletMessage } from '../src/wallet-state.ts';

const wallet = (over = {}) => ({ fc: 1234, dailyClaimed: true, event: { points: 60, free: 2, paid: 10, missions: ['daily'] }, admin: false, ...over });

test('Ví máy chủ ghi đè FC, quà ngày và tiến trình sự kiện trong bản lưu (sửa bản lưu không tạo ra FC)', () => {
  const today = dayKey();
  const cheated = { ...initialSave(), fc: 999_999_999, event: { points: 5, plays: 3, claimed: [1], free: 99, day: today, missions: [], paid: 0, log: [], gifts: [] } };
  const next = applyWallet(cheated, wallet(), today);
  assert.equal(next.fc, 1234);
  assert.equal(next.daily, today);
  assert.deepEqual([next.event!.points, next.event!.free, next.event!.paid, next.event!.missions], [60, 2, 10, ['daily']]);
  assert.deepEqual(next.event!.claimed, [1], 'mốc đã nhận giữ nguyên');
  assert.ok(validateSave(JSON.parse(JSON.stringify(next))));
  // Máy chủ nói chưa nhận quà hôm nay (vd. ví mới) thì bỏ dấu đã nhận trên máy.
  assert.equal(applyWallet({ ...cheated, daily: today }, wallet({ dailyClaimed: false }), today).daily, '');
});

test('Ghi kết quả hũ do máy chủ quay: cộng điểm, nhật ký, BP / gói; không cộng FC hũ lần hai', () => {
  const save = { ...initialSave(), fc: 100 };
  // Cấp 1: hũ 0 = 18M BP (1 điểm), hũ 6 = 100 FC (15 điểm).
  const result = recordEventPlay(save, [{ level: 0, jar: 0 }, { level: 0, jar: 6 }], 'fc', 40, false, true);
  assert.equal(result.state.fc, 100);
  assert.equal(result.state.balance, save.balance + 18_000_000);
  assert.equal(eventState(result.state).points, 16);
  assert.equal(result.points, 16);
  assert.equal(eventState(result.state).log.length, 2);
  assert.match(result.state.history[0].detail, /−40 FC/);
  assert.throws(() => recordEventPlay(save, [{ level: 9, jar: 0 }], 'fc', 20), /không hợp lệ/);
  // Chơi trên máy (bản cũ) vẫn trừ FC và cộng FC hũ.
  const local = playEvent({ ...save, fc: 1000 }, 1, () => .999, false, 'fc');
  assert.equal(local.state.fc, 1000 - 20 + (local.hits[0].jar === 6 ? 100 : 0));
});

test('Thông báo lỗi máy chủ bằng tiếng Việt', () => {
  assert.equal(walletMessage(new Error('FCO_NOT_ENOUGH_FC')), 'Không đủ FC.');
  assert.equal(walletMessage({ message: 'FCO_GIFT_USED' }), 'Bạn đã dùng gift code này rồi.');
  assert.match(walletMessage(new Error('TypeError: Failed to fetch')), /kết nối/);
  assert.match(walletMessage({ message: 'Could not find the function public.fco_bilac_config without parameters', code: 'PGRST202' }), /migration/);
});

test('Tên HLV hiện đầy đủ với tài khoản tên đăng nhập, email thật vẫn che (202611090008)', async () => {
  const { readFileSync } = await import('node:fs');
  const { registrationIdentity } = await import('../src/account-identity.ts');
  const sql = readFileSync('supabase/migrations/202611090008_fco_public_full_name.sql', 'utf8');
  const domain = registrationIdentity('hlv_test').email.split('@')[1];
  assert.match(sql, new RegExp(`lower\\(split_part\\(e, '@', 2\\)\\) = '${domain.replace(/\./g, '\\.')}' then n`));
  assert.match(sql, /left\(n, 3\) \|\| '\*\*\*'/, 'email thật vẫn che');
  assert.match(sql, /create or replace function public\.fco_public_name\(p_uid uuid\)/);
  assert.match(sql, /update public\.fco_jackpot set feed = /, 'sửa tên đã lưu trong bảng tin trúng giải');
});
test('FC tặng không tính vào Đã nạp: nạp / tặng tách lý do, sổ cái đổi được loại (202611090010)', async () => {
  const { readFileSync } = await import('node:fs');
  const { canMarkGift, LEDGER_REASONS } = await import('../src/wallet-state.ts');
  const sql = readFileSync('supabase/migrations/202611090010_fco_admin_fc_gift.sql', 'utf8');
  assert.match(sql, /create function public\.fco_admin_credit\(p_login text, p_amount bigint, p_note text default '', p_gift boolean default false\)/);
  assert.match(sql, /public\.fco_admin_send_gift\(target, p_amount, null, null, p_note\)/, 'tặng đi đường admin_gift');
  assert.match(sql, /create function public\.fco_admin_ledger_mark_gift\(p_id bigint, p_gift boolean\)/);
  assert.match(sql, /r\.delta <= 0 or r\.actor is null or r\.reason not in \('admin', 'admin_gift'\)/);
  const row = { id: 1, time: 0, login: 'a', delta: 1000, balance: 1000, reason: 'admin', note: null, admin: true };
  assert.equal(canMarkGift(row), true);
  assert.equal(canMarkGift({ ...row, reason: 'admin_gift' }), true);
  assert.equal(canMarkGift({ ...row, delta: -1000 }), false, 'không đổi lần trừ');
  assert.equal(canMarkGift({ ...row, reason: 'daily', admin: false }), false);
  assert.equal(canMarkGift({ ...row, id: undefined }), false, 'chưa chạy migration thì chưa có id');
  assert.equal(LEDGER_REASONS.admin, 'Admin nạp');
});