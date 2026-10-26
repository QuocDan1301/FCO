import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, makeCard, players, upgrade, validateSave } from '../src/game.ts';
import { marketQuote } from '../src/market.ts';
import { activeProtection, protectionApplies, protectionCost, setProtection, upgradeWithProtection } from '../src/insurance.ts';
import { fodderTier } from '../src/restore.ts';
import type { Rng } from '../src/upgrade/rng.ts';

const script = (...values: number[]): Rng => () => { if (!values.length) throw new Error('Hết RNG kịch bản'); return values.shift()!; };
const priced = players.find(p => marketQuote({ playerId: p.id, level: 8 }).insuranceFee)!;
const unpriced = players.find(p => marketQuote({ playerId: p.id, level: 8 }).price === null);
const setup = (level = 8, playerId = priced.id) => {
  const target = { ...makeCard(playerId), level }, material = { ...makeCard(players.find(p => fodderTier({ playerId }, { playerId: p.id }) === 'normal')!.id), level: 13 }; // phôi mạnh để tỉ lệ thành công > 0; phôi thường nên không có khôi phục
  return { target, material, state: { ...initialSave(), balance: 10_000_000_000_000, cards: [target, material] } };
};

test('Phí bảo vệ = phí bảo hiểm × mức %; 100% ≈ tối đa 95% giá thẻ; chỉ áp dụng từ +8 đến +12', () => {
  const { target } = setup();
  const quote = marketQuote(target);
  assert.equal(protectionCost(target, 100), quote.insuranceFee);
  assert.ok(quote.insuranceFee! <= Math.round(quote.price! * .95));
  assert.equal(protectionCost(target, 50), Math.round(quote.insuranceFee! / 2));
  assert.equal(protectionCost(target, 0), 0);
  assert.equal(protectionCost({ ...target, level: 7 }, 100), null);
  assert.equal(protectionCost({ ...target, level: 13 }, 100), null);
  assert.ok(protectionApplies({ level: 8 }) && protectionApplies({ level: 12 }) && !protectionApplies({ level: 7 }));
});

test('Bảo vệ 100%: thất bại giữ nguyên cấp, phí bị trừ dù kết quả; dây cầu vẫn ghi mức rớt gốc', () => {
  const { target, material, state } = setup();
  const cost = protectionCost(target, 100)!, base = target.level * 100000;
  const fail = upgradeWithProtection(state, target.uid, [material.uid], script(.999999, 0, .99), false, { pct: 100, patternRng: () => .5 });
  assert.equal(fail.success, false); assert.equal(fail.shielded, true);
  assert.equal(fail.result.level, 8);
  assert.equal(fail.state.balance, state.balance - base - cost);
  assert.deepEqual(fail.state.bridge!.levels['9'].chain, [1]);
  assert.match(fail.state.history[0].detail, /giữ nguyên \+8 · Bảo vệ nâng cấp.*Bảo vệ 100%/);
  const win = upgradeWithProtection(state, target.uid, [material.uid], script(0), false, { pct: 100, patternRng: () => .5 });
  assert.equal(win.success, true); assert.equal(win.result.level, 9); assert.equal(win.shielded, false);
  assert.equal(win.state.balance, state.balance - base - cost);
});

test('Bảo vệ 50%: roll bảo vệ dưới 50% giữ cấp, trên thì rớt ngẫu nhiên; không bảo vệ thì chuỗi RNG không đổi', () => {
  const { target, material, state } = setup();
  const kept = upgradeWithProtection(state, target.uid, [material.uid], script(.999999, .5, .3), true, { pct: 50, patternRng: () => .5 });
  assert.equal(kept.result.level, 8); assert.equal(kept.shielded, true);
  const lost = upgradeWithProtection(state, target.uid, [material.uid], script(.999999, .5, .7), true, { pct: 50, patternRng: () => .5 });
  assert.equal(lost.shielded, false); assert.equal(lost.result.level, lost.droppedLevel); assert.ok(lost.result.level < 8);
  let calls = 0; const counted: Rng = () => { calls++; return calls === 1 ? .999999 : .5; };
  upgrade(state, target.uid, [material.uid], counted, true, { patternRng: () => .5 });
  assert.equal(calls, 2, 'Không bảo vệ: chỉ roll thành công + mức rớt');
});

test('Cố định chi phí giữ mức cho lần sau; không cố định thì về 0% sau lượt đập; lưu / khôi phục an toàn', () => {
  const { target, material, state } = setup();
  const loose = setProtection(state, 60, false), fixed = setProtection(state, 60, true);
  assert.equal(activeProtection(loose, target), 60);
  assert.equal(activeProtection(loose, { level: 5 }), 0, 'Thẻ dưới +8 không áp dụng');
  const a = upgradeWithProtection(loose, target.uid, [material.uid], script(0), true, { pct: activeProtection(loose, target), patternRng: () => .5 });
  assert.deepEqual(a.state.protection, { pct: 0, fixed: false });
  const b = upgradeWithProtection(fixed, target.uid, [material.uid], script(0), true, { pct: activeProtection(fixed, target), patternRng: () => .5 });
  assert.deepEqual(b.state.protection, { pct: 60, fixed: true });
  assert.throws(() => setProtection(state, 55, true), /nấc 10%/);
  for (const bad of [{ pct: 120, fixed: true }, { pct: 35, fixed: false }, { pct: 50 }, 'abc']) {
    const save = JSON.parse(JSON.stringify({ ...state, protection: bad }));
    assert.ok(validateSave(save)); assert.equal(save.protection, undefined);
  }
  const ok = JSON.parse(JSON.stringify(fixed)); assert.ok(validateSave(ok)); assert.deepEqual(ok.protection, { pct: 60, fixed: true });
});

test('Chặn bảo vệ cho thẻ dưới +8, thẻ chưa có giá, hoặc không đủ BP', () => {
  const low = setup(7);
  assert.throws(() => upgradeWithProtection(low.state, low.target.uid, [low.material.uid], script(0), true, { pct: 50 }), /từ \+8/);
  assert.throws(() => upgrade(low.state, low.target.uid, [low.material.uid], script(0), true, { protection: { pct: 50, cost: 1 } }), /từ \+8/);
  if (unpriced) { const u = setup(8, unpriced.id); assert.throws(() => upgradeWithProtection(u.state, u.target.uid, [u.material.uid], script(0), true, { pct: 50 }), /chưa có giá/); }
  const { target, material, state } = setup();
  const poor = { ...state, balance: target.level * 100000 };
  assert.throws(() => upgradeWithProtection(poor, target.uid, [material.uid], script(0), false, { pct: 100 }), /phí bảo vệ/);
});