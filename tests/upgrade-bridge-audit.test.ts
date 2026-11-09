import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_CONFIG } from '../src/upgrade/config.ts';
import { seededRng, type Rng } from '../src/upgrade/rng.ts';
import { formatChain } from '../src/upgrade/dropTracking.ts';
import { matchPublic, publicPatternList } from '../src/upgrade/publicPattern.ts';
import { historicalCandidates, hiddenMatches } from '../src/upgrade/hiddenPattern.ts';
import { finalRate } from '../src/upgrade/probability.ts';
import { emptyBridge, isBridgeState, previewUpgrade, recordOutcome, resolveUpgrade, type BridgeState, type LevelBridge } from '../src/upgrade/engine.ts';
const previewRate = (bridge: BridgeState, currentLevel: number, baseRate: number) => previewUpgrade(bridge, currentLevel, baseRate).rate;
import { makeCard, UPGRADE_LEVELS, upgrade, upgradeInfo, validateSave } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';

const always = (value: number): Rng => () => value;
// Đếm số lần một RNG bị gọi.
const counted = (rng: Rng) => { const wrapped = Object.assign(() => { wrapped.calls++; return rng(); }, { calls: 0 }); return wrapped; };
const bridgeWith = (target: number, level: Partial<LevelBridge>, extra: Partial<BridgeState> = {}): BridgeState => ({
  ...emptyBridge(), ...extra,
  levels: { [target]: { chain: [], publicSource: null, history: [], patterns: { historical: null, sum3: null, quad: null }, ...level } },
});
const playChain = (bridge: BridgeState, currentLevel: number, drops: number[], rng: Rng = always(.5)) => {
  for (const drop of drops) bridge = recordOutcome(bridge, currentLevel, { success: false, drop }, rng);
  return recordOutcome(bridge, currentLevel, { success: true }, rng);
};
const baseRate = (currentLevel: number) => UPGRADE_LEVELS[currentLevel].chance;
// Số RNG rơi giữa đoạn trọng số của mức rớt cần có.
const dropRoll = (currentLevel: number, drop: number) => {
  const weights = BRIDGE_CONFIG.dropWeights[currentLevel], total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let below = 0;
  for (const [level, weight] of weights) { if (level === drop) return (below + weight / 2) / total; below += weight; }
  throw new Error(`+${currentLevel} không rớt về +${drop}`);
};

test('RNG: luồng kết quả chỉ bị gọi 1 lần khi thành công, 2 lần khi thất bại, bất kể cầu ngầm', () => {
  const states = [emptyBridge(), playChain(playChain(emptyBridge(), 7, [1, 2, 3, 4]), 7, [5, 5, 5]), bridgeWith(8, { chain: [1, 5, 2], patterns: { historical: null, sum3: [1, 5, 2], quad: [5, 5, 5, 5] } }, { backToBack: 8 })];
  for (const bridge of states) for (const patternSeed of [1, 2, 3, 4, 5]) for (const roll of [.01, .99]) {
    const outcome = counted(script(roll, .5)), pattern = counted(seededRng(patternSeed));
    const result = resolveUpgrade(bridge, { currentLevel: 7, baseRate: 7, role: 'main' }, { outcome, pattern });
    assert.equal(outcome.calls, result.success ? 1 : 2);
  }
});
function script(...values: number[]): Rng { return () => { if (!values.length) throw new Error('Hết RNG kịch bản'); return values.shift()!; }; }

test('RNG: đổi seed cầu ngầm không làm lệch chuỗi roll kết quả (khi không có thưởng)', () => {
  // Gốc 50%, không cầu nào khớp được (không có mẫu): kết quả chỉ phụ thuộc luồng kết quả.
  const run = (patternSeed: number) => {
    const outcome = seededRng(2024), pattern = seededRng(patternSeed); let bridge = emptyBridge(); const out: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const r = resolveUpgrade(bridge, { currentLevel: 4, baseRate: 50, role: 'main' }, { outcome, pattern });
      if (r.turn.bonus > 0) { out.push('bonus'); break; }
      out.push(`${r.success}:${r.drop}`); bridge = { ...r.bridge, levels: {}, backToBack: null };
    }
    return out;
  };
  assert.deepEqual(run(1), run(999));
  assert.ok(!run(1).includes('bonus'));
});

