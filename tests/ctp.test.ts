import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CTP_RAILS } from '../src/ctp-prizes';
import { findPack } from '../src/event';
import { isBilacPrizePack } from '../src/game';
import { CTP_DRAFT, CTP_RULES, ctpAvailable, ctpCellKind, ctpDraftChances, ctpDraftSize, ctpPath, ctpPrice } from '../src/ctp';
import { players, TIERS } from '../src/game';
import { TAX_VOUCHERS } from '../src/stp';
import { isVqtgMilestonePack } from '../src/game';

test('Cờ tỷ phú: kệ quà đúng Tài liệu/quaracctp.xlsx — 8 dải × 5 quà, gói có thật, chỉ nhận từ sự kiện, có ảnh', () => {
  assert.deepEqual(CTP_RAILS.map(r => r.id), ['orange', 'green', 'red', 'purple', 'yellow', 'cyan', 'white', 'pink']);
  for (const rail of CTP_RAILS) {
    assert.equal(rail.prizes.length, 5, rail.id);
    assert.equal(rail.at.length, 5, rail.id);
    for (const p of rail.prizes) {
      if ('pack' in p) {
        const pack = findPack(p.pack);
        assert.ok(pack?.eventOnly, `${rail.id}: ${p.pack}`);
        if (p.pack.startsWith('ctp-')) {
          assert.ok(isBilacPrizePack(pack), `${p.pack} theo luật tỷ lệ danh sách quà`);
          assert.ok(existsSync(`public${pack.back}`), `ảnh ${pack.back}`);
        }
      } else assert.ok(('bp' in p ? p.bp : p.fc) > 0, rail.id);
    }
  }
  // Vài ô đối chiếu với Excel (cột B..F).
  const rail = (id: string) => CTP_RAILS.find(r => r.id === id)!.prizes;
  assert.deepEqual(rail('green'), [300e6, 350e6, 400e6, 450e6, 500e6].map(bp => ({ bp })));
  assert.deepEqual(rail('red')[1], { fc: 200 });
  assert.deepEqual(rail('orange')[4], { pack: 'ctp-107-fca-11' });
  assert.deepEqual(rail('pink')[4], { pack: 'eternal' });
  // Đọc từ phải sang trái: cột B nằm bên phải cột F trên cùng dải.
  for (const r of CTP_RAILS) assert.ok(r.at[0][0] > r.at[4][0], r.id);
});

test('Cờ tỷ phú (202611220001_fco_ctp.sql): quà kệ trên máy chủ đúng src/ctp-prizes.ts, luật khớp CTP_RULES', () => {
  const sql = readFileSync('supabase/migrations/202611220001_fco_ctp.sql', 'utf8');
  const rows = [...sql.matchAll(/\((\d), '(\w+)', '(\[[^']+\])', '\{([\d,]+)\}', (\d+)\)/g)];
  assert.equal(rows.length, 8);
  for (const [, idx, id, rewards, weights, rail] of rows) {
    const r = CTP_RAILS[Number(idx) - 1];
    assert.equal(r.id, id);
    assert.deepEqual(JSON.parse(rewards), r.prizes.map(p => 'pack' in p ? { ...p, count: 1 } : p), id);
    const w = weights.split(',').map(Number);
    assert.equal(w.length, 5); assert.equal(w.reduce((a, b) => a + b, 0), 10000, id);
    assert.ok(Number(rail) > 0);
  }
  assert.equal(rows.reduce((s, r) => s + Number(r[5]), 0), 10000, 'trọng số dải tổng 10.000');
  const rules = sql.match(/fco_ctp_rules\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)![1];
  assert.match(rules, new RegExp(`'prices', '${JSON.stringify(CTP_RULES.prices).replace(/[[\]{}]/g, '\\$&')}'`));
  for (const [k, v] of Object.entries(CTP_RULES)) if (k !== 'prices' && k !== 'rollPoints') assert.match(rules, new RegExp(`'${k}', ${v}\\b`), k);
});

