import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { draw, getPlayer, initialSave, isPackAvailable, openPacks, packs, players, seasons, TIERS, validateSave } from '../src/game.ts';
import { getTeamLogo } from '../src/teamLogos.ts';

const pack = packs.find(p => p.id === 'mdl')!;
const roster = players.filter(p => p.tier === 'mdl');
const logo = (name: string) => getTeamLogo(roster.find(p => p.name === name)!);

test('Gói MEDALIST (ALL) ra 100% mùa MEDALIST, có mặt sau thẻ và logo mùa', () => {
  assert.equal(pack.name, 'MEDALIST (ALL)');
  assert.equal(seasons.mdl, 'MEDALIST');
  assert.deepEqual(pack.weights, [0, 0, 0, 0, 0, 0, 100, 0]);
  assert.equal(pack.weights.length, TIERS.length);
  assert.equal(pack.tunnel, '/assets/mdl-tunnel.webp');
  for (const file of ['mdl-back.png', 'mdl-team.png', 'mdl-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('40 thẻ MEDALIST: không trùng tên / ID, ảnh tồn tại, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 40);
  assert.equal(new Set(roster.map(p => p.name)).size, 40, 'Ảnh S. Gnabry gửi hai lần chỉ thêm một thẻ');
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  for (const p of roster) assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), p.name);
  const ovrs = roster.map(p => p.ovr);
  assert.equal(pack.range, `${Math.min(...ovrs)}–${Math.max(...ovrs)}`);
});

test('Logo đội MEDALIST theo logo in ở góc dưới phải từng thẻ', () => {
  for (const name of ['Riquelme', 'Ronaldo', 'C. Puyol', 'R. Bauer', 'Park Chu Young']) assert.equal(logo(name), '/assets/mdl-team.png', name);
  assert.equal(logo('Pedri'), logo('Dani Olmo'));
  assert.equal(logo('J. Vásquez'), '/assets/clubs/genoa.png');
  for (const name of ['Neymar Jr', 'C. Montes', 'G. Ochoa']) assert.equal(logo(name), undefined, `${name} là cầu thủ tự do`);
  for (const p of roster) { const l = getTeamLogo(p); if (l) assert.ok(existsSync(`public${l}`), p.name); }
});

test('Gói MEDALIST mở được, mỗi thẻ đều rút được, gói khác không ra nhầm thẻ MEDALIST', () => {
  assert.equal(isPackAvailable(pack), true);
  roster.forEach((player, i) => assert.equal(draw(pack, () => (i + .5) / roster.length).playerId, player.id));
  const result = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(result.cards.every(c => getPlayer(c).tier === 'mdl'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  for (const other of packs.filter(p => p.id !== 'mdl')) for (let i = 0; i < 50; i++) { const card = draw(other); assert.notEqual(getPlayer(card).tier, 'mdl'); }
});