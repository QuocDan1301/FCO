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

const roster = players.filter(p => p.tier === 'cu');
const base = defaultPacks.find(p => p.id === 'cu')!;

// Mùa CU (CHAMPIONS OF EUROPE): ảnh gói, ảnh nền đường hầm, logo mùa và 167 thẻ.
test('Mùa CU có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% CU', () => {
  assert.ok(TIERS.includes('cu'));
  assert.ok((SEASON_IDS as readonly string[]).includes('cu'));
  assert.equal(seasons.cu, 'CU');
  assert.equal(seasonShort('cu'), 'CU');
  assert.equal(base.name, 'CU (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'cu' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/cu-tunnel.webp');
  for (const file of ['cu-back.png', 'cu-back.webp', 'cu-team.png', 'cu-team.webp', 'cu-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('167 thẻ CU: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 167);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 167 }, (_, i) => 893 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Giá +2…+13 theo họ công thức "117 · ×1" của bp2: ở OVR 110–111 mức sàn +3 thấp hơn mức sàn +2 nên +3 có thể rẻ hơn +2.
    prices.slice(1).forEach((price, i) => assert.ok(i === 1 ? price! > prices[0]! : price! > prices[i]!, `${p.name} +${i + 2}`));
  }
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Kaká')!.id, level: 1 }).price, 4_600_000);
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'P. Maldini')!.id, level: 1 }).price, 2_310_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'G. Bale')!.id, level: 1 }).price, 1_067_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Emerson')!.id, level: 1 }).price, 34_500);
  // Thẻ in logo mùa CU dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'B. Lizarazu')!), '/assets/cu-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'V. van Dijk')!), `/assets/${clubLogos.Liverpool.slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'J. Grealish')!), '/assets/clubs/everton.webp');
});

test('Gói CU mở bán, mỗi thẻ CU đều rút được và chỉ ra thẻ CU; mua, mở, lưu được', () => {
  const cu = allPacks.find(p => p.id === 'cu') ?? base;
  assert.equal(isPackAvailable(cu), true);
  assert.equal(packOdds(cu).pool.length, 167);
  for (const player of roster) assert.equal(draw(cu, rngFor(cu, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), cu, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'cu'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});