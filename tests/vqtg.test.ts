import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VQTG_RACE_END, VQTG_RACE_START, raceCountdown, VQTG_ROLL_TICKETS, VQTG_BOARD, VQTG_QUADS, VQTG_RULES, VQTG_SPECIAL, tokenPoint, vqtgAvailable, vqtgNext, vqtgPath, vqtgPickAllowed, wheelAngle, type VqtgTile } from '../src/vqtg.ts';
import { EVENT_BILAC_ENABLED, EVENT_VQTG_ENABLED } from '../src/config.ts';
import { PACK_ODDS, packs, priceAlphaOf } from '../src/game.ts';

const sql = readFileSync('supabase/migrations/202611130004_fco_vqtg.sql', 'utf8');

test('Luật VQTG trong game khớp fco_vqtg_rules và cách đi quân của máy chủ', () => {
  const mini = readFileSync('supabase/migrations/202611130011_fco_vqtg_mini_from_jp.sql', 'utf8');
  assert.match(mini, new RegExp(`'bpPerJackpotFc', ${VQTG_RULES.bpPerJackpotFc}[,)]`));
  assert.equal(VQTG_RULES.bpPerJackpotFc * 1000, 5_000_000_000, '1.000 FC Jackpot → 5B BP Mini Jackpot');
  assert.match(sql, new RegExp(`'bpChance', ${VQTG_RULES.bpChance}[,)]`));
  assert.match(sql, /\(pos \+ roll - 1\) % 16 \+ 1/);
  assert.equal(vqtgNext(0, 3), 3);
  assert.equal(vqtgNext(15, 4), 3);
  assert.equal(vqtgNext(16, 1), 1);
  assert.deepEqual(vqtgPath(14, 4), [15, 16, 1, 2]);
  assert.ok(EVENT_VQTG_ENABLED && !EVENT_BILAC_ENABLED, 'VQTG thay chỗ Bi Lắc');
});

test('Bàn cờ (ảnh): 13 ô quà đủ 4 ô màu trong ảnh, ô đặc biệt 6 / 10 / 14, quân đi qua đủ 16 ô', () => {
  const { w, h } = VQTG_BOARD;
  const reward = [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16];
  assert.deepEqual(Object.keys(VQTG_QUADS).map(Number).sort((a, b) => a - b), reward);
  for (const idx of reward) {
    const g = VQTG_QUADS[idx];
    assert.equal(g.q.length, 4, `ô ${idx}`);
    for (const [x, y, side] of g.q) assert.ok(x > 0 && x < w && y > 0 && y < h && side > 30, `ô ${idx}: ${x},${y}`);
  }
  assert.deepEqual(Object.keys(VQTG_SPECIAL).map(Number), [6, 10, 14]);
  // Ô liền nhau gần nhau (quân không nhảy chéo bàn); ô 16 → ô 1 qua lối Bắt đầu cũng vậy.
  for (let i = 1; i <= 16; i++) {
    const a = tokenPoint(i), b = tokenPoint(i % 16 + 1);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 380, `ô ${i} → ${i % 16 + 1}`);
  }
  assert.ok(tokenPoint(0).x < tokenPoint(1).x, 'ô Bắt đầu ở bên trái ô 1');
});

test('Chỉ định không dừng được ở ô Quỹ BP / Giải Đặc Biệt', () => {
  const tiles: VqtgTile[] = Array.from({ length: 16 }, (_, i) => ({ idx: i + 1, kind: i + 1 === 6 ? 'pick' : i + 1 === 10 ? 'bp' : i + 1 === 14 ? 'jackpot' : 'reward', label: '', rewards: [] }));
  assert.deepEqual([1, 2, 3, 4, 5, 6].filter(n => vqtgPickAllowed(tiles, 8, n)), [1, 3, 4, 5]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].filter(n => vqtgPickAllowed(tiles, 0, n)), [1, 2, 3, 4, 5, 6]);
});

test('Vòng quay luôn quay tới trước và dừng đúng số dưới kim', () => {
  let angle = 0;
  for (const roll of [1, 6, 3, 3, 2, 5, 4]) {
    const next = wheelAngle(angle, roll);
    assert.ok(next >= angle + 360 * 4, `${roll}`);
    assert.equal(((next % 360) + 360) % 360, ((-(roll - 1) * 60) % 360 + 360) % 360);
    angle = next;
  }
});

