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

const roster = players.filter(p => p.tier === 'hr25');
const source = readFileSync('scripts/data/hr25.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'hr25')!;

test('25HR season and published pack carry all supplied artwork', () => {
  assert.ok(TIERS.includes('hr25'));
  assert.ok((SEASON_IDS as readonly string[]).includes('hr25'));
  assert.equal(seasons.hr25, '25HR');
  assert.equal(seasonShort('hr25'), '25HR');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'hr25' ? 100 : 0));
  assert.equal(base.range, '112–118');
  for (const path of [base.back, base.tunnel, '/assets/hr25-team.webp']) assert.ok(path && existsSync(`public${path}`));
});

test('20 distinct 25HR cards match screenshot order, OVR, wages and +1 prices', () => {
  assert.equal(roster.length, 20);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 20);
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
  assert.equal(roster[0].name, 'E. Hazard');
  assert.equal(marketQuote({ playerId: roster[0].id, level: 1 }).price, 22600000);
  assert.equal(roster.at(-1)!.name, 'M. Noor');
});

test('25HR pack can draw every 25HR player, open and persist', () => {
  const pack = (allPacks.find(p => p.id === 'hr25') ?? defaultPacks.find(p => p.id === 'hr25')!);
  assert.ok(pack && isPackAvailable(pack));
  assert.equal(packOdds(pack).pool.length, 20);
  for (const p of roster) assert.equal(draw(pack, rngFor(pack, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), pack, 15, Math.random);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'hr25'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
});
