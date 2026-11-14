import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteView, restoreViews, takeViews } from '../src/player-views.ts';

test('Lượt xem thẻ gom trên máy: tối đa 3 lần / cầu thủ, 20 cầu thủ, lấy xong thì xoá, gửi lỗi thì trả lại', () => {
  assert.equal(takeViews(), null);
  for (let i = 0; i < 5; i++) noteView(4085);
  noteView(1060); noteView(-1); noteView(1.5);
  const v = takeViews();
  assert.deepEqual(v, { '4085': 3, '1060': 1 });
  assert.equal(takeViews(), null);
  restoreViews(v);
  assert.deepEqual(takeViews(), { '4085': 3, '1060': 1 });
  for (let i = 1; i <= 25; i++) noteView(i);
  assert.equal(Object.keys(takeViews()!).length, 20);
});

test('Máy chủ nhận lượt xem kèm heartbeat với cùng giới hạn; Tâm điểm ô 3 là thẻ xem nhiều nhất 7 ngày', () => {
  const sql = readFileSync('supabase/migrations/202611140004_fco_player_views.sql', 'utf8');
  assert.match(sql, /least\(greatest\(\(p_views->>k\)::integer, 0\), 3\)/);
  assert.match(sql, /limit 20/);
  assert.match(sql, /day > public\.fco_today\(\) - 7/);
  const market = readFileSync('src/TransferMarket.tsx', 'utf8');
  assert.match(market, /'Được xem nhiều nhất'/);
  assert.doesNotMatch(market, /Ngôi sao Việt Nam/);
  assert.match(market, /EMPTY_TTL = 30_000/, 'chưa có dữ liệu chỉ nhớ 30 giây');
});
