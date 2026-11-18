import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BP_PER_VND, BP_TOPUP_MAX_VND, BP_TOPUP_MIN_VND } from '../src/wallet.ts';

// Admin nạp BP theo VND (202611180013_fco_admin_topup_bp.sql): 1.000đ = 10B BP; tỉ giá / giới hạn game và máy chủ phải khớp.
const sql = readFileSync('supabase/migrations/202611180013_fco_admin_topup_bp.sql', 'utf8');
test('Nạp BP: 1.000đ = 10B BP, giới hạn mỗi lần khớp máy chủ, chỉ admin, chống cộng hai lần', () => {
  assert.equal(1000 * BP_PER_VND, 10_000_000_000);
  assert.match(sql, new RegExp(`select ${BP_PER_VND}::bigint`));
  assert.match(sql, new RegExp(`p_vnd < ${BP_TOPUP_MIN_VND} or p_vnd > ${BP_TOPUP_MAX_VND}`));
  assert.ok(BP_TOPUP_MAX_VND * BP_PER_VND <= 9e14, 'không vượt giới hạn BP một lần của kho');
  const fn = sql.slice(sql.indexOf('function public.fco_admin_topup_bp('), sql.indexOf('function public.fco_admin_bp_topups('));
  assert.match(fn, /admin_id uuid := public\.fco_require_admin\(\)/);
  assert.match(fn, /select \* into prev from public\.fco_bp_topups where request = p_request;\s+if found then/);
  assert.match(fn, /insert into public\.fco_admin_gifts/, 'chưa có kho thì vào Quà từ Admin');
  assert.doesNotMatch(fn, /fco_apply_fc|fco_fc_ledger/, 'không đụng ví FC / Top Đặc Huấn');
  assert.match(sql, /revoke all on public\.fco_bp_topups from anon, authenticated;/);
});