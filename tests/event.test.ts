import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_RESET, START_BP, buyPacks, choosePool, dayKey, getPackStock, initialSave, openChosen, openPacks, openSelectedPacks, packs, shopPacks, validateSave } from '../src/game.ts';
import type { Entry } from '../src/game.ts';
import { EVENT_LEVELS, EVENT_MILESTONES, EVENT_MISSIONS, EVENT_PLAYS, EVENT_ROUND, claimMilestone, eventRound, claimMission, eventLevel, eventState, findPack, milestoneAvailable, missionProgress, playEvent } from '../src/event.ts';

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

test('Mọi hũ quà và mốc quà đều là gói đang bán hoặc BP; mỗi cấp có 8 hũ', () => {
  for (const level of EVENT_LEVELS) {
    assert.equal(level.jars.length, 8);
    for (const jar of level.jars) assert.ok('bp' in jar.reward ? jar.reward.bp > 0 : 'fc' in jar.reward ? jar.reward.fc > 0 : findPack(jar.reward.pack) && jar.reward.count > 0);
  }
  for (const m of EVENT_MILESTONES) for (const option of m.options) for (const r of option) assert.ok('bp' in r ? r.bp > 0 : 'fc' in r ? r.fc > 0 : findPack(r.pack), `mốc ${m.points}`);
});

test('Chơi trừ FC, trúng hũ theo tỷ lệ, cộng điểm của hũ, cộng BP / gói vào kho', () => {
  const before = { ...initialSave(), fc: 210 };
  // rng 0 → hũ đầu (BP), 0.999 → hũ cuối (gói).
  const { state, hits, points } = playEvent(before, 10, seq(0, .999));
  assert.equal(state.fc, 20);
  assert.deepEqual(hits.slice(0, 2).map(h => h.jar), [0, 7]);
  assert.equal(state.event?.points, points);
  assert.equal(state.event?.plays, 10);
  assert.equal(state.event?.paid, 10);
  assert.equal(state.event?.log?.length, 10);
  assert.equal(state.event?.log?.[0].jar, hits[9].jar);
  assert.deepEqual(state.event?.log?.[9].reward, EVENT_LEVELS[0].jars[0].reward);
  const first = EVENT_LEVELS[0].jars[0].reward, last = EVENT_LEVELS[0].jars[7].reward;
  assert.ok('bp' in first && 'pack' in last);
  assert.ok(state.balance > before.balance);
  const pack = packs.find(p => p.id === last.pack)!;
  assert.ok(getPackStock(state, pack) > getPackStock(before, pack));
  assert.equal(state.cards, before.cards);
  assert.equal(state.history[0].type, 'event');
  assert.ok(validateSave(JSON.parse(JSON.stringify(state))));
  assert.throws(() => playEvent(state, 10), /Không đủ FC/);
  // Chế độ thử không trừ FC; hũ quà FC vẫn cộng thêm FC.
  const trial = playEvent(state, 100, undefined, true);
  assert.equal(trial.state.fc, 20 + trial.rewards.reduce((sum, r) => sum + ('fc' in r ? r.fc : 0), 0));
});

test('Giữ giá lượt chơi cũ, tỷ lệ hũ cho chi phí trung bình 12.000 FC/vòng với gói 50/100', () => {
  assert.deepEqual(EVENT_PLAYS.map(({ count, price }) => [count, price]), [[1, 20], [10, 190], [50, 900], [100, 1800]]);
  for (const level of EVENT_LEVELS) {
    const totalWeight = level.jars.reduce((sum, jar) => sum + jar.weight, 0);
    const averagePoints = level.jars.reduce((sum, jar) => sum + jar.points * jar.weight, 0) / totalWeight;
    for (const option of EVENT_PLAYS) {
      const roundCost = EVENT_ROUND / averagePoints * option.price / option.count;
      if (option.count >= 50) assert.ok(Math.abs(roundCost - 12_000) < 0.01, `${option.count} lượt: ${roundCost} FC/vòng`);
      // Kiểm tra số FC thực trừ ở từng gói, chọn hũ BP để không có FC thưởng.
      const before = { ...initialSave(), fc: 20_000 };
      assert.equal(playEvent(before, option.count, () => 0).state.fc, before.fc - option.price);
    }
  }
});

test('Lên cấp đổi sang kho hũ của cấp mới', () => {
  const save = { ...initialSave(), event: { points: EVENT_LEVELS[1].points - 1, plays: 0, claimed: [] } };
  const { hits, levelAfter } = playEvent(save, 10, () => .999, true);
  assert.equal(hits[0].level, 0);
  assert.equal(hits[1].level, 1);
  assert.equal(levelAfter, eventLevel(EVENT_LEVELS[1].points - 1 + 10 * 20));
});

