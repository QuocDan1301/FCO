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

test('Shop Đổi Vé (quamocvqtg.xlsx): 23 mốc 1 → 1.900 vé, gói có thật, gói vqm-* theo luật gói mốc', () => {
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
        if (r.pack.startsWith('vqm-')) assert.equal(priceAlphaOf(pack), PACK_ODDS.milestonePriceAlpha, r.pack);
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

test('Đua top đếm ngược 7 ngày từ 0h 13/11/2026 tới 0h 20/11/2026 giờ Việt Nam', () => {
  assert.equal(new Date(VQTG_RACE_START).toISOString(), '2026-11-12T17:00:00.000Z');
  assert.equal(new Date(VQTG_RACE_END).toISOString(), '2026-11-19T17:00:00.000Z');
  assert.deepEqual(raceCountdown(VQTG_RACE_START), { left: 7 * 86400000, started: true, days: 7, clock: '00:00:00' });
  const mid = raceCountdown(Date.UTC(2026, 10, 13, 15, 30, 5)); // 22:30:05 ngày 13/11 giờ VN
  assert.deepEqual([mid.days, mid.clock], [6, '01:29:55']);
  assert.equal(raceCountdown(VQTG_RACE_END + 1).left, 0);
  assert.equal(raceCountdown(VQTG_RACE_START - 1).started, false);
});
