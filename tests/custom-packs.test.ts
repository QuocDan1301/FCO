import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PACK_LEVELS, TIERS, allPacks, buyPacks, customPack, defaultPacks, draw, getPackStock, getPlayer, isPackAvailable, openPacks, ovr, packOdds, packs, players, shopPacks, openChosen, choosePool, openDraft, draftCandidates, draftSize, defaultDraft, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import type { CustomPackData, Pack } from '../src/game.ts';
import { SEASON_IDS, customArtPath, packError } from '../src/admin/pack-rules.ts';
import { publishedPacksOnly } from '../scripts/pack-admin.ts';
import { rngFor, seeded } from './pack-rng.ts';
import data from '../src/packs.json';
import priceData from '../src/player-prices.json';

// Dữ liệu trang quản trị (src/packs.json, mọi gói bán trong Shop) thay đổi theo người dùng: các test dưới đây kiểm tra theo dữ liệu thật, không ghim gói cụ thể.
const all = data.packs as CustomPackData[];
const sample: CustomPackData = { id: 'mau-thu', name: 'MẪU THỬ', short: 'MAU', title: 'MẪU THỬ', seasons: ['stellar', 'origin'], minOvr: 117, levels: [1, 1], price: 1000, description: '', range: '117–126', back: customArtPath('mau-thu'), published: true };
// Khoảng OVR theo khoảng cấp; gói chưa có cầu thủ (mùa mới) ghi trống.
const rangeOf = (pack: Pack) => {
  const { pool, levels } = packOdds(pack);
  if (!pool.length) return '';
  return `${Math.min(...pool.map(r => ovr({ playerId: r.player.id, level: levels[0].level })))}–${Math.max(...pool.map(r => ovr({ playerId: r.player.id, level: levels[levels.length - 1].level })))}`;
};

