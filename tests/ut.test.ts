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

const roster = players.filter(p => p.tier === 'ut');
const base = defaultPacks.find(p => p.id === 'ut')!;

// Mùa UT (UNEXPECTED TRANSFER): ảnh gói, ảnh nền đường hầm, logo mùa và 134 thẻ.
test('Mùa UT có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% UT', () => {
  assert.ok(TIERS.includes('ut'));
  assert.ok((SEASON_IDS as readonly string[]).includes('ut'));
  assert.equal(seasons.ut, 'UT');
  assert.equal(seasonShort('ut'), 'UT');
  assert.equal(base.name, 'UT (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'ut' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/ut-tunnel.webp');
  for (const file of ['ut-back.png', 'ut-back.webp', 'ut-team.png', 'ut-team.webp', 'ut-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('134 thẻ UT: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 134);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 134 }, (_, i) => 759 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Giá +2…+13 theo họ công thức "117 · ×1" của bp2: ở OVR 110–111 mức sàn +3 thấp hơn mức sàn +2 nên +3 có thể rẻ hơn +2
    // (De Sciglio, Kessié); các cấp còn lại tăng dần.
    prices.slice(1).forEach((price, i) => assert.ok(i === 1 ? price! > prices[0]! : price! > prices[i]!, `${p.name} +${i + 2}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Ronaldo')!.id, level: 1 }).price, 1_740_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Sergio Ramos')!.id, level: 1 }).price, 27_400_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'S. Rode')!.id, level: 1 }).price, 21_100);
  // Thẻ in logo mùa UT dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'R. Ferdinand')!), '/assets/ut-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'K. Mbappé')!), `/assets/${clubLogos.Madrid.slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'F. Bernardeschi')!), '/assets/clubs/bologna.webp');
});

test('Gói UT mở bán, mỗi thẻ UT đều rút được và chỉ ra thẻ UT; mua, mở, lưu được', () => {
  const ut = allPacks.find(p => p.id === 'ut') ?? base;
  assert.equal(isPackAvailable(ut), true);
  assert.equal(packOdds(ut).pool.length, 134);
  for (const player of roster) assert.equal(draw(ut, rngFor(ut, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), ut, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'ut'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});