test('Nhiệm vụ ngày cho lượt miễn phí; lượt miễn phí dùng để chơi 1 lượt', () => {
  const today = dayKey();
  const history: Entry[] = [0, 1, 2].map(i => ({ id: `p${i}`, time: Date.now(), type: 'pack', title: 'Mở', detail: '' }));
  let save = { ...initialSave(), daily: today, history };
  assert.equal(missionProgress(save, EVENT_MISSIONS.find(m => m.id === 'pack')!), 3);
  save = claimMission(claimMission(save, 'daily'), 'pack');
  assert.equal(eventState(save).free, 2);
  assert.throws(() => claimMission(save, 'pack'), /đã nhận/);
  assert.throws(() => claimMission(save, 'upgrade'), /Chưa hoàn thành/);
  // rng 0 → hũ đầu (BP), để FC không đổi vì trúng hũ FC.
  const played = playEvent(save, 1, () => 0, false, 'free');
  assert.equal(eventState(played.state).free, 1);
  assert.equal(played.state.fc ?? 0, save.fc ?? 0);
  assert.equal(eventState(played.state).paid, 0);
  // Sang ngày mới: nhiệm vụ làm lại, lượt miễn phí vẫn còn.
  const tomorrow = eventState(played.state, '2999-01-01');
  assert.deepEqual(tomorrow.missions, []);
  assert.equal(tomorrow.free, 1);
  assert.throws(() => playEvent({ ...initialSave() }, 1, undefined, false, 'free'), /không có lượt/);
});

test('Quà tích lũy: mốc 1 lựa chọn nhận luôn, mốc 3 lựa chọn phải chọn; mỗi 1.250 điểm thêm 1 lần nhận, mốc once chỉ 1 lần', () => {
  const once = EVENT_MILESTONES.findIndex(m => m.once), single = EVENT_MILESTONES.findIndex(m => !m.once && m.options.length === 1), pick = EVENT_MILESTONES.findIndex(m => m.options.length === 3);
  const at = (points: number) => ({ ...initialSave(), event: { points, plays: 0, claimed: [] } });
  assert.equal(milestoneAvailable(at(0), once), 0);
  // 2 vòng + 100 điểm: mốc thường nhận 3 lần (nếu ≤ 100 điểm), mốc once vẫn 1 lần.
  const save = at(2 * EVENT_ROUND + EVENT_MILESTONES[pick].points);
  assert.equal(milestoneAvailable(save, once), 1);
  assert.equal(milestoneAvailable(save, single), 3);
  assert.equal(milestoneAvailable(save, pick), 3);
  assert.deepEqual(eventRound(save.event.points), { done: 2, next: EVENT_ROUND - EVENT_MILESTONES[pick].points });
  const first = claimMilestone(save, once, null);
  assert.equal(milestoneAvailable(first.state, once), 0);
  assert.throws(() => claimMilestone(first.state, once, null), /Cần/);
  assert.throws(() => claimMilestone(save, pick, null), /chọn một phần quà/);
  const picked = claimMilestone(save, pick, 1), bundle = EVENT_MILESTONES[pick].options[1];
  assert.deepEqual(picked.rewards, bundle);
  const pack = bundle.find(r => 'pack' in r)!, bp = bundle.find(r => 'bp' in r)!;
  assert.ok('pack' in pack && 'bp' in bp);
  assert.equal(getPackStock(picked.state, findPack(pack.pack)!), getPackStock(save, findPack(pack.pack)!) + 1);
  assert.equal(picked.state.balance, save.balance + bp.bp);
  assert.equal(milestoneAvailable(picked.state, pick), 2);
  assert.deepEqual(picked.state.event?.gifts?.[0].rewards, bundle);
  assert.ok(validateSave(JSON.parse(JSON.stringify(picked.state))));
  // Bản lưu cũ ghi 1 quà (reward) mỗi lần nhận mốc vẫn đọc được.
  const old = JSON.parse(JSON.stringify({ ...save, event: { ...save.event, gifts: [{ time: 1, milestone: 0, reward: { bp: 5 } }] } }));
  assert.ok(validateSave(old));
  assert.deepEqual(old.event.gifts[0].rewards, [{ bp: 5 }]);
});

test('Hũ nhiều điểm hiếm hơn hũ ít điểm', () => {
  for (const level of EVENT_LEVELS) for (let i = 1; i < level.jars.length; i++) assert.ok(level.jars[i].points >= level.jars[i - 1].points && level.jars[i].weight <= level.jars[i - 1].weight);
});

test('Bản lưu có FC hoặc tiến trình sự kiện hỏng vẫn mở được, chỉ bỏ phần hỏng', () => {
  const data = JSON.parse(JSON.stringify({ ...initialSave(), fc: -5, event: { points: 1, plays: 0, claimed: [], free: -1 } }));
  assert.ok(validateSave(data));
  assert.equal(data.fc, undefined);
  assert.equal(data.event, undefined);
});