test('Gói trong src/packs.json: dữ liệu hợp lệ, mã không trùng, có ảnh gói, khoảng OVR đúng; mùa khớp TIERS và bảng ghép ảnh', () => {
  assert.deepEqual([...SEASON_IDS], [...TIERS]);
  // Bảng SEASONS của scripts/compose-pack.py phải có đủ các mùa để ghép ảnh.
  const script = readFileSync('scripts/compose-pack.py', 'utf8');
  assert.deepEqual([...script.matchAll(/^ {4}'(\w+)': dict\(art=/gm)].map(m => m[1]).sort(), [...TIERS].sort());
  assert.equal(new Set(all.map(pack => pack.id)).size, all.length);
  for (const pack of all) {
    assert.equal(packError(pack), null, pack.id);
    assert.ok(pack.back === null || existsSync(`public${pack.back}`), `thiếu ảnh ${pack.back}`);
    assert.equal(pack.range, rangeOf(customPack(pack)), `${pack.id}: khoảng OVR cũ, mở trang quản trị và lưu lại`);
  }
});

test('Gói rút đúng: chỉ mùa đã chọn, đủ OVR +1 tối thiểu, đúng khoảng cấp, tỷ lệ mùa khớp bảng công bố; mua, mở, lưu được', () => {
  for (const data of [...all, sample]) {
    const pack = customPack(data), { pool } = packOdds(pack), [low, high] = data.levels;
    // Gói chưa có cầu thủ (vd. mùa mới chưa thêm thẻ): Shop hiện "Sắp ra mắt", không mở / mua được.
    if (!pool.length) { assert.equal(isPackAvailable(pack), false, data.id); assert.throws(() => draw(pack)); continue; }
    const passing = players.filter(p => data.seasons.includes(p.tier) && ovr({ playerId: p.id, level: 1 }) >= (data.minOvr ?? 0));
    // Gói top price chỉ giữ topPrice cầu thủ giá +1 cao nhất.
    const basePrice = (id: number) => (priceData.players as Record<string, (number | null)[]>)[String(id)]?.[0] ?? 0;
    const eligible = data.topPrice ? [...passing].sort((a, b) => basePrice(b.id) - basePrice(a.id) || ovr({ playerId: b.id, level: 1 }) - ovr({ playerId: a.id, level: 1 }) || a.id - b.id).slice(0, data.topPrice) : passing;
    assert.deepEqual(pool.map(row => row.player.id).sort((a, b) => a - b), eligible.map(p => p.id).sort((a, b) => a - b), data.id);
    assert.deepEqual(packOdds(pack).levels.map(l => l.level), Array.from({ length: high - low + 1 }, (_, i) => low + i));
    for (const player of eligible) assert.equal(draw(pack, rngFor(pack, player.id)).playerId, player.id, `${data.id} · ${player.name}`);
    const rng = seeded(11), counts = new Map<string, number>();
    for (let i = 0; i < 20000; i++) { const tier = getPlayer(draw(pack, rng)).tier; counts.set(tier, (counts.get(tier) ?? 0) + 1); }
    for (const tier of new Set(pool.map(row => row.player.tier))) {
      const share = pool.filter(row => row.player.tier === tier).reduce((sum, row) => sum + row.chance, 0);
      assert.ok(Math.abs((counts.get(tier) ?? 0) / 20000 - share) < .015, `${data.id} · ${tier}`);
    }
    // Cấp sẵn 15 gói để mở thử (cả gói nháp / gói chỉ có từ sự kiện).
    const start = initialSave(), stocked = { ...start, unopened: { ...start.unopened, [pack.id]: 15 } };
    // Gói chỉ định không rút ngẫu nhiên: mở bằng cách chọn cầu thủ (openChosen).
    if (pack.choose) { const chosen = openChosen(stocked, pack, eligible[0].id); assert.equal(chosen.card.level, high); assert.equal(validateSave(JSON.parse(JSON.stringify(chosen.state))), true); continue; }
    const opened = openPacks(stocked, pack, 15, seeded(5), true);
    assert.ok(opened.cards.every(card => card.level >= low && card.level <= high && eligible.some(p => p.id === card.playerId)), data.id);
    assert.equal(validateSave(JSON.parse(JSON.stringify(opened.state))), true);
  }
  for (const pack of shopPacks.filter(isPackAvailable)) assert.equal(getPackStock(buyPacks(initialSave(), pack, 2, true), pack), 17);
});

test('Gói lấy màu / đường hầm / màu Shop (và ảnh khi chưa ghép) của gói gốc mùa đầu tiên; không nhập OVR = không lọc; gói nháp không vào Shop ngoài npm run dev', () => {
  for (const data of [...all, sample]) {
    const pack = customPack(data), theme = defaultPacks.find(p => p.weights[TIERS.indexOf(data.seasons[0])] === 100 && !p.levels)!;
    assert.equal(pack.tone, theme.tone ?? theme.id, data.id);
    assert.equal(pack.color, theme.color);
    assert.equal(pack.tunnel, theme.tunnel);
    assert.deepEqual(pack.stage, theme.stage);
    assert.equal(pack.draft, !data.published);
    assert.equal(pack.back, data.back === null ? theme.back : data.back, data.id);
  }
  const open = { ...sample, id: 'khong-ovr', minOvr: null, back: customArtPath('khong-ovr') };
  assert.equal(packError(open), null);
  assert.equal(customPack(open).minOvr, undefined);
  assert.equal(packOdds(customPack(open)).pool.length, players.filter(p => open.seasons.includes(p.tier)).length);
  assert.notEqual(packError({ ...open, minOvr: 'x' }), null);
  // Chạy test (không phải npm run dev): Shop chỉ có gói đã bật hiện cho người chơi, đúng thứ tự trong file.
  assert.deepEqual(allPacks.map(pack => pack.id), all.map(pack => pack.id));
  assert.deepEqual(packs.map(pack => pack.id), all.filter(pack => pack.published).map(pack => pack.id));
  assert.equal(packs.filter(pack => pack.draft).length, 0);
});

test('Gói mặc định chưa sửa trong src/packs.json ra đúng tỷ lệ như định nghĩa gốc (một mùa, không lọc OVR, ảnh gốc)', () => {
  for (const base of defaultPacks) {
    const entry = all.find(pack => pack.id === base.id);
    const tier = TIERS.find((_, i) => base.weights[i] === 100)!;
    if (!entry || entry.seasons.join() !== tier || entry.minOvr !== null) continue; // gói đã xoá / đã đổi mùa hoặc OVR ở trang quản trị
    const mine = packOdds(customPack(entry)).pool, original = packOdds(base).pool;
    assert.deepEqual(mine.map(row => row.player.id), original.map(row => row.player.id), base.id);
    mine.forEach((row, i) => assert.ok(Math.abs(row.chance - original[i].chance) < 1e-12, `${base.id} · ${row.player.name}`));
    if (entry.back === null) assert.equal(customPack(entry).back, base.id === 'stellar5' ? defaultPacks.find(p => p.id === 'stellar')!.back : base.back);
  }
  assert.equal(packError({ ...sample, back: null }), null);
  assert.notEqual(packError({ ...sample, back: '/assets/ts26-back.webp' }), null);
  assert.deepEqual(PACK_LEVELS, [1, 1]);
});

test('Bản build bỏ hẳn gói nháp khỏi JSON; bản lưu còn gói trả trước của gói đã xoá vẫn hợp lệ', () => {
  const plugin = publishedPacksOnly();
  const code = JSON.stringify({ packs: [{ ...sample, id: 'dang-ban', published: true }, { ...sample, id: 'nhap', published: false }] });
  const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;
  const result = JSON.parse(transform.call({}, code, 'C:\\du-an\\src\\packs.json')!.code);
  assert.deepEqual(result.packs.map((pack: CustomPackData) => pack.id), ['dang-ban']);
  assert.equal(transform.call({}, code, '/du-an/src/other.json'), undefined);
  assert.equal(plugin.apply, 'build');
  const save = { ...initialSave(), prepaid: { 'goi-da-xoa': 3 } };
  assert.equal(validateSave(JSON.parse(JSON.stringify(save))), true);
  assert.equal(validateSave(JSON.parse(JSON.stringify({ ...save, prepaid: { 'goi-da-xoa': -1 } }))), false);
});

test('Gói top price: chỉ lấy N cầu thủ giá +1 cao nhất của các mùa trong gói; top price sai thì báo lỗi', () => {
  const price = (id: number) => (priceData.players as Record<string, (number | null)[]>)[String(id)]?.[0] ?? 0;
  const base = { ...sample, id: 'top-thu', seasons: ['gru', 'cu', 'ut'] as CustomPackData['seasons'], minOvr: null, levels: [8, 8] as [number, number], back: null };
  const top = customPack({ ...base, topPrice: 50 });
  const { pool } = packOdds(top);
  assert.equal(pool.length, 50);
  assert.ok(pool.every(r => base.seasons.includes(r.player.tier)));
  // Cầu thủ rẻ nhất trong gói vẫn không rẻ hơn bất kỳ cầu thủ nào bị loại.
  const kept = new Set(pool.map(r => r.player.id)), cutoff = Math.min(...pool.map(r => price(r.player.id)));
  assert.ok(players.filter(p => base.seasons.includes(p.tier) && !kept.has(p.id)).every(p => price(p.id) <= cutoff));
  assert.ok(packOdds(customPack(base)).pool.length > 50);
  assert.equal(packError({ ...base, topPrice: 50 }), null);
  assert.match(packError({ ...base, topPrice: 0 }) ?? '', /Top price/);
  for (const _ of Array(20)) assert.ok(kept.has(draw(top, seeded(7)).playerId));
});

test('Gói chỉ định: danh sách mặc định là N người giá cao nhất; mở nhận ngẫu nhiên 1 trong N người đã chọn ở cấp của gói', () => {
  const pack = packs.find(p => p.choose)!;
  const size = draftSize(pack), candidates = draftCandidates(pack), initial = defaultDraft(pack);
  assert.ok(size >= 1 && size <= candidates.length);
  assert.ok(candidates.length > size, 'Có thêm cầu thủ ngoài nhóm mặc định để đổi');
  assert.deepEqual([...initial].sort(), choosePool(pack).map(p => p.id).sort());
  // Đổi người cuối danh sách lấy một người ngoài nhóm mặc định.
  const outsider = candidates.find(p => !initial.includes(p.id))!;
  const custom = [...initial.slice(0, -1), outsider.id];
  const state = { ...initialSave(), unopened: { ...initialSave().unopened, [pack.id]: 2 } };
  const last = openDraft(state, pack, custom, () => .9999999);
  assert.equal(last.cards.length, 1);
  assert.equal(last.cards[0].playerId, outsider.id, 'rng sát 1 lấy người cuối danh sách');
  assert.equal(last.cards[0].level, (pack.levels ?? [1, 1])[1]);
  assert.equal(last.state.unopened?.[pack.id], 1);
  assert.equal(last.state.cards.length, state.cards.length + 1);
  assert.equal(openDraft(state, pack, custom, () => 0).cards[0].playerId, custom[0]);
  assert.ok(validateSave(JSON.parse(JSON.stringify(last.state))));
  // Sai số lượng, trùng, người ngoài gói, hết gói, gói thường đều bị chặn.
  assert.throws(() => openDraft(state, pack, custom.slice(1)), /đúng/);
  assert.throws(() => openDraft(state, pack, [...custom.slice(1), custom[1]]), /đúng/);
  const stranger = players.find(p => !candidates.some(c => c.id === p.id))!;
  assert.throws(() => openDraft(state, pack, [...custom.slice(1), stranger.id]), /đúng/);
  assert.throws(() => openDraft({ ...state, unopened: { [pack.id]: 0 } }, pack, custom), /không còn/);
  assert.throws(() => openDraft(state, packs.find(p => !p.choose)!, custom), /không phải/);
});