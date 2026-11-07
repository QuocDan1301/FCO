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
