import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { getTeamLogo } from '../src/teamLogos.ts';
import assert from 'node:assert/strict';
import { baseOvr, ovr, GAUGE_OFFSETS, MAX_LEVEL, PACK_LEVELS, PACK_ODDS, UPGRADE_LEVELS, claimDaily, dayKey, draw, getPlayer, initialSave, isPackAvailable, makeCard, materialGauge, openPacks, openSelectedPacks, packOdds, packs, players, upgrade, upgradeInfo, validateSave } from '../src/game.ts';
import priceData from '../src/player-prices.json';
import { rngFor, seeded } from './pack-rng.ts';
import { BRIDGE_CONFIG } from '../src/upgrade/config.ts';


// Thẻ mẫu theo OVR: chọn cầu thủ có OVR tự tính ở cấp đó đúng bằng giá trị cần thử và không bị sửa tay trong Excel,
// để test công thức năng lượng không phụ thuộc dữ liệu cầu thủ người dùng chỉnh.
const cardWith = (rating: number, level = 1, skip: number[] = []) => {
  const player = players.find(p => !skip.includes(p.id) && baseOvr({ playerId: p.id, level }) === rating && ovr({ playerId: p.id, level }) === rating);
  if (!player) throw new Error(`Không có cầu thủ OVR ${rating} ở +${level}`);
  return { ...makeCard(player.id), level };
};
test('479 cầu thủ: 126 ICON, 160 thẻ 26TS, 24 thẻ NO.7, 60 INFINITE PRIME, 40 VIETNAM, 20 PRIME, 40 MEDALIST và 9 FC AMBASSADOR; mọi gói đủ 100%', () => {
  assert.equal(players.length, 479);
  assert.equal(players.filter(p => p.tier === 'amb').length, 9);
  assert.equal(players.filter(p => p.tier === 'mdl').length, 40);
  assert.equal(players.filter(p => p.tier === 'prm').length, 20);
  assert.equal(players.filter(p => p.tier === 'vietnam').length, 40);
  assert.equal(players.filter(p => p.tier === 'prime').length, 60);
  assert.equal(players.filter(p => p.tier === 'origin').length, 24);
  assert.equal(players.filter(p => p.tier === 'stellar').length, 160);
  assert.equal(players.filter(p => p.tier === 'eternal').length, 126);
  for (const p of packs) assert.equal(p.weights.reduce((a, b) => a + b, 0), 100);
});
test('Cả bốn gói mở đúng mùa; toàn bộ 24 thẻ NO.7 có thể nhận và lưu lại', () => {
  assert.equal(isPackAvailable(packs.find(p => p.id === 'prime')!), players.some(p => p.tier === 'prime'));
  // Gói VIETNAM chưa có cầu thủ nên được kiểm tra riêng ở vietnam.test.ts.
  for (const pack of packs.filter(p => ['eternal', 'stellar', 'origin', 'prime'].includes(p.id))) {
    assert.equal(isPackAvailable(pack), true);
    for (const value of [0, .5, .999999]) assert.equal(getPlayer(draw(pack, () => value)).tier, pack.id);
  }
  const no7 = packs[2], pool = players.filter(p => p.tier === 'origin');
  assert.equal(no7.name, 'NO.7 (ALL)');
  assert.equal(no7.range, '115–119');
  pool.forEach(player => {
    const card = draw(no7, rngFor(no7, player.id));
    assert.equal(card.playerId, player.id);
    assert.equal(card.level, 1);
    assert.ok(player.cardFace?.includes('/assets/no7-'));
    assert.ok(player.wage && player.wage >= 28 && player.wage <= 32);
  });
  const before = initialSave(), snapshot = structuredClone(before);
  const result = openPacks(before, no7, 10, () => .999999, true);
  assert.equal(result.cards.length, 10);
  assert.ok(result.cards.every(card => getPlayer(card).tier === 'origin'));
  assert.equal(result.state.unopened?.origin, 5);
  assert.equal(validateSave(JSON.parse(JSON.stringify(result.state))), true);
  assert.deepEqual(before, snapshot);
});


