import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_CONFIG } from '../src/upgrade/config.ts';
import { seededRng, type Rng } from '../src/upgrade/rng.ts';
import { dropRange, endsWith, formatChain, rollDrop, tail } from '../src/upgrade/dropTracking.ts';
import { matchPublic, publicPatternList } from '../src/upgrade/publicPattern.ts';
import { choosePatterns, eligibleKinds, hiddenMatches, historicalCandidates, quadCandidates, sum3Candidates } from '../src/upgrade/hiddenPattern.ts';
import { appliedBonus, finalRate } from '../src/upgrade/probability.ts';
import { emptyBridge, isBridgeState, previewUpgrade, recordOutcome, resolveUpgrade, type BridgeState, type LevelBridge, type UpgradeRole } from '../src/upgrade/engine.ts';
import { initialSave, makeCard, MAX_LEVEL, upgrade, validateSave } from '../src/game.ts';

const fmt = (patterns: number[][]) => patterns.map(formatChain).sort();
const always = (value: number): Rng => () => value;
const script = (...values: number[]): Rng => () => { if (!values.length) throw new Error('Hết giá trị RNG kịch bản'); return values.shift()!; };
// Dựng trạng thái một cấp để thử từng tình huống xác suất cố định.
const bridgeWith = (target: number, level: Partial<LevelBridge>, extra: Partial<BridgeState> = {}): BridgeState => ({
  ...emptyBridge(), ...extra,
  levels: { [target]: { chain: [], publicSource: null, history: [], patterns: { historical: null, sum3: null, quad: null }, ...level } },
});
// Ghi một dây xịt rồi nổ ở cấp hiện tại bằng nhập tay.
const playChain = (bridge: BridgeState, currentLevel: number, drops: number[], rng: Rng = always(.5)) => {
  for (const drop of drops) bridge = recordOutcome(bridge, currentLevel, { success: false, drop }, rng);
  return recordOutcome(bridge, currentLevel, { success: true }, rng);
};

test('Test 1 — Dây công khai 12145 = 7 cho cầu chuẩn 2145 và đúng 7 mẫu đuôi thuận/đảo', () => {
  const bridge = playChain(emptyBridge(), 6, [1, 2, 1, 4, 5]);
  const level = bridge.levels['7'];
  assert.deepEqual(level.publicSource, [2, 1, 4, 5]);
  assert.deepEqual(level.chain, [], 'Thành công reset dây hiện tại');
  assert.deepEqual(fmt(publicPatternList(level.publicSource)), ['145', '2145', '45', '5', '54', '541', '5412']);
  for (const middle of [[2, 1], [1, 4], [2, 1, 4]]) assert.equal(matchPublic(level.publicSource, [3, ...middle]).length, 0, `Không lấy đoạn giữa ${formatChain(middle)}`);
});

test('Cầu công khai chỉ thưởng mẫu dài nhất khớp: 7,5 / 15 / 22,5 / 30 điểm %', () => {
  const source = [2, 1, 4, 5];
  const cases: [number[], number, number][] = [[[3, 5], 1, 7.5], [[3, 4, 5], 2, 15], [[5, 4], 2, 15], [[3, 1, 4, 5], 3, 22.5], [[5, 4, 1], 3, 22.5], [[2, 1, 4, 5], 4, 30], [[1, 5, 4, 1, 2], 4, 30], [[4], 0, 0], [[], 0, 0]];
  for (const [chain, length, bonus] of cases) assert.deepEqual([matchPublic(source, chain).length, matchPublic(source, chain).bonus], [length, bonus], formatChain(chain));
  for (const [length, rate] of [[1, 14.5], [2, 22], [3, 29.5], [4, 37]]) assert.equal(finalRate(7, length * 7.5, 0), rate);
  assert.equal(matchPublic(null, [1, 2]).length, 0, 'Chưa có dây nổ thì không có cầu công khai');
});

test('Test 2 — Cầu ngầm lịch sử 123223 = 7 chỉ lấy 223, 322, 3223 (mẫu đối xứng không trùng)', () => {
  assert.deepEqual(fmt(historicalCandidates([1, 2, 3, 2, 2, 3])), ['223', '322', '3223']);
  assert.deepEqual(historicalCandidates([4, 5]), [], 'Dây dưới 3 mức rớt không đủ điều kiện');
  assert.deepEqual(fmt(historicalCandidates([1, 2, 3])), ['123', '321']);
  const patterns = choosePatterns([[4, 5], [], [1, 2, 3, 2, 2, 3]], 7, seededRng(9));
  assert.ok(['223', '322', '3223'].includes(formatChain(patterns.historical!)));
  assert.equal(choosePatterns([[4, 5], []], 7, seededRng(9)).historical, null, 'Không có dây đủ điều kiện thì loại lịch sử không tham gia');
  assert.ok(!eligibleKinds({ historical: null, sum3: [1, 5, 2], quad: [1, 1, 1, 1] }, false).includes('historical'));
});