test('Dây rớt: khôi phục cấp thẻ vẫn ghi mức rớt gốc do engine roll', () => {
  const target = { ...makeCard(33), level: 8 };
  const materials = [{ ...makeCard(33), level: 5 }, { ...makeCard(34), level: 1 }];
  const state = { ...initialSave(), cards: [target, ...materials] };
  const result = upgrade(state, target.uid, materials.map(c => c.uid), script(.999999, 0, .1), true, { patternRng: always(.5), restore: { chance: 50, floor: 8 } });
  assert.equal(result.droppedLevel, 1); assert.equal(result.restoredLevel, 8); assert.equal(result.result.level, 8);
  assert.deepEqual(result.state.bridge!.levels['9'].chain, [1], 'Ghi +1 (mức rớt), không ghi +8 (sau khi khôi phục)');
  assert.equal(result.turn.drop, 1);
});

test('Dây rớt: 12145 = 7 lưu chu kỳ, dây chuẩn 2145, phôi và thẻ chính dùng chung dây', () => {
  let bridge = emptyBridge();
  const drops = [1, 2, 1, 4, 5];
  drops.forEach((drop, i) => {
    const r = resolveUpgrade(bridge, { currentLevel: 6, baseRate: 15, role: i % 2 ? 'main' : 'material' }, { outcome: script(.99, dropRoll(6, drop)), pattern: always(.5) });
    assert.equal(r.drop, drop); bridge = r.bridge;
  });
  assert.deepEqual(bridge.levels['7'].chain, drops, 'Thất bại không reset dây');
  bridge = resolveUpgrade(bridge, { currentLevel: 6, baseRate: 15, role: 'main' }, { outcome: always(0), pattern: always(.5) }).bridge;
  assert.deepEqual(bridge.levels['7'].history.at(-1), drops);
  assert.deepEqual(bridge.levels['7'].publicSource, [2, 1, 4, 5]);
});

test('Cầu công khai: từng độ dài, thuận và đảo; đoạn giữa không hợp lệ', () => {
  const source = [2, 1, 4, 5];
  const list = publicPatternList(source).map(formatChain);
  for (const valid of ['5', '45', '54', '145', '541', '2145', '5412']) assert.ok(list.includes(valid), valid);
  for (const invalid of ['21', '14', '214', '12', '41', '412']) assert.ok(!list.includes(invalid), invalid);
  const cases: [number[], number, number][] = [[[5], 1, 14.5], [[4, 5], 2, 22], [[5, 4], 2, 22], [[1, 4, 5], 3, 29.5], [[5, 4, 1], 3, 29.5], [[2, 1, 4, 5], 4, 37], [[5, 4, 1, 2], 4, 37]];
  for (const [chain, length, rate] of cases) {
    const m = matchPublic(source, [6, ...chain]);
    assert.equal(m.length, length, formatChain(chain)); assert.equal(finalRate(7, m.bonus, 0), rate);
  }
  for (const middle of [[2, 1], [1, 4], [2, 1, 4]]) assert.equal(matchPublic(source, middle).length, 0);
});

test('Cầu lịch sử: 123223 chỉ cho 223 / 322 / 3223; không lấy dây cấp khác', () => {
  const list = historicalCandidates([1, 2, 3, 2, 2, 3]).map(formatChain);
  assert.deepEqual(list.sort(), ['223', '322', '3223']);
  for (const invalid of ['3', '23', '32', '123', '1223']) assert.ok(!list.includes(invalid), invalid);
  // Đã bỏ cầu ngầm: engine không còn tạo mẫu ngầm cho cấp nào (hàm ứng viên chỉ còn dùng để kiểm tra bản lưu cũ).
  let bridge = playChain(emptyBridge(), 6, [1, 2, 3, 2, 2, 3]);
  bridge = playChain(bridge, 7, [6]);
  assert.equal(bridge.levels['7'].patterns, null);
  assert.equal(bridge.levels['8'].patterns, null);
});

