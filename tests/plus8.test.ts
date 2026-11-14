import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { players } from '../src/game.ts';

// BXH "Đập +8 nhiều nhất" giới hạn 3 cầu thủ / mùa nhờ bảng mùa trên máy chủ (fco_player_tiers).
// Thêm mùa mới thì phải có migration bổ sung dòng vào fco_player_tiers, nếu không thẻ mới bị tính như mùa riêng.
test('BXH +8: mọi thẻ đều có mùa đúng trên máy chủ (fco_player_tiers)', () => {
  const tiers = new Map<number, string>();
  for (const f of readdirSync('supabase/migrations').sort()) {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    for (const block of sql.split(/insert into public\.fco_player_tiers/).slice(1)) {
      const body = block.slice(0, block.indexOf(';'));
      for (const m of body.matchAll(/\((\d+),'([^']+)'\)/g)) tiers.set(Number(m[1]), m[2]);
    }
  }
  const missing = players.filter(p => tiers.get(p.id) !== p.tier).map(p => p.id);
  assert.deepEqual(missing, [], 'thẻ thiếu / sai mùa trong fco_player_tiers');
});

test('BXH +8: chỉ ghi khi đập thành công lên đúng +8, mỗi mùa tối đa 3 cầu thủ', () => {
  const sql = readFileSync('supabase/migrations/202611140005_fco_plus8_board.sql', 'utf8');
  assert.match(sql, /if p_level = 8 then\s+insert into public\.fco_plus8/);
  assert.match(sql, /k <= 3/);
});
test('Quà Top 1–5 Đập 8 liền tay: gói EL · CU · UT · CC 114+ … 110+ (+8), riêng thẻ EL luôn +1', async () => {
  const { packs, customPack, draw, fixedLevel, packOdds } = await import('../src/game.ts');
  const { catalogPack } = await import('../src/inventory-catalog.ts');
  const { existsSync } = await import('node:fs');
  for (const top of [1, 2, 3, 4, 5]) {
    const pack = packs.find(p => p.id === `p8-${top}`);
    assert.ok(pack, `thiếu gói p8-${top}`);
    assert.deepEqual([pack.seasons, pack.minOvr, pack.levels, pack.seasonLevels, pack.eventOnly], [['el', 'cu', 'ut', 'cc'], 115 - top, [8, 8], { el: 1 }, true]);
    assert.equal(pack.name, `EL, CU, UT, CC ${115 - top}+ (+8)`);
    assert.ok(existsSync(`public/assets/custom/p8-${top}-back.webp`));
    const cat = catalogPack(pack);
    assert.equal(cat.fixedLevels.length, cat.players.length);
    cat.players.forEach((id, i) => assert.equal(cat.fixedLevels[i], id >= 4085 && id <= 4176 ? 1 : 0));
    assert.ok(packOdds(pack).pool.some(r => r.player.tier === 'el'), 'gói có mọi cầu thủ EL');
  }
  // Gói không có seasonLevels: fixedLevels rỗng (máy chủ rút cấp như cũ).
  assert.deepEqual(catalogPack(packs.find(p => p.id === 'vqt-1')!).fixedLevels, []);
  // Rút thẻ: EL ra +1, mùa khác ra đúng levels của gói.
  const test = customPack({ id: 't', name: 't', short: 't', title: 't', seasons: ['el', 'cu'], minOvr: null, levels: [8, 8], seasonLevels: { el: 1 }, price: 0, description: '', range: '', back: null, published: true });
  let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cards = Array.from({ length: 400 }, () => draw(test, rng));
  const { getPlayer } = await import('../src/game.ts');
  for (const c of cards) assert.equal(c.level, getPlayer(c).tier === 'el' ? 1 : 8);
  assert.equal(fixedLevel(test, { tier: 'cu' }), null);
  // Tỷ lệ EL trong gói gộp rất nhỏ (phạt giá) nên thử riêng gói chỉ EL: mọi thẻ ra +1 dù levels là +8.
  const elOnly = customPack({ id: 'e', name: 'e', short: 'e', title: 'e', seasons: ['el'], minOvr: null, levels: [8, 8], seasonLevels: { el: 1 }, price: 0, description: '', range: '', back: null, published: true });
  assert.ok(Array.from({ length: 50 }, () => draw(elOnly, rng)).every(c => c.level === 1 && getPlayer(c).tier === 'el'));
});

test('Máy chủ mở gói theo cấp cố định (202611140006): nhận fixedLevels khi đồng bộ, ưu tiên khi mở', () => {
  const sql = readFileSync('supabase/migrations/202611140006_fco_pack_fixed_levels.sql', 'utf8');
  assert.match(sql, /add column if not exists fixed_levels/);
  assert.match(sql, /coalesce\(r->'fixedLevels', '\[\]'\)/);
  assert.match(sql, /coalesce\(nullif\(pk\.fixed_levels\[k\], 0\), pk\.levels\[public\.fco_inv_pick\(pk\.level_weights\)\]\)/);
});
test('Bù BXH +8 (202611140011): lấy lượt đập thành công lên +8 từ lịch sử từ 0h 14/11, ghép thẻ +8 đang giữ, chạy lại được', () => {
  const sql = readFileSync('supabase/migrations/202611140011_fco_plus8_backfill.sql', 'utf8');
  assert.match(sql, /e->>'detail' ~ '→ \\\+8\( \|\$\)'/);
  assert.match(sql, /timestamptz '2026-11-14 00:00:00\+07'/);
  assert.match(sql, /\(card->>'level'\)::integer >= 8/);
  assert.match(sql, /on conflict do nothing;/);
});
test('Lịch sử đập +8 (202611140012): xem theo hạng 1..10 hoặc của mình, ghi rõ có tính điểm không, không lộ mã người chơi', () => {
  const sql = readFileSync('supabase/migrations/202611140012_fco_plus8_history.sql', 'utf8');
  assert.match(sql, /if p_rank is null then target := uid;/);
  assert.match(sql, /'counted', x\.k <= 3/);
  assert.doesNotMatch(sql, /'user'|'uid'/);
  const page = readFileSync('src/Plus8Page.tsx', 'utf8');
  assert.match(page, /clickable\(i \+ 1, r\.name\)/);
  assert.match(page, /clickable\(null, 'Bạn'\)/);
});
test('BXH +8 tự bù khi kho chưa bắt buộc (202611140013): ghi từ lịch sử mỗi lần lưu, kho bắt buộc thì không đọc lịch sử', () => {
  const sql = readFileSync('supabase/migrations/202611140013_fco_plus8_auto.sql', 'utf8');
  assert.match(sql, /if not coalesce\(\(select enforced from public\.fco_inventory where id = 1\), false\) then\n\s+perform public\.fco_plus8_from_history\(owner_id, saved\.data\);/);
  assert.match(sql, /revoke all on function public\.fco_plus8_from_history\(uuid, jsonb\) from public, anon, authenticated;/);
});
test('Gói quà BXH +8 tăng tỷ lệ OVR (mức Nhẹ, 2026-11-14): phạt giá như Shop, không phạt OVR, so OVR theo cấp thật lúc nhận', async () => {
  const { packs, packOdds, ovr, fixedLevel, priceAlphaOf, ovrDecayOf, PACK_ODDS } = await import('../src/game.ts');
  assert.equal(PACK_ODDS.rankPrizePriceAlpha, .5);
  assert.equal(PACK_ODDS.rankPrizeOvrDecay, 1);
  const p8 = packs.find(p => p.id === 'p8-1')!, other = packs.find(p => p.id === 'vqt-1')!;
  assert.deepEqual([priceAlphaOf(p8), ovrDecayOf(p8)], [.5, 1]);
  assert.deepEqual([priceAlphaOf(other), ovrDecayOf(other)], [PACK_ODDS.eventPriceAlpha, PACK_ODDS.ovrDecay], 'gói sự kiện khác giữ nguyên');
  // OVR trung bình nhận được cao hơn luật sự kiện cũ (129,3 ở gói Top 1).
  let avg = 0;
  for (const { player, chance } of packOdds(p8).pool) avg += chance * ovr({ playerId: player.id, level: fixedLevel(p8, player) ?? 8 });
  assert.ok(avg > 129.5, `OVR TB ${avg}`);
});
test('Vòng đua Đập 8 liền tay (202611140018): Top 1–5 nhận gói p8-1…p8-5 qua hàng chờ quà, bảng reset, tự bù chỉ từ đầu vòng', () => {
  const sql = readFileSync('supabase/migrations/202611140018_fco_plus8_rounds.sql', 'utf8');
  assert.match(sql, /perform public\.fco_rank_prize_pack\(r\.round, 'plus8', i, t\.user_id, t\.score, 'p8-' \|\| i\);/);
  assert.match(sql, /limit 5 loop/);
  assert.match(sql, /insert into public\.fco_admin_gifts\(user_id, rewards, note\)/);
  assert.match(sql, /delete from public\.fco_plus8 where true;/);
  assert.match(sql, /extract\(epoch from public\.fco_plus8_since\(\)\) \* 1000/);
  assert.match(readFileSync('src/Plus8Page.tsx', 'utf8'), /roundFirst\.then\(\(\) => load\(\)\)/);
});