test('Test 3 — Cầu tổng 3 cho mục tiêu +8 đúng 152, 242, 332, 422, 512; không đảo', () => {
  assert.deepEqual(fmt(sum3Candidates(8)), ['152', '242', '332', '422', '512']);
  for (let target = 2; target <= MAX_LEVEL; target++) for (const [a, b, c] of sum3Candidates(target)) {
    assert.equal(a + b + c, target); assert.equal(c, 2);
    assert.ok(a <= dropRange(target - 1).max && b <= dropRange(target - 1).max);
  }
  assert.deepEqual(sum3Candidates(3), [], 'Đập lên +3 chỉ rớt về +1 nên không có số 2');
  const patterns = { historical: null, sum3: [4, 2, 2], quad: null };
  assert.ok(hiddenMatches('sum3', patterns, [1, 4, 2, 2]));
  assert.ok(!hiddenMatches('sum3', patterns, [1, 5, 2]), 'Chỉ khớp mẫu đang chọn');
});

test('Test 4 — Tứ quý 3333 khớp dây 123333, không khớp 2222', () => {
  assert.deepEqual(fmt(quadCandidates(8)), ['1111', '2222', '3333', '4444', '5555', '6666']);
  const patterns = { historical: null, sum3: null, quad: [3, 3, 3, 3] };
  assert.ok(hiddenMatches('quad', patterns, [3, 3, 3, 3]));
  assert.ok(hiddenMatches('quad', patterns, [1, 2, 3, 3, 3, 3]));
  assert.ok(!hiddenMatches('quad', patterns, [2, 2, 2, 2]));
  assert.ok(!hiddenMatches('quad', patterns, [3, 3, 3]), 'Dây chưa đủ dài');
});

test('Test 5 — Nổ liên tiếp chỉ dùng cho đúng lượt kế tiếp cùng cấp, đập cấp khác xen giữa thì mất', () => {
  // RNG cầu = 0: thành công luôn bật nổ liên tiếp (0 < 30%).
  let bridge = resolveUpgrade(emptyBridge(), { currentLevel: 6, baseRate: 15, role: 'material' }, { outcome: always(0), pattern: always(0) }).bridge;
  assert.equal(bridge.backToBack, 7);
  // RNG cầu 0,99 chọn loại cuối trong danh sách đủ điều kiện = nổ liên tiếp.
  const next = resolveUpgrade(bridge, { currentLevel: 6, baseRate: 15, role: 'material' }, { outcome: always(.99), pattern: always(.99) });
  assert.equal(next.turn.hiddenKind, 'backToBack'); assert.equal(next.turn.hiddenBonus, 30); assert.equal(next.rate, 45);
  assert.equal(next.bridge.backToBack, null, 'Đã dùng xong, thất bại cũng hết hiệu lực');
  const again = resolveUpgrade(next.bridge, { currentLevel: 6, baseRate: 15, role: 'material' }, { outcome: always(.99), pattern: always(.99) });
  assert.notEqual(again.turn.hiddenKind, 'backToBack', 'Không bảo lưu sang lượt sau');
  // Đập cấp khác xen giữa.
  const other = resolveUpgrade(bridge, { currentLevel: 3, baseRate: 64, role: 'main' }, { outcome: always(.99), pattern: always(.99) });
  assert.equal(other.turn.hiddenKind === 'backToBack', false); assert.equal(other.bridge.backToBack, null);
  const back = resolveUpgrade(other.bridge, { currentLevel: 6, baseRate: 15, role: 'material' }, { outcome: always(.99), pattern: always(.99) });
  assert.notEqual(back.turn.hiddenKind, 'backToBack');
  // RNG cầu ≥ 30% sau thành công: không bật.
  assert.equal(resolveUpgrade(emptyBridge(), { currentLevel: 6, baseRate: 15, role: 'main' }, { outcome: always(0), pattern: always(.5) }).bridge.backToBack, null);
});