test('Tứ quý: 3333 khớp 3333 và 123333; không khớp 2222 và 3332', () => {
  const patterns = { historical: null, sum3: null, quad: [3, 3, 3, 3] };
  assert.ok(hiddenMatches('quad', patterns, [3, 3, 3, 3])); assert.ok(hiddenMatches('quad', patterns, [1, 2, 3, 3, 3, 3]));
  assert.ok(!hiddenMatches('quad', patterns, [2, 2, 2, 2])); assert.ok(!hiddenMatches('quad', patterns, [3, 3, 3, 2]));
});

test('Đã bỏ nổ liên tiếp: bản lưu cũ đang có hiệu ứng thì lượt kế tiếp vẫn đúng tỷ lệ gốc, rồi hiệu ứng bị xoá', () => {
  const armed: BridgeState = { ...emptyBridge(), backToBack: 7 };
  for (const role of ['main', 'material'] as const) {
    const r = resolveUpgrade(armed, { currentLevel: 6, baseRate: 15, role }, { outcome: always(.99), pattern: always(.99) });
    assert.equal(r.turn.hiddenKind, null); assert.equal(r.rate, 15); assert.equal(r.bridge.backToBack, null);
  }
  assert.equal(resolveUpgrade(emptyBridge(), { currentLevel: 6, baseRate: 15, role: 'main' }, { outcome: always(0), pattern: always(0) }).bridge.backToBack, null);
});

test('Đã bỏ cầu ngầm: 5.000 lượt toàn engine, tỷ lệ thật luôn = gốc + cầu công khai, đúng như xem trước', () => {
  const rng = seededRng(11);
  let state = emptyBridge();
  for (let i = 0; i < 5000; i++) {
    const shown = previewRate(state, 7, 7);
    const r = resolveUpgrade(state, { currentLevel: 7, baseRate: 7, role: 'main' }, { outcome: rng, pattern: rng });
    assert.equal(r.turn.hiddenKind, null); assert.equal(r.turn.hiddenBonus, 0);
    assert.equal(r.turn.bonus, r.turn.publicBonus); assert.equal(r.rate, finalRate(7, r.turn.publicBonus, 0));
    assert.equal(r.rate, shown, 'tỷ lệ roll bằng tỷ lệ xem trước');
    state = r.bridge;
  }
});

test('Công thức: +7 → +8 đủ các mức, +2 → +3 cộng 30 bị chặn ở 100% (cộng điểm %, không nhân 1,3)', () => {
  assert.equal(baseRate(7), 7);
  assert.deepEqual([[0, 0], [7.5, 0], [15, 0], [22.5, 0], [30, 0], [0, 30], [22.5, 30], [30, 30]].map(([p, h]) => finalRate(7, p, h)), [7, 14.5, 22, 29.5, 37, 37, 37, 37]);
  assert.equal(baseRate(2), 81);
  assert.equal(finalRate(81, 0, 30), 100);
  assert.notEqual(finalRate(15, 0, 30), 15 * 1.3);
  // Đã bỏ cầu công khai: dây khớp 4 số cũ ở +2 → +3 vẫn 81%, roll 0,999999 thất bại.
  const pub = bridgeWith(3, { chain: [1, 1, 1, 1], publicSource: [1, 1, 1, 1] });
  const r = resolveUpgrade(pub, { currentLevel: 2, baseRate: 81, role: 'main' }, { outcome: always(.999999), pattern: always(0) });
  assert.equal(r.rate, 81); assert.equal(r.success, false);
  // Cấp 100% vẫn luôn thành công.
  assert.equal(resolveUpgrade(emptyBridge(), { currentLevel: 1, baseRate: 100, role: 'main' }, { outcome: always(.999999), pattern: always(0) }).success, true);
  // Mẫu tứ quý ngầm cũ không còn tác dụng: vẫn 81%.
  const hidden = bridgeWith(3, { chain: [1, 1, 1, 1], patterns: { historical: null, sum3: null, quad: [1, 1, 1, 1] } });
  assert.equal(resolveUpgrade(hidden, { currentLevel: 2, baseRate: 81, role: 'main' }, { outcome: always(.999999), pattern: always(0) }).rate, 81);
});

