import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, allPacks, players, seasons, packOdds, draw, openPacks, getPlayer, validateSave, ovr, makeCard, customPack } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote, buyPlayer, sellPlayer } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'hw23');
const base = defaultPacks.find(p => p.id === 'hw23')!;
const pack = (allPacks.find(p => p.id === 'hw23') ?? defaultPacks.find(p => p.id === 'hw23')!);
const lines = readFileSync('scripts/data/hw23.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(s => s.split('|'));

test('23HW: 195 unique players, source order, exact screenshot metadata and assets', () => {
  assert.equal(roster.length, 195);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 195);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 195 }, (_, i) => 2129 + i));
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club, price] = lines[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.equal(marketQuote({ playerId: p.id, level: 1 }).price, Number(price), p.name);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `card: ${p.name}`);
    const logo = getTeamLogo(p);
    assert.ok(logo && existsSync(`public${logo}`), `crest: ${p.name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `flag: ${p.name}`);
  }
  assert.equal(roster[0].name, 'Bruno Fernandes');
  assert.equal(roster.at(-1)!.name, 'M. Bourabia');
  assert.equal(marketQuote({ playerId: 2217, level: 1 }).price, 2_530_000);
  assert.equal(marketQuote({ playerId: 2218, level: 1 }).price, 4_200_000);
  for (const path of [base.back!, base.tunnel!, '/assets/hw23-team.webp', '/assets/hw23-back.webp']) assert.ok(existsSync(`public${path}`), path);
});

test('23HW publishes in Shop, works in mixed packs, and every player can be drawn and saved', () => {
  assert.ok(TIERS.includes('hw23'));
  assert.ok(SEASON_IDS.includes('hw23'));
  assert.equal(seasons.hw23, '23HW');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'hw23' ? 100 : 0));
  assert.equal(packOdds(pack).pool.length, 195);
  assert.equal(base.range, '103–112');
  const mixed = customPack({ id: 'hw23-bdo-test', name: 'Mixed', short: 'Mixed', title: 'Mixed', seasons: ['bdo', 'hw23'], minOvr: 110, levels: [1, 1], price: 1, description: 'Test pool', range: '110–118', back: null, published: true });
  const mixedRows = packOdds(mixed).pool;
  assert.deepEqual(new Set(mixedRows.map(row => row.player.tier)), new Set(['bdo', 'hw23']));
  assert.ok(mixedRows.every(row => row.player.ovr >= 110));
  for (const p of roster) assert.equal(draw(pack, rngFor(pack, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'hw23'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
  assert.equal(ovr({ playerId: 2129, level: 13 }), 139);
});

test('23HW has quotes +1…+13, supports market trades and preserves existing saves', () => {
  for (const p of roster) {
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), p.name);
    prices.slice(2).forEach((v, i) => assert.ok(v! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const bought = buyPlayer(initialSave(), 2129, 5, true);
  const sold = sellPlayer(bought.state, bought.card.uid, true);
  assert.equal(sold.state.cards.some(c => c.uid === bought.card.uid), false);
  const existing = initialSave();
  existing.cards.push(makeCard(2021)); // BDO card from the previous season integration.
  assert.equal(validateSave(JSON.parse(JSON.stringify(existing))), true);
});
