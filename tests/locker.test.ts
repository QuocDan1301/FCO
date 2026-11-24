import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCard, validateSave } from '../src/game.ts';
import type { Save } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { addToSquad, getLineups, placeCard, setReserve } from '../src/squad.ts';
import { jerseyNumbers, lockerMembers, saveOutfits } from '../src/locker.ts';

// Phòng thay đồ (2026-11-24): số áo tự cấp / tự chọn không trùng, lưu trang phục, validateSave lọc dữ liệu sai.
const build = () => {
  const cards = [10, 11, 12, 13].map(id => makeCard(id));
  let state: Save = { ...initialSave(), cards: [...initialSave().cards, ...cards] };
  for (const c of cards) state = addToSquad(state, c.uid);
  for (const c of cards) state = setReserve(state, 0, c.uid, false);
  state = placeCard(state, getLineups(state).active, 0, cards[0].uid);
  return { state, cards };
};

test('Phòng thay đồ: số áo tự cấp không trùng, số chọn tay được giữ', () => {
  const { state, cards } = build();
  const members = lockerMembers(state);
  assert.equal(members.length, 4);
  const auto = jerseyNumbers(state);
  assert.equal(new Set(auto.values()).size, 4);
  const saved = saveOutfits(state, { [cards[1].uid]: { number: 10, sleeve: 1 } });
  const numbers = jerseyNumbers(saved);
  assert.equal(numbers.get(cards[1].uid), 10);
  assert.equal(new Set(numbers.values()).size, 4);
  assert.equal(saved.outfits?.[cards[1].uid]?.sleeve, 1);
  assert.throws(() => saveOutfits(saved, { [cards[2].uid]: { number: 10 } }), /Số áo 10/);
  assert.throws(() => saveOutfits(saved, { [cards[2].uid]: { number: 100 } }));
});

test('Phòng thay đồ: thiết lập đội và validateSave lọc dữ liệu sai', () => {
  const { state, cards } = build();
  const saved = saveOutfits(state, { [cards[0].uid]: { gear: 3, boot: 2, number: 7 } }, { kit: 1, gk: 2, captain: cards[0].uid });
  const copy = JSON.parse(JSON.stringify(saved)) as Save;
  (copy.outfits as Record<string, unknown>)['khong-co'] = { gear: 1 };
  (copy.outfits as Record<string, Record<string, unknown>>)[cards[0].uid].fit = 99;
  (copy.teamKit as Record<string, unknown>).captain = 'khong-co';
  assert.ok(validateSave(copy));
  assert.deepEqual(copy.outfits, { [cards[0].uid]: { gear: 3, boot: 2, number: 7 } });
  assert.deepEqual(copy.teamKit, { kit: 1, gk: 2 });
});

test('Nhà quản lý: validateSave chỉ giữ mã 7 chữ số', async () => {
  const { isManagerId, MANAGER_IDS } = await import('../src/managers.ts');
  const { state } = build();
  const ok = JSON.parse(JSON.stringify({ ...state, manager: MANAGER_IDS[0] })) as Save;
  assert.ok(validateSave(ok)); assert.equal(ok.manager, MANAGER_IDS[0]); assert.ok(isManagerId(ok.manager));
  const bad = JSON.parse(JSON.stringify({ ...state, manager: '../x' })) as Save;
  assert.ok(validateSave(bad)); assert.equal(bad.manager, undefined);
  assert.ok(!isManagerId('1234567'));
});