test('Lưu trữ: giới hạn 100 dây / 12 số / 200 lượt; cắt lịch sử không làm hỏng cầu đang hoạt động', () => {
  let bridge = emptyBridge();
  for (let i = 0; i < 130; i++) bridge = playChain(bridge, 7, Array.from({ length: 15 }, (_, j) => 1 + ((i + j) % 6)));
  const level = bridge.levels['8'];
  assert.equal(level.history.length, BRIDGE_CONFIG.historyLimit);
  assert.ok(level.history.every(chain => chain.length === BRIDGE_CONFIG.storedChainLength));
  assert.equal(bridge.log.length, BRIDGE_CONFIG.logLimit);
  assert.ok(isBridgeState(JSON.parse(JSON.stringify(bridge))), 'Mẫu lịch sử đang hoạt động vẫn lấy được từ lịch sử đã cắt');
  // Dây hiện tại cũng chỉ giữ 12 số cuối khi xịt liên tục.
  for (let i = 0; i < 40; i++) bridge = recordOutcome(bridge, 7, { success: false, drop: 1 + (i % 6) }, always(.5));
  assert.equal(bridge.levels['8'].chain.length, BRIDGE_CONFIG.storedChainLength);
  // Chuyển cấp không mất lịch sử cấp cũ.
  bridge = playChain(bridge, 5, [1, 2, 3]);
  assert.equal(bridge.levels['8'].history.length, BRIDGE_CONFIG.historyLimit);
});

test('Bản lưu: reload khôi phục đúng; dữ liệu cũ / hỏng / bị sửa tay để gian lận bị loại an toàn', () => {
  const target = { ...makeCard(11), level: 7 }, materials = Array.from({ length: 5 }, () => ({ ...makeCard(11), level: 7 }));
  const done = upgrade({ ...initialSave(), cards: [target, ...materials] }, target.uid, materials.map(c => c.uid), always(.99), true, { patternRng: seededRng(1) });
  const reloaded = JSON.parse(JSON.stringify(done.state));
  assert.ok(validateSave(reloaded)); assert.deepEqual(reloaded.bridge, done.state.bridge);
  const legacy = JSON.parse(JSON.stringify({ ...done.state, bridge: undefined }));
  assert.ok(validateSave(legacy)); assert.equal(legacy.bridge, undefined);
  const good = done.state.bridge!;
  const forged: unknown[] = [
    { ...good, levels: { 8: { ...good.levels['8'], patterns: { historical: null, sum3: [3, 4, 2], quad: null } } } },
    { ...good, levels: { 8: { ...good.levels['8'], patterns: { historical: [1, 1, 1], sum3: null, quad: null } } } },
    { ...good, levels: { 8: { ...good.levels['8'], patterns: { historical: null, sum3: null, quad: [7, 7, 7, 7] } } } },
    { ...good, levels: { 8: { ...good.levels['8'], chain: [0] } } },
    { ...good, levels: { '08': good.levels['8'] } },
    { ...good, backToBack: 99 },
    { ...good, log: [{ ...good.log[0], hiddenPattern: 'abc' }] },
    { ...good, log: [{ ...good.log[0], rate: 500 }] },
    { ...good, log: [null] },
    'rác', null, [],
  ];
  for (const bridge of forged) {
    const save = JSON.parse(JSON.stringify({ ...done.state, bridge }));
    assert.ok(validateSave(save), 'Bản lưu vẫn dùng được');
    assert.equal(save.bridge, undefined, JSON.stringify(bridge).slice(0, 80));
  }
  // Mẫu tổng 3 hợp lệ thì vẫn nhận.
  assert.ok(isBridgeState({ ...good, levels: { 8: { ...good.levels['8'], patterns: { historical: null, sum3: [4, 2, 2], quad: [3, 3, 3, 3] } } } }));
});