test('Tỷ lệ gói: OVR cao hơn sàn và giá +1 đắt hơn thì hiếm hơn; gói (ALL) chỉ ra +1, gói ghi khoảng cấp mỗi cấp hiếm hơn ~3,2 lần', () => {
  const prices: Record<string, (number | null)[]> = priceData.players;
  for (const pack of packs.filter(isPackAvailable)) {
    const { pool, levels } = packOdds(pack);
    assert.ok(Math.abs(pool.reduce((sum, row) => sum + row.chance, 0) - 1) < 1e-9, pack.name);
    assert.ok(pool.every(row => row.chance > 0), `${pack.name}: mọi cầu thủ đều có thể ra`);
    // Đúng công thức: trọng số = ovrDecay^(OVR +1 − OVR sàn) ÷ max(1, giá +1 ÷ giá rẻ nhất)^priceAlpha, chuẩn hoá về tổng 1.
    const rows = pool.map(({ player }) => ({ value: ovr({ playerId: player.id, level: 1 }), price: prices[String(player.id)]?.[0] ?? 0 }));
    const floor = Math.min(...rows.map(r => r.value)), cheapest = Math.min(...rows.map(r => r.price).filter(p => p > 0));
    const weights = rows.map(r => PACK_ODDS.ovrDecay ** (r.value - floor) / Math.max(1, r.price > 0 ? r.price / cheapest : 1) ** PACK_ODDS.priceAlpha);
    const total = weights.reduce((sum, w) => sum + w, 0);
    pool.forEach((row, i) => assert.ok(Math.abs(row.chance - weights[i] / total) < 1e-12, `${pack.name} · ${row.player.name}`));
    assert.deepEqual(levels, [{ level: 1, chance: 1 }], `${pack.name}: gói (ALL) chỉ ra +1`);
  }
  assert.deepEqual(PACK_LEVELS, [1, 1]);
  const ip = packs.find(p => p.id === 'prime')!, first = packOdds(ip).pool[0].player.id;
  assert.equal(draw(ip, rngFor(ip, first, .999999)).level, 1);
  // Gói ghi khoảng cấp +1~+5: mỗi cấp hiếm hơn cấp trước levelDecay lần.
  const ranged: typeof ip = { ...ip, levels: [1, 5] }, { levels } = packOdds(ranged);
  assert.deepEqual(levels.map(l => l.level), [1, 2, 3, 4, 5]);
  assert.ok(Math.abs(levels.reduce((sum, l) => sum + l.chance, 0) - 1) < 1e-12);
  levels.slice(1).forEach((l, i) => assert.ok(Math.abs(l.chance / levels[i].chance - PACK_ODDS.levelDecay) < 1e-12));
  assert.equal(draw(ranged, rngFor(ranged, first, 0)).level, 1);
  assert.equal(draw(ranged, rngFor(ranged, first, levels[0].chance + 1e-9)).level, 2);
  assert.equal(draw(ranged, rngFor(ranged, first, .999999)).level, 5);
  // 20.000 lượt mở (rng có hạt giống) khớp bảng tỷ lệ công bố.
  const rng = seeded(7), counts = new Map<number, number>(), levelCounts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) { const card = draw(ranged, rng); counts.set(card.playerId, (counts.get(card.playerId) ?? 0) + 1); levelCounts[card.level]++; }
  for (const { player, chance } of packOdds(ip).pool.filter(row => row.chance > .05)) assert.ok(Math.abs((counts.get(player.id) ?? 0) / 20000 - chance) < .015, player.name);
  levels.forEach(({ level, chance }) => assert.ok(Math.abs(levelCounts[level] / 20000 - chance) < .015, `+${level}`));
});

test('43 thẻ 26TS bổ sung mở được, lưu lại được và có đủ mặt thẻ/logo CLB', () => {
  const pack = packs.find(p => p.id === 'stellar')!;
  const pool = players.filter(p => p.tier === 'stellar');
  const added = pool.filter(p => p.id >= 262 && p.id <= 304);
  assert.equal(added.length, 43);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(pack.range, `${Math.min(...pool.map(p => p.ovr))}–${Math.max(...pool.map(p => p.ovr))}`);
  const cards = added.map(player => {
    const card = draw(pack, rngFor(pack, player.id));
    assert.equal(card.playerId, player.id);
    assert.equal(baseOvr(card), player.ovr);
    assert.equal(baseOvr({ ...card, level: 2 }), player.ovr + 1);
    for (const asset of [player.cardFace, getTeamLogo(player)]) {
      assert.ok(asset?.startsWith('/assets/'));
      assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), asset);
    }
    return card;
  });
  assert.equal(validateSave(JSON.parse(JSON.stringify({ ...initialSave(), cards }))), true);
});

