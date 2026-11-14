import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Vá bảo mật 202611140009: sự kiện ẩn không gọi được, BXH giá trị đội hình máy chủ tự tính, lượt xem chống gọi dồn, ví không nhận điểm tự khai.
test('Vá bảo mật (202611140009): khoá API sự kiện ẩn, máy chủ tự tính giá trị đội hình, chống thổi phồng lượt xem', () => {
  const sql = readFileSync('supabase/migrations/202611140009_fco_security_fixes.sql', 'utf8');
  for (const fn of ['fco_bilac_play(integer, text)', 'fco_event_play(integer, text)', 'fco_event_mission(text)', 'fco_player_views_cleanup()'])
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), fn);
  assert.match(sql, /v := public\.fco_squad_value\(uid\);/);
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.fco_rank_squad')), /values \(uid, p_value/);
  assert.match(sql, /now\(\) - prev >= interval '20 seconds'/);
  assert.match(sql, /perform public\.fco_wallet_lock\(uid, 0\);/);
  // Game không gọi các API đã khoá khi sự kiện đang ẩn.
  const config = readFileSync('src/config.ts', 'utf8');
  assert.match(config, /EVENT_NCSS_ENABLED = false/);
  assert.match(config, /EVENT_BILAC_ENABLED = false/);
});