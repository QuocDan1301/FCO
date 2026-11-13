import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, draw, getPlayer, isPackAvailable, openPacks, packOdds, players, seasons, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote, priceAt, sellPlayer } from '../src/market.ts';
import { livePrice } from '../src/group-price.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'live');
const source = readFileSync('scripts/data/live.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const pack = defaultPacks.find(p => p.id === 'live')!;

test('Mùa LIVE có đủ ảnh gói, hầm, nhãn mùa', () => {
  assert.ok(TIERS.includes('live'));
  assert.ok((SEASON_IDS as readonly string[]).includes('live'));
  assert.equal(seasons.live, 'LIVE');
  assert.equal(seasonShort('live'), 'LIVE');
  assert.deepEqual(pack.weights, TIERS.map(t => t === 'live' ? 100 : 0));
  assert.equal(pack.range, '65–84');
  for (const path of [pack.back, pack.tunnel]) assert.ok(path && existsSync(`public${path}`));
});

test('33 thẻ LIVE khớp danh sách, mỗi thẻ có ảnh, cờ và logo CLB', () => {
  // 32 thẻ đầu + G. Vicario (id 4084) thêm 2026-11-13.
  assert.equal(roster.length, 33);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 33);
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club] = source[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
  }
});

test('Mọi thẻ LIVE: +1 đồng giá 1.000 BP, mỗi cấp nhân 2, không dao động theo kỳ', () => {
  const HOUR = 3_600_000, start = Date.UTC(2026, 10, 10);
  assert.deepEqual([livePrice(1), livePrice(2), livePrice(3), livePrice(13)], [1000, 2000, 4000, 4_096_000]);
  for (const p of roster) {
    for (let level = 1; level <= 13; level++) {
      const card = { playerId: p.id, level }, expected = 1000 * 2 ** (level - 1);
      assert.equal(marketQuote(card).price, expected, `${p.name} +${level}`);
      for (let period = 0; period < 6; period++) assert.equal(priceAt(card, start + period * 5 * HOUR), expected);
    }
  }
});

test('Gói LIVE ra đủ 33 cầu thủ, mở và bán được', () => {
  assert.ok(isPackAvailable(pack));
  assert.equal(packOdds(pack).pool.length, 33);
  for (const p of roster) assert.equal(draw(pack, rngFor(pack, p.id)).playerId, p.id, p.name);
  const opened = openPacks({ ...initialSave(), unopened: { ...initialSave().unopened, live: 15 } }, pack, 15, Math.random);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'live'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
  const sold = sellPlayer({ ...initialSave(), balance: 0, cards: opened.cards }, opened.cards[0].uid);
  assert.equal(sold.state.balance, 600);
});
