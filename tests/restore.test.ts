import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayer, initialSave, makeCard, ovr, players } from '../src/game.ts';
import type { Card } from '../src/game.ts';
import { upgradeWithProtection } from '../src/insurance.ts';
import { evaluateRestore, fodderRestore, fodderTier, restoreApplies } from '../src/restore.ts';
import type { Rng } from '../src/upgrade/rng.ts';

const script = (...values: number[]): Rng => () => { if (!values.length) throw new Error('Hết RNG kịch bản'); return values.shift()!; };
const at = (playerId: number, level: number): Card => ({ ...makeCard(playerId), level });
// Phôi cùng mùa (khác cầu thủ) ở cấp cho trước có chênh OVR thỏa điều kiện.
const mate = (target: Card, level: number, ok: (diff: number) => boolean) => {
  for (const p of players) {
    if (p.id === target.playerId || p.tier !== getPlayer(target).tier) continue;
    const card = at(p.id, level);
    if (ok(ovr(card) - ovr(target))) return card;
  }
  throw new Error(`Không có phôi cùng mùa +${level} phù hợp`);
};

test('Bậc phôi: bản sao, cùng mùa, cùng cầu thủ khác mùa (bỏ dấu, chữ viết tắt một bên), phôi thường', () => {
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 8 }), 'clone');
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 1 }), 'season', 'Hai thẻ ICON khác cầu thủ');
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 221 }), 'player', 'D. Beckham ICON và NO7');
  assert.equal(fodderTier({ playerId: 107 }, { playerId: 230 }), 'player', 'Butragueño = E. Butragueño');
  assert.equal(fodderTier({ playerId: 324 }, { playerId: 423 }), 'player', 'Nguyễn Quang Hải PRIME và PRM');
  const gerd = players.find(p => p.name === 'G. Müller')!, thomas = players.find(p => p.name === 'T. Müller')!;
  assert.equal(fodderTier({ playerId: gerd.id }, { playerId: thomas.id }), 'normal', 'Khác chữ viết tắt, khác mùa');
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 324 }), 'normal');
});

test('Bản sao: bằng / cao hơn cấp 100%, thấp hơn 1 cấp 85% (giữ nguyên cấp); +3 trở lên 50%, +1/+2 20% (giữ +5)', () => {
  const target = at(8, 8);
  assert.deepEqual(fodderRestore(target, at(8, 8)), { tier: 'clone', power: 1, floor: 8 });
  assert.deepEqual(fodderRestore(target, at(8, 10)), { tier: 'clone', power: 1, floor: 8 });
  assert.deepEqual(fodderRestore(target, at(8, 7)), { tier: 'clone', power: .85, floor: 8 });
  assert.deepEqual(fodderRestore(target, at(8, 3)), { tier: 'clone', power: .5, floor: 5 });
  assert.deepEqual(fodderRestore(target, at(8, 2)), { tier: 'clone', power: .2, floor: 5 });
  assert.deepEqual(fodderRestore(at(8, 5), at(8, 4)), { tier: 'clone', power: .85, floor: 5 });
});

test('Cùng mùa: phôi từ +5 OVR không thấp hơn quá 3 → 100% (giữ cấp phôi), yếu hơn giảm dần tới 35%; +4 OVR không thấp hơn → 40%', () => {
  const target = at(8, 7);
  assert.deepEqual(fodderRestore(target, mate(target, 6, d => d >= -3)), { tier: 'season', power: 1, floor: 6 });
  assert.equal(fodderRestore(target, mate(target, 9, d => d >= -3)).floor, 7, 'Giữ tối đa bằng cấp thẻ chính');
  const weak = mate(target, 5, d => d < -3 && d > -8), diff = ovr(weak) - ovr(target);
  assert.equal(fodderRestore(target, weak).power, Math.pow(.82, -diff - 2));
  assert.equal(fodderRestore(target, mate(target, 5, d => d <= -8)).power, .35, 'Tối thiểu 35%');
  const five = at(8, 5);
  assert.deepEqual(fodderRestore(five, mate(five, 4, d => d >= 0)), { tier: 'season', power: .4, floor: 5 });
  assert.equal(fodderRestore(five, mate(five, 4, d => d < 0)).power, 0);
  assert.equal(fodderRestore(five, mate(five, 3, () => true)).power, 0, 'Phôi cùng mùa dưới +4 không tính');
});

test('Cùng cầu thủ khác mùa: phôi từ +5 OVR không thấp hơn quá 2 → 65%, giữ +5', () => {
  const target = at(8, 5), strong = at(221, 13);
  assert.ok(ovr(strong) - ovr(target) >= -2);
  assert.deepEqual(fodderRestore(target, strong), { tier: 'player', power: .65, floor: 5 });
  const high = at(8, 12), weak = at(221, 5);
  assert.ok(ovr(weak) - ovr(high) < -2);
  assert.equal(fodderRestore(high, weak).power, 0, 'OVR thấp hơn quá 2 không tính');
  assert.equal(fodderRestore(target, at(221, 4)).power, 0, 'Phôi dưới +5 không tính');
});

test('Tổng hợp: cộng dồn tối đa 100%, giữ mức cao nhất của phôi có đóng góp; chỉ thẻ +5 … +12', () => {
  const target = at(8, 8);
  assert.deepEqual(evaluateRestore(target, [at(8, 2), at(8, 3)]), { chance: 70, floor: 5, tier: 'clone' });
  assert.deepEqual(evaluateRestore(target, [at(8, 7), at(8, 3)]), { chance: 100, floor: 8, tier: 'clone' });
  assert.deepEqual(evaluateRestore(target, [at(8, 2), at(1, 1)]), { chance: 20, floor: 5, tier: 'clone' }, 'Phôi không đóng góp không kéo mức giữ');
  assert.deepEqual(evaluateRestore(target, [at(324, 1)]), { chance: 0, floor: 1, tier: 'normal' });
  assert.deepEqual(evaluateRestore(target, []), { chance: 0, floor: 1, tier: 'normal' });
  assert.equal(evaluateRestore(at(8, 4), [at(8, 4)]).chance, 0, 'Dưới +5 không có khôi phục');
  assert.deepEqual([4, 5, 12, 13].map(level => restoreApplies({ level })), [false, true, true, false]);
});

test('Mọi lượt đập trong game (upgradeWithProtection) áp dụng khôi phục theo bậc phôi', () => {
  const target = at(8, 6), state = (materials: Card[]) => ({ ...initialSave(), cards: [target, ...materials] });
  const run = (materials: Card[], rng: Rng) => upgradeWithProtection(state(materials), target.uid, materials.map(c => c.uid), rng, true, { patternRng: () => .5 });
  // Bản sao ngang cấp: 100%, giữ nguyên +6 (vẫn roll một số).
  const kept = run([at(8, 6)], script(.999999, 0, .999999));
  assert.equal(kept.success, false); assert.equal(kept.droppedLevel, 1); assert.equal(kept.restoredLevel, 6); assert.equal(kept.result.level, 6);
  // Bản sao +1: 20%, giữ +5.
  const floor = run([at(8, 1)], script(.999999, 0, .1));
  assert.equal(floor.restoredLevel, 5); assert.equal(floor.result.level, 5);
  const missed = run([at(8, 1)], script(.999999, 0, .2));
  assert.equal(missed.restoredLevel, null); assert.equal(missed.result.level, 1);
  let calls = 0;
  run([at(324, 1)], () => { calls++; return calls === 1 ? .999999 : 0; });
  assert.equal(calls, 2, 'Phôi thường: không roll khôi phục');
});
