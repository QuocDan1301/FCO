import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players } from '../src/game.ts';
import { EDGE_CAP, roleLine, slotRating, statEdge, teamRating } from '../src/ranked-ratings.ts';
import { playerStats, rawStats } from '../src/player-stats.ts';

const natural = (pos: string, role: string, ovr = 120) => { const p = players.find(x => x.pos === pos)!; return { role, ovr, pid: p.id, pos }; };
const good = [natural('LW', 'LW'), natural('ST', 'ST'), natural('RW', 'RW'), natural('CM', 'LCM'), natural('CDM', 'CM'), natural('CAM', 'RCM'), natural('LB', 'LB'), natural('CB', 'LCB'), natural('CB', 'RCB'), natural('RB', 'RB'), natural('GK', 'GK')];

test('Chỉ số GLXH: đúng người đúng chỗ thì công / thủ cao hơn đội toàn trung vệ; thủ môn đá trên sân yếu', () => {
  const allCb = good.map(s => ({ ...s, pos: 'CB', pid: players.find(x => x.pos === 'CB')!.id }));
  const g = teamRating(good), b = teamRating(allCb);
  assert.ok(g.attack > b.attack + 5, `công ${g.attack} vs ${b.attack}`);
  assert.ok(statEdge(g, 120, b, 120) > 0 && statEdge(g, 120, b, 120) <= EDGE_CAP);
  assert.equal(statEdge(b, 120, g, 120), -statEdge(g, 120, b, 120), 'đối xứng');
  assert.ok(slotRating(natural('GK', 'ST')).att < slotRating(natural('ST', 'ST')).att - 10);
  assert.deepEqual(['GK', 'LCB', 'RWB', 'CDM', 'CAM', 'LS', 'RW'].map(roleLine), ['gk', 'df', 'df', 'mf', 'mf', 'fw', 'fw']);
});

test('Chỉ số hiển thị là bản làm tròn của chỉ số máy chủ dùng (cùng công thức)', () => {
  for (const p of players.filter((_, i) => i % 211 === 0)) {
    const raw = rawStats(p, 117).values, shown = playerStats(p, 117).map(s => s.value);
    raw.forEach((v, i) => assert.ok(Math.abs(v - shown[i]) <= 1, p.name));
  }
});
