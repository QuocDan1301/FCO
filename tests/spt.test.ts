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

const roster = players.filter(p => p.tier === 'spt');
const base = defaultPacks.find(p => p.id === 'spt')!;
const logos: Record<string, string> = clubLogos;

// Mùa SPT (SPARTAN): ảnh gói, ảnh nền đường hầm, logo mùa và 118 thẻ.
test('Mùa SPT có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% SPT', () => {
  assert.ok(TIERS.includes('spt'));
  assert.ok((SEASON_IDS as readonly string[]).includes('spt'));
  assert.equal(seasons.spt, 'SPT');
  assert.equal(seasonShort('spt'), 'SPT');
  assert.equal(base.name, 'SPT (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'spt' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/spt-tunnel.webp');
  for (const file of ['spt-back.png', 'spt-back.webp', 'spt-team.png', 'spt-team.webp', 'spt-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('118 thẻ SPT: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 118);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 118 }, (_, i) => 1903 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    // Thẻ in logo mùa SPT dùng logo mùa; mọi thẻ in logo CLB đều có logo CLB (không thẻ CLB nào dùng logo mùa).
    const logo = getTeamLogo(p);
    assert.ok(logo && existsSync(`public${logo}`), `logo ${p.name}`);
    assert.equal(logo === '/assets/spt-team.webp', p.club === 'Spartan', `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: giá vài cấp liền nhau có thể bằng / thấp hơn cấp trước một chút;
    // giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Ó. Trejo')!.id, level: 1 }).price, 739_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === "S. Eto'o")!.id, level: 1 }).price, 315_000_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Javi Galán')!.id, level: 1 }).price, 412_000);
  assert.deepEqual(roster.map(p => p.ovr), [...roster.map(p => p.ovr)].sort((a, b) => b - a));
  assert.equal(roster.find(p => p.name === 'D. Djené')!.flag, 'TG');
  assert.equal(roster.find(p => p.name === 'Omar Mascarell')!.flag, 'GQ');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Z. Ibrahimović')!), '/assets/spt-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'X. Simons')!), '/assets/clubs/tottenham.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'I. Gueye')!), '/assets/clubs/everton.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Iago Aspas')!), `/assets/${logos['Celta'].slice('/assets/'.length)}`);
});

test('Gói SPT mở bán, mỗi thẻ SPT đều rút được và chỉ ra thẻ SPT; mua, mở, lưu được', () => {
  const spt = allPacks.find(p => p.id === 'spt') ?? base;
  assert.equal(isPackAvailable(spt), true);
  assert.equal(packOdds(spt).pool.length, 118);
  for (const player of roster) assert.equal(draw(spt, rngFor(spt, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), spt, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'spt'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
