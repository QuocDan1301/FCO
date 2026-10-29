import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, allPacks, defaultPacks, draw, getPlayer, isPackAvailable, openPacks, ovr, packOdds, players, seasons, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'hg');
const source = readFileSync('scripts/data/hg.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'hg')!;

test('HG season and published pack carry all supplied artwork', () => {
  assert.ok(TIERS.includes('hg'));
  assert.ok((SEASON_IDS as readonly string[]).includes('hg'));
  assert.equal(seasons.hg, 'HG');
  assert.equal(seasonShort('hg'), 'HG');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'hg' ? 100 : 0));
  assert.equal(base.range, '103–111');
  for (const path of [base.back, base.tunnel, '/assets/hg-team.webp']) assert.ok(path && existsSync(`public${path}`));
});

test('116 distinct HG cards match screenshot order, OVR, wages and +1 prices', () => {
  assert.equal(roster.length, 116);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 116);
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club, price] = source[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `crest ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
    assert.equal(marketQuote({ playerId: p.id, level: 1 }).price, Number(price), name);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
    prices.slice(2).forEach((v, j) => assert.ok(v! > prices[j]!, name));
  }
  assert.equal(roster.find(p => p.name === 'M. Arnold')!.id, 2951);
  assert.equal(marketQuote({ playerId: 2951, level: 1 }).price, 26400);
});

test('HG pack can draw every HG player, open and persist', () => {
  const pack = allPacks.find(p => p.id === 'hg')!;
  assert.ok(pack && isPackAvailable(pack));
  assert.equal(packOdds(pack).pool.length, 116);
  for (const p of roster) assert.equal(draw(pack, rngFor(pack, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), pack, 15, Math.random, true);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'hg'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
});