test('Cờ tỷ phú: ô đặc biệt, đường đi vòng 28 ô, giá lượt đầu', () => {
  assert.deepEqual([7, 14, 21, 28, 1].map(ctpCellKind), ['mini', 'special', 'ultimate', 'lucky', 'ball']);
  assert.deepEqual(ctpPath(26, 4), [27, 28, 1, 2]);
  assert.equal(ctpPrice(1, false), 10); assert.equal(ctpPrice(1, true), 20); assert.equal(ctpPrice(10, false), 190); assert.equal(ctpPrice(100, true), 1800);
});
test('Cờ tỷ phú · quà mốc (202611220002_fco_ctp_milestones.sql): 36 mốc theo quamocctp.xlsx, gói có thật + có ảnh, phiếu 35/40% bán được', () => {
  const sql = readFileSync('supabase/migrations/202611220002_fco_ctp_milestones.sql', 'utf8');
  const rows = [...sql.matchAll(/^  \((\d+), (\d+), '(\[.*\])', (true|false), (true|false), (true|false)\)/gm)];
  assert.equal(rows.length, 36);
  assert.deepEqual(rows.map(r => Number(r[2])).slice(0, 3), [1, 15, 25]);
  assert.equal(rows.filter(r => r[6] === 'true').length, 12, '12 mốc đặc biệt');
  assert.equal(Math.max(...rows.filter(r => r[6] === 'false').map(r => Number(r[2]))), 1800, 'vòng 1.800 điểm');
  const ids = new Set<string>();
  for (const r of rows) for (const opt of JSON.parse(r[3]) as Record<string, unknown>[][]) for (const x of opt) {
    assert.ok(['pack', 'bp', 'voucher', 'ctpCard', 'ctpBadge'].some(k => k in x), JSON.stringify(x));
    if ('pack' in x) ids.add(x.pack as string);
    if ('voucher' in x) assert.ok((TAX_VOUCHERS as readonly number[]).includes(x.voucher as number), `phiếu ${x.voucher}%`);
  }
  for (const id of ids) {
    const pack = findPack(id);
    assert.ok(pack, id);  // gói sẵn có (kể cả gói Shop như the-moment) hoặc gói mới ctpm-*
    if (id.startsWith('ctpm-')) assert.ok(pack.eventOnly, id);
    if (id.startsWith('ctpm-')) { assert.ok(isVqtgMilestonePack(pack), `${id} theo luật gói mốc`); assert.ok(existsSync(`public${pack.back}`), `ảnh ${id}`); }
  }
  const guard = sql.match(/where id in \(([^)]+)\)\) < (\d+)/)!;
  assert.equal(guard[1].split(',').length, Number(guard[2]));
  assert.deepEqual(new Set(guard[1].split(',').map(x => x.trim().slice(1, -1))), new Set([...ids].filter(x => x.startsWith('ctpm-'))), 'chặn đúng các gói ctpm-* mới');
  assert.match(sql, /p_voucher not in \(10, 20, 30, 35, 40\)/);
});