test('Bản lưu cũ bỏ thẻ Khởi nguyên và giữ thẻ khác, BP, lịch sử, kho gói', () => {
  const kept = { ...makeCard(11), level: 7 };
  const saved = { ...initialSave(), balance: 123456, opened: 42, upgrades: 8, cards: [kept, ...Array.from({ length: 10 }, (_, i) => makeCard(21 + i))], history: [{ id: 'old', type: 'gift' as const, time: 1, title: 'Quà', detail: 'BP' }] };
  const before = structuredClone(saved);
  assert.equal(validateSave(saved), true);
  assert.deepEqual(saved, { ...before, cards: [kept] });
  assert.equal(validateSave(saved), true);
  assert.equal(validateSave({ ...saved, cards: [makeCard(9999)] }), false);
});
test('Mở 10 trừ đúng tiền, thêm đủ thẻ riêng biệt và không sửa trạng thái cũ', () => {
  const before = initialSave(); const result = openPacks(before, packs[0], 10, () => .99);
  assert.equal(result.state.balance, 0); assert.equal(before.balance, 15000000);
  assert.equal(result.state.cards.length, before.cards.length + 10);
  assert.equal(result.state.opened, 10); assert.equal(result.state.history.length, 1);
  assert.equal(new Set(result.cards.map(c => c.uid)).size, 10);
  assert.ok(result.cards.every(c => getPlayer(c).tier === 'eternal'));
  assert.throws(() => openPacks(result.state, packs[2], 1), /Không đủ BP/);
  assert.throws(() => openPacks(before, packs[2], -1));
});
// Phôi rất mạnh (OVR cao nhất ở +13): mỗi viên nạp tối đa 2,5 vạch nên 5 viên luôn đủ 5 vạch ở mọi cấp.
const strongMaterial = () => {
  const best = players.reduce((a, b) => ovr({ playerId: b.id, level: 13 }) > ovr({ playerId: a.id, level: 13 }) ? b : a);
  return { ...makeCard(best.id), level: 13 };
};
test('Tỷ lệ theo bảng, ranh giới thành công/thất bại ở đủ năng lượng cho cả 12 bước', () => {
  const rates = [100, 81, 64, 50, 26, 15, 7, 4, 2, 1, .7, .5];
  const gains = [1, 1, 2, 2, 2, 3, 4, 2, 2, 2, 3, 3];
  for (let level = 1; level < MAX_LEVEL; level++) {
    const target = { ...makeCard(11), level };
    const materials = Array.from({ length: 5 }, strongMaterial);
    const state = { ...initialSave(), cards: [target, ...materials] };
    const info = upgradeInfo(target, materials);
    assert.equal(info.energy, 100);
    assert.equal(info.chance, rates[level - 1], `+${level} → +${level + 1}`);
    const success = upgrade(state, target.uid, materials.map(c => c.uid), () => rates[level - 1] / 100 - 1e-9);
    assert.equal(success.success, true);
    assert.equal(ovr(success.result) - ovr(target), gains[level - 1]);
    assert.equal(success.state.cards.length, 1);
    assert.doesNotMatch(success.state.history[0].detail, /Tỷ lệ|%/);
    if (rates[level - 1] < 100) {
      const failure = upgrade(state, target.uid, materials.map(c => c.uid), () => rates[level - 1] / 100);
      assert.equal(failure.success, false);
      assert.ok(failure.result.level <= Math.max(1, level - 1));
      assert.equal(failure.state.cards.length, 1);
    }
    assert.equal(state.cards[0].level, level);
  }
  assert.equal(UPGRADE_LEVELS.length, 13);
});

test('OVR cộng dồn đúng đến cấp sao +13; giữ cấp thẻ trong bản lưu hiện có', () => {
  const bonuses = [0, 1, 2, 4, 6, 8, 11, 15, 17, 19, 21, 24, 27];
  const original = makeCard(1);
  for (let level = 1; level <= MAX_LEVEL; level++) assert.equal(ovr({ ...original, level }), getPlayer(original).ovr + bonuses[level - 1]);
  const saved = JSON.parse(JSON.stringify({ ...initialSave(), cards: [{ ...original, level: 13 }] }));
  assert.ok(validateSave(saved));
  assert.equal(saved.cards[0].level, 13);
  assert.equal(ovr(saved.cards[0]), getPlayer(original).ovr + 27);
});

