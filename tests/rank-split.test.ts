import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// BXH GLXH / Penalty / Đập 8 chia 2 đợt mỗi tuần (202611240004_fco_rank_split_rounds.sql); chạy thật ở supabase/tests/fco-rank-split.pglite.mjs.
test('BXH 2 đợt mỗi tuần: mốc 23:59 Thứ 4 / Chủ nhật xen kẽ, tick dời mốc theo lịch mới, đầu vòng Đập 8 = mốc trước', () => {
  const sql = readFileSync('supabase/migrations/202611240004_fco_rank_split_rounds.sql', 'utf8');
  assert.match(sql, /extract\(isodow from d \+ k\) in \(3, 7\)/);
  assert.match(sql, /time '23:59'\) at time zone 'Asia\/Ho_Chi_Minh'/);
  assert.match(sql, /r\.ends_at := public\.fco_rank_next_end\(r\.ends_at\);/);
  assert.doesNotMatch(sql, /r\.ends_at \+ r\.period/);
  assert.match(sql, /public\.fco_rank_round_start\(ends_at\)/);
  // Giữ nguyên quà của từng bảng khi chốt đợt.
  assert.match(sql, /fco_rank_prize\(r\.round, 'ranked'/);
  assert.match(sql, /fco_rank_prize\(r\.round, 'penalty'/);
  assert.match(sql, /fco_rank_prize_pack\(r\.round, 'plus8'/);
  assert.match(readFileSync('src/RanksPage.tsx', 'utf8'), /Thứ 2 – Thứ 4 \(3 ngày\) và Thứ 5 – Chủ nhật \(4 ngày\)/);
});