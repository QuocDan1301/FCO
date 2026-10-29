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

const roster = players.filter(p => p.tier === 'bld');
const base = defaultPacks.find(p => p.id === 'bld')!;
const logos: Record<string, string> = clubLogos;

// Mùa BLD (BEST LEGENDS): ảnh gói, ảnh nền đường hầm, logo mùa và 88 thẻ.
test('Mùa BLD có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% BLD', () => {
  assert.ok(TIERS.includes('bld'));
  assert.ok((SEASON_IDS as readonly string[]).includes('bld'));
  assert.equal(seasons.bld, 'BLD');
  assert.equal(seasonShort('bld'), 'BLD');
  assert.equal(base.name, 'BLD (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'bld' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/bld-tunnel.webp');
  for (const file of ['bld-back.png', 'bld-back.webp', 'bld-team.png', 'bld-team.webp', 'bld-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('88 thẻ BLD: ID riêng, đủ ảnh thẻ / logo CLB / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 88);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 88 }, (_, i) => 1617 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    // Mọi thẻ BLD in logo CLB thật: không thẻ nào dùng logo mùa thay logo CLB.
    const logo = getTeamLogo(p);
    assert.ok(logo && existsSync(`public${logo}`) && !logo.includes('-team.'), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: giá vài cấp liền nhau có thể bằng / thấp hơn cấp trước một chút;
    // giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'L. Messi')!.id, level: 1 }).price, 96_400_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'İ. Gündoğan')!.id, level: 1 }).price, 9_700);
  // Thẻ Aubameyang người dùng gửi hai lần: chỉ một thẻ.
  assert.equal(roster.filter(p => p.name === 'P. Aubameyang').length, 1);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'V. Osimhen')!), `/assets/${logos['Galatasaray'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'R. Kolo Muani')!), '/assets/clubs/tottenham.webp');
});

test('Gói BLD mở bán, mỗi thẻ BLD đều rút được và chỉ ra thẻ BLD; mua, mở, lưu được', () => {
  const bld = allPacks.find(p => p.id === 'bld') ?? base;
  assert.equal(isPackAvailable(bld), true);
  assert.equal(packOdds(bld).pool.length, 88);
  for (const player of roster) assert.equal(draw(bld, rngFor(bld, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), bld, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'bld'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