test('Tỷ lệ tăng theo năng lượng nguyên liệu; +1 lên +2 đủ năng lượng luôn thành công', () => {
  const target = makeCard(11), equal = makeCard(11);
  assert.equal(upgradeInfo(target, Array.from({ length: 5 }, () => equal)).chance, 100);
  const high = { ...target, level: 7 };
  const weak = upgradeInfo(high, Array.from({ length: 5 }, () => ({ ...equal, level: 7 })));
  assert.ok(weak.energy < 100);
  assert.equal(weak.chance, Math.round(7 * weak.energy) / 100);
  assert.equal(upgradeInfo(high, Array.from({ length: 5 }, strongMaterial)).chance, 7);
  const materials = Array.from({ length: 5 }, () => makeCard(11));
  const result = upgrade({ ...initialSave(), cards: [target, ...materials] }, target.uid, materials.map(c => c.uid), () => .999999999);
  assert.equal(result.success, true);
});

test('Vạch phôi theo độ lệch OVR chuẩn của từng cấp: đúng chuẩn 1 vạch, ×1,28 / ×0,72 mỗi OVR', () => {
  assert.deepEqual(GAUGE_OFFSETS, [-2, -.5, 0, .3, 1, 1.8, 2.5, 3.3, 4.1, 5, 6, 7]);
  // Mức chuẩn: +1 thấp hơn 2 OVR, +3 bằng OVR, +5 cao hơn 1 OVR, +12 cao hơn 7 OVR.
  assert.equal(materialGauge(130, 1, 128), 1);
  assert.equal(materialGauge(130, 3, 130), 1);
  assert.equal(materialGauge(130, 5, 131), 1);
  assert.equal(materialGauge(130, 12, 137), 1);
  assert.equal(materialGauge(130, 13, 137), 1, 'Ngoài bảng dùng độ lệch 7');
  assert.equal(materialGauge(130, 3, 131), 1.28);
  assert.equal(materialGauge(130, 3, 129), .72);
  assert.equal(materialGauge(130, 2, 129), .849, '+2: phôi thấp hơn 1 OVR ≈ 0,85 vạch');
  assert.equal(materialGauge(130, 4, 130), .906, '+4: phôi cùng OVR ≈ 0,9 vạch');
  assert.equal(materialGauge(130, 1, 140), 2.5, 'Tối đa 2,5 vạch mỗi phôi');
  assert.equal(materialGauge(130, 1, 124), .02, 'Thấp hơn thẻ chính từ 6 OVR chỉ còn 0,02 vạch');
  assert.equal(materialGauge(130, 12, 125), .02, 'Không thấp hơn 0,02 vạch');
});