test('Test 6 — Không cộng dồn: công khai 22,5 + ngầm 30 chỉ thưởng 30', () => {
  assert.equal(appliedBonus(22.5, 30), 30);
  assert.equal(finalRate(7, 22.5, 30), 37);
  assert.equal(finalRate(7, 22.5, 0), 29.5);
  assert.equal(appliedBonus(30, 30), BRIDGE_CONFIG.bonusCap);
  // Qua engine: dây 1422 khớp công khai 3 số (422) và cầu tổng 3 422 được chọn.
  const bridge = bridgeWith(8, { chain: [1, 4, 2, 2], publicSource: [5, 4, 2, 2], patterns: { historical: null, sum3: [4, 2, 2], quad: [6, 6, 6, 6] } });
  const result = resolveUpgrade(bridge, { currentLevel: 7, baseRate: 7, role: 'main' }, { outcome: always(.99), pattern: always(0) });
  assert.equal(result.turn.hiddenKind, 'sum3');
  assert.deepEqual([result.turn.publicBonus, result.turn.hiddenBonus, result.turn.bonus, result.rate], [22.5, 30, 30, 37]);
  assert.equal(finalRate(90, 30, 30), 100, 'Không vượt 100%');
});

test('Cầu ngầm được chọn không khớp thì thưởng 0, không chuyển sang loại khác', () => {
  // Dây 6666 khớp tứ quý nhưng RNG chọn tổng 3 (loại đầu) → thưởng 0.
  const bridge = bridgeWith(8, { chain: [6, 6, 6, 6], patterns: { historical: null, sum3: [1, 5, 2], quad: [6, 6, 6, 6] } });
  const result = resolveUpgrade(bridge, { currentLevel: 7, baseRate: 7, role: 'main' }, { outcome: always(.99), pattern: always(0) });
  assert.equal(result.turn.hiddenKind, 'sum3'); assert.equal(result.turn.hiddenBonus, 0); assert.equal(result.rate, 7);
});

test('Test 7 — Thẻ chính và phôi cùng trạng thái có cùng tỷ lệ và cùng kết quả', () => {
  const bridge = bridgeWith(8, { chain: [3, 1, 4, 5], publicSource: [2, 1, 4, 5], patterns: { historical: [1, 4, 5], sum3: [1, 5, 2], quad: [2, 2, 2, 2] } });
  const run = (role: UpgradeRole) => resolveUpgrade(bridge, { currentLevel: 7, baseRate: 7, role }, { outcome: seededRng(5), pattern: seededRng(6) });
  const main = run('main'), material = run('material');
  assert.equal(main.rate, material.rate); assert.equal(main.success, material.success); assert.equal(main.drop, material.drop);
  assert.deepEqual({ ...main.turn, role: 0 }, { ...material.turn, role: 0 });
  assert.deepEqual(main.bridge.levels, material.bridge.levels);
  // Qua game.upgrade: cùng thẻ chính hay phôi đều cùng tỷ lệ.
  const target = { ...makeCard(11), level: 7 }, materials = Array.from({ length: 5 }, () => ({ ...makeCard(11), level: 7 }));
  const save = { ...initialSave(), cards: [target, ...materials], bridge };
  const rates = (['main', 'material'] as const).map(role => upgrade(save, target.uid, materials.map(c => c.uid), always(.5), true, { role, patternRng: always(0) }).turn.rate);
  assert.equal(rates[0], rates[1]);
});

test('Test 8 — Chu kỳ mới thành công thay cầu công khai bằng tối đa 4 số cuối của dây mới', () => {
  let bridge = playChain(emptyBridge(), 6, [1, 2, 1, 4, 5]);
  assert.deepEqual(bridge.levels['7'].publicSource, [2, 1, 4, 5]);
  bridge = playChain(bridge, 6, [3, 3]);
  assert.deepEqual(bridge.levels['7'].publicSource, [3, 3]);
  bridge = playChain(bridge, 6, []);
  assert.deepEqual(bridge.levels['7'].publicSource, [], 'Nổ ngay phát đầu: cầu mới rỗng');
  assert.equal(bridge.levels['7'].history.length, 3);
  // Mỗi cấp có lịch sử riêng.
  bridge = playChain(bridge, 7, [6, 5, 4]);
  assert.deepEqual(bridge.levels['7'].publicSource, []); assert.deepEqual(bridge.levels['8'].publicSource, [6, 5, 4]);
});

test('Thất bại không reset dây; thẻ chính và phôi cùng nối mức rớt vào dây', () => {
  let bridge = emptyBridge();
  for (const [role, roll] of [['material', .1], ['main', .7], ['material', .4]] as const) {
    const result = resolveUpgrade(bridge, { currentLevel: 7, baseRate: 7, role }, { outcome: script(.99, roll), pattern: always(.5) });
    assert.equal(result.success, false); assert.equal(result.drop, rollDrop(7, always(roll)));
    bridge = result.bridge;
  }
  assert.deepEqual(bridge.levels['8'].chain, [2, 4, 3], '+7: 0,1 → +2, 0,7 → +4, 0,4 → +3 theo bảng trọng số');
  assert.equal(bridge.log.length, 3); assert.equal(bridge.turn, 3);
});