test('Cờ tỷ phú · số lượt quà mốc còn nhận (khớp fco_ctp_reached)', () => {
  const ms = [{ idx: 0, points: 1, once: true, paidOnly: true, special: false }, { idx: 1, points: 15, once: false, paidOnly: false, special: false },
    { idx: 2, points: 1800, once: false, paidOnly: false, special: false }, { idx: 3, points: 9000, once: true, paidOnly: false, special: true }];
  assert.equal(ctpAvailable(5, ms[0], [], ms, 1800, false), 0, 'mốc 1 cần đã chơi trả FC');
  assert.equal(ctpAvailable(5, ms[0], [], ms, 1800, true), 1);
  assert.equal(ctpAvailable(5000, ms[0], [1], ms, 1800, true), 0, 'mốc 1 một lần');
  assert.equal(ctpAvailable(3615, ms[1], [], ms, 1800, true), 3, '15 → 1.815 → 3.615: 3 vòng');
  assert.equal(ctpAvailable(3615, ms[1], [0, 2], ms, 1800, true), 1);
  assert.equal(ctpAvailable(9500, ms[3], [], ms, 1800, true), 0, 'đặc biệt cần đã nhận 1 quà mốc thường');
  assert.equal(ctpAvailable(9500, ms[3], [0, 1], ms, 1800, true), 1);
  assert.equal(ctpAvailable(9500, ms[3], [0, 1, 0, 1], ms, 1800, true), 0);
});
test('Cờ tỷ phú · Thẻ Cơ Hội / Khí Vận (202611220003_fco_ctp_cards.sql): chơi kèm thẻ, chờ chọn bộ quà, bỏ 3 màu', () => {
  const sql = readFileSync('supabase/migrations/202611220003_fco_ctp_cards.sql', 'utf8');
  assert.match(sql, /drop function if exists public\.fco_ctp_play\(integer, text\);/, 'bỏ bản 2 tham số để không trùng hàm');
  assert.match(sql, /create or replace function public\.fco_ctp_play\(p_count integer, p_mode text, p_chance boolean default false, p_exclude text\[\] default null\)/);
  assert.match(sql, /coalesce\(array_length\(ex, 1\), 0\) <> 3/, 'Khí Vận bỏ đúng 3 màu');
  assert.match(sql, /grant execute on function public\.fco_ctp_play\(integer, text, boolean, text\[\]\), public\.fco_ctp_pick\(integer\), public\.fco_ctp_pending\(\) to authenticated/);
  assert.match(sql, /delete from public\.fco_ctp_pending where user_id = p_user;/, 'reset xoá lượt chờ');
  for (const id of ['orange', 'green', 'red', 'purple', 'yellow', 'cyan', 'white', 'pink']) assert.ok(CTP_RAILS.some(r => r.id === id));
});
test('Cờ tỷ phú · Tuyển chọn (202611220004_fco_ctp_draft.sql): danh sách cầu thủ + cấp trên máy chủ khớp CTP_DRAFT, 10/9/7/5 người, tỷ lệ nghịch giá', () => {
  for (const t of Object.keys(CTP_DRAFT.levels)) assert.ok((TIERS as readonly string[]).includes(t), t);
  const sql = readFileSync('supabase/migrations/202611220004_fco_ctp_draft.sql', 'utf8');
  const block = sql.slice(sql.indexOf('insert into _ctp_pool_check values'), sql.indexOf('select count(*) into n from _ctp_pool_check'));
  const rows = [...block.matchAll(/\((\d+),(\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const expected = players.filter(p => CTP_DRAFT.levels[p.tier] !== undefined).map(p => [p.id, CTP_DRAFT.levels[p.tier]]);
  assert.deepEqual(new Set(rows.map(r => r.join(':'))), new Set(expected.map(r => r.join(':'))));
  assert.match(sql, /when w\.ctp_draft_count = 0 then 10 when w\.ctp_draft_count = 1 then 9 when w\.ctp_draft_count = 2 then 7 else 5/);
  assert.match(sql, /if total > 6000000000 then/);
  assert.deepEqual([0, 1, 2, 3, 9].map(ctpDraftSize), [10, 9, 7, 5, 5]);
  const c = ctpDraftChances([100, 200, 400]);
  assert.ok(Math.abs(c.reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(c[0] / c[1] - 2) < 1e-9 && Math.abs(c[1] / c[2] - 2) < 1e-9, 'đắt gấp 2 thì khó ra gấp 2');
});
test('Cờ tỷ phú · Đua top (202611220005_fco_ctp_race.sql): 2 đợt theo giờ người dùng chốt, quà trống chờ cập nhật', () => {
  const sql = readFileSync('supabase/migrations/202611220005_fco_ctp_race.sql', 'utf8');
  assert.match(sql, /\(1, '2026-11-21 00:00\+07', '2026-11-26 23:00\+07'\)/);
  assert.match(sql, /\(2, '2026-11-27 00:00\+07', '2026-11-29 23:00\+07'\)/);
  assert.match(sql, /perform public\.fco_ctp_race_tick\(\);\n  j := public\.fco_jackpot_tick\(\);/, 'chốt đợt trước khi cộng điểm');
  assert.match(sql, /perform public\.fco_ctp_race_add\(p_uid, \(o->>'ptsWon'\)::integer\);/);
  assert.match(sql, /if rw is not null and jsonb_array_length\(rw\) > 0 then/, 'không gửi quà rỗng');
});
test('Cờ tỷ phú · quà mốc +1 cấp (202611220006_fco_ctp_milestones_plus1.sql): mọi mốc chỉ dùng gói riêng ctpm-*, cấp ≤ 13', () => {
  const sql = readFileSync('supabase/migrations/202611220006_fco_ctp_milestones_plus1.sql', 'utf8');
  const packs = [...sql.matchAll(/"pack":"([^"]+)"/g)].map(m => m[1]);
  assert.ok(packs.length >= 70 && packs.every(id => id.startsWith('ctpm-')), 'không còn gói dùng chung trong bảng mốc');
  for (const id of new Set(packs)) { const p = findPack(id); assert.ok(p?.eventOnly && p.levels && p.levels[1] <= 13, id); }
  assert.deepEqual(findPack('ctpm-9000')?.levels, [2, 2], 'ICON TM 122+ → +2');
  assert.deepEqual(findPack('ctpm-15-2')?.levels, [6, 6], 'UC 119+ (+5) → +6');
  assert.deepEqual(findPack('ctpm-1-1')?.levels, [5, 6], '26UP…120+ (4~5) → (5~6)');
});
test('Cờ tỷ phú · điểm theo số lắc (202611220007_fco_ctp_roll_points.sql) khớp CTP_RULES.rollPoints', () => {
  const sql = readFileSync('supabase/migrations/202611220007_fco_ctp_roll_points.sql', 'utf8');
  assert.match(sql, new RegExp(`'rollPoints', '${JSON.stringify(CTP_RULES.rollPoints).replace(/[[\]]/g, '\\$&')}'::jsonb`));
  assert.match(sql, /pts := \(rules->'rollPoints'->>\(roll - 1\)\)::integer \* case when dbl then 2 else 1 end;/);
  assert.match(sql, /'luckyMore', 2, 'luckyLess', 1,/, 'giữ đủ các hằng số cũ');
});

test('Cờ tỷ phú · tỷ lệ kệ quà mới (202611220008_fco_ctp_rails_harder.sql): 8 dải, mỗi dải tổng 10.000, tổng dải 10.000', () => {
  const sql = readFileSync('supabase/migrations/202611220008_fco_ctp_rails_harder.sql', 'utf8');
  const rows = [...sql.matchAll(/set weights = '\{([\d,]+)\}', rail_weight = (\d+) where id = '(\w+)'/g)];
  assert.deepEqual(rows.map(r => r[3]).sort(), CTP_RAILS.map(r => r.id).sort());
  for (const r of rows) assert.equal(r[1].split(',').map(Number).reduce((a, b) => a + b, 0), 10000, r[3]);
  assert.equal(rows.reduce((s, r) => s + Number(r[2]), 0), 10000);
});

test('Cờ tỷ phú · quà Đua top (202611220009_fco_ctp_race_rewards.sql): Top 1–5 đúng gói người dùng gửi, gói có thật + có ảnh', () => {
  const sql = readFileSync('supabase/migrations/202611220009_fco_ctp_race_rewards.sql', 'utf8');
  const rows = Object.fromEntries([...sql.matchAll(/set rewards = '(\[[^']+\])' where rank = (\d);/g)].map(m => [Number(m[2]), (JSON.parse(m[1]) as { pack: string }[]).map(r => r.pack)]));
  assert.deepEqual(rows, {
    1: ['ctpt-el1-5', 'ctpt-tsu5-5', 'ctpt-uc12-5'], 2: ['ctpt-el1-7', 'ctpt-tsu5-7', 'ctpt-uc12-7'], 3: ['ctpt-el1-10', 'ctpt-tsu5-10', 'ctpt-uc12-10'],
    4: ['ctpt-tsu5-10', 'ctpt-uc12-10'], 5: ['ctpt-tsu5-15', 'ctpt-uc12-15'],
  });
  for (const id of new Set(Object.values(rows).flat())) { const p = findPack(id); assert.ok(p?.eventOnly && p.choose && existsSync(`public${p.back}`), id); }
  assert.deepEqual([findPack('ctpt-tsu5-5')?.levels, findPack('ctpt-uc12-15')?.levels, findPack('ctpt-uc12-15')?.topPrice], [[5, 5], [12, 12], 15]);
});