test('Năng lượng: mỗi phôi = số vạch × 20% (làm tròn 0,1%), cộng dồn tối đa 5 vạch', () => {
  // +2: 5 phôi thấp hơn 1 OVR ≈ 4,25 vạch.
  const t2 = cardWith(125, 2), lower = cardWith(124);
  assert.equal(upgradeInfo(t2, [lower]).energy, 17);
  assert.equal(upgradeInfo(t2, Array.from({ length: 5 }, () => lower)).energy, 85);
  // +4: 5 phôi cùng OVR ≈ 4,5 vạch; 3 phôi cùng OVR + 2 phôi cao hơn 1 OVR đủ 5 vạch.
  const t4 = cardWith(129, 4), same = { ...makeCard(t4.playerId), level: 4 }, above = cardWith(130, 4);
  assert.equal(upgradeInfo(t4, [same]).energy, 18.1);
  assert.equal(upgradeInfo(t4, [same, same, same]).energy, 54.3, 'Cộng đúng phần 0,1% hiển thị ở từng phôi');
  assert.equal(upgradeInfo(t4, Array.from({ length: 5 }, () => same)).energy, 90.5);
  assert.equal(upgradeInfo(t4, [above]).energy, 23.8);
  assert.equal(upgradeInfo(t4, [same, same, same, above, above]).energy, 100);
  assert.equal(upgradeInfo(t4, [same, same, same, above, above]).chance, 50);
  // Không phụ thuộc trùng cầu thủ; phôi cao OVR hơn nạp nhiều hơn.
  const target = cardWith(125), other = cardWith(125, 1, [target.playerId]);
  assert.equal(upgradeInfo(target, [other]).energy, upgradeInfo(target, [makeCard(target.playerId)]).energy);
  assert.equal(upgradeInfo(target, [other]).energy, 32.8);
  const low = upgradeInfo(t4, [cardWith(127)]).energy, high = upgradeInfo(t4, [above]).energy;
  assert.ok(low < upgradeInfo(t4, [same]).energy && upgradeInfo(t4, [same]).energy < high);
  assert.equal(upgradeInfo(target, []).chance, 0);
});
test('Thành công tăng +1; thất bại rớt cấp, cả hai tiêu hao nguyên liệu và phí', () => {
  const target = { ...makeCard(33), level: 2 };
  const materialCards = Array.from({ length: 5 }, () => ({ ...makeCard(33), level: 2 }));
  const before = { ...initialSave(), cards: [target, ...materialCards] };
  const materials = materialCards.map(c => c.uid);
  for (const success of [true, false]) {
    const result = upgrade(before, target.uid, materials, () => success ? 0 : .999999);
    assert.equal(result.success, success); assert.equal(result.result.level, success ? 3 : 1);
    assert.equal(result.state.cards.length, before.cards.length - 5);
    assert.equal(result.state.balance, before.balance - 200000);
    assert.equal(result.state.history[0].success, success);
    assert.equal(before.cards[0].level, 2);
  }
});
test('Thất bại rớt cấp theo bảng trọng số của từng cấp, không rớt quá +8, thấp nhất +1', () => {
  for (let level = 1; level < MAX_LEVEL; level++) {
    const target = { ...makeCard(33), level };
    const material = makeCard(34);
    const state = { ...initialSave(), cards: [target, material] };
    const snapshot = structuredClone(state);
    const weights = BRIDGE_CONFIG.dropWeights[level], total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    assert.equal(total, 100);
    assert.ok(Math.max(...weights.map(([drop]) => drop)) <= Math.min(8, Math.max(1, level - 1)));
    let below = 0;
    for (const [expected, weight] of weights) {
      const rolls = [.999999, (below + weight / 2) / total]; below += weight;
      const result = upgrade(state, target.uid, [material.uid], () => rolls.shift()!);
      assert.equal(result.success, false);
      assert.equal(result.result.level, expected);
      assert.equal(result.droppedLevel, expected);
      assert.equal(result.restoredLevel, null);
      assert.equal(result.result.uid, target.uid);
      assert.equal(result.state.cards.length, 1);
      assert.equal(result.state.balance, state.balance - level * 100000);
      assert.equal(result.state.upgrades, state.upgrades + 1);
      assert.ok(validateSave(result.state));
    }
    assert.deepEqual(state, snapshot);
  }
});

test('Khôi phục từ +5: trúng thì thẻ không rớt dưới mức giữ; chỉ roll một lần khi thất bại và có cơ hội', () => {
  const target = { ...makeCard(33), level: 8 }, material = makeCard(34);
  const state = { ...initialSave(), cards: [target, material] };
  const run = (card: typeof target, restore: { chance: number; floor: number }, ...values: number[]) => {
    let calls = 0;
    const result = upgrade({ ...state, cards: [card, material] }, card.uid, [material.uid], () => { calls++; if (!values.length) throw new Error('Hết RNG'); return values.shift()!; }, false, { restore });
    return { result, calls };
  };
  const kept = run(target, { chance: 50, floor: 8 }, .999999, 0, .3);
  assert.equal(kept.result.droppedLevel, 1); assert.equal(kept.result.restoredLevel, 8); assert.equal(kept.result.result.level, 8); assert.equal(kept.calls, 3);
  assert.ok(kept.result.state.history[0].detail.includes('+8 → +1 → +8 · Khôi phục cấp thẻ'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(kept.result.state))));
  const floor = run(target, { chance: 50, floor: 5 }, .999999, 0, .3);
  assert.equal(floor.result.restoredLevel, 5); assert.equal(floor.result.result.level, 5);
  // Rớt về +6 cao hơn mức giữ +5: coi như rớt thường.
  const above = run(target, { chance: 50, floor: 5 }, .999999, .999, .3);
  assert.equal(above.result.droppedLevel, 6); assert.equal(above.result.restoredLevel, null); assert.equal(above.result.result.level, 6);
  const missed = run(target, { chance: 50, floor: 8 }, .999999, 0, .5);
  assert.equal(missed.result.restoredLevel, null); assert.equal(missed.result.result.level, 1); assert.equal(missed.calls, 3);
  assert.equal(run(target, { chance: 100, floor: 8 }, .999999, 0, .999999).result.result.level, 8, '100% vẫn roll một số');
  assert.equal(run(target, { chance: 0, floor: 8 }, .999999, 0).calls, 2, 'Không có cơ hội khôi phục: chỉ roll thành công + mức rớt');
  assert.equal(run(target, { chance: 50, floor: 8 }, 0).calls, 1, 'Thành công không roll khôi phục');
  const low = run({ ...target, level: 4 }, { chance: 50, floor: 4 }, .999999, 0);
  assert.equal(low.calls, 2, 'Dưới +5 bỏ qua khôi phục'); assert.equal(low.result.result.level, 1);
  for (const bad of [{ chance: 101, floor: 8 }, { chance: 50, floor: 9 }, { chance: 50, floor: 0 }, { chance: NaN, floor: 8 }])
    assert.throws(() => upgrade(state, target.uid, [material.uid], () => 0, false, { restore: bad }), /khôi phục/);
});

