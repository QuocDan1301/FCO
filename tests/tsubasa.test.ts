import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, packs, draw, getPlayer, isPackAvailable, openPacks, ovr, packOdds, players, seasons, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { rngFor } from './pack-rng.ts';

const roster = players.filter(p => p.tier === 'tsubasa');
const source = readFileSync('scripts/data/tsubasa.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'tsubasa')!;

test('Mùa TSUBASA có đủ ảnh gói, hầm, huy hiệu mùa và nhãn', () => {
  assert.ok(TIERS.includes('tsubasa'));
  assert.ok((SEASON_IDS as readonly string[]).includes('tsubasa'));
  assert.equal(seasons.tsubasa, 'TSUBASA');
  assert.equal(seasonShort('tsubasa'), 'TSUBASA');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'tsubasa' ? 100 : 0));
  assert.equal(base.range, '124–130');
  for (const path of [base.back, base.tunnel, '/assets/tsubasa-team.webp', '/assets/seasons/tsubasa.webp']) assert.ok(path && existsSync(`public${path}`), path);
});

test('18 thẻ TSUBASA khớp danh sách (thứ tự ảnh, OVR, vị trí, lương, cờ), có ảnh riêng, logo mùa và giá tăng theo cấp', () => {
  assert.equal(roster.length, 18);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(new Set(roster.map(p => p.cardFace)).size, 18);
  assert.deepEqual([roster[0].id, roster.at(-1)!.id], [4177, 4194]);
  for (const [i, p] of roster.entries()) {
    const [name, rating, pos, wage, flag, club] = source[i];
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${name}`);
    if (club === 'Tự do') assert.equal(getTeamLogo(p), p.teamLogo, `logo Captain Tsubasa ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
    prices.slice(2).forEach((v, j) => assert.ok(v! > prices[j]!, name));
  }
  assert.equal(roster[0].name, 'Pelé');
  assert.equal(roster.at(-1)!.name, 'F. Ljungberg');
  // Ảnh gốc ghi tên + vị trí tiếng Trung: tên dịch theo cách viết sẵn có trong game.
  assert.deepEqual(roster.map(p => p.pos), ['ST', 'LW', 'GK', 'CF', 'CAM', 'LW', 'LB', 'CM', 'ST', 'CM', 'CB', 'ST', 'CB', 'RB', 'CAM', 'CDM', 'RW', 'RM']);
  for (const p of roster) assert.ok(players.some(q => q.tier !== 'tsubasa' && q.name === p.name), `tên ${p.name} trùng cách viết mùa khác`);
});

test('Gói quà Top 2 Đua top (vqt-2) ra cầu thủ TSUBASA', () => {
  const pack = packs.find(p => p.id === 'vqt-2')!;
  assert.ok(pack.eventOnly);
  assert.equal(packOdds(pack).pool.length, 18);
});

test('Gói TSUBASA ra đủ 18 cầu thủ, mở và lưu được', () => {
  assert.ok(isPackAvailable(base));
  assert.equal(packOdds(base).pool.length, 18);
  for (const p of roster) assert.equal(draw(base, rngFor(base, p.id)).playerId, p.id, p.name);
  const opened = openPacks(initialSave(), base, 15, Math.random);
  assert.equal(opened.cards.length, 15);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'tsubasa'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(opened.state))));
});

test('Khóa giao dịch mùa EL và TSUBASA: không mua / bán ở TTCN, khoảng id máy chủ khớp đúng 2 mùa', async () => {
  const { buyPlayer, sellCards, sellPlayer, isTradeLocked, sellRange } = await import('../src/market.ts');
  const sql = readFileSync('supabase/migrations/202611130016_fco_trade_lock.sql', 'utf8');
  const ranges = [...sql.matchAll(/\('(\w+)', (\d+), (\d+)\)/g)].map(m => [m[1], +m[2], +m[3]] as const);
  assert.deepEqual(ranges.map(r => r[0]), ['EL', 'TSUBASA']);
  for (const p of players) {
    const inRange = ranges.some(([, a, b]) => p.id >= a && p.id <= b);
    assert.equal(inRange, p.tier === 'el' || p.tier === 'tsubasa', `${p.name} (${p.tier}, id ${p.id})`);
    assert.equal(isTradeLocked({ playerId: p.id }), inRange, p.name);
  }
  const rich = { ...initialSave(), balance: 9e15 };
  const el = players.find(p => p.tier === 'el')!, ts = roster[0], other = players.find(p => p.tier === 'gru')!;
  assert.throws(() => buyPlayer(rich, el.id, 1), /khóa giao dịch/);
  assert.throws(() => buyPlayer(rich, ts.id, 1), /khóa giao dịch/);
  assert.ok(buyPlayer(rich, other.id, 1).card);
  const withCard = { ...rich, cards: [{ uid: 'ts1', playerId: ts.id, level: 1, received: 1 }, ...rich.cards] };
  assert.throws(() => sellPlayer(withCard, 'ts1'), /khóa giao dịch/);
  assert.throws(() => sellCards(withCard, [{ uid: 'ts1', price: sellRange({ playerId: ts.id, level: 1 })!.price }]), /khóa giao dịch/);
  // Giá vẫn còn (giá trị đội hình / BXH / tỷ lệ gói).
  assert.ok(sellRange({ playerId: ts.id, level: 1 })!.price > 0);
});
