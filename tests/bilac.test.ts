import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPackStock, initialSave, packs, validateSave } from '../src/game.ts';
import { bilacAvailable, bilacRewardText, bilacRound, bilacRowFor, grantBilac, shortBp, summarizeBilac } from '../src/bilac.ts';
import type { BilacRow } from '../src/wallet-state.ts';

const rows: BilacRow[] = [
  { id: 'special3', symbol: 'special', kind: 'triple', points: 10, rewards: [{ jackpot: 'special' }] },
  { id: 'bp2', symbol: 'bp', kind: 'pair', points: 2, rewards: [{ bp: 1 }] },
  { id: 'fc2', symbol: 'fc', kind: 'pair', points: 2, rewards: [{ fc: 1 }] },
  { id: 'mixed', symbol: null, kind: 'mixed', points: 1, rewards: [{ bp: 1 }] },
];

test('Bi Lắc: hàng khớp 3 quả bóng giống luật máy chủ (x3, x2, khác nhau)', () => {
  assert.equal(bilacRowFor(rows, ['special', 'special', 'special'])?.id, 'special3');
  assert.equal(bilacRowFor(rows, ['bp', 'fc', 'bp'])?.id, 'bp2');
  assert.equal(bilacRowFor(rows, ['club', 'fc', 'bp'])?.id, 'mixed');
});

test('Bi Lắc: chỉ cộng BP / gói vào bản lưu (FC và giải do máy chủ cộng), ghi lịch sử event, bỏ gói không tồn tại', () => {
  const pack = packs[0], before = { ...initialSave(), fc: 100 };
  const { state, missing } = grantBilac(before, [{ fc: 300 }, { bp: 5_000_000 }, { pack: pack.id, count: 2 }, { fc: 6274, jackpot: 'special' }, { pack: 'khong-co', count: 1 }], 'Bi Lắc · 1 lượt', 'x');
  assert.equal(state.fc, 100);
  assert.equal(state.balance, before.balance + 5_000_000);
  assert.equal(getPackStock(state, pack), getPackStock(before, pack) + 2);
  assert.deepEqual(missing, ['khong-co']);
  assert.equal(state.history[0].type, 'event');
  assert.ok(validateSave(JSON.parse(JSON.stringify(state))));
});

test('Bi Lắc: gộp và hiển thị quà', () => {
  assert.equal(shortBp(400_000_000), '400M'); assert.equal(shortBp(1_200_000_000), '1,2B');
  assert.deepEqual(summarizeBilac([{ bp: 1 }, { bp: 2 }, { fc: 5 }, { pack: 'a', count: 1 }, { pack: 'a', count: 1 }]), [{ pack: 'a', count: 2 }, { fc: 5 }, { bp: 3 }]);
  assert.equal(bilacRewardText({ fc: 6274, jackpot: 'special' }), 'Giải Đặc Biệt 6.274 FC');
});

test('Bi Lắc: mọi gói trong dữ liệu quà của các migration có trong game', () => {
  const sql = ['202611070005_fco_bilac.sql', '202611070006_fco_bilac_prizes.sql', '202611070007_fco_bilac_milestones.sql'].map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
  const ids = [...sql.matchAll(/"pack":"([^"]+)"/g)].map(m => m[1]);
  assert.ok(ids.length > 10);
  for (const id of new Set(ids)) assert.ok(packs.some(p => p.id === id), `gói ${id}`);
});

