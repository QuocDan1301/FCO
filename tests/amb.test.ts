import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { defaultPacks, draw, getPlayer, isPackAvailable, openPacks, packs, players, seasons, TIERS, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { rngFor } from './pack-rng.ts';

// Định nghĩa gốc: trang quản trị có thể đổi tên / giá / cấp hoặc ẩn gói đang bán.
const pack = defaultPacks.find(p => p.id === 'amb')!;
const roster = players.filter(p => p.tier === 'amb');
const logo = (name: string) => getTeamLogo(roster.find(p => p.name === name)!);

test('Gói FC AMBASSADOR (ALL) ra 100% mùa FC AMBASSADOR, có mặt sau thẻ và logo mùa', () => {
  assert.equal(pack.name, 'FC AMBASSADOR (ALL)');
  assert.equal(seasons.amb, 'FC AMBASSADOR');
  assert.deepEqual(pack.weights, TIERS.map(t => t === 'amb' ? 100 : 0));
  assert.equal(pack.weights.length, TIERS.length);
  assert.equal(pack.tunnel, '/assets/amb-tunnel.webp');
  for (const file of ['amb-back.png', 'amb-team.png', 'amb-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('9 thẻ FC AMBASSADOR: ảnh tồn tại, OVR khớp khoảng gói, logo đội theo thẻ', () => {
  assert.equal(roster.length, 9);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  for (const p of roster) { assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), p.name); assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`); }
  const ovrs = roster.map(p => p.ovr);
  assert.equal(pack.range, `${Math.min(...ovrs)}–${Math.max(...ovrs)}`);
  assert.equal(logo('V. van Dijk'), logo('F. Chiesa'));
  assert.equal(logo('Vini Jr.'), logo('J. Bellingham'));
  assert.equal(logo('J. Grealish'), '/assets/clubs/everton.webp');
  assert.equal(logo('Y. Moukoko'), '/assets/clubs/fc-copenhagen.webp');
});

test('Gói FC AMBASSADOR mở được, mỗi thẻ đều rút được, gói khác không ra nhầm', () => {
  assert.equal(isPackAvailable(pack), true);
  roster.forEach(player => assert.equal(draw(pack, rngFor(pack, player.id)).playerId, player.id));
  const result = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(result.cards.every(c => getPlayer(c).tier === 'amb'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  for (const other of packs.filter(p => p.id !== 'amb' && !p.seasons?.includes('amb') && isPackAvailable(p))) for (let i = 0; i < 50; i++) { const card = draw(other); assert.notEqual(getPlayer(card).tier, 'amb'); }
});