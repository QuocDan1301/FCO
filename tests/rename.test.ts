import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renameProblem } from '../src/RenameCoach.tsx';
import { walletMessage } from '../src/wallet-state.ts';

test('Đổi tên HLV: kiểm tra độ dài, ký tự, trùng tên cũ; thông báo lỗi máy chủ tiếng Việt', () => {
  assert.equal(renameProblem('ab', 'Cũ'), 'Tên HLV cần từ 3 đến 24 ký tự.');
  assert.equal(renameProblem('x'.repeat(25), 'Cũ'), 'Tên HLV cần từ 3 đến 24 ký tự.');
  assert.match(renameProblem('Tên<script>', 'Cũ')!, /chỉ dùng chữ/);
  assert.equal(renameProblem('  Quốc   Dân  ', 'Quốc Dân'), 'Tên mới giống tên hiện tại.');
  assert.equal(renameProblem('Nguyễn Văn A_99', 'Cũ'), null);
  assert.equal(renameProblem('FC Sấm-Sét.2', 'Cũ'), null);
  for (const code of ['FCO_NAME_TAKEN', 'FCO_NAME_COOLDOWN', 'FCO_NAME_LENGTH', 'FCO_NAME_CHARS', 'FCO_NAME_RESERVED', 'FCO_NAME_SAME'])
    assert.doesNotMatch(walletMessage(new Error(code)), /Máy chủ FC đang lỗi/, code);
});

test('Migration đổi tên: phí lần đầu 0 / sau 100 FC, 7 ngày, không trùng, tên công khai lấy từ bảng máy chủ', () => {
  const sql = readFileSync('supabase/migrations/202611160004_fco_rename.sql', 'utf8');
  assert.match(sql, /cost := case when r\.changes = 0 then 0 else 100 end/);
  assert.match(sql, /now\(\) < r\.changed_at \+ interval '7 days'/);
  assert.match(sql, /d\.name_key = k and d\.user_id <> uid/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /coalesce\(\(select d\.name from public\.fco_display_names d where d\.user_id = p_uid\)/);
  assert.match(sql, /grant execute on function public\.fco_rename_info\(\), public\.fco_rename\(text\) to authenticated/);
});
test('Đăng ký: chặn tên trùng / không hợp lệ ở form và ở máy chủ (trigger trước khi tạo tài khoản)', () => {
  const sql = readFileSync('supabase/migrations/202611160005_fco_signup_unique_name.sql', 'utf8');
  assert.match(sql, /create trigger fco_signup_name_guard before insert on auth\.users/);
  assert.match(sql, /raise exception 'FCO_NAME_TAKEN'/);
  assert.match(sql, /grant execute on function public\.fco_name_available\(text, text\) to anon, authenticated/);
  assert.match(sql, /lower\(coalesce\(u\.email, ''\)\) <> mail/, 'đăng ký lại Gmail chưa xác nhận không bị coi là trùng với chính mình');
  const app = readFileSync('src/AccountApp.tsx', 'utf8');
  assert.match(app, /rpc\('fco_name_available'/);
  assert.match(app, /database error saving new user/);
  assert.match(app, /display_name: coach/);
  assert.match(app, /minLength=\{3\} maxLength=\{24\}/);
});