test('Test 9 — 100.000 lượt mỗi trạng thái cố định: tỷ lệ quan sát tiệm cận tỷ lệ cấu hình', () => {
  const N = 100_000;
  const observe = (bridge: BridgeState, currentLevel: number, baseRate: number, seed: number) => {
    const outcome = seededRng(seed), pattern = seededRng(seed + 1);
    let wins = 0;
    for (let i = 0; i < N; i++) if (resolveUpgrade(bridge, { currentLevel, baseRate, role: 'main' }, { outcome, pattern }).success) wins++;
    return wins / N;
  };
  const near = (observed: number, expectedPercent: number, label: string) => {
    const p = expectedPercent / 100, tolerance = 4.5 * Math.sqrt(p * (1 - p) / N) + 1e-9;
    assert.ok(Math.abs(observed - p) <= tolerance, `${label}: quan sát ${observed}, kỳ vọng ${p} ± ${tolerance.toFixed(4)}`);
  };
  const quiet = { historical: null, sum3: [1, 5, 2], quad: [6, 6, 6, 6] };
  near(observe(bridgeWith(8, { patterns: quiet }), 7, 7, 1), 7, 'Gốc 7%');
  near(observe(bridgeWith(8, { chain: [3, 1, 4, 5], publicSource: [2, 1, 4, 5], patterns: quiet }), 7, 7, 2), 29.5, 'Công khai 3 số');
  near(observe(bridgeWith(8, { chain: [2, 1, 4, 5], publicSource: [2, 1, 4, 5], patterns: quiet }), 7, 7, 3), 37, 'Công khai 4 số');
  // Dây khớp tổng 3; tổng 3 và tứ quý đủ điều kiện → mỗi loại được chọn 1/2: kỳ vọng 7 + 30/2 = 22%.
  near(observe(bridgeWith(8, { chain: [1, 5, 2], patterns: quiet }), 7, 7, 4), 22, 'Cầu ngầm chọn ngẫu nhiên');
  near(observe(bridgeWith(6, { patterns: { historical: null, sum3: null, quad: null } }), 5, 50, 5), 50, 'Gốc 50%');
  // Phân bố mức rớt theo bảng trọng số của +8 (rớt về +1 … +6, không bao giờ +7).
  const rng = seededRng(77), counts = new Array(8).fill(0);
  for (let i = 0; i < N; i++) counts[rollDrop(8, rng)]++;
  assert.equal(counts[0], 0); assert.equal(counts[7], 0);
  for (const [level, weight] of BRIDGE_CONFIG.dropWeights[8]) near(counts[level] / N, weight, `Rớt về +${level}`);
});

test('Test 10 — Seeded RNG tái hiện chính xác chuỗi kết quả; trạng thái đầu vào không bị sửa', () => {
  const run = (seed: number) => {
    const outcome = seededRng(seed), pattern = seededRng(seed * 31 + 7);
    let bridge = emptyBridge(); const results: string[] = [];
    for (let i = 0; i < 400; i++) {
      const currentLevel = 4 + (i % 7 === 0 ? 2 : 3);
      const result = resolveUpgrade(bridge, { currentLevel, baseRate: currentLevel === 6 ? 26 : 15, role: i % 2 ? 'main' : 'material' }, { outcome, pattern });
      results.push(`${result.success}:${result.drop}:${result.rate}:${result.turn.hiddenKind}`); bridge = result.bridge;
    }
    return { results, bridge };
  };
  const a = run(42), b = run(42), c = run(43);
  assert.deepEqual(a.results, b.results); assert.deepEqual(a.bridge, b.bridge);
  assert.notDeepEqual(a.results, c.results);
  const snapshot = structuredClone(a.bridge);
  resolveUpgrade(a.bridge, { currentLevel: 7, baseRate: 15, role: 'main' }, { outcome: seededRng(1), pattern: seededRng(2) });
  assert.deepEqual(a.bridge, snapshot);
  assert.ok(isBridgeState(JSON.parse(JSON.stringify(a.bridge))));
});