test('Quà ô theo quaracvqtg.xlsx: 13 ô quà đủ 4 món, ô 10 / 14 không quà an ủi, gói có thật và chỉ nhận từ sự kiện', () => {
  const prizes = readFileSync('supabase/migrations/202611130005_fco_vqtg_prizes.sql', 'utf8');
  const rows = [...prizes.matchAll(/set rewards = '(\[.*?\])', weights = '\{([\d,]+)\}' where idx = (\d+);/g)];
  assert.deepEqual(rows.map(r => +r[3]), [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16]);
  for (const [, json, weights, idx] of rows) {
    const rewards = JSON.parse(json) as { pack?: string; fc?: number }[];
    const w = weights.split(',').map(Number);
    assert.equal(rewards.length, 4, `ô ${idx}`);
    assert.equal(w.length, 4, `ô ${idx}`);
    assert.ok(w.every((x, i) => i === 0 || x > w[i - 1]), `ô ${idx}: quà bên trái hiếm hơn`);
    if (rewards.some(r => r.fc)) assert.ok(w[0] / w.reduce((a, b) => a + b) <= 0.005, `ô ${idx}: FC rất hiếm`);
    for (const r of rewards) if (r.pack) {
      const pack = packs.find(p => p.id === r.pack);
      assert.ok(pack?.eventOnly, `ô ${idx}: ${r.pack}`);
      if (r.pack.startsWith('vq-')) assert.equal(priceAlphaOf(pack), PACK_ODDS.prizePriceAlpha, r.pack);
    }
  }
  assert.match(prizes, /set rewards = '\[\]', weights = null where idx in \(10, 14\)/);
});

test('Shop Đổi Vé (quamocvqtg.xlsx): 23 mốc 1 → 1.900 vé, gói có thật, gói vqm-* theo luật gói mốc VQTG (OVR cao dễ ra hơn gói mốc chung)', () => {
  assert.ok(PACK_ODDS.vqtgMilestoneOvrDecay > PACK_ODDS.ovrDecay && PACK_ODDS.vqtgMilestonePriceAlpha < PACK_ODDS.milestonePriceAlpha);
  const sql = readFileSync('supabase/migrations/202611130006_fco_vqtg_milestones.sql', 'utf8');
  const rows = [...sql.matchAll(/\((\d+), (\d+), '(\[\[.*?\]\])', (true|false), (true|false)\)/g)];
  assert.equal(rows.length, 23);
  assert.deepEqual(rows.map(r => +r[2]), [1, 10, 20, 30, 50, 70, 100, 150, 200, 300, 400, 500, 600, 700, 800, 950, 1100, 1250, 1400, 1500, 1600, 1750, 1900]);
  assert.deepEqual(rows.map(r => +r[1]), rows.map((_, i) => i));
  const [first] = rows;
  assert.equal(first[4], 'true'); assert.equal(first[5], 'true'); // mốc 1 vé: 1 lần, chỉ bằng lượt trả phí
  assert.ok(rows.slice(1).every(r => r[4] === 'false' && r[5] === 'false'));
  for (const [, idx, tickets, json] of rows) {
    const options = JSON.parse(json) as { pack?: string; bp?: number; voucher?: number }[][];
    assert.equal(options.length, +idx < 5 ? 1 : +tickets === 1900 ? 4 : 3, `mốc ${tickets}`);
    for (const opt of options) {
      if (+tickets > 1) assert.ok(opt.some(r => r.bp), `mốc ${tickets} có BP`);
      for (const r of opt) if (r.pack) {
        const pack = packs.find(p => p.id === r.pack);
        assert.ok(pack?.eventOnly, `mốc ${tickets}: ${r.pack}`);
        if (r.pack.startsWith('vqm-')) assert.equal(priceAlphaOf(pack!), PACK_ODDS.vqtgMilestonePriceAlpha, r.pack);
      }
    }
  }
  // Ba món game chưa có đã bỏ theo lựa chọn của người dùng.
  assert.doesNotMatch(sql.split('\n').filter(l => l.startsWith('  (')).join('\n'), /ICON|HLV|"tc"/i);
  assert.equal((sql.match(/"voucher":30/g) ?? []).length, 2);
});

