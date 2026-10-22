import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { getTeamLogo } from '../src/teamLogos.ts';
import assert from 'node:assert/strict';
import { baseOvr, ovr, MAX_LEVEL, UPGRADE_LEVELS, claimDaily, dayKey, draw, getPlayer, initialSave, isPackAvailable, makeCard, openPacks, openSelectedPacks, packs, players, upgrade, upgradeInfo, validateSave } from '../src/game.ts';


// Thẻ mẫu theo OVR: chọn cầu thủ có OVR tự tính ở cấp đó đúng bằng giá trị cần thử và không bị sửa tay trong Excel,
// để test công thức năng lượng không phụ thuộc dữ liệu cầu thủ người dùng chỉnh.
const cardWith = (rating: number, level = 1, skip: number[] = []) => {
  const player = players.find(p => !skip.includes(p.id) && baseOvr({ playerId: p.id, level }) === rating && ovr({ playerId: p.id, level }) === rating);
  if (!player) throw new Error(`Không có cầu thủ OVR ${rating} ở +${level}`);
  return { ...makeCard(player.id), level };
};
test('310 cầu thủ: 126 ICON, 160 thẻ 26TS, 24 thẻ NO.7; mọi gói công bố đủ 100%', () => {
  assert.equal(players.length, 310);
  assert.equal(players.filter(p => p.tier === 'origin').length, 24);
  assert.equal(players.filter(p => p.tier === 'stellar').length, 160);
  assert.equal(players.filter(p => p.tier === 'eternal').length, 126);
  for (const p of packs) assert.equal(p.weights.reduce((a, b) => a + b, 0), 100);
});
test('Cả ba gói mở đúng mùa; toàn bộ 24 thẻ NO.7 có thể nhận và lưu lại', () => {
  // Gói INFINITE PRIME chưa có cầu thủ nên chưa mở được; các gói còn lại phải mở được.
  assert.equal(isPackAvailable(packs.find(p => p.id === 'prime')!), players.some(p => p.tier === 'prime'));
  for (const pack of packs.filter(p => p.id !== 'prime')) {
    assert.equal(isPackAvailable(pack), true);
    for (const value of [0, .5, .999999]) assert.equal(getPlayer(draw(pack, () => value)).tier, pack.id);
  }
  const no7 = packs[2], pool = players.filter(p => p.tier === 'origin');
  assert.equal(no7.name, 'NO.7 (ALL)');
  assert.equal(no7.range, '115–119');
  pool.forEach((player, index) => {
    const card = draw(no7, () => (index + .5) / pool.length);
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


test('43 thẻ 26TS bổ sung mở được, lưu lại được và có đủ mặt thẻ/logo CLB', () => {
  const pack = packs.find(p => p.id === 'stellar')!;
  const pool = players.filter(p => p.tier === 'stellar');
  const added = pool.filter(p => p.id >= 262 && p.id <= 304);
  assert.equal(added.length, 43);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(pack.range, `${Math.min(...pool.map(p => p.ovr))}–${Math.max(...pool.map(p => p.ovr))}`);
  const cards = added.map(player => {
    const index = pool.indexOf(player);
    const card = draw(pack, () => (index + .5) / pool.length);
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

test('Bản lưu cũ bỏ thẻ Khởi nguyên và giữ thẻ khác, xu, lịch sử, kho gói', () => {
  const kept = { ...makeCard(11), level: 7 };
  const saved = { ...initialSave(), balance: 123456, opened: 42, upgrades: 8, cards: [kept, ...Array.from({ length: 10 }, (_, i) => makeCard(21 + i))], history: [{ id: 'old', type: 'gift' as const, time: 1, title: 'Quà', detail: 'Xu' }] };
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
  assert.throws(() => openPacks(result.state, packs[2], 1), /Không đủ xu/);
  assert.throws(() => openPacks(before, packs[2], -1));
});
test('Tỷ lệ theo bảng ảnh, ranh giới thành công/thất bại ở đủ năng lượng cho cả 12 bước', () => {
  const rates = [100, 81, 64, 50, 26, 15, 7, 5, 4, 3, 2, 1];
  const gains = [1, 1, 2, 2, 2, 3, 4, 2, 2, 2, 3, 3];
  for (let level = 1; level < MAX_LEVEL; level++) {
    const target = { ...makeCard(11), level };
    const materials = Array.from({ length: 5 }, () => ({ ...makeCard(11), level }));
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
      assert.equal(failure.result.level, level);
      assert.equal(ovr(failure.result), ovr(target));
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

test('Tỷ lệ vẫn tăng theo năng lượng nguyên liệu; +1 lên +2 đủ năng lượng luôn thành công', () => {
  const target = makeCard(11), equal = makeCard(11);
  assert.equal(upgradeInfo(target, Array.from({ length: 5 }, () => equal)).chance, 100);
  const high = { ...target, level: 7 };
  assert.equal(upgradeInfo(high, Array.from({ length: 5 }, () => ({ ...equal, level: 7 }))).chance, 7);
  const materials = Array.from({ length: 5 }, () => makeCard(11));
  const result = upgrade({ ...initialSave(), cards: [target, ...materials] }, target.uid, materials.map(c => c.uid), () => .999999999);
  assert.equal(result.success, true);
});

test('Nguyên liệu cùng OVR từ 125 được 1 vạch; dưới 125 tăng 0,25 vạch mỗi OVR', () => {
  const cases = [[1, 126, 20], [1, 125, 20], [1, 124, 25], [1, 123, 30], [1, 122, 35], [1, 121, 40], [2, 125, 20], [2, 124, 25]];
  for (const [level, rating, energy] of cases) {
    const target = cardWith(rating, level);
    assert.equal(ovr(target), rating);
    assert.equal(upgradeInfo(target, [{ ...makeCard(target.playerId), level }]).energy, energy, `OVR ${rating}`);
  }
  const target = cardWith(125), other = () => cardWith(125, 1, [target.playerId]);
  assert.equal(upgradeInfo(target, [other()]).energy, 20, 'Không phụ thuộc trùng cầu thủ');
  assert.equal(upgradeInfo(target, []).chance, 0);
  assert.equal(upgradeInfo(target, Array.from({ length: 5 }, other)).energy, 100);
});

test('Phôi thấp hơn 7 OVR đóng góp 1/5 mức cùng OVR; 122 đập 129 được 0,2 vạch', () => {
  const target = cardWith(129, 4);
  assert.equal(ovr(target), 129);
  const cases = [[4, 129, 20], [3, 128, 15.9], [1, 127, 12.6], [1, 126, 10], [1, 125, 8], [1, 124, 6.3], [1, 123, 5], [1, 122, 4], [1, 121, 3.2]];
  for (const [level, rating, energy] of cases) {
    const material = cardWith(rating, level);
    assert.equal(ovr(material), rating);
    assert.equal(upgradeInfo(target, [material]).energy, energy, `${rating} → 129`);
  }
  const materials = Array.from({ length: 5 }, () => cardWith(122));
  assert.equal(upgradeInfo(target, materials).energy, 20, '5 phôi 122 bằng 1 vạch khi đập 129');
  assert.equal(upgradeInfo(target, [cardWith(122)]).chance, 2, 'Tỷ lệ thành công dùng đúng năng lượng mới');
  const higher = cardWith(130, 4);
  assert.equal(ovr(higher), 130);
  assert.equal(upgradeInfo(target, [higher]).energy, 21.2);
});

test('Năng lượng phôi thấp OVR vẫn tính từ mức cùng OVR và cộng đúng phần xem trước', () => {
  const target = cardWith(124);
  assert.equal(upgradeInfo(target, [cardWith(123)]).energy, 19.9);
  const materials = Array.from({ length: 3 }, () => cardWith(123));
  assert.equal(upgradeInfo(target, materials).energy, 59.7);
  assert.equal(upgradeInfo(cardWith(126), [cardWith(123)]).energy, 10);
});

test('Năng lượng tăng theo OVR nguyên liệu và cộng dồn tối đa 5 vạch', () => {
  const target = cardWith(124);
  const low = upgradeInfo(target, [cardWith(123)]).energy;
  const equal = upgradeInfo(target, [cardWith(124, 1, [target.playerId])]).energy;
  const high = upgradeInfo(target, [cardWith(125)]).energy;
  assert.ok(low < equal && equal < high);
  assert.equal(upgradeInfo(target, [cardWith(124, 1, [target.playerId]), cardWith(124, 1, [target.playerId])]).energy, 50);
  assert.equal(upgradeInfo(target, Array.from({ length: 5 }, () => cardWith(124, 1, [target.playerId]))).energy, 100);
});
test('Thành công tăng +1; thất bại phục hồi theo phôi trùng, cả hai tiêu hao nguyên liệu và phí', () => {
  const target = { ...makeCard(33), level: 2 };
  const materialCards = Array.from({ length: 5 }, () => ({ ...makeCard(33), level: 2 }));
  const before = { ...initialSave(), cards: [target, ...materialCards] };
  const materials = materialCards.map(c => c.uid);
  for (const success of [true, false]) {
    const result = upgrade(before, target.uid, materials, () => success ? 0 : .999999);
    assert.equal(result.success, success); assert.equal(result.result.level, success ? 3 : 2);
    assert.equal(result.state.cards.length, before.cards.length - 5);
    assert.equal(result.state.balance, before.balance - 200000);
    assert.equal(result.state.history[0].success, success);
    assert.equal(before.cards[0].level, 2);
  }
});
test('Thất bại không có phôi trùng rơi ngẫu nhiên xuống mọi cấp thấp hơn, thấp nhất +1', () => {
  for (let level = 1; level < MAX_LEVEL; level++) {
    const target = { ...makeCard(33), level };
    const material = makeCard(34);
    const state = { ...initialSave(), cards: [target, material] };
    const snapshot = structuredClone(state);
    const range = Math.max(1, level - 1);
    for (let expected = 1; expected <= range; expected++) {
      const rolls = [.999999, (expected - .5) / range];
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

test('Phôi trùng chỉ phục hồi khi rớt dưới cấp phôi; lấy phôi trùng cao nhất', () => {
  const target = { ...makeCard(33), level: 8 };
  const materials = [{ ...makeCard(33), level: 3 }, { ...makeCard(33), level: 5 }, { ...makeCard(34), level: 13 }];
  for (const order of [materials, [...materials].reverse()]) {
    const state = { ...initialSave(), cards: [target, ...order] };
    for (const [dropRoll, dropped, final, restored] of [[0, 1, 5, 5], [.5, 4, 5, 5], [.8, 6, 6, null], [.999999, 7, 7, null]] as const) {
      const rolls = [.999999, dropRoll];
      const result = upgrade(state, target.uid, order.map(c => c.uid), () => rolls.shift()!);
      assert.equal(result.success, false);
      assert.equal(result.droppedLevel, dropped);
      assert.equal(result.result.level, final);
      assert.equal(result.restoredLevel, restored);
      assert.equal(result.state.cards.length, 1);
      assert.equal(result.state.cards[0].playerId, 33);
      assert.ok(validateSave(JSON.parse(JSON.stringify(result.state))));
      if (restored !== null) assert.ok(result.state.history[0].detail.includes(`+8 → +${dropped} → +5`));
    }
  }
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

test('Chế độ thử mở gói/nâng cấp với 0 xu và không thay đổi số dư gốc', () => {
  const before = { ...initialSave(), balance: 0 };
  const opened = openPacks(before, packs[0], 10, () => .99, true);
  assert.equal(opened.state.balance, 0);
  assert.equal(opened.cards.length, 10);
  assert.match(opened.state.history[0].detail, /Không trừ xu/);
  assert.throws(() => openPacks(before, packs[0], -1, () => 0, true));
  for (const outcome of [0, .99999]) {
    const result = upgrade(before, before.cards[0].uid, [before.cards[1].uid], () => outcome, true);
    assert.equal(result.state.balance, 0);
    assert.equal(result.state.cards.length, before.cards.length - 1);
    assert.match(result.state.history[0].detail, /Không trừ xu/);
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
  assert.equal(all.cards.length, 45);
  assert.equal(all.state.cards.length, before.cards.length + 45);
  // Chỉ xét gói đã có cầu thủ (gói INFINITE PRIME chưa mở được thì bỏ qua).
  const openable = packs.filter(isPackAvailable);
  assert.ok(openable.every(pack => all.state.unopened?.[pack.id] === 0));
  assert.equal(new Set(all.cards.map(card => getPlayer(card).tier)).size, 3);
  assert.equal(before.opened, 0);
  assert.ok(openable.every(pack => before.unopened?.[pack.id] === 15));

  const stocked = { ...before, balance: 1_000_000_000, unopened: Object.fromEntries(packs.map(pack => [pack.id, 80])) };
  const capped = openSelectedPacks(stocked, packs);
  assert.equal(capped.cards.length, 150);
  assert.equal(new Set(capped.cards.map(card => card.uid)).size, 150);
  assert.deepEqual(openable.map(pack => capped.state.unopened?.[pack.id]), [0, 10, 80]);
  assert.equal(capped.state.balance, stocked.balance - 80 * packs[0].price - 70 * packs[1].price);
  assert.equal(capped.state.opened, 150);
  assert.ok(validateSave(capped.state));
  assert.deepEqual(openable.map(pack => stocked.unopened[pack.id]), [80, 80, 80]);

  const single = openSelectedPacks({ ...stocked, unopened: { [packs[0].id]: 151 } }, [packs[0], packs[0]], () => 0, true);
  assert.equal(single.cards.length, 150);
  assert.equal(single.state.unopened?.[packs[0].id], 1);
  const duplicate = openSelectedPacks(before, [packs[0], packs[0]], () => 0, true);
  assert.equal(duplicate.cards.length, 15);
  assert.throws(() => openSelectedPacks(before, []));
  assert.throws(() => openSelectedPacks(all.state, packs, () => 0, true));
  const insufficient = { ...stocked, balance: packs[0].price * 80 };
  assert.throws(() => openSelectedPacks(insufficient, packs), /Không đủ xu/);
  assert.equal(insufficient.opened, 0);
  assert.deepEqual(openable.map(pack => insufficient.unopened[pack.id]), [80, 80, 80]);
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
