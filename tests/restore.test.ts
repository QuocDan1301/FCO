import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayer, makeCard, ovr, players } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
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

test('Bậc phôi: chỉ bản sao (cùng cầu thủ, cùng mùa); khác cầu thủ hoặc khác mùa là phôi thường', () => {
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 8 }), 'clone');
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 1 }), 'normal', 'Hai thẻ ICON khác cầu thủ');
  assert.equal(fodderTier({ playerId: 8 }, { playerId: 221 }), 'normal', 'D. Beckham ICON và NO7 (khác mùa)');
  assert.equal(fodderTier({ playerId: 324 }, { playerId: 423 }), 'normal', 'Nguyễn Quang Hải PRIME và PRM');
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

test('Phôi cùng mùa khác cầu thủ và cùng cầu thủ khác mùa: không có khôi phục (0%)', () => {
  for (const target of [at(8, 5), at(8, 7), at(8, 12)]) {
    for (const level of [4, 5, 9, 13]) {
      assert.deepEqual(fodderRestore(target, mate(target, level, () => true)), { tier: 'normal', power: 0, floor: 1 }, `cùng mùa +${level}`);
      assert.deepEqual(fodderRestore(target, at(221, level)), { tier: 'normal', power: 0, floor: 1 }, `cùng cầu thủ khác mùa +${level}`);
    }
  }
  assert.deepEqual(evaluateRestore(at(8, 7), [mate(at(8, 7), 13, () => true), at(221, 13)]), { chance: 0, floor: 1, tier: 'normal' });
  assert.deepEqual(evaluateRestore(at(8, 7), [at(221, 13), at(8, 3)]), { chance: 50, floor: 5, tier: 'clone' }, 'Chỉ bản sao được tính');
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
