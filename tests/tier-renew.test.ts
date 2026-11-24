import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIER_RENEW } from '../src/profile.ts';

// Premium / Luxury tự gia hạn khi nạp đủ trong kỳ (202611240005_fco_tier_auto_renew.sql); chạy thật ở supabase/tests/fco-tier-renew.pglite.mjs.
const sql = readFileSync('supabase/migrations/202611240005_fco_tier_auto_renew.sql', 'utf8');

test('Mốc tự gia hạn khớp máy chủ: Premium 10.000 FC / 7 ngày, Luxury 50.000 FC / 30 ngày', () => {
  assert.deepEqual(TIER_RENEW, { premium: { fc: 10_000, days: 7 }, luxury: { fc: 50_000, days: 30 } });
  assert.ok(sql.includes(`'{"premium": {"fc": ${TIER_RENEW.premium.fc}, "days": ${TIER_RENEW.premium.days}}, "luxury": {"fc": ${TIER_RENEW.luxury.fc}, "days": ${TIER_RENEW.luxury.days}}}'::jsonb`));
  // Kỳ gia hạn bằng đúng kỳ admin đặt tay.
  const lux = readFileSync('supabase/migrations/202611120011_fco_luxury.sql', 'utf8');
  assert.match(lux, /interval '30 days' else interval '7 days'/);
});

test('Tự gia hạn: chỉ tính FC nạp thật (reason admin) trong kỳ vừa qua, chốt ở ví / thuế bán / admin, cộng liền mạch từng kỳ', () => {
  assert.match(sql, /l\.reason = 'admin' and l\.created_at >= until_ - period and l\.created_at < until_/);
  assert.match(sql, /until_ := until_ \+ period/);
  assert.match(sql, /perform public\.fco_tier_auto_renew\(uid\);\s*-- 202611140009/);
  assert.match(sql, /create or replace function public\.fco_inv_tax[\s\S]*?perform public\.fco_tier_auto_renew\(p_uid\);/);
  assert.match(sql, /create or replace function public\.fco_admin_account_tier[\s\S]*?perform public\.fco_tier_auto_renew\(p_user\);/);
  assert.match(sql, /revoke all on function public\.fco_tier_renew_rules\(\), public\.fco_tier_auto_renew\(uuid\) from public, anon, authenticated;/);
});