test('Shop Đổi Vé: số lần còn nhận theo vòng, vé không bị trừ, mốc 1 vé cần lượt trả phí', () => {
  const m70 = { tickets: 70, once: false, paidOnly: false }, m1 = { tickets: 1, once: true, paidOnly: true };
  assert.equal(vqtgAvailable(69, m70, 0, 1900, true), 0);
  assert.equal(vqtgAvailable(70, m70, 0, 1900, true), 1);
  assert.equal(vqtgAvailable(70, m70, 1, 1900, true), 0);
  assert.equal(vqtgAvailable(70 + 1900, m70, 1, 1900, true), 1);
  assert.equal(vqtgAvailable(70 + 3800, m70, 0, 1900, true), 3);
  assert.equal(vqtgAvailable(5000, m1, 0, 1900, false), 0);
  assert.equal(vqtgAvailable(5000, m1, 0, 1900, true), 1);
  assert.equal(vqtgAvailable(5000, m1, 1, 1900, true), 0);
});

test('Đua top nhận quà hot: quà đủ 5 hạng, gói có thật', () => {
  const sql = readFileSync('supabase/migrations/202611130007_fco_vqtg_top.sql', 'utf8');
  const rows = [...sql.matchAll(/\((\d), '(\[.*?\])', '([^']*)'\)/g)];
  assert.deepEqual(rows.map(r => +r[1]), [1, 2, 3, 4, 5]);
  assert.deepEqual(rows.map(r => JSON.parse(r[2]).map((x: { pack: string }) => x.pack).join()), ['vqt-1,vqt-1g', 'vqt-2,vqt-2g', 'vqt-3', 'vqt-4', 'vqt-5']);
  assert.deepEqual(['vqt-1', 'vqt-1g', 'vqt-2', 'vqt-2g', 'vqt-3', 'vqt-4', 'vqt-5'].map(id => packs.find(p => p.id === id)?.levels), [[1, 1], [11, 11], [1, 1], [11, 11], [11, 11], [11, 11], [11, 11]]);
  assert.deepEqual(['vqt-1g', 'vqt-2g', 'vqt-5'].map(id => { const p = packs.find(x => x.id === id)!; return [p.seasons, p.topPrice, p.choose]; }),
    [[['gru'], 10, true], [['gru'], 15, true], [['gru'], 30, true]]);
  for (const [, rank, json] of rows) for (const r of JSON.parse(json) as { pack?: string }[]) if (r.pack) assert.ok(packs.some(p => p.id === r.pack), `hạng ${rank}: ${r.pack}`);
  assert.match(sql, /order by w\.vqtg_tickets desc, w\.vqtg_tickets_at nulls last/);
});

test('Vé theo số lắc khớp máy chủ: 1 vòng Shop (1.900 vé) ~12.800 FC lắc thường, ~11.900 FC khi tận dụng Chỉ định', () => {
  const sql = readFileSync('supabase/migrations/202611130008_fco_vqtg_roll_tickets.sql', 'utf8');
  assert.match(sql, new RegExp(`'rollTickets', '\\[${VQTG_ROLL_TICKETS.join(',')}\\]'`));
  const avg = VQTG_ROLL_TICKETS.reduce((a, b) => a + b, 0) / 6;
  const plain = Math.ceil(1900 / avg) * 18;
  assert.ok(plain <= 13500 && plain * 19 / 18 <= 13600, String(plain));
  assert.equal(Math.max(...VQTG_ROLL_TICKETS), VQTG_ROLL_TICKETS[5]);
});

test('Ô 14 chỉ có Giải Đặc Biệt (không Giải Phụ 1/10 quỹ); mini jackpot là quỹ BP ô 10', () => {
  const sql = readFileSync('supabase/migrations/202611130010_fco_vqtg_no_mini.sql', 'utf8');
  const play = sql.slice(sql.indexOf('function public.fco_vqtg_play'));
  assert.doesNotMatch(play, /'mini'|miniChance|pot \/ 10/);
  assert.match(play, /jp_kind := case when r < special_chance then 'special' end;/);
  assert.doesNotMatch(sql.slice(sql.indexOf('fco_vqtg_rules'), sql.indexOf('fco_vqtg_play')), /miniChance/);
});

test('Người trúng Jackpot chỉ nhận FC; Mini Jackpot nổ cùng lúc cho HLV khác (202611130012)', () => {
  const sql = readFileSync('supabase/migrations/202611130012_fco_vqtg_mini_other.sql', 'utf8');
  const special = sql.slice(sql.indexOf("if jp_kind = 'special' then"), sql.indexOf('if jp_kind is not null then'));
  assert.doesNotMatch(special, /grants :=/);
  assert.match(special, /fco_bot_name\(\)/);
});

test('Đua top đếm ngược từ 0h 13/11/2026 tới hết ngày 20/11/2026 (0h 21/11) giờ Việt Nam', () => {
  assert.equal(new Date(VQTG_RACE_START).toISOString(), '2026-11-12T17:00:00.000Z');
  assert.equal(new Date(VQTG_RACE_END).toISOString(), '2026-11-20T17:00:00.000Z');
  assert.deepEqual(raceCountdown(VQTG_RACE_START), { left: 8 * 86400000, started: true, days: 8, clock: '00:00:00' });
  const mid = raceCountdown(Date.UTC(2026, 10, 13, 15, 30, 5)); // 22:30:05 ngày 13/11 giờ VN
  assert.deepEqual([mid.days, mid.clock], [7, '01:29:55']);
  assert.equal(raceCountdown(VQTG_RACE_END + 1).left, 0);
  assert.equal(raceCountdown(VQTG_RACE_START - 1).started, false);
});

test('Chọn nhanh Shop Đổi Vé (202611140008): nhận nhiều lượt một mốc trong một lần, tối đa 100, gộp quà', () => {
  const sql = readFileSync('supabase/migrations/202611140008_fco_vqtg_claim_many.sql', 'utf8');
  assert.match(sql, /if n < 1 or n > 100 then raise exception 'FCO_BAD_COUNT'/);
  assert.match(sql, /if done \+ n > reached then raise exception 'FCO_MILESTONE_CLAIMED'/);
  assert.match(sql, /grant execute on function public\.fco_vqtg_claim_many\(integer, integer\[\]\) to authenticated/);
  const page = readFileSync('src/VqtgPage.tsx', 'utf8');
  assert.match(page, /const QUICK_MIN = 2, QUICK_MAX = 100;/);
});
test('Jackpot VQTG gấp 3 (202611140019): 0,96% × áp lực quỹ mỗi lần dừng ô 14, trần 12%', () => {
  const sql = readFileSync('supabase/migrations/202611140019_fco_vqtg_jackpot_x3.sql', 'utf8');
  assert.match(sql, /if random\(\) < least\(\.12, \.0096 \* public\.fco_jackpot_pressure\(j\.pot\)\) then hit := 'special'; end if;/);
  assert.doesNotMatch(sql, /least\(\.04, \.0032/);
});
test('Khôi phục VQTG (202611140020): đặt lại bản mới nhất của rules / config / play, dọn tin Mini 0 BP', () => {
  const sql = readFileSync('supabase/migrations/202611140020_fco_vqtg_restore.sql', 'utf8');
  assert.match(sql, /'bpPerJackpotFc'/);
  assert.match(sql, /least\(\.12, \.0096 \* public\.fco_jackpot_pressure\(j\.pot\)\)/);
  assert.match(sql, /price := 0;   -- Lượt dùng Chỉ định miễn phí/);
  assert.match(sql, /where coalesce\(\(e->>'amount'\)::numeric, 0\) > 0/);
});

test('202611150001: Giải Đặc Biệt tỷ lệ cố định, mỗi HLV trúng Jackpot / Mini Jackpot tối đa 1 lần / 24 giờ', () => {
  const sql = readFileSync('supabase/migrations/202611150001_fco_vqtg_jackpot_fair.sql', 'utf8');
  const play = sql.slice(sql.indexOf('create or replace function public.fco_vqtg_play('));
  assert.doesNotMatch(play, /fco_jackpot_pressure/, 'không nhân theo áp lực quỹ');
  assert.match(play, /random\(\) < \.0096 then hit := 'special'/);
  assert.match(play, /jp_at <= now\(\) - interval '24 hours'/);
  assert.match(play, /mini_at <= now\(\) - interval '24 hours'/);
  assert.match(play, /vqtg_jp_at = jp_at, vqtg_mini_at = mini_at/);
  // Kỳ vọng mỗi lượt 18 FC ở quỹ 23.000 FC: ~6,75 % dừng ô 14 × 0,96 % × 23.000 ≈ 15 FC < giá lượt.
  assert.ok(0.0675 * 0.0096 * 23000 < 18);
});

test('202611150002: máy chủ chốt Đua top đúng giờ game hiển thị, trao quà một lần, chốt trước khi cộng vé', () => {
  const sql = readFileSync('supabase/migrations/202611150002_fco_vqtg_race_settle.sql', 'utf8');
  const end = /set ends_at = '([^']+)'/.exec(readFileSync('supabase/migrations/202611170001_fco_vqtg_race_extend.sql', 'utf8'))![1]; // giờ mới nhất (lùi sang hết 20/11)
  assert.equal(Date.parse(end.replace(' ', 'T').replace('+07', '+07:00')), VQTG_RACE_END);
  assert.match(sql, /if not found or r\.settled_at is not null or now\(\) < r\.ends_at then return/);
  const play = sql.slice(sql.indexOf('create or replace function public.fco_vqtg_play('));
  assert.ok(play.indexOf('fco_vqtg_race_tick()') < play.indexOf('vqtg_tickets = vqtg_tickets + got_tickets'));
  assert.match(sql, /function public\.fco_vqtg_top\(\) returns jsonb\nlanguage plpgsql volatile/);
});