test('Nâng cấp thành công không rớt hoặc phục hồi và chỉ tăng đúng một cấp', () => {
  const target = { ...makeCard(33), level: 8 };
  const material = { ...makeCard(33), level: 12 };
  let calls = 0;
  const result = upgrade({ ...initialSave(), cards: [target, material] }, target.uid, [material.uid], () => { calls++; return 0; });
  assert.equal(result.success, true);
  assert.equal(result.result.level, 9);
  assert.equal(result.droppedLevel, null);
  assert.equal(result.restoredLevel, null);
  assert.equal(calls, 1);
});

test('Chặn nguyên liệu trùng, thẻ chính, thiếu tiền, thẻ không tồn tại và cấp tối đa', () => {
  const s = initialSave(); const target = s.cards[0]; const m = s.cards[1];
  assert.throws(() => upgrade(s, target.uid, [m.uid, m.uid]));
  assert.throws(() => upgrade(s, target.uid, [target.uid]));
  assert.throws(() => upgrade(s, target.uid, []));
  assert.throws(() => upgrade(s, target.uid, ['khong-ton-tai']));
  assert.throws(() => upgrade({ ...s, balance: 0 }, target.uid, [m.uid]));
  assert.throws(() => upgrade({ ...s, cards: [{ ...target, level: 13 }, m] }, target.uid, [m.uid]));
});
test('Điểm danh chỉ một lần/ngày theo UTC+7', () => {
  assert.equal(dayKey(new Date('2026-10-20T16:59:59Z')), '2026-10-20');
  assert.equal(dayKey(new Date('2026-10-20T17:00:00Z')), '2026-10-21');
  const before = initialSave(); const after = claimDaily(before);
  assert.equal(after.balance, before.balance + 1000000);
  assert.throws(() => claimDaily(after));
});
test('Bản lưu hợp lệ; dữ liệu hỏng bị từ chối', () => {
  const s = initialSave(); assert.equal(validateSave(JSON.parse(JSON.stringify(s))), true);
  assert.equal(validateSave({ ...s, cards: [...s.cards, s.cards[0]] }), false);
  assert.equal(validateSave({ ...s, balance: -1 }), false);
  assert.equal(validateSave({ ...s, cards: [{ ...s.cards[0], playerId: 999 }] }), false);
  assert.equal(validateSave({ ...s, history: [{}] }), false);
  assert.equal(validateSave(null), false);
});

test('Chế độ thử mở gói/nâng cấp với 0 BP và không thay đổi số dư gốc', () => {
  const before = { ...initialSave(), balance: 0 };
  const opened = openPacks(before, packs[0], 10, () => .99, true);
  assert.equal(opened.state.balance, 0);
  assert.equal(opened.cards.length, 10);
  assert.match(opened.state.history[0].detail, /Không trừ BP/);
  assert.throws(() => openPacks(before, packs[0], -1, () => 0, true));
  for (const outcome of [0, .99999]) {
    const result = upgrade(before, before.cards[0].uid, [before.cards[1].uid], () => outcome, true);
    assert.equal(result.state.balance, 0);
    assert.equal(result.state.cards.length, before.cards.length - 1);
    assert.match(result.state.history[0].detail, /Không trừ BP/);
  }
});

