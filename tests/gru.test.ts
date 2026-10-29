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

const roster = players.filter(p => p.tier === 'gru');
const base = defaultPacks.find(p => p.id === 'gru')!;

// Mùa GRU (GREATEST RUNNER-UPS): ảnh gói, ảnh nền đường hầm, logo mùa và 176 thẻ.
test('Mùa GRU có tên, nhãn, ảnh gói / đường hầm / logo mùa và gói gốc 100% GRU', () => {
  assert.ok(TIERS.includes('gru'));
  assert.ok((SEASON_IDS as readonly string[]).includes('gru'));
  assert.equal(seasons.gru, 'GRU');
  assert.equal(seasonShort('gru'), 'GRU');
  assert.equal(base.name, 'GRU (ALL)');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'gru' ? 100 : 0));
  assert.equal(base.weights.length, TIERS.length);
  assert.equal(base.tunnel, '/assets/gru-tunnel.webp');
  for (const file of ['gru-back.png', 'gru-back.webp', 'gru-team.png', 'gru-team.webp', 'gru-tunnel.webp']) assert.ok(existsSync(`public/assets/${file}`), file);
});

test('176 thẻ GRU: ID riêng, đủ ảnh thẻ / logo đội / cờ, giá +1…+13 tăng dần, OVR khớp khoảng gói', () => {
  assert.equal(roster.length, 176);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 176 }, (_, i) => 1060 + i));
  assert.equal(new Set(roster.map(p => p.cardFace)).size, roster.length);
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `ảnh ${p.name}`);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `cờ ${p.name}`);
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(price => price !== null && price > 0), `giá ${p.name}`);
    // Giá +2…+13 theo họ công thức "117 · ×1" của bp2: ở OVR 110–111 mức sàn +3 thấp hơn mức sàn +2 nên +3 có thể rẻ hơn +2;
    // ở OVR 105 mức sàn +9 thấp hơn +8 một chút (S. Özcan, M. Haïdara, J. Drommel) nên +9 chỉ so với +7.
    prices.slice(1).forEach((price, i) => assert.ok(i === 1 || (i === 7 && p.ovr === 105) ? price! > prices[i - 1]! : price! > prices[i]!, `${p.name} +${i + 2}`));
  }
  const values = roster.map(p => ovr({ playerId: p.id, level: 1 }));
  assert.equal(base.range, `${Math.min(...values)}–${Math.max(...values)}`);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'L. Messi')!.id, level: 1 }).price, 8_290_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'Z. Zidane')!.id, level: 1 }).price, 6_300_000);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'D. Machado')!.id, level: 1 }).price, 5_960);
  // Trang giá cuối (gửi sau): 11 thẻ OVR 105–107.
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'A. Florenzi')!.id, level: 1 }).price, 45_800);
  assert.equal(marketQuote({ playerId: roster.find(p => p.name === 'J. Drommel')!.id, level: 1 }).price, 23_100);
  // Hai thẻ "R. Keane" là hai người khác nhau (Roy CDM, Robbie CF), mỗi thẻ một ảnh.
  assert.deepEqual(roster.filter(p => p.name === 'R. Keane').map(p => p.pos), ['CDM', 'CF']);
  // Thẻ in logo mùa GRU dùng logo mùa; thẻ in logo CLB có sẵn dùng logo CLB.
  assert.equal(getTeamLogo(roster.find(p => p.name === 'S. Gerrard')!), '/assets/gru-team.webp');
  assert.equal(getTeamLogo(roster.find(p => p.name === 'V. van Dijk')!), `/assets/${clubLogos.Liverpool.slice('/assets/'.length)}`);
  assert.equal(getTeamLogo(roster.find(p => p.name === 'K. Danso')!), '/assets/clubs/tottenham.webp');
});

test('Gói GRU mở bán, mỗi thẻ GRU đều rút được và chỉ ra thẻ GRU; mua, mở, lưu được', () => {
  const gru = allPacks.find(p => p.id === 'gru') ?? base;
  assert.equal(isPackAvailable(gru), true);
  assert.equal(packOdds(gru).pool.length, 176);
  for (const player of roster) assert.equal(draw(gru, rngFor(gru, player.id)).playerId, player.id, player.name);
  const opened = openPacks(initialSave(), gru, 15, Math.random, true);
  assert.ok(opened.cards.every(card => getPlayer(card).tier === 'gru'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
});