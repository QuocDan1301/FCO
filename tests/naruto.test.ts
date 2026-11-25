import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS, defaultPacks, draw, isPackAvailable, ovr, packOdds, players, seasons } from '../src/game.ts';
import { hasSystemSale, marketQuote } from '../src/market.ts';
import { cardSwapOf } from '../src/portraits.ts';
import { GOLD_GK_TRAITS, goldTraitOf } from '../src/gold-traits.ts';
import { physicalOf } from '../src/physical.ts';
import { extraOf, traitIdsOf } from '../src/player-extra.ts';
import { customDefaultOf, portraitOf } from '../src/portraits.ts';
import { SEASON_CODE, latestSourceId } from '../src/latest-season.ts';
import { seasonShort } from '../src/badges.tsx';
import { SEASON_IDS } from '../src/admin/pack-rules.ts';

// Mùa NARUTO (NARUTO SHIPPUDEN, 2026-11-25): tài nguyên từ scripts/import-naruto.py; người dùng gửi cầu thủ sau.
const base = defaultPacks.find(p => p.id === 'naruto')!;

test('Mùa NARUTO: đứng sau CH trong TIERS, có tên mùa, gói ALL, ảnh gói / hầm / logo / huy hiệu mùa, khung thẻ trống giữ để dựng thẻ', () => {
  assert.equal(TIERS.indexOf('naruto'), TIERS.indexOf('ch') + 1);
  assert.ok((SEASON_IDS as readonly string[]).includes('naruto'));
  assert.equal(seasons.naruto, 'NARUTO');
  assert.equal(seasonShort('naruto'), 'NARUTO');
  assert.deepEqual(base.weights, TIERS.map(t => t === 'naruto' ? 100 : 0));
  for (const p of defaultPacks) assert.equal(p.weights.length, TIERS.length, p.id);
  for (const path of [base.back, base.tunnel, '/assets/naruto-team.webp', '/assets/seasons/naruto.webp']) assert.ok(path && existsSync(`public${path.replace(/^\/FCO/, '')}`), path);
  assert.ok(existsSync('scripts/data/naruto-frame.png') && existsSync('scripts/data/naruto-badge.png'));
  assert.match(readFileSync('src/season-badges.css', 'utf8'), /\.season-tag-naruto\{--season-img:url\(\/assets\/seasons\/naruto\.webp\)\}/);
  assert.match(readFileSync('src/main.tsx', 'utf8'), /import '\.\/naruto-cards\.css';/);
  assert.match(readFileSync('scripts/compose-pack.py', 'utf8'), /'naruto': dict\(art='naruto-back\.png'/);
});

test('Thẻ NARUTO: Lamine Yamal (id 4346) khớp scripts/data/naruto.csv, có ảnh (đã xoá OVR + tên in sẵn), nhãn, giá tăng theo cấp; không đổi miniface', () => {
  const roster = players.filter(p => p.tier === 'naruto');
  const rows = readFileSync('scripts/data/naruto.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split('|'));
  assert.equal(roster.length, rows.length);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  for (const [i, p] of roster.entries()) {
    const [id, name, rating, pos, wage, nation, flag, club] = rows[i];
    assert.deepEqual([p.id, p.name, p.ovr, p.pos, p.wage, p.nation, p.flag, p.club], [Number(id), name, Number(rating), pos, Number(wage), nation, flag, club]);
    assert.ok(p.cardFace && existsSync(`public${p.cardFace}`), name);
    assert.equal(cardSwapOf(p), null, `thẻ NARUTO ${name} giữ nguyên ảnh`);
    assert.equal(hasSystemSale({ playerId: p.id }), false, `hệ thống không bán ${name}`);
    assert.equal(ovr({ playerId: p.id, level: 13 }), p.ovr + 27, name);
    const prices = Array.from({ length: 13 }, (_, j) => marketQuote({ playerId: p.id, level: j + 1 }).price);
    assert.ok(prices.every(v => v !== null && v > 0), name);
  }
  // OVR / lương theo Desktop muamoi.xlsx (2026-11-25); Busquets chưa có ảnh nên chưa thêm.
  assert.equal(roster.length, 41);
  assert.deepEqual([roster[0].id, roster[0].name, roster[0].ovr, roster[0].pos, roster[0].wage], [4346, 'Lamine Yamal', 135, 'RW', 36]);
  assert.deepEqual(roster.map(p => p.id), Array.from({ length: 41 }, (_, i) => 4346 + i));
  const messi = roster.find(p => p.name === 'L. Messi')!; assert.deepEqual([messi.ovr, messi.wage, messi.pos], [136, 36, 'RW']);
  const gk = roster.find(p => p.name === 'W. Szczęsny')!; assert.deepEqual([gk.ovr, gk.wage, gk.pos], [132, 30, 'GK']);
  assert.ok(roster.every(p => ['Barcelona', 'Real Madrid'].includes(p.club) && p.teamLogo?.endsWith('/assets/naruto-team.webp')));
  assert.ok(existsSync('public/assets/naruto-label.webp'));
  const css = readFileSync('src/naruto-cards.css', 'utf8');
  assert.match(css, /\.player-card\.face-art\.season-naruto\{aspect-ratio:555\/684\}/);
  assert.match(css, /\.season-naruto\[data-level="1"\] \.face-art-level\{visibility:hidden\}/);
  const tiers = readFileSync('supabase/migrations/202611250001_fco_season_naruto.sql', 'utf8') + readFileSync('supabase/migrations/202611250002_fco_season_naruto_more.sql', 'utf8')
    + readFileSync('supabase/migrations/202611250005_fco_naruto_real_madrid.sql', 'utf8');
  const ns = /values \('NARUTO', (\d+), (\d+)\)/.exec(readFileSync('supabase/migrations/202611250005_fco_naruto_real_madrid.sql', 'utf8'))!;
  assert.deepEqual([Number(ns[1]), Number(ns[2])], [roster[0].id, roster.at(-1)!.id], 'khoảng id hệ thống không bán phủ đủ mùa NARUTO');
  for (const p of roster) assert.match(tiers, new RegExp(`\\(${p.id},'naruto'\\)`), p.name);
});

test('Gói NARUTO (ALL) mở được, ra đúng cầu thủ NARUTO', () => {
  assert.ok(isPackAvailable(base));
  const pool = packOdds(base).pool;
  assert.equal(pool.length, players.filter(p => p.tier === 'naruto').length);
  assert.equal(players.find(p => p.id === draw(base, () => .5).playerId)!.tier, 'naruto');
});

test('Mọi thẻ NARUTO có chỉ số ẩn vàng (gán tay ở scripts/data/gold-manual.json): GK chỉ CSA thủ môn, cầu thủ khác không có CSA thủ môn', () => {
  const manual = JSON.parse(readFileSync('scripts/data/gold-manual.json', 'utf8')) as { cards: Record<string, string>; why: Record<string, string> };
  const gk = GOLD_GK_TRAITS as readonly string[];
  for (const p of players.filter(p => p.tier === 'naruto')) {
    const g = goldTraitOf(p.id);
    assert.ok(g && g.name && g.desc, p.name);
    assert.equal(manual.cards[String(p.id)], g.id, p.name);
    assert.ok(manual.why[String(p.id)], p.name);
    assert.equal(gk.includes(g.id), p.pos === 'GK', `${p.name} (${p.pos}) → ${g.name}`);
    assert.ok(existsSync(`public/assets/traits/gold-${g.id}.png`), g.id);
  }
});

test('Thẻ NARUTO thiếu thể hình / ngày sinh / sao / chỉ số ẩn / chân dung: lấy từ mùa mới nhất (mã mùa FC Online) của chính cầu thủ', () => {
  const phys = JSON.parse(readFileSync('src/player-physical.json', 'utf8')).cards as Record<string, unknown>;
  const key = (p: { name: string; nation: string }) => `${p.name}|${p.nation}`;
  let filled = 0, manualSeen = 0;
  const manual = JSON.parse(readFileSync('src/player-info-manual.json', 'utf8')) as { cards: Record<string, { birth: string; height: number }> };
  for (const p of players.filter(p => p.tier === 'naruto')) {
    const others = players.filter(q => q.tier !== 'naruto' && key(q) === key(p) && String(q.id) in phys);
    const src = latestSourceId(p.id, id => String(id) in phys);
    if (!others.length) {
      // Không có mùa nào khác (Fermín López, Marc Bernal, P. Guardiola): thông tin điền tay src/player-info-manual.json — ngày sinh + chiều cao, còn lại chưa rõ.
      assert.equal(src, null, p.name);
      const m = manual.cards[String(p.id)];
      assert.ok(m, `${p.name} có thông tin điền tay`);
      assert.deepEqual(physicalOf(p.id), { height: m.height, weight: 0, body: null, left: 0, right: 0 }, p.name);
      const ex = extraOf(p.id)!;
      assert.deepEqual([ex.birth, ex.skill, ex.reputation, ex.traits], [m.birth, 0, '', []], p.name);
      assert.deepEqual(traitIdsOf(p.id), [Number(goldTraitOf(p.id)!.id)], p.name);
      manualSeen++;
      continue;
    }
    const best = Math.max(...others.map(q => SEASON_CODE[q.tier] ?? 0));
    const s = players.find(q => q.id === src)!;
    assert.equal(SEASON_CODE[s.tier] ?? 0, best, `${p.name}: lấy mùa mới nhất`);
    assert.deepEqual(physicalOf(p.id), physicalOf(s.id), p.name);
    const ex = extraOf(p.id)!, exs = extraOf(s.id)!;
    assert.deepEqual([ex.birth, ex.skill, ex.reputation, ex.traits], [exs.birth, exs.skill, exs.reputation, exs.traits], p.name);
    // CSA vàng (mã 50+) là của chính thẻ NARUTO, không lấy của mùa nguồn.
    assert.deepEqual(traitIdsOf(p.id).filter(id => id >= 50), [Number(goldTraitOf(p.id)!.id)], p.name);
    filled++;
  }
  assert.equal(filled, 38);
  assert.equal(manualSeen, 3);
  assert.ok(portraitOf(players.find(p => p.tier === 'naruto' && p.name === 'L. Messi')!.id));
  // Mùa khác không đổi: thẻ không có dữ liệu vẫn trả null.
  const other = players.find(p => p.tier !== 'naruto' && !(String(p.id) in phys))!;
  assert.equal(physicalOf(other.id), null);
  assert.equal(latestSourceId(other.id, () => true), null);
});

test('Thẻ NARUTO dùng miniface người dùng gửi (ảnh ghép nhân vật + cầu thủ, nhãn NARUTO) làm miniface mặc định', () => {
  const custom = JSON.parse(readFileSync('src/minifaces-custom.json', 'utf8')).items as Record<string, { person: string; label: string }>;
  for (const p of players.filter(p => p.tier === 'naruto')) {
    const id = customDefaultOf(p.id)!;
    assert.ok(id?.startsWith('naruto-'), p.name);
    assert.deepEqual(custom[id], { person: `${p.name}|${p.nation}`, label: 'NARUTO' }, p.name);
    assert.ok(portraitOf(p.id)!.endsWith(`/assets/portraits/custom/${id}.webp`), p.name);
    assert.ok(existsSync(`public/assets/portraits/custom/${id}.webp`), p.name);
  }
  assert.equal(new Set(players.filter(p => p.tier === 'naruto').map(p => customDefaultOf(p.id))).size, 41);
  // Mùa khác giữ nguyên chân dung tự gán (miniface NARUTO chỉ thêm vào danh sách chọn).
  const messi = players.find(p => p.tier === 'ch' && p.name === 'L. Messi')!;
  assert.equal(customDefaultOf(messi.id), undefined);
});
