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
import clubLogos from '../src/clubLogos.json';

const roster = players.filter(p => p.tier === 'ptg');
const base = defaultPacks.find(p => p.id === 'ptg')!;
const logos: Record<string, string> = clubLogos;
const FREE = ['M. Depay', 'M. Arnautović', 'J. Arias', 'C. Montes', 'Neymar Jr'];

// Mùa PTG (PATH TO GLORY): ảnh gói, ảnh nền đường hầm và 165 thẻ.
test('Mùa PTG có tên, nhãn, ảnh gói / đường hầm và gói gốc 100% PTG', () => {
  assert.ok(TIERS.includes('ptg'));
  assert.ok((SEASON_IDS as readonly string[]).includes('ptg'));
  assert.equal(seasons.ptg, 'PTG');
  assert.equal(seasonShort('ptg'), 'PTG');
  assert.equal(base.name, 'PTG (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'ptg' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/ptg-tunnel.webp');
  for (const file of ['ptg-back.png', 'ptg-back.webp', 'ptg-tunnel.webp', 'ptg-free-team.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('165 thẻ PTG: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 165);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 165 }, (_, i) => 2532 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    // Thẻ cầu thủ tự do dùng khiên xám in trên thẻ; mọi thẻ khác dùng logo CLB thật.
    const logo = getTeamLogo(p);
    assert.ok(logo && existsSync(`public${logo}`), `logo ${p.name}`);
    assert.equal(logo === '/assets/ptg-free-team.webp', p.club === 'Tự do', `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.deepEqual(roster.filter(p => p.club === 'Tự do').map(p => p.name), FREE);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Pedri')!.id, level: 1 }).price, 13_000_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'M. Almirón')!.id, level: 1 }).price, 413_000);
  assert.deepEqual(roster.map(p => p.ovr), [...roster.map(p => p.ovr)].sort((a, b) => b - a));
  assert.equal(roster.find(p => p.name === 'M. Al Tamari')!.flag, 'JO');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'M. Taremi')!), `/assets/${logos['Olympiacos'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'C. Romero')!), '/assets/clubs/tottenham.webp');
});

test('Gói PTG mở bán, mỗi thẻ PTG đều rút được và chỉ ra thẻ PTG; mua, mở, lưu được', () => {
  const ptg = allPacks.find(p => p.id === 'ptg') ?? base;
  assert.equal(isPackAvailable(ptg), true);
  assert.equal(packOdds(ptg).pool.length, 165);
  for (const player of roster) assert.equal(draw(ptg, rngFor(ptg, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), ptg, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'ptg'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
