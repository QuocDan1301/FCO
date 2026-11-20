import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatPoints, isAllTime, normalizeTopupRace, raceSpan, topupCountdown } from '../src/topup-race.ts';

const sql = readFileSync('supabase/migrations/202611180005_fco_topup_race.sql', 'utf8');

test('Top Đặc Huấn (202611180005): FC nạp từ 0h 18/11 tới hết VQTG, top 50, bỏ admin / tài khoản khoá, quà trao 1 lần', () => {
  assert.match(sql, /values \(1, '2026-11-18 00:00\+07', 50\)/, 'bắt đầu 0h 18/11 giờ VN, top 50');
  assert.match(sql, /select ends_at from public\.fco_vqtg_race where id = 1/, 'kết thúc cùng sự kiện VQTG');
  assert.match(sql, /where l\.reason = 'admin'/, 'chỉ tính FC nạp (admin cộng sau khi kiểm bill), không tính admin_gift');
  assert.match(sql, /not exists \(select 1 from public\.fco_admins a where a\.user_id = l\.user_id\)/);
  assert.match(sql, /u\.banned_until > now\(\)/);
  assert.match(sql, /order by s\.amount desc, s\.last_at, s\.user_id/, 'bằng FC thì ai đạt trước xếp trên');
  assert.match(sql, /on conflict \(user_id\) do nothing/, 'mỗi người nhận quà 1 lần');
  assert.match(sql, /if now\(\) < public\.fco_topup_race_ends\(\) or not exists \(select 1 from public\.fco_topup_race_rewards\) then return 0/);
  assert.match(sql, /revoke all on function public\.fco_topup_race_ends\(\), public\.fco_topup_race_rows\(\), public\.fco_topup_race_award\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.fco_topup_top\(\) to authenticated/);
});

