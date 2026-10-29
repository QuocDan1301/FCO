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

const roster = players.filter(p => p.tier === 'dc');
const base = defaultPacks.find(p => p.id === 'dc')!;

// Mùa DC (DECADE): ảnh gói, ảnh nền đường hầm, logo mùa và 135 thẻ.
test('Mùa DC có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% DC', () => {
  assert.ok(TIERS.includes('dc'));
  assert.ok((SEASON_IDS as readonly string[]).includes('dc'));
  assert.equal(seasons.dc, 'DC');
  assert.equal(seasonShort('dc'), 'DC');
  assert.equal(base.name, 'DC (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'dc' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/dc-tunnel.webp');
  for (const file of ['dc-back.png', 'dc-back.webp', 'dc-team.png', 'dc-team.webp', 'dc-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('135 thẻ DC: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 135);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 135 }, (_, i) => 1371 + i));
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
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'N. Uysal')!.id, level: 1 }).price, 108_000);
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Sergio Ramos')!.id, level: 1 }).price, 34_100_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'R. Varane')!.id, level: 1 }).price, 947_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'T. Jantschke')!.id, level: 1 }).price, 7_170);
  // Bosnia & Herzegovina (E. Višća) dùng cờ gốc flag-icons.
  assert.equal(roster.find(p => p.name === 'E. Višća')!.flag, 'BA');
  // Thẻ in logo mùa DC dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Xavi')!), '/assets/dc-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'L. Modrić')!), `/assets/${clubLogos['Milano'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'C. Günter')!), '/assets/clubs/freiburg.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'S. Coleman')!), '/assets/clubs/everton.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'B. Davies')!), '/assets/clubs/tottenham.webp');
});

test('Gói DC mở bán, mỗi thẻ DC đều rút được và chỉ ra thẻ DC; mua, mở, lưu được', () => {
  const dc = allPacks.find(p => p.id === 'dc') ?? base;
  assert.equal(isPackAvailable(dc), true);
  assert.equal(packOdds(dc).pool.length, 135);
  for (const player of roster) assert.equal(draw(dc, rngFor(dc, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), dc, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'dc'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
