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

const roster = players.filter(p => p.tier === 'ep24');
const base = defaultPacks.find(p => p.id === 'ep24')!;
const logos: Record<string, string> = clubLogos;

// Mùa 24EP (24 ENERGETIC PLAYER): ảnh gói, ảnh nền đường hầm, logo mùa và 208 thẻ.
test('Mùa 24EP có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% 24EP', () => {
  assert.ok(TIERS.includes('ep24'));
  assert.ok((SEASON_IDS as readonly string[]).includes('ep24'));
  assert.equal(seasons.ep24, '24EP');
  assert.equal(seasonShort('ep24'), '24EP');
  assert.equal(base.name, '24EP (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'ep24' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/ep24-tunnel.webp');
  for (const file of ['ep24-back.png', 'ep24-back.webp', 'ep24-team.png', 'ep24-team.webp', 'ep24-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('208 thẻ 24EP: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 208);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 208 }, (_, i) => 2324 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    // Thẻ in logo mùa 24EP dùng logo mùa; mọi thẻ in logo CLB đều có logo CLB thật.
    const logo = getTeamLogo(p);
    assert.ok(logo && existsSync(`public${logo}`), `logo ${p.name}`);
    assert.equal(logo === '/assets/ep24-team.webp', p.club === '24 Energetic Player', `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Họ công thức "117 · ×1" của bp2 có mức sàn theo OVR: giá vẫn phải tăng sau mỗi 2 cấp.
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Andreas Pereira')!.id, level: 1 }).price, 946_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'M. Ruggeri')!.id, level: 1 }).price, 30_800);
  assert.deepEqual(roster.map(p => p.ovr), [...roster.map(p => p.ovr)].sort((a, b) => b - a));
  assert.equal(roster.find(p => p.name === 'Y. Wissa')!.flag, 'CD');
  assert.equal(roster.find(p => p.name === 'B. Djimsiti')!.flag, 'AL');
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'R. Doan')!.id, level: 1 }).price, 439_000);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'Tuta')!), '/assets/ep24-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'M. Kudus')!), '/assets/clubs/tottenham.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'N. Atubolu')!), '/assets/clubs/freiburg.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'K. Müller')!), `/assets/${logos['Schalke'].slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'M. Locatelli')!), getTeamLogo(players.find(p => p.tier === 'spt' && p.name === 'M. Locatelli')!));
});

test('Gói 24EP mở bán, mỗi thẻ 24EP đều rút được và chỉ ra thẻ 24EP; mua, mở, lưu được', () => {
  const ep24 = allPacks.find(p => p.id === 'ep24') ?? base;
  assert.equal(isPackAvailable(ep24), true);
  assert.equal(packOdds(ep24).pool.length, 208);
  for (const player of roster) assert.equal(draw(ep24, rngFor(ep24, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), ep24, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'ep24'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});
