import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { draw, getPlayer, initialSave, isPackAvailable, openPacks, packs, players, seasons, TIERS, validateSave } from '../src/game.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { rngFor } from './pack-rng.ts';

const pack = packs.find(p => p.id === 'vietnam')!;
const roster = players.filter(p => p.tier === 'vietnam');

test('Gói VIETNAM (ALL) ra 100% mùa VIETNAM, có mặt sau thẻ và logo mùa', () => {
  assert.ok(pack);
  assert.equal(pack.name, 'VIETNAM (ALL)');
  assert.equal(seasons.vietnam, 'VIETNAM');
  assert.ok(TIERS.includes('vietnam'));
  assert.deepEqual(pack.weights, [0, 0, 0, 0, 100, 0, 0, 0]);
  for (const p of packs) assert.equal(p.weights.length, TIERS.length);
  assert.equal(pack.tunnel, '/assets/vietnam-tunnel.webp');
  for (const file of ['vietnam-back.png', 'vietnam-team.png', 'vietnam-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
  assert.equal(getTeamLogo({ tier: 'vietnam', club: 'Việt Nam' }), '/assets/vietnam-team.webp');
});

test('40 thẻ VIETNAM: dữ liệu hợp lệ, ảnh tồn tại, OVR khớp khoảng của gói', () => {
  assert.equal(roster.length, 40);
  assert.equal(new Set(roster.map(p => p.id)).size, 40);
  assert.equal(new Set(players.map(p => p.id)).size, players.length, 'Không trùng ID với mùa khác');
  for (const p of roster) {
    assert.equal(p.nation, 'Việt Nam'); assert.equal(p.flag, 'VN');
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), p.name);
    assert.ok(p.ovr >= 105 && p.ovr <= 119, `${p.name} ${p.ovr}`);
    assert.ok(p.wage && p.wage >= 18 && p.wage <= 29);
    assert.equal(getTeamLogo(p), '/assets/vietnam-team.webp');
  }
  const ovrs = roster.map(p => p.ovr);
  assert.equal(pack.range, `${Math.min(...ovrs)}–${Math.max(...ovrs)}`);
});

test('Gói VIETNAM mở được và chỉ ra thẻ VIETNAM; mỗi thẻ đều có thể rút được', () => {
  assert.equal(isPackAvailable(pack), true);
  roster.forEach(player => assert.equal(draw(pack, rngFor(pack, player.id)).playerId, player.id));
  const result = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(result.cards.every(c => getPlayer(c).tier === 'vietnam'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  for (const other of packs.filter(p => p.id !== 'vietnam')) for (let i = 0; i < 50; i++) { const card = draw(other); assert.notEqual(getPlayer(card).tier, 'vietnam'); }
});