test('Bi Lắc: tỉ lệ quà (202611080004 + 0005) — trọng số khớp số quà mỗi hàng, tổng 1000, quà đắt nhất ≤ 3 %, quà FC hiếm', () => {
  const prizes = readFileSync('supabase/migrations/202611070006_fco_bilac_prizes.sql', 'utf8');
  const weights = readFileSync('supabase/migrations/202611080004_fco_bilac_harder.sql', 'utf8');
  const lessFc = readFileSync('supabase/migrations/202611080005_fco_bilac_less_fc.sql', 'utf8');
  const symbolSql = readFileSync('supabase/migrations/202611080006_fco_bilac_rare_fc.sql', 'utf8');
  // 202611080005 ghi đè trọng số hàng FC x2 / x3.
  const override = new Map([...lessFc.matchAll(/when '(\w+)' then '\{([\d,]+)\}'/g)].map(m => [m[1], m[2].split(',').map(Number)]));
  const rewards = new Map([...prizes.matchAll(/rewards = '(\[.*?\])' where id = '(\w+)'/g)].map(m => [m[2], JSON.parse(m[1]) as Record<string, unknown>[]]));
  const rows = [...weights.matchAll(/when '(\w+)'\s+then '\{([\d,]+)\}'/g)].map(m => [m[1], override.get(m[1]) ?? m[2].split(',').map(Number)] as const);
  assert.equal(rows.length, 11);
  for (const [id, w] of rows) {
    const list = rewards.get(id)!;
    assert.equal(w.length, list.length, `${id}: số trọng số`);
    assert.equal(w.reduce((a, b) => a + b, 0), 1000, `${id}: tổng 1000`);
    if (w.length > 1) assert.ok(Math.min(...w) <= 30, `${id}: quà đắt nhất ≤ 3 %`);
    const fc = w.filter((_, i) => 'fc' in list[i]), other = w.filter((_, i) => !('fc' in list[i]));
    if (fc.length && other.length) assert.ok(Math.max(...fc) < Math.min(...other.filter(v => v > 0)) || Math.max(...fc) <= 70, `${id}: quà FC hiếm`);
  }
  const symbols = /when 'club' then (\d+) when 'fc' then (\d+) when 'special' then (\d+) when 'bp' then (\d+) when 'card' then (\d+)/.exec(symbolSql)!.slice(1).map(Number);
  assert.equal(symbols.reduce((a, b) => a + b, 0), 100);
  assert.ok(symbols[1] < Math.min(symbols[0], symbols[3], symbols[4]), 'bóng FC hiếm hơn CLB / BP / Thẻ');
  assert.match(lessFc, /random\(\) >= \(case when balls\[1\] = 'fc' then 0\.1 else 0\.4 end\) then/, 'x3 thường giữ 40 %, FC x3 giữ 10 %');
  assert.ok(symbols[1] <= 3 && symbols[2] <= 3, 'bóng FC và Special ≤ 3 %');
  const fc2 = override.get('fc2')!; assert.ok(fc2[0] + fc2[1] + fc2[3] <= 15, 'quà FC trong hàng FC x2 ≤ 1,5 %');
});

test('Bi Lắc: quỹ ≥ 10.000 FC thì người chơi có thêm cơ hội Giải Đặc Biệt theo áp lực quỹ (202611080007)', () => {
  const sql = readFileSync('supabase/migrations/202611080007_fco_bilac_jackpot_chance.sql', 'utf8');
  assert.match(sql, /if j\.pot >= 10000 and not \(balls\[1\] = 'special'/);
  assert.match(sql, /random\(\) < least\(\.005, \.0004 \* public\.fco_jackpot_pressure\(j\.pot\)\)/);
  assert.match(sql, /random\(\) >= \(case when balls\[1\] = 'fc' then 0\.1 else 0\.4 end\) then/, 'giữ luật giảm x3 của 202611080005');
  const pressure = (pot: number) => (1 + Math.max(0, pot - 10000) / 5000) ** 2, chance = (pot: number) => Math.min(.005, .0004 * pressure(pot));
  assert.equal(chance(10000), .0004);
  assert.ok(chance(15000) > chance(12500) && chance(20000) <= .005);
});

test('Bi Lắc: số lần nhận quà mốc theo vòng 1.250 điểm', () => {
  const once = { points: 1, once: true }, m70 = { points: 70, once: false };
  assert.equal(bilacAvailable(0, once, null, 1250), 0);
  assert.equal(bilacAvailable(5000, once, null, 1250), 1);
  assert.equal(bilacAvailable(5000, once, 1, 1250), 0);
  assert.equal(bilacAvailable(69, m70, null, 1250), 0);
  assert.equal(bilacAvailable(70, m70, null, 1250), 1);
  assert.equal(bilacAvailable(1319, m70, 1, 1250), 0);
  assert.equal(bilacAvailable(1320, m70, 1, 1250), 1);
  assert.equal(bilacAvailable(2570, m70, null, 1250), 3);
  assert.deepEqual(bilacRound(160, 1250), { done: 0, next: 1090 });
  assert.deepEqual(bilacRound(2500, 1250), { done: 2, next: 1250 });
});
