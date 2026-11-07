import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packs } from '../src/game.ts';
import { CHECKIN_REWARDS, checkinReward } from '../src/checkin.ts';

test('Điểm danh 7 ngày: quà đúng thứ tự, gói có thật, FC khớp bảng trong SQL mới nhất', () => {
  assert.equal(CHECKIN_REWARDS.length, 7);
  assert.deepEqual(CHECKIN_REWARDS.map(r => 'fc' in r ? r.fc : 'pack' in r ? r.pack : null), [200, 400, 700, 1000, 1300, 1600, 2000]);
  for (const r of CHECKIN_REWARDS) if ('pack' in r) assert.ok(packs.some(p => p.id === r.pack), `gói ${r.pack} phải có trong packs.json`);
  const sql = readFileSync('supabase/migrations/202611070008_fco_checkin_fc.sql', 'utf8');
  const fc = CHECKIN_REWARDS.map(r => 'fc' in r ? r.fc : 0).join(', ');
  assert.ok(sql.includes(`array[${fc}]`), `bảng FC trong SQL phải là array[${fc}]`);
  assert.deepEqual(checkinReward(3), { fc: 700 });
  assert.deepEqual(checkinReward(9), CHECKIN_REWARDS[6]);
});