test('Tương thích: OVR, năng lượng nguyên liệu và tỷ lệ gốc không đổi; không nhân đôi thẻ', () => {
  assert.deepEqual(UPGRADE_LEVELS.map(l => l.chance), [0, 100, 81, 64, 50, 26, 15, 7, 4, 2, 1, .7, .5]);
  const target = { ...makeCard(11), level: 6 }, materials = Array.from({ length: 5 }, () => ({ ...makeCard(11), level: 13 }));
  const state = { ...initialSave(), cards: [target, ...materials] };
  assert.equal(upgradeInfo(target, materials).chance, 15);
  for (const roll of [0, .99]) {
    const r = upgrade(state, target.uid, materials.map(c => c.uid), script(roll, .5), true, { patternRng: always(.5) });
    assert.equal(r.state.cards.length, 1); assert.equal(new Set(r.state.cards.map(c => c.uid)).size, 1);
    assert.equal(r.state.upgrades, state.upgrades + 1); assert.equal(r.state.bridge!.turn, 1);
  }
  assert.equal(state.bridge, undefined, 'Hàm thuần: không sửa trạng thái đầu vào');
});

// Nhóm A: khóa trạng thái cầu, 100.000 lượt độc lập mỗi cấp và mỗi mức thưởng.
test('Xác suất nhóm A — +5→+6 … +9→+10, mỗi mức thưởng 100.000 lượt', () => {
  const N = 100_000;
  for (const currentLevel of [5, 6, 7, 8, 9]) {
    const base = baseRate(currentLevel), target = currentLevel + 1;
    const scenarios: [string, BridgeState, number][] = [
      ['không cầu', bridgeWith(target, {}), base],
      ['dây khớp công khai 2 số cũ (đã bỏ)', bridgeWith(target, { chain: [3, 2, 1], publicSource: [1, 2, 1] }), base],
      ['dây khớp công khai 4 số cũ (đã bỏ)', bridgeWith(target, { chain: [1, 2, 2, 1], publicSource: [1, 2, 2, 1] }), base],
      ['bản lưu cũ còn nổ liên tiếp (đã bỏ)', bridgeWith(target, {}, { backToBack: target }), base],
    ];
    scenarios.forEach(([label, bridge, expected], k) => {
      const outcome = seededRng(currentLevel * 100 + k), pattern = seededRng(currentLevel * 100 + k + 50);
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const r = resolveUpgrade(bridge, { currentLevel, baseRate: base, role: i % 2 ? 'main' : 'material' }, { outcome, pattern });
        assert.equal(r.rate, expected);
        if (r.success) wins++;
      }
      const p = expected / 100, tolerance = 4.5 * Math.sqrt(p * (1 - p) / N);
      assert.ok(Math.abs(wins / N - p) <= tolerance, `+${currentLevel} ${label}: ${wins / N} vs ${p}`);
    });
  }
});

// Nhóm B: chạy toàn engine, trạng thái cầu tự biến đổi; so sánh theo từng nhóm có cùng tỷ lệ đã tính, không so với tỷ lệ gốc.
test('Xác suất nhóm B — toàn engine 100.000 lượt mỗi cấp, đúng xác suất theo từng mức tỷ lệ đã tính', () => {
  const N = 100_000;
  for (const currentLevel of [5, 6, 7, 8, 9]) {
    const base = baseRate(currentLevel), rng = seededRng(currentLevel), pattern = seededRng(currentLevel + 1000);
    let bridge = emptyBridge();
    const buckets = new Map<number, { n: number; wins: number }>();
    for (let i = 0; i < N; i++) {
      const r = resolveUpgrade(bridge, { currentLevel, baseRate: base, role: i % 3 ? 'material' : 'main' }, { outcome: rng, pattern });
      const b = buckets.get(r.rate) ?? { n: 0, wins: 0 }; b.n++; if (r.success) b.wins++; buckets.set(r.rate, b);
      bridge = r.bridge;
    }
    assert.ok([...buckets.keys()].every(rate => [0, 7.5, 15, 22.5, 30].some(bonus => rate === Math.min(100, base + bonus))), `+${currentLevel} chỉ có mức tỷ lệ hợp lệ`);
    for (const [rate, { n, wins }] of buckets) {
      if (n < 1000) continue;
      const p = rate / 100, tolerance = 4.5 * Math.sqrt(p * (1 - p) / n);
      assert.ok(Math.abs(wins / n - p) <= tolerance, `+${currentLevel} mức ${rate}%: ${wins}/${n}`);
    }
  }
});
