import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, draw, getPlayer, isPackAvailable, openPacks, ovr, packOdds, players, seasons, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'hr26');
const source = readFileSync('scripts/data/hr26.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'hr26')!;

test('Mùa 26HR có đủ ảnh gói, hầm, huy hiệu mùa và nhãn', () => {
  assert.ok(TIERS.includes('hr26'));
  assert.ok((SEASON_IDS as readonly string[]).includes('hr26'));
  assert.equal(seasons.hr26, '26HR');
  assert.equal(seasonShort('hr26'), '26HR');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'hr26' ? 100 : 0));
  assert.equal(base.range, '118–122');
  for (const path of [base.back, base.tunnel, '/assets/hr26-team.webp', '/assets/seasons/hr26.webp']) assert.ok(path && existsSync(`public${path}`), path);
});

test('9 thẻ 26HR khớp danh sách (thứ tự ảnh, OVR, vị trí, lương, cờ), có ảnh riêng, logo mùa và giá tăng theo cấp', () => {
  assert.equal(roster.length, 9);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 9);
  assert.deepEqual([roster[0].id, roster.at(-1)!.id], [3959, 3967]);
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club] = source[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.equal(getTeamLogo(p), p.teamLogo, `logo mùa ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
    prices.slice(2).forEach((v, j) => assert.ok(v! > prices[j]!, name));
  }
  assert.equal(roster[0].name, 'Iván Zamorano');
  assert.equal(roster.at(-1)!.name, 'M. Richards');
});

test('Gói 26HR ra đủ 9 cầu thủ, mở và lưu được', () => {
  assert.ok(isPackAvailable(base));
  assert.equal(packOdds(base).pool.length, 9);
  for (const p of roster) assert.equal(draw(base, rngFor(base, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), base, 15, Math.random);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'hr26'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
});
