import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, packs, draw, isPackAvailable, ovr, packOdds, players, seasons } from '../src/game.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { getTeamLogo } from '../src/teamLogos.ts';
import { marketQuote } from '../src/market.ts';
import { flagImageUrl } from '../src/flags.tsx';
import { portraitOf } from '../src/portraits.ts';
import { rngFor } from './pack-rng.ts';

// Mùa CH (CONTINENTAL HEROES, mã FC Online 845): scripts/data/ch.csv + scripts/import-ch.py (thẻ dựng từ khung trống người dùng gửi + chân dung).
const roster = players.filter(p => p.tier === 'ch');
const source = readFileSync('scripts/data/ch.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const base = defaultPacks.find(p => p.id === 'ch')!;

test('Mùa CH có đủ ảnh gói, hầm, huy hiệu mùa, nhãn và khung trống đổi miniface', () => {
  assert.ok(TIERS.includes('ch'));
  assert.equal(TIERS.at(-1), 'ch');
  assert.ok((SEASON_IDS as readonly string[]).includes('ch'));
  assert.equal(seasons.ch, 'CH');
  assert.equal(seasonShort('ch'), 'CH');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'ch' ? 100 : 0));
  for (const p of defaultPacks) assert.equal(p.weights.length, TIERS.length, p.id);
  assert.equal(base.range, '111–121');
  for (const path of [base.back, base.tunnel, '/assets/ch-team.webp', '/assets/seasons/ch.webp', '/assets/portraits/blank/ch.webp']) assert.ok(path && existsSync(`public${path}`), path);
  assert.ok((JSON.parse(readFileSync('src/portrait-blank.json', 'utf8')) as { tiers: Record<string, unknown> }).tiers.ch);
});

test('151 thẻ CH khớp danh sách (spid 845, OVR = Garena + 3, vị trí, lương, cờ), có ảnh riêng, logo đội và giá tăng theo cấp', () => {
  assert.equal(roster.length, 151);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.deepEqual([roster[0].id, roster.at(-1)!.id], [4195, 4345]);
  for (const [i, p] of roster.entries()) {
    const [spid, name, rating, pos, wage, flag, club] = source[i];
    assert.ok(spid.startsWith('845'), name);
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club], [name, Number(rating), pos, Number(wage), flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.ok(existsSync(`public${getTeamLogo(p)}`), `logo ${name}`);
    assert.ok(!/\/assets\/(?!ch-)[a-z0-9]+-team\.webp$/.test(p.teamLogo ?? ''), `không mượn huy hiệu mùa khác: ${name} ${p.teamLogo}`);
    if (club === 'Tự do') assert.ok(p.teamLogo?.endsWith('/assets/ch-team.webp'), `Tự do dùng huy hiệu CH: ${name}`);
    assert.notEqual(flagImageUrl(p.flag), flagImageUrl('unknown'), name);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
    prices.slice(2).forEach((v, j) => assert.ok(v! > prices[j]!, name));
  }
  assert.deepEqual([roster[0].name, roster[0].ovr], ['L. Messi', 121]);
  // Chân dung: đúng thẻ mùa 845 khi FC Online có ảnh (148/151); 3 thẻ không có ảnh ở mùa nào.
  const own = roster.filter(p => portraitOf(p.id)?.includes('/845'));
  assert.equal(own.length, 148);
  assert.deepEqual(roster.filter(p => !portraitOf(p.id)).map(p => p.name).sort(), ['J. Seri', 'O. Pineda', 'Vieirinha']);
  // Lisandro (845239301) và Lautaro (845231478) Martínez: hai người khác nhau.
  const lm = roster.filter(p => p.name === 'L. Martínez');
  assert.deepEqual(lm.map(p => p.pos).sort(), ['CB', 'ST']);
});

test('Gói CH ra đủ 151 cầu thủ, mở được; 9 gói quà Top Đặc Huấn CH chỉ định (+9)', () => {
  assert.ok(isPackAvailable(base));
  assert.equal(packOdds(base).pool.length, 151);
  for (const p of roster.slice(0, 20)) assert.equal(draw(base, rngFor(base, p.id)).playerId, p.id, p.name);
  for (const n of [1, 3, 5, 7, 10, 15, 20, 30, 40]) {
    const pack = packs.find(p => p.id === `tdh-ch${n}-9`)!;
    assert.ok(pack?.eventOnly && pack.choose, `tdh-ch${n}-9`);
    assert.equal(packOdds(pack).pool.length, n);
    assert.ok(packOdds(pack).pool.every(r => r.player.tier === 'ch'));
  }
});

test('Máy chủ biết mùa của 151 thẻ CH (fco_player_tiers, 202611180008)', () => {
  const sql = readFileSync('supabase/migrations/202611180008_fco_season_ch.sql', 'utf8');
  for (const p of roster) assert.match(sql, new RegExp(`\\(${p.id},'ch'\\)`), p.name);
});