test('Mốc mở thẻ có nhịp chuẩn 9–12 giây, nhanh 3–5 giây (gồm nhịp ánh sáng trắng); cờ/vị trí/logo dài bằng nhau rồi vào thẻ ngay', async () => {
  const { OPENING_CUES, openingPhase, OPENING_RESULT } = await import('../src/cinema/timeline.ts');
  assert.ok(OPENING_CUES.standard.at(-1)! >= 9000 && OPENING_CUES.standard.at(-1)! <= 12000);
  assert.ok(OPENING_CUES.quick.at(-1)! >= 3000 && OPENING_CUES.quick.at(-1)! <= 5000);
  assert.equal(OPENING_CUES.standard[4] - OPENING_CUES.standard[3], 2500, 'Mỗi mục hiện 2 giây rồi nghỉ 0,5 giây');
  for (const cues of [OPENING_CUES.standard, OPENING_CUES.quick]) {
    const [flag, position, team] = [cues[3] - cues[2], cues[4] - cues[3], cues[5] - cues[4]];
    assert.equal(flag, position); assert.equal(position, team);
    assert.ok(cues[8] - cues[5] <= 150, 'Hết logo là vào thẻ, không chờ');
  }
  assert.equal(openingPhase(0, false), 0);
  assert.equal(openingPhase(4000, false), 3);
  assert.equal(openingPhase(12000, false), OPENING_RESULT);
  assert.equal(openingPhase(5000, true), OPENING_RESULT);
});


test('Mở mọi số lượng 1–10 nhận đúng số thẻ và tính đúng tổng phí', () => {
  for (let count = 1; count <= 10; count++) {
    const before = initialSave();
    const result = openPacks(before, packs[0], count, () => .99);
    assert.equal(result.cards.length, count);
    assert.equal(result.state.cards.length, before.cards.length + count);
    assert.equal(result.state.opened, count);
    assert.equal(result.state.balance, 15000000 - 1500000 * count);
    assert.equal(new Set(result.cards.map(c => c.uid)).size, count);
    assert.equal(before.cards.length, 2);
  }
  for (const count of [0, -1, 151, 2.5, NaN, Infinity]) {
    assert.throws(() => openPacks(initialSave(), packs[0], count, () => 0, true));
  }
});


test('Mở lựa chọn trong kho gộp mọi loại gói và giới hạn tổng 150 thẻ', () => {
  const before = initialSave();
  const all = openSelectedPacks(before, packs, () => .99, true);
  const openable = packs.filter(isPackAvailable);
  assert.equal(all.cards.length, 120);
  assert.equal(all.state.cards.length, before.cards.length + 120);
  assert.ok(openable.every(pack => all.state.unopened?.[pack.id] === 0));
  assert.equal(new Set(all.cards.map(card => getPlayer(card).tier)).size, 8);
  assert.equal(before.opened, 0);
  assert.ok(openable.every(pack => before.unopened?.[pack.id] === 15));

  const stocked = { ...before, balance: 1_000_000_000, unopened: Object.fromEntries(packs.map(pack => [pack.id, 80])) };
  const capped = openSelectedPacks(stocked, packs);
  assert.equal(capped.cards.length, 150);
  assert.equal(new Set(capped.cards.map(card => card.uid)).size, 150);
  assert.deepEqual(openable.map(pack => capped.state.unopened?.[pack.id]), [0, 10, 80, 80, 80, 80, 80, 80]);
  assert.equal(capped.state.balance, stocked.balance - 80 * packs[0].price - 70 * packs[1].price);
  assert.equal(capped.state.opened, 150);
  assert.ok(validateSave(capped.state));
  assert.deepEqual(openable.map(pack => stocked.unopened[pack.id]), [80, 80, 80, 80, 80, 80, 80, 80]);

  const single = openSelectedPacks({ ...stocked, unopened: { [packs[0].id]: 151 } }, [packs[0], packs[0]], () => 0, true);
  assert.equal(single.cards.length, 150);
  assert.equal(single.state.unopened?.[packs[0].id], 1);
  const duplicate = openSelectedPacks(before, [packs[0], packs[0]], () => 0, true);
  assert.equal(duplicate.cards.length, 15);
  assert.throws(() => openSelectedPacks(before, []));
  assert.throws(() => openSelectedPacks(all.state, packs, () => 0, true));
  const insufficient = { ...stocked, balance: packs[0].price * 80 };
  assert.throws(() => openSelectedPacks(insufficient, packs), /Không đủ BP/);
  assert.equal(insufficient.opened, 0);
  assert.deepEqual(openable.map(pack => insufficient.unopened[pack.id]), [80, 80, 80, 80, 80, 80, 80, 80]);
});