test('Gói chỉ có từ sự kiện: không bán trong Shop, kho mặc định 0, trúng hũ thì vào kho; quà FC cộng FC', () => {
  const eventPacks = packs.filter(p => p.eventOnly);
  // Gói chỉ có từ sự kiện = đúng các gói xuất hiện trong hũ / quà tích lũy (trừ gói đang bán như ICON TM, TOP PRICE 350 +8).
  const used = new Set([...EVENT_LEVELS.flatMap(l => l.jars.map(j => j.reward)), ...EVENT_MILESTONES.flatMap(m => m.options.flat())].flatMap(r => 'pack' in r ? [r.pack] : []));
  assert.deepEqual([...used].filter(id => packs.find(p => p.id === id)?.eventOnly).sort(), eventPacks.map(p => p.id).sort());
  const save = initialSave();
  for (const pack of eventPacks) {
    assert.ok(!shopPacks.includes(pack));
    assert.equal(getPackStock(save, pack), 0);
    assert.throws(() => buyPacks(save, pack, 1), /chưa có trong shop/);
  }
  const jars = EVENT_LEVELS[0].jars, jarOf = (pred: (r: typeof jars[number]['reward']) => boolean) => jars.findIndex(j => pred(j.reward));
  const pick = (i: number) => { const total = jars.reduce((s, j) => s + j.weight, 0); return (jars.slice(0, i).reduce((s, j) => s + j.weight, 0) + jars[i].weight / 2) / total; };
  const top = jarOf(r => 'pack' in r && r.pack === 'event-top-250'), fc = jarOf(r => 'fc' in r);
  const won = playEvent({ ...save, fc: 0 }, 1, () => pick(top), true).state;
  assert.equal(getPackStock(won, packs.find(p => p.id === 'event-top-250')!), 1);
  const gotFc = playEvent({ ...save, fc: 0 }, 1, () => pick(fc), true).state;
  assert.equal(gotFc.fc, 100);
  assert.ok(validateSave(JSON.parse(JSON.stringify(gotFc))));
});

test('Gói chỉ định: chọn 1 trong N cầu thủ giá cao nhất, nhận đúng cầu thủ ở cấp của gói; không mở ngẫu nhiên', () => {
  const pack = packs.find(p => p.id === 'event-2-uc80')!;
  const pool = choosePool(pack);
  assert.equal(pool.length, 80);
  assert.ok(pool.every(p => p.tier === 'uc'));
  const start = initialSave(), save = { ...start, unopened: { ...start.unopened, [pack.id]: 2 } };
  const pick = pool[5];
  const { state, card } = openChosen(save, pack, pick.id);
  assert.equal(card.playerId, pick.id);
  assert.equal(card.level, 5);
  assert.equal(getPackStock(state, pack), 1);
  assert.equal(state.cards[0], card);
  assert.throws(() => openChosen(save, pack, 1), /không có trong danh sách/);
  assert.throws(() => openChosen(start, pack, pick.id), /không còn gói/);
  assert.throws(() => openPacks(save, pack, 1), /gói chỉ định/);
  assert.throws(() => openSelectedPacks(save, [pack]), /Hãy chọn vật phẩm/);
});

test('Đặt lại một lần: bản lưu cũ về kho vật phẩm trống, mất tiến trình sự kiện, số dư về mức đầu; giữ thẻ', () => {
  const fresh = initialSave(), pack = packs.find(p => !p.eventOnly)!, eventPack = packs.find(p => p.eventOnly)!;
  const old = JSON.parse(JSON.stringify({ ...fresh, reset: undefined, fc: 777, balance: 123, unopened: { ...fresh.unopened, [pack.id]: 3, [eventPack.id]: 9 }, prepaid: { [pack.id]: 2 }, event: { points: 500, plays: 9, claimed: [1] } }));
  assert.ok(validateSave(old));
  assert.equal(old.reset, SAVE_RESET);
  assert.equal(getPackStock(old, pack), 0);
  assert.equal(getPackStock(old, eventPack), 0);
  assert.equal(old.prepaid, undefined);
  assert.equal(old.event, undefined);
  assert.deepEqual([old.fc, old.balance, old.cards.length], [undefined, START_BP, fresh.cards.length]);
  // Đã đặt lại rồi thì lần đọc sau giữ nguyên tiến trình mới.
  const later = JSON.parse(JSON.stringify({ ...old, unopened: { ...old.unopened, [pack.id]: 4 }, event: { points: 10, plays: 1, claimed: [] } }));
  assert.ok(validateSave(later));
  assert.equal(getPackStock(later, pack), 4);
  assert.equal(later.event.points, 10);
});
