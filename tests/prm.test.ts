import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { draw, getPlayer, initialSave, isPackAvailable, openPacks, packs, players, seasons, TIERS, validateSave } from '../src/game.ts';
import { getTeamLogo } from '../src/teamLogos.ts';

const pack = packs.find(p => p.id === 'prm')!;
const roster = players.filter(p => p.tier === 'prm');

test('Gói PRIME (ALL) ra 100% mùa PRIME, tách khỏi INFINITE PRIME, có nền hầm, mặt sau và logo', () => {
  assert.equal(pack.name, 'PRIME (ALL)');
  assert.equal(seasons.prm, 'PRIME');
  assert.notEqual(seasons.prime, seasons.prm);
  assert.deepEqual(pack.weights, [0, 0, 0, 0, 0, 100, 0, 0]);
  assert.equal(pack.weights.length, TIERS.length);
  for (const file of ['prm-back.png', 'prm-team.png', 'prm-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
  assert.equal(pack.tunnel, '/assets/prm-tunnel.webp');
  // Logo mùa (cạnh OVR) vẫn là khiên phượng hoàng; logo đội là logo CLB riêng của từng cầu thủ.
  assert.equal(getTeamLogo({ tier: 'prm', club: 'Inter Miami' }), '/assets/clubs/20232.webp');
  assert.equal(getTeamLogo({ tier: 'prm', club: 'Việt Nam' }), '/assets/vietnam-team.webp');
  assert.notEqual(getTeamLogo({ tier: 'prm', club: 'Al Nassr' }), getTeamLogo({ tier: 'prm', club: 'Inter Miami' }));
});

test('20 thẻ PRIME: không trùng ID / tên, ảnh tồn tại, có CSS vị trí OVR và ô cấp riêng', () => {
  assert.equal(roster.length, 20);
  assert.equal(new Set(roster.map(p => p.name)).size, 20, 'Ảnh L. Suárez gửi hai lần chỉ thêm một thẻ');
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  const css = readFileSync('src/prm-cards.css', 'utf8');
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), p.name);
    assert.ok(p.ovr >= 119 && p.ovr <= 126, `${p.name} ${p.ovr}`);
    assert.match(css, new RegExp(`\\.face-${p.id}\\{--prm-ovr-x:`), `CSS ${p.name}`);
  }
  const ovrs = roster.map(p => p.ovr);
  assert.equal(pack.range, `${Math.min(...ovrs)}–${Math.max(...ovrs)}`);
});

test('Gói PRIME mở được, mỗi thẻ đều rút được, gói khác không ra nhầm thẻ PRIME', () => {
  assert.equal(isPackAvailable(pack), true);
  roster.forEach((player, i) => assert.equal(draw(pack, () => (i + .5) / roster.length).playerId, player.id));
  const result = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(result.cards.every(c => getPlayer(c).tier === 'prm'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
  for (const other of packs.filter(p => p.id !== 'prm')) for (let i = 0; i < 50; i++) { const card = draw(other); assert.notEqual(getPlayer(card).tier, 'prm'); }
});
test('Logo đội mùa PRIME theo logo in ở góc dưới phải từng thẻ', () => {
  const logo = (name: string) => getTeamLogo(roster.find(p => p.name === name)!);
  for (const name of ['Nguyễn Quang Hải', 'Maicon', 'E. Hazard', 'Lúcio', 'D. Forlán', 'C. Tévez', 'Guti', 'Nguyễn Xuân Son', 'Nguyễn Công Phượng', 'Lê Huỳnh Đức', 'Nguyễn Hoàng Đức']) assert.equal(logo(name), '/assets/prm-team.webp', name);
  assert.equal(logo('M. Reus'), '/assets/clubs/la-galaxy.webp');
  assert.equal(logo('L. Messi'), '/assets/clubs/20232.webp');
  assert.equal(logo('Cristiano Ronaldo'), logo('S. Mané'));
  for (const p of roster) assert.ok(existsSync(`public${getTeamLogo(p)}`), p.name);
});