import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayer, initialSave, makeCard, players, upgrade, validateSave } from '../src/game.ts';
import { addToSquad, isLocked, releaseCard, removeFromSquad, squadCards, squadSummary, toggleLock, SQUAD_LIMIT, SQUAD_WAGE_CAP } from '../src/squad.ts';
import { sellPlayer } from '../src/market.ts';

const cardsOf = (ids: number[]) => ids.map(id => makeCard(id));
const lowWage = players.filter(p => (p.wage ?? 0) > 0).sort((a, b) => (a.wage ?? 0) - (b.wage ?? 0));

test('Thêm / bỏ cầu thủ vào đội hình riêng; thứ tự giữ nguyên, đếm FW/MF/DF/GK và lương', () => {
  const picks = [players.find(p => p.pos === 'ST')!, players.find(p => p.pos === 'CM')!, players.find(p => p.pos === 'CB')!, players.find(p => p.pos === 'GK')!];
  const cards = cardsOf(picks.map(p => p.id));
  let state = { ...initialSave(), cards };
  for (const c of cards) state = addToSquad(state, c.uid);
  assert.deepEqual(squadCards(state).map(c => c.uid), cards.map(c => c.uid));
  const summary = squadSummary(squadCards(state));
  assert.deepEqual(summary.counts, { fw: 1, mf: 1, df: 1, gk: 1 });
  assert.equal(summary.wage, picks.reduce((s, p) => s + (p.wage ?? 0), 0));
  state = removeFromSquad(state, cards[1].uid);
  assert.deepEqual(squadCards(state).map(c => c.uid), [cards[0].uid, cards[2].uid, cards[3].uid]);
  assert.ok(validateSave(JSON.parse(JSON.stringify(state))));
});

test('Chặn thêm trùng thẻ, trùng cầu thủ, thẻ không có; cho phép vượt mốc lương 305', () => {
  const [a, b] = [makeCard(lowWage[0].id), makeCard(lowWage[0].id)];
  let state = addToSquad({ ...initialSave(), cards: [a, b] }, a.uid);
  assert.throws(() => addToSquad(state, a.uid), /đã có trong đội hình/);
  assert.throws(() => addToSquad(state, b.uid), /thẻ khác/);
  assert.throws(() => addToSquad(state, 'khong-co'), /không còn/);
  const pricey = [...players].sort((x, y) => (y.wage ?? 0) - (x.wage ?? 0));
  const big = pricey.slice(0, 40).map(p => makeCard(p.id));
  let full = { ...initialSave(), cards: big };
  for (const c of big) full = addToSquad(full, c.uid);
  assert.equal(squadCards(full).length, 40);
  assert.ok(squadSummary(squadCards(full)).wage > SQUAD_WAGE_CAP);
  const more = players.slice(0, SQUAD_LIMIT + 5).filter(p => !big.some(c => c.playerId === p.id)).map(p => makeCard(p.id));
  let capped = { ...full, cards: [...full.cards, ...more] };
  for (const c of more) { if (squadCards(capped).length >= SQUAD_LIMIT) break; capped = addToSquad(capped, c.uid); }
  assert.throws(() => addToSquad(capped, more.at(-1)!.uid), /đủ 50/);
});

test('Thẻ bị bán / dùng làm nguyên liệu tự rơi khỏi đội hình; bản lưu hỏng được làm sạch', () => {
  const target = { ...makeCard(11), level: 2 }, material = { ...makeCard(12), level: 2 };
  let state = addToSquad(addToSquad({ ...initialSave(), cards: [target, material] }, target.uid), material.uid);
  const result = upgrade(state, target.uid, [material.uid], () => 0, true);
  assert.deepEqual(squadCards(result.state).map(c => c.uid), [target.uid]);
  const dirty = JSON.parse(JSON.stringify({ ...result.state, squad: [target.uid, target.uid, 'mat-tich', 42] }));
  assert.ok(validateSave(dirty));
  assert.deepEqual(dirty.squad, [target.uid]);
  const broken = JSON.parse(JSON.stringify({ ...result.state, squad: 'abc' }));
  assert.ok(validateSave(broken)); assert.equal(broken.squad, undefined);
  const legacy = JSON.parse(JSON.stringify({ ...initialSave() }));
  assert.ok(validateSave(legacy)); assert.deepEqual(squadCards(legacy), []);
  assert.equal(getPlayer(target).id, 11);
});
test('Khóa thẻ: không xóa, không bán, không dùng làm nguyên liệu; mở khóa thì xóa được và rời đội hình', () => {
  const target = { ...makeCard(11), level: 2 }, material = { ...makeCard(12), level: 2 };
  let state = addToSquad({ ...initialSave(), cards: [target, material] }, material.uid);
  state = toggleLock(state, material.uid);
  assert.ok(isLocked(state, material.uid));
  assert.throws(() => releaseCard(state, material.uid), /khóa/);
  assert.throws(() => sellPlayer(state, material.uid, true), /khóa/);
  assert.throws(() => upgrade(state, target.uid, [material.uid], () => 0, true), /khóa/);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.ok(validateSave(reloaded)); assert.deepEqual(reloaded.locked, [material.uid]);
  state = toggleLock(state, material.uid);
  assert.ok(!isLocked(state, material.uid));
  const released = releaseCard(state, material.uid);
  assert.deepEqual(released.cards.map(c => c.uid), [target.uid]);
  assert.deepEqual(squadCards(released), []);
  assert.equal(released.balance, state.balance, 'Xóa không cộng xu');
  const dirty = JSON.parse(JSON.stringify({ ...released, locked: [material.uid, target.uid, target.uid, 5] }));
  assert.ok(validateSave(dirty)); assert.deepEqual(dirty.locked, [target.uid]);
});