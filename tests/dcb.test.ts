import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, draw, isPackAvailable, ovr, packOdds, players, seasons } from '../src/game.ts';
import { marketQuote } from '../src/market.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';
import { goldTraitOf } from '../src/gold-traits.ts';
import { physicalOf } from '../src/physical.ts';
import { extraOf } from '../src/player-extra.ts';
import { cardSwapOf, customDefaultOf, portraitOf } from '../src/portraits.ts';

// Mùa DCB (DRAMATIC COMEBACKS, mã FC Online 846, 2026-11-25): scripts/import-dcb.py, dữ liệu fifaaddict.com (fo4db?class=dcb) + lương Garena.
const roster = players.filter(p => p.tier === 'dcb');
const rows = readFileSync('scripts/data/dcb.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split('|'));
const base = defaultPacks.find(p => p.id === 'dcb')!;

test('Mùa DCB: đứng cuối TIERS, có tên mùa, gói ALL, ảnh gói / hầm / logo / huy hiệu mùa / khung trống', () => {
  assert.equal(TIERS.at(-1), 'dcb');
  assert.ok((SEASON_IDS as readonly string[]).includes('dcb'));
  assert.equal(seasons.dcb, 'DCB');
  assert.equal(seasonShort('dcb'), 'DCB');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'dcb' ? 100 : 0));
  for (const p of defaultPacks) assert.equal(p.weights.length, TIERS.length, p.id);
  for (const path of [base.back, base.tunnel, '/assets/dcb-team.webp', '/assets/seasons/dcb.webp', '/assets/portraits/blank/dcb.webp']) assert.ok(path && existsSync(`public${path.replace(/^\/FCO/, '')}`), path);
  assert.ok(existsSync('scripts/data/dcb-frame.png') && existsSync('scripts/data/dcb-badge.png'));
  assert.equal(base.range, `${Math.min(...roster.map(p => p.ovr))}–${Math.max(...roster.map(p => p.ovr))}`);
});

test('67 thẻ DCB khớp scripts/data/dcb.csv (spid mùa 846), id 4387–4453, có ảnh thẻ, giá tăng theo cấp, migration fco_player_tiers', () => {
  assert.equal(roster.length, 67);
  assert.equal(rows.length, 67);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 67 }, (_, i) => 4387 + i));
  roster.forEach((p, i) => {
    const [spid, name, o, pos, wage, flag, club, nation] = rows[i];
    assert.equal(Math.floor(Number(spid) / 1e6), 846, name);
    assert.deepEqual([p.name, p.ovr, p.pos, p.wage, p.flag, p.club, p.nation], [name, Number(o), pos, Number(wage), flag, club, nation]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace.replace(/^\/FCO/, '')}`), name);
    assert.ok(p.teamLogo, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every((v, j) => v > 0 && (j === 0 || v > prices[j - 1])), name);
    assert.equal(ovr({ playerId: p.id, level: 1 }), p.ovr, name);
  });
  const sql = readFileSync('supabase/migrations/202611250008_fco_season_dcb.sql', 'utf8');
  for (const p of roster) assert.match(sql, new RegExp(`\\(${p.id},'dcb'\\)`), p.name);
});

test('Thẻ DCB: CSA vàng đúng fifaaddict, có chân dung / thể hình / ngày sinh (mùa mới nhất hoặc điền tay), đổi miniface lên thẻ bằng khung trống', () => {
  const manual = JSON.parse(readFileSync('scripts/data/gold-manual.json', 'utf8')) as { cards: Record<string, string> };
  let gold = 0;
  for (const p of roster) {
    const g = goldTraitOf(p.id);
    if (g) { gold++; assert.equal(manual.cards[String(p.id)], g.id, p.name); assert.equal(g.id === '57' || g.id === '60' || g.id === '68', p.pos === 'GK', p.name); }
    assert.ok(physicalOf(p.id), `${p.name} có thể hình`);  // mùa mới nhất, hoặc điền tay (Dudek, Fabiański, Alexander-Arnold, Son)
    assert.ok(extraOf(p.id)?.birth, `${p.name} có ngày sinh`);
    assert.equal(customDefaultOf(p.id), undefined, `${p.name} không tự nhận miniface người dùng gửi`);
  }
  assert.equal(gold, 50);
  const beckham = roster[0];
  assert.equal(goldTraitOf(beckham.id)!.id, '55');
  assert.ok(portraitOf(beckham.id)!.endsWith('/assets/portraits/846000250.webp'));
  assert.ok(cardSwapOf(beckham) === null || cardSwapOf(beckham)!.blank, 'đổi miniface dùng khung trống DCB');
  const dudek = roster.find(p => p.name === 'J. Dudek')!;
  assert.deepEqual(physicalOf(dudek.id), { height: 187, weight: 0, body: null, left: 5, right: 3 });
  assert.equal(extraOf(dudek.id)!.skill, 1);
});

test('Gói DCB (ALL) mở được, ra đúng cầu thủ DCB', () => {
  assert.ok(isPackAvailable(base));
  assert.equal(packOdds(base).pool.length, roster.length);
  for (const r of [.01, .5, .99]) assert.equal(players.find(p => p.id === draw(base, () => r).playerId)!.tier, 'dcb');
});
