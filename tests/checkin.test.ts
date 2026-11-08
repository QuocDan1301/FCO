import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packs } from '../src/game.ts';
import { CHECKIN_REWARDS, checkinReward } from '../src/checkin.ts';

test('Điểm danh 7 ngày: quà đúng thứ tự, gói có thật, FC khớp bảng trong SQL mới nhất', () => {
  assert.equal(CHECKIN_REWARDS.length, 7);
  assert.deepEqual(CHECKIN_REWARDS.map(r => 'fc' in r ? r.fc : 'pack' in r ? r.pack : null), [200, 350, 500, 650, 800, 1000, 'the-moment']);
  for (const r of CHECKIN_REWARDS) if ('pack' in r) assert.ok(packs.some(p => p.id === r.pack), `gói ${r.pack} phải có trong packs.json`);
  const sql = readFileSync('supabase/migrations/202611080002_fco_checkin_v3.sql', 'utf8');
  const fc = CHECKIN_REWARDS.map(r => 'fc' in r ? r.fc : 0).join(', ');
  assert.ok(sql.includes(`array[${fc}]`), `bảng FC trong SQL phải là array[${fc}]`);
  assert.deepEqual(checkinReward(3), { fc: 500 });
  assert.deepEqual(checkinReward(7), { pack: 'the-moment', count: 1 });
  assert.deepEqual(checkinReward(9), CHECKIN_REWARDS[6]);
});
