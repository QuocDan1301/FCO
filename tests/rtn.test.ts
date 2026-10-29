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

const roster = players.filter(p => p.tier === 'rtn');
const base = defaultPacks.find(p => p.id === 'rtn')!;

// Mùa RTN (RETURNEES): ảnh gói, ảnh nền đường hầm, logo mùa và 135 thẻ.
test('Mùa RTN có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% RTN', () => {
  assert.ok(TIERS.includes('rtn'));
  assert.ok((SEASON_IDS as readonly string[]).includes('rtn'));
  assert.equal(seasons.rtn, 'RTN');
  assert.equal(seasonShort('rtn'), 'RTN');
  assert.equal(base.name, 'RTN (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'rtn' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/rtn-tunnel.webp');
  for (const file of ['rtn-back.png', 'rtn-back.webp', 'rtn-team.png', 'rtn-team.webp', 'rtn-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('135 thẻ RTN: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 135);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 135 }, (_, i) => 1236 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: ở OVR thấp, giá vài cấp liền nhau có thể bằng / thấp hơn cấp trước một chút;
    // giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Mariano')!.id, level: 1 }).price, 155_000);
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'S. Effenberg')!.id, level: 1 }).price, 1_010_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'M. Stekelenburg')!.id, level: 1 }).price, 26_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Fidel')!.id, level: 1 }).price, 2_900);
  // Thẻ in logo mùa RTN dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'R. Gullit')!), '/assets/rtn-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Rodri')!), `/assets/${clubLogos['Manchester Xanh'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'M. Ginter')!), '/assets/clubs/freiburg.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'F. Đuričić')!), '/assets/clubs/panathinaikos.webp');
});

test('Gói RTN mở bán, mỗi thẻ RTN đều rút được và chỉ ra thẻ RTN; mua, mở, lưu được', () => {
  const rtn = allPacks.find(p => p.id === 'rtn') ?? base;
  assert.equal(isPackAvailable(rtn), true);
  assert.equal(packOdds(rtn).pool.length, 135);
  for (const player of roster) assert.equal(draw(rtn, rngFor(rtn, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), rtn, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'rtn'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});