test('Kho gói trừ đúng lượng đã mở, chặn mở quá số còn lại và giữ bản cũ', () => {
  const start = initialSave();
  const first = openPacks(start, packs[0], 10, () => 0, true);
  assert.equal(first.state.unopened?.eternal, 5);
  assert.equal(start.unopened?.eternal, 15);
  assert.throws(() => openPacks(first.state, packs[0], 6, () => 0, true));
  const last = openPacks(first.state, packs[0], 5, () => 0, true);
  assert.equal(last.state.unopened?.eternal, 0);
  assert.equal(last.state.cards.length, start.cards.length + 15);
  assert.equal(last.state.unopened?.origin, 15);
  assert.throws(() => openPacks(last.state, packs[0], 1, () => 0, true));
  const legacy = { ...start }; delete legacy.unopened;
  assert.ok(validateSave(legacy));
  assert.equal(openPacks(legacy, packs[0], 1, () => 0, true).state.unopened?.eternal, 14);
  assert.equal(validateSave({ ...start, unopened: { eternal: -1, stellar: 15, origin: 15 } }), false);
});


test('Camera chạy liên tục qua các mốc hé lộ và dừng êm tại sân khấu', async () => {
  const timeline = await import('../src/cinema/timeline.ts');
  assert.equal(typeof timeline.cameraProgress, 'function');
  for (const quick of [false, true]) {
    const cues = timeline.OPENING_CUES[quick ? 'quick' : 'standard'];
    const end = timeline.cameraEnd(quick);
    const progress = (t: number) => timeline.cameraProgress(t, quick);
    assert.equal(progress(-100), 0); assert.equal(progress(end + 100), 1);
    let last = 0;
    for (let t = 0; t <= end; t += 4) {
      const p = progress(t); assert.ok(p >= last && p <= 1); last = p;
    }
    for (const t of cues.slice(0, -1)) {
      const step = .01;
      const left = (progress(t) - progress(t - step)) / step, right = (progress(t + step) - progress(t)) / step;
      assert.ok(left > 0 && right > 0, 'Không dừng giữa các nhịp hé lộ');
      assert.ok(Math.abs(right - left) < .0000001, 'Không đổi tốc độ đột ngột ở mốc hé lộ');
    }
    assert.ok(1 - progress(end - 1) < .000002, 'Hãm tốc trước khi dừng');
  }
});


test('Camera luôn nhìn về phía sân khấu khi rời đường hầm', async () => {
  const { cameraPose, cameraProgress, OPENING_CUES, STAGE_Z, TUNNEL_EXTRA } = await import('../src/cinema/timeline.ts');
  // Camera còn ở trong hầm (trước cửa hầm z = -38 - TUNNEL_EXTRA) suốt cờ, vị trí, logo đội.
  for (const quick of [false, true]) {
    const cues = OPENING_CUES[quick ? 'quick' : 'standard'];
    for (let t = cues[2]; t < cues[5]; t += 50) assert.ok(cameraPose(cameraProgress(t, quick)).z > -38 - TUNNEL_EXTRA, `Đã ra khỏi hầm ở ${t}ms`);
  }
  assert.equal(typeof cameraPose, 'function');
  for (const quick of [false, true]) {
    const end = OPENING_CUES[quick ? 'quick' : 'standard'][8];
    let previousPitch = 0;
    for (let t = 0; t <= end + 100; t += 1000 / 60) {
      const pose = cameraPose(cameraProgress(t, quick));
      assert.ok(pose.lookZ < pose.z - 5, `Không quay ngược ở ${Math.round(t)}ms`);
      const pitch = Math.atan2(3.3 - pose.y, pose.z - pose.lookZ);
      if (t > 0) assert.ok(Math.abs(pitch - previousPitch) < .01, 'Không đổi góc nhìn đột ngột');
      previousPitch = pitch;
    }
    assert.equal(cameraPose(1).z, STAGE_Z + 9.5);
    assert.equal(cameraPose(1).lookZ, STAGE_Z);
  }
});