test('202611150003: Giải Đặc Biệt 0,6 % mỗi lần dừng ô 14, vẫn giữ chốt Đua top và giới hạn 24 giờ', () => {
  const sql = readFileSync('supabase/migrations/202611150003_fco_vqtg_jackpot_rate.sql', 'utf8');
  assert.match(sql, /random\(\) < \.006 then hit := 'special'/);
  assert.doesNotMatch(sql, /\.0096|fco_jackpot_pressure/);
  assert.match(sql, /perform public\.fco_vqtg_race_tick\(\);/);
  assert.match(sql, /mini_at <= now\(\) - interval '24 hours'/);
});

test('202611150004: Giải Đặc Biệt 0,8 %, Jackpot / Mini Jackpot tối đa 2 lần mỗi 24 giờ', () => {
  const sql = readFileSync('supabase/migrations/202611150004_fco_vqtg_jackpot_twice.sql', 'utf8');
  assert.match(sql, /\(jp_prev is null or jp_prev <= now\(\) - interval '24 hours'\) and random\(\) < \.008 then hit := 'special'; jp_prev := jp_at; jp_at := now\(\)/);
  assert.match(sql, /\(mini_prev is null or mini_prev <= now\(\) - interval '24 hours'\)/);
  assert.match(sql, /hit := 'mini'; mini_prev := mini_at; mini_at := now\(\)/);
  assert.match(sql, /vqtg_jp_prev = jp_prev, vqtg_mini_prev = mini_prev/);
  assert.match(sql, /perform public\.fco_vqtg_race_tick\(\);/);
  assert.doesNotMatch(sql, /fco_jackpot_pressure|random\(\) < \.006/);
});