test('Đếm ngược Top Đặc Huấn', () => {
  const end = Date.UTC(2026, 10, 20, 17), cd = topupCountdown(end, end - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
  assert.deepEqual([cd.days, cd.clock], [2, '03:04:05']);
  assert.equal(topupCountdown(end, end + 1000).left, 0);
});

test('Điểm đặc huấn = FC nạp × 1,5, bảng công khai chỉ trả điểm (202611180006)', () => {
  const pts = readFileSync('supabase/migrations/202611180006_fco_topup_race_points.sql', 'utf8');
  assert.match(pts, /points_per_fc numeric not null default 1\.5/);
  assert.match(pts, /'points', r\.amount \* rate/);
  assert.doesNotMatch(pts, /'amount',/, 'không lộ số FC nạp');
  assert.equal(formatPoints(3001 * 1.5), '4.501,5');
  assert.equal(formatPoints(1500 * 1.5), '2.250');
});

test('Quà Top Đặc Huấn (202611180007) theo Dachuan.xlsx: gói tdh-* có trong bộ gói, phủ đủ hạng 1–50', () => {
  const rw = readFileSync('supabase/migrations/202611180007_fco_topup_race_rewards.sql', 'utf8');
  const packs = (JSON.parse(readFileSync('src/packs.json', 'utf8')) as { packs: { id: string; seasons: string[]; topPrice: number | null; levels: number[]; eventOnly?: boolean; choose?: boolean; back: string | null }[] }).packs;
  const byId = new Map(packs.map(p => [p.id, p]));
  const rows = [...rw.matchAll(/\((\d+), (\d+),\s+'(\[.*?\])'/g)].map(m => ({ from: +m[1], to: +m[2], rewards: JSON.parse(m[3]) as { pack: string; count: number }[] }));
  assert.deepEqual(rows.map(r => [r.from, r.to]), [[1, 1], [2, 2], [3, 3], [4, 5], [6, 10], [11, 20], [21, 29], [30, 40], [41, 50]]);
  const want: Record<number, [string, number, number][]> = {
    // 2026-11-19 người dùng "tăng các gói đặc huấn lên 2 mức thẻ cộng": mọi gói +2 cấp so với Dachuan.xlsx (mã gói giữ nguyên).
    1: [['stellar', 1, 12], ['ch', 1, 11], ['ws', 1, 11]], 2: [['stellar', 1, 11], ['ch', 3, 11], ['ws', 3, 11]], 3: [['stellar', 3, 11], ['ch', 5, 11], ['ws', 5, 11]],
    4: [['stellar', 5, 11], ['ch', 7, 11], ['ws', 7, 11]], 6: [['stellar', 7, 11], ['ch', 10, 11], ['ws', 10, 11]], 11: [['stellar', 10, 10], ['ch', 15, 11], ['ws', 15, 10]],
    21: [['stellar', 20, 10], ['ch', 20, 11], ['ws', 20, 10]], 30: [['stellar', 30, 10], ['ch', 30, 11], ['ws', 30, 10]], 41: [['stellar', 40, 10], ['ch', 40, 11], ['ws', 40, 10]],
  };
  for (const r of rows) {
    const got = r.rewards.map(w => { const p = byId.get(w.pack); assert.ok(p?.eventOnly && p.choose && p.back, `gói ${w.pack} là gói chỉ định quà, có ảnh`); assert.match(rw, new RegExp(`'${w.pack}'`)); return [p!.seasons[0], p!.topPrice, p!.levels[0]]; });
    assert.deepEqual(got, want[r.from], `hạng ${r.from}`);
  }
  assert.ok(!packs.some(p => ['tdh-ts3', 'tdh-itm121', 'tdh-cc50'].includes(p.id)), 'đã bỏ các gói làm theo bảng quà sai');
  assert.match(rw, /raise exception 'Top Đặc Huấn đã trao quà/);
});

test('Máy chủ chưa chạy 202611180006 (chỉ trả amount) thì game tự quy ra điểm, không hiện NaN', () => {
  const base = { startsAt: 0, endsAt: 1, ended: false, topN: 50, rewards: [], awarded: false };
  const old = normalizeTopupRace({ ...base, top: [{ rank: 1, name: 'a', amount: 3000, mine: false }], me: { rank: null, amount: 0 } } as never);
  assert.equal(old.top[0].points, 4500);
  assert.equal(old.pointsPerFc, 1.5);
  assert.ok(!('amount' in old.top[0]));
  assert.equal(old.me.points, 0);
  const now = normalizeTopupRace({ ...base, pointsPerFc: 2, top: [{ rank: 1, name: 'a', points: 10, mine: true }], me: { rank: 1, points: 10 } } as never);
  assert.deepEqual([now.top[0].points, now.me.points, now.pointsPerFc], [10, 10, 2]);
});

test('Top Đặc Huấn tính toàn bộ FC đã nạp (202611180009): mốc bắt đầu lùi về 2000, game hiện "đến ngày kết thúc"', () => {
  const sql = readFileSync('supabase/migrations/202611180009_fco_topup_race_all_time.sql', 'utf8');
  assert.match(sql, /update public\.fco_topup_race set starts_at = '2000-01-01 00:00\+07' where id = 1;/);
  const start = Date.parse('2000-01-01T00:00:00+07:00'), end = Date.parse('2026-11-21T00:00:00+07:00');
  assert.ok(isAllTime(start));
  assert.equal(raceSpan(start, end), 'đến 20.11');
  assert.ok(!isAllTime(Date.parse('2026-11-18T00:00:00+07:00')));
  assert.equal(raceSpan(Date.parse('2026-11-18T00:00:00+07:00'), end), '18.11 – 20.11');
});

test('BP admin nạp cũng tính điểm Top Đặc Huấn (202611180015): 10B BP = 1 FC tương đương = 1,5 điểm; thể lệ trong game không nhắc BP', () => {
  const sql = readFileSync('supabase/migrations/202611180015_fco_topup_race_bp.sql', 'utf8');
  assert.match(sql, /add column if not exists bp_per_fc numeric not null default 10000000000;/);
  assert.match(sql, /b\.bp::numeric \/ \(select bp_per_fc from public\.fco_topup_race where id = 1\)/);
  assert.match(sql, /from public\.fco_bp_topups b/);
  assert.match(sql, /revoke all on function public\.fco_topup_race_rows\(\) from public, anon, authenticated;/);
  assert.match(sql, /alter column amount type numeric/);
  const ui = readFileSync('src/TopupRaceBoard.tsx', 'utf8');
  assert.doesNotMatch(ui.replace(/^\s*\/\/.*$/gm, ''), /\bBP nạp|nạp BP|Nạp BP/i, 'thể lệ không nhắc nạp BP');
});
test('BP admin nạp: 1.000đ = 1.500 điểm Top Đặc Huấn, tính lại cả lần nạp cũ (202611180019)', () => {
  const sql = readFileSync('supabase/migrations/202611180019_fco_topup_race_bp_1500.sql', 'utf8');
  // 1.000đ = 10B BP (fco_bp_per_vnd 10.000.000 BP / đ); bp_per_fc 10.000.000 → 1.000 FC tương đương × 1,5 = 1.500 điểm.
  const bpPerFc = Number(/update public\.fco_topup_race set bp_per_fc = (\d+) where id = 1;/.exec(sql)![1]);
  assert.equal(1000 * 10_000_000 / bpPerFc * 1.5, 1500);
  assert.match(sql, /alter column bp_per_fc set default 10000000;/);
  assert.match(sql, /Chưa chạy 202611180015_fco_topup_race_bp\.sql/);
});
