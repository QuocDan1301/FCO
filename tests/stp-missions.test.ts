import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { players } from '../src/game.ts';
import { STP_MISSIONS, claimableMissions } from '../src/stp-missions.ts';

const sql = readFileSync('supabase/migrations/202611110012_fco_stp_missions.sql', 'utf8');

test('Nhiệm vụ Star Point hằng ngày khớp bảng fco_stp_mission_defs (thứ tự, tên, thưởng, cầu thủ, mức)', () => {
  const rows = [...sql.matchAll(/\('(\w+)', '([^']+)', '(upgrade|penalty)', '\{([^}]*)\}', (\w+), (\w+), (\d+), (\d+)\)/g)]
    .map(m => ({ id: m[1], title: m[2], kind: m[3], names: m[4] ? m[4].split(',').map(s => JSON.parse(s)) : [], level: m[5] === 'null' ? null : Number(m[5]), goals: m[6] === 'null' ? null : Number(m[6]), reward: Number(m[7]), sort: Number(m[8]) }));
  assert.deepEqual(rows.map(r => r.id), STP_MISSIONS.map(m => m.id));
  assert.deepEqual(rows.map(r => r.reward), [25, 25, 20, 15, 15]);
  for (const [i, m] of STP_MISSIONS.entries()) { assert.equal(rows[i].title, m.title); assert.equal(rows[i].reward, m.reward); assert.equal(rows[i].sort, i + 1); }
  assert.deepEqual(rows.map(r => r.level ?? r.goals), [8, 8, 20, 7, 7]);
  // Tên trong bảng là tên cầu thủ thật trong game; C. Ronaldo là "Cristiano Ronaldo" (không phải Ronaldo người Brazil).
  for (const r of rows) for (const name of r.names) assert.ok(players.some(p => p.name === name), name);
  assert.deepEqual(rows.find(r => r.id === 'ronaldo8')!.names, ['Cristiano Ronaldo']);
  assert.deepEqual(rows.find(r => r.id === 'messi7')!.names, ['L. Messi']);
});

test('Đếm phần thưởng chờ nhận', () => {
  assert.equal(claimableMissions(null), 0);
  assert.equal(claimableMissions({ day: '2026-11-11', missions: [{ id: 'messi7', reward: 15, done: true, claimed: false }, { id: 'messi8', reward: 25, done: true, claimed: true }, { id: 'penalty20', reward: 20, done: false, claimed: false }] }), 1);
});
