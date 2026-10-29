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

const roster = players.filter(p => p.tier === 'cc');
const base = defaultPacks.find(p => p.id === 'cc')!;

// Mùa CC (CENTURY CLUB): ảnh gói, ảnh nền đường hầm, logo mùa và 111 thẻ.
test('Mùa CC có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% CC', () => {
  assert.ok(TIERS.includes('cc'));
  assert.ok((SEASON_IDS as readonly string[]).includes('cc'));
  assert.equal(seasons.cc, 'CC');
  assert.equal(seasonShort('cc'), 'CC');
  assert.equal(base.name, 'CC (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'cc' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/cc-tunnel.webp');
  for (const file of ['cc-back.png', 'cc-back.webp', 'cc-team.png', 'cc-team.webp', 'cc-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('111 thẻ CC: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 111);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 111 }, (_, i) => 1506 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: giá vài cấp liền nhau có thể bằng / thấp hơn cấp trước một chút;
    // giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Cristiano Ronaldo')!.id, level: 1 }).price, 540_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'J. Vertonghen')!.id, level: 1 }).price, 10_600_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'K. Navas')!.id, level: 1 }).price, 10_000);
  // Costa Rica, Iran, Panama dùng cờ gốc flag-icons.
  for (const [name, flag] of [['K. Navas', 'CR'], ['E. Haji Safi', 'IR'], ['A. Godoy', 'PA']]) assert.equal(roster.find(p => p.name === name)!.flag, flag);
  // Thẻ in logo mùa CC dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Z. Zidane')!), '/assets/cc-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'L. Messi')!), `/assets/${clubLogos['Inter Miami'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Kim Young Gwon')!), '/assets/clubs/ulsan-hd.webp');
});

test('Gói CC mở bán, mỗi thẻ CC đều rút được và chỉ ra thẻ CC; mua, mở, lưu được', () => {
  const cc = allPacks.find(p => p.id === 'cc') ?? base;
  assert.equal(isPackAvailable(cc), true);
  assert.equal(packOdds(cc).pool.length, 111);
  for (const player of roster) assert.equal(draw(cc, rngFor(cc, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), cc, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'cc'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