test('Quỹ Jackpot chạy liên tục: chạy đều từ số đang hiện tới số mới trong 30 giây, giảm / lần đầu thì nhảy ngay', async () => {
  const { rollTo, rollValue, JACKPOT_ROLL_MS } = await import('../src/vqtg.ts');
  let r = rollTo({ from: 0, to: 0, start: 0 }, 10_000, 0);
  assert.equal(rollValue(r, 0), 10_000, 'lần đầu có số: nhảy ngay, không chạy từ 0');
  r = rollTo(r, 11_200, 1_000);
  assert.equal(rollValue(r, 1_000), 10_000);
  assert.equal(rollValue(r, 1_000 + JACKPOT_ROLL_MS / 2), 10_600);
  assert.equal(rollValue(r, 1_000 + JACKPOT_ROLL_MS), 11_200);
  assert.equal(rollValue(r, 1_000 + 5 * JACKPOT_ROLL_MS), 11_200, 'không vượt số máy chủ');
  // Số mới tới giữa chừng: chạy tiếp từ số đang hiện, không giật lùi.
  const mid = rollValue(r, 1_000 + JACKPOT_ROLL_MS / 2);
  r = rollTo(r, 12_000, 1_000 + JACKPOT_ROLL_MS / 2);
  assert.equal(rollValue(r, 1_000 + JACKPOT_ROLL_MS / 2), mid);
  // Có người trúng: quỹ về 2.000 → nhảy ngay.
  r = rollTo(r, 2_000, 40_000);
  assert.equal(rollValue(r, 40_000), 2_000);
});

