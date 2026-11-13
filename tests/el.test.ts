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

const roster = players.filter(p => p.tier === 'el');
const source = readFileSync('scripts/data/el.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'el')!;

test('Mùa EL có đủ ảnh gói, hầm, huy hiệu mùa và nhãn', () => {
  assert.ok(TIERS.includes('el'));
  assert.ok((SEASON_IDS as readonly string[]).includes('el'));
  assert.equal(seasons.el, 'EL');
  assert.equal(seasonShort('el'), 'EL');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'el' ? 100 : 0));
  assert.equal(base.range, '127–137');
  for (const path of [base.back, base.tunnel, '/assets/el-team.webp', '/assets/seasons/el.webp']) assert.ok(path && existsSync(`public${path}`), path);
});

test('92 thẻ EL khớp danh sách (thứ tự ảnh, OVR, vị trí, lương, cờ), có ảnh riêng, logo mùa và giá tăng theo cấp', () => {
  assert.equal(roster.length, 92);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 92);
  assert.deepEqual([roster[0].id, roster.at(-1)!.id], [4085, 4176]);
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club] = source[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${name}`);
    if (club === 'Tự do') assert.equal(getTeamLogo(p), p.teamLogo, `huy hiệu Eternal Legends ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
    prices.slice(2).forEach((v, j) => assert.ok(v! > prices[j]!, name));
  }
  assert.equal(roster[0].name, 'Cristiano Ronaldo');
  assert.equal(roster.at(-1)!.name, 'L. Insigne');
});

test('Gói EL ra đủ 92 cầu thủ, mở và lưu được', () => {
  assert.ok(isPackAvailable(base));
  assert.equal(packOdds(base).pool.length, 92);
  for (const p of roster) assert.equal(draw(base, rngFor(base, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), base, 15, Math.random);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'el'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
});