test('Cấp 100% luôn thành công; dữ liệu đầu vào sai bị chặn trước khi nâng cấp', () => {
  const result = resolveUpgrade(emptyBridge(), { currentLevel: 1, baseRate: 100, role: 'main' }, { outcome: always(.999999), pattern: always(.5) });
  assert.equal(result.success, true); assert.equal(result.rate, 100);
  const input = (patch: object) => () => resolveUpgrade(emptyBridge(), { currentLevel: 7, baseRate: 7, role: 'main', ...patch } as never, { outcome: always(.5), pattern: always(.5) });
  assert.throws(input({ currentLevel: 13 })); assert.throws(input({ currentLevel: 0 })); assert.throws(input({ currentLevel: 2.5 }));
  assert.throws(input({ baseRate: -1 })); assert.throws(input({ baseRate: 101 })); assert.throws(input({ baseRate: NaN })); assert.throws(input({ role: 'khac' }));
  assert.throws(() => resolveUpgrade(emptyBridge(), { currentLevel: 7, baseRate: 7, role: 'main' }, { outcome: always(1), pattern: always(.5) }), /RNG/);
  assert.throws(() => recordOutcome(emptyBridge(), 7, { success: false, drop: 7 }, always(.5)), /Mức rớt/);
  assert.throws(() => recordOutcome(emptyBridge(), 7, { success: false, drop: 0 }, always(.5)));
});

test('Xem trước chỉ tính cầu công khai, không tiết lộ cầu ngầm', () => {
  const bridge = bridgeWith(8, { chain: [1, 5, 2], publicSource: [3, 2], patterns: { historical: null, sum3: [1, 5, 2], quad: null } }, { backToBack: 8 });
  assert.deepEqual(previewUpgrade(bridge, 7, 7), { baseRate: 7, publicLength: 1, publicBonus: 7.5, rate: 14.5 });
  assert.deepEqual(previewUpgrade(emptyBridge(), 7, 7), { baseRate: 7, publicLength: 0, publicBonus: 0, rate: 7 });
});

test('Tích hợp game.upgrade: thưởng cầu đổi kết quả roll, trạng thái cầu lưu/khôi phục cùng bản lưu', () => {
  // Phôi cùng thẻ ở +13 đủ 5 vạch nên tỷ lệ gốc đúng 7%.
  const target = { ...makeCard(11), level: 7 }, materials = Array.from({ length: 5 }, () => ({ ...makeCard(11), level: 13 }));
  const ids = materials.map(c => c.uid);
  const plain = { ...initialSave(), cards: [target, ...materials] };
  const bridged = { ...plain, bridge: bridgeWith(8, { chain: [2, 1, 4, 5], publicSource: [2, 1, 4, 5], patterns: { historical: null, sum3: null, quad: null } }) };
  // Roll 0,36: gốc 7% thất bại, có cầu công khai 4 số (37%) thành công.
  assert.equal(upgrade(plain, target.uid, ids, script(.36, .5), true, { patternRng: always(.5) }).success, false);
  const won = upgrade(bridged, target.uid, ids, always(.36), true, { patternRng: always(.5) });
  assert.equal(won.success, true); assert.equal(won.result.level, 8); assert.equal(won.turn.rate, 37);
  assert.deepEqual(won.state.bridge!.levels['8'].publicSource, [2, 1, 4, 5]); assert.deepEqual(won.state.bridge!.levels['8'].chain, []);
  const restored = JSON.parse(JSON.stringify(won.state));
  assert.ok(validateSave(restored)); assert.deepEqual(restored.bridge, won.state.bridge);
  // Trạng thái cầu hỏng bị bỏ, phần còn lại của bản lưu vẫn dùng được.
  const broken = JSON.parse(JSON.stringify({ ...won.state, bridge: { version: 1, turn: 1, levels: { 8: { chain: [99], publicSource: null, history: [], patterns: null } }, backToBack: null, log: [] } }));
  assert.ok(validateSave(broken)); assert.equal(broken.bridge, undefined);
  // Bản lưu cũ chưa có trạng thái cầu vẫn nâng cấp được.
  assert.ok(upgrade(plain, target.uid, ids, always(0), true).state.bridge);
  assert.equal(BRIDGE_CONFIG.maxLevel, MAX_LEVEL);
});

test('Tiện ích dây: đuôi tối đa 4 số, so khớp đuôi, định dạng mức rớt hai chữ số', () => {
  assert.deepEqual(tail([1, 2, 1, 4, 5]), [2, 1, 4, 5]); assert.deepEqual(tail([5]), [5]);
  assert.ok(endsWith([1, 2, 3], [2, 3])); assert.ok(!endsWith([3], [2, 3])); assert.ok(!endsWith([1], []));
  assert.equal(formatChain([2, 1, 4, 5]), '2145'); assert.equal(formatChain([11, 2]), '11-2');
});