test('202611150005: quà Đua top Top 1–5 đúng gói người dùng đặt, gói nào cũng có trong packs.json', async () => {
  const sql = readFileSync('supabase/migrations/202611150005_fco_vqtg_top_rewards.sql', 'utf8');
  const { packs } = JSON.parse(readFileSync('src/packs.json', 'utf8').replace(/^\uFEFF/, '')) as { packs: { id: string; seasons: string[]; minOvr: number | null; topPrice: number | null; levels: number[]; choose?: boolean }[] };
  const byId = new Map(packs.map(p => [p.id, p]));
  const ranks = [...sql.matchAll(/\((\d), '(\[[^']+\])'/g)].map(m => ({ rank: +m[1], ids: (JSON.parse(m[2]) as { pack: string }[]).map(r => r.pack) }));
  assert.equal(ranks.length, 5);
  const label = (id: string) => { const p = byId.get(id); assert.ok(p, `thiếu gói ${id}`);
    return p.choose ? `${p.seasons[0]} chỉ định ${p.topPrice} (+${p.levels[0]})` : `${p.seasons[0]} ${p.minOvr ?? 'all'}`; };
  assert.deepEqual(ranks.map(r => r.ids.map(label)), [
    ['el 135', 'tsubasa 128', 'gru chỉ định 10 (+11)'],
    ['el 134', 'tsubasa 127', 'gru chỉ định 15 (+11)'],
    ['el 133', 'tsubasa 126', 'gru chỉ định 20 (+11)'],
    ['tsubasa all', 'gru chỉ định 25 (+11)'],
    ['tsubasa all', 'gru chỉ định 30 (+11)'],
  ]);
});

test('Tự dùng Chỉ định: chọn số được phép cho nhiều vé nhất, tránh ô Mini Jackpot / Giải Đặc Biệt', async () => {
  const { vqtgBestPick, vqtgPickAllowed, rollTickets } = await import('../src/vqtg.ts');
  const tiles = Array.from({ length: 16 }, (_, i) => ({ idx: i + 1, kind: i + 1 === 10 ? 'bp' : i + 1 === 14 ? 'jackpot' : i + 1 === 6 ? 'pick' : 'reward' })) as never[];
  assert.equal(vqtgBestPick(tiles, 1), 6, 'đi 6 → ô 7: được, 6 vé');
  assert.equal(vqtgBestPick(tiles, 8), 5, '6 → ô 14 bị chặn, 5 → ô 13 (3 vé)');
  assert.equal(vqtgBestPick(tiles, 4), 5, '6 → ô 10 bị chặn');
  for (let from = 1; from <= 16; from++) {
    const n = vqtgBestPick(tiles, from)!;
    assert.ok(vqtgPickAllowed(tiles, from, n));
    for (let m = 1; m <= 6; m++) if (vqtgPickAllowed(tiles, from, m)) assert.ok(rollTickets(m) <= rollTickets(n), `ô ${from}: số ${m} nhiều vé hơn ${n}`);
  }
});
test('Mốc 1.250 → 1.900 vé: mọi gói +1 cấp, 4 gói dùng chung Bi Lắc đổi sang bản vqm riêng (202611180001)', () => {
  const sql = readFileSync('supabase/migrations/202611180001_fco_vqtg_milestones_plus1.sql', 'utf8');
  const swaps: [string, string, number][] = [['blm-1150-3', 'vqm-1250-2', 1250], ['bl-up26-50', 'vqm-1500-2', 1500], ['blm-1250-2', 'vqm-1600-3', 1600], ['blm-1250-1', 'vqm-1900-1', 1900]];
  for (const [from, to, tickets] of swaps) {
    assert.match(sql, new RegExp(`replace\\(options::text, '"${from}"', '"${to}"'\\)::jsonb where tickets = ${tickets}`));
    const a = packs.find(p => p.id === from)!, b = packs.find(p => p.id === to)!;
    assert.ok(b && b.eventOnly, to);
    assert.deepEqual(b.levels, [a.levels![0] + 1, a.levels![1] + 1], `${to} = ${from} +1 cấp`);
    assert.equal(b.topPrice, a.topPrice); assert.deepEqual(b.seasons, a.seasons);
  }
  const levels: Record<string, [number, number]> = { 'vqm-1250-1': [10, 10], 'vqm-1250-3': [9, 9], 'vqm-1400-1': [9, 9], 'vqm-1400-2': [6, 7], 'vqm-1400-3': [12, 12], 'vqm-1500-1': [10, 10], 'vqm-1500-3': [12, 12],
    'vqm-1600-1': [12, 12], 'vqm-1600-2': [10, 10], 'vqm-1750-1': [12, 12], 'vqm-1750-2': [12, 12], 'vqm-1750-3': [10, 10], 'vqm-1900-2': [12, 12], 'vqm-1900-3': [9, 9], 'vqm-1900-4': [12, 12] };
  for (const [id, lv] of Object.entries(levels)) assert.deepEqual(packs.find(p => p.id === id)?.levels, lv, id);
});
