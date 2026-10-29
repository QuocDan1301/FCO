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

const roster = players.filter(p => p.tier === 'uc');
const base = defaultPacks.find(p => p.id === 'uc')!;

// Mùa UC (UNTOUCHABLE CHAMPIONS): ảnh gói, ảnh nền đường hầm, logo mùa và 112 thẻ.
test('Mùa UC có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% UC', () => {
  assert.ok(TIERS.includes('uc'));
  assert.ok((SEASON_IDS as readonly string[]).includes('uc'));
  assert.equal(seasons.uc, 'UC');
  assert.equal(seasonShort('uc'), 'UC');
  assert.equal(base.name, 'UC (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'uc' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/uc-tunnel.webp');
  for (const file of ['uc-back.png', 'uc-back.webp', 'uc-team.png', 'uc-team.webp', 'uc-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('112 thẻ UC: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 112);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 112 }, (_, i) => 492 + i));
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    prices.slice(1).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 2}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'L. Messi')!.id, level: 1 }).price, 670_000_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'C. Jones')!.id, level: 1 }).price, 752_000);
  // Thẻ in logo mùa UC dùng logo mùa; thẻ in logo CLB dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'G. Chiellini')!), '/assets/uc-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'F. Wirtz')!), `/assets/${clubLogos.Liverpool.slice('/assets/'.length)}`);
});

test('Gói UC mở bán, mỗi thẻ UC đều rút được và chỉ ra thẻ UC; mua, mở, lưu được', () => {
  const uc = allPacks.find(p => p.id === 'uc') ?? base;
  assert.equal(isPackAvailable(uc), true);
  assert.equal(packOdds(uc).pool.length, 112);
  for (const player of roster) assert.equal(draw(uc, rngFor(uc, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), uc, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'uc'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
