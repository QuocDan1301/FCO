import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TIERS, defaultPacks, allPacks, players, seasons, packOdds, draw, openPacks, getPlayer, validateSave, ovr } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote, buyPlayer, sellPlayer } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'bdo');
const base = defaultPacks.find(p => p.id === 'bdo')!;
const pack = (allPacks.find(p => p.id === 'bdo') ?? defaultPacks.find(p => p.id === 'bdo')!);

test('BDO: 108 unique players, correct source metadata and complete assets', () => {
  assert.equal(roster.length, 108);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 108 }, (_, i) => 2021 + i));
  assert.equal(roster.find(p => p.name === 'R. Ferdinand')!.pos, 'CB');
  assert.equal(roster.filter(p => p.name === 'M. Essien').length, 1);
  assert.equal(roster.find(p => p.name === 'G. Best')!.flag, 'NI');
  for (const p of roster) {
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), `image: ${p.name}`);
    assert.equal(getTeamLogo(p), '/assets/bdo-team.webp');
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), `flag: ${p.name}`);
  }
  for (const asset of [base.back!, base.tunnel!, '/assets/bdo-team.webp', '/assets/bdo-back.webp']) assert.ok(existsSync(`public${asset}`), asset);
});

test('BDO is published, supports custom packs and every player can be drawn and saved', () => {
  assert.ok(TIERS.includes('bdo'));
  assert.ok(SEASON_IDS.includes('bdo'));
  assert.equal(seasons.bdo, 'BDO');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'bdo' ? 100 : 0));
  assert.equal(packOdds(pack).pool.length, 108);
  assert.equal(base.range, '102–118');
  for (const p of roster) assert.equal(draw(pack, rngFor(pack, p.id)).playerId, p.id);
  const opened = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'bdo'));
  assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
  assert.equal(ovr({ playerId: roster[0].id, level: 13 }), 145);
});

test('BDO screenshot prices and bp2 higher-level quotes support market trades', () => {
  assert.equal(marketQuote({ playerId: 2021, level: 1 }).price, 11_400_000);
  assert.equal(marketQuote({ playerId: 2022, level: 1 }).price, 75_400_000);
  assert.equal(marketQuote({ playerId: 2119, level: 1 }).price, 69_700);
  assert.equal(marketQuote({ playerId: 2128, level: 1 }).price, 6_680);
  for (const p of roster) {
    const prices = Array.from({ length: 13 }, (_, i) => marketQuote({ playerId: p.id, level: i + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), p.name);
    prices.slice(2).forEach((price, i) => assert.ok(price! > prices[i]!, `${p.name} +${i + 3}`));
  }
  const bought = buyPlayer(initialSave(), 2021, 5, true);
  const sold = sellPlayer(bought.state, bought.card.uid, true);
  assert.equal(sold.state.cards.some(c => c.uid === bought.card.uid), false);
});
