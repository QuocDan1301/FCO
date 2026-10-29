import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TIERS, allPacks, defaultPacks, draw, getPlayer, isPackAvailable, openPacks, ovr, packOdds, players, seasons, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'wg');
const base = defaultPacks.find(p => p.id === 'wg')!;

// Mùa WG (WARRIORS OF GLORY): ảnh gói, ảnh nền đường hầm, logo mùa và 155 thẻ.
test('Mùa WG có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% WG', () => {
  assert.ok(TIERS.includes('wg'));
  assert.ok((SEASON_IDS as readonly string[]).includes('wg'));
  assert.equal(seasons.wg, 'WG');
  assert.equal(seasonShort('wg'), 'WG');
  assert.equal(base.name, 'WG (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'wg' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/wg-tunnel.webp');
  for (const file of ['wg-back.png', 'wg-back.webp', 'wg-team.png', 'wg-team.webp', 'wg-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('155 thẻ WG: ID riêng, đủ ảnh thẻ / logo mùa / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 155);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 155 }, (_, i) => 604 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.equal(getTeamLogo(p), '/assets/wg-team.webp', `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    prices.slice(1).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 2}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Ronaldo')!.id, level: 1 }).price, 138_000_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'D. Forlán')!.id, level: 1 }).price, 4_200_000);
  // Hai thẻ "R. Keane" là hai người khác nhau (Robbie Keane ST, Roy Keane CM), mỗi thẻ một ảnh.
  assert.deepEqual(roster.filter(p => p.name === 'R. Keane').map(p => p.pos), ['ST', 'CM']);
});

test('Gói WG mở bán, mỗi thẻ WG đều rút được và chỉ ra thẻ WG; mua, mở, lưu được', () => {
  const wg = allPacks.find(p => p.id === 'wg') ?? base;
  assert.equal(isPackAvailable(wg), true);
  assert.equal(packOdds(wg).pool.length, 155);
  for (const player of roster) assert.equal(draw(wg, rngFor(wg, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), wg, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'wg'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
