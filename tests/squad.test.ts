import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayer, makeCard, ovr, players, upgrade, validateSave } from '../src/game.ts';
import type { Save } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { addToSquad, clearLineup, DEFAULT_FORMATION, FORMATIONS, getLineups, isLocked, lineupSummary, optimizeLineup, placeCard, positionPenalty, releaseCard, removeFromSquad, selectLineup, setFormation, slotOvr, squadCards, squadSummary, toggleLock, SQUAD_LIMIT, SQUAD_WAGE_CAP, XI } from '../src/squad.ts';
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
  assert.equal(released.balance, state.balance, 'Xóa không cộng BP');
  const dirty = JSON.parse(JSON.stringify({ ...released, locked: [material.uid, target.uid, target.uid, 5] }));
  assert.ok(validateSave(dirty)); assert.deepEqual(dirty.locked, [target.uid]);
});

test('Sơ đồ đội hình: mỗi sơ đồ 11 ô khác tên, thủ môn ở ô cuối; trái vị trí bị trừ OVR', () => {
  for (const [name, slots] of Object.entries(FORMATIONS)) {
    assert.equal(slots.length, XI, name);
    assert.equal(slots.at(-1)!.role, 'GK', name);
    assert.equal(slots.filter(s => s.role === 'GK').length, 1, name);
    assert.equal(new Set(slots.map(s => s.label)).size, XI, name);
  }
  assert.equal(positionPenalty('ST', 'ST'), 0);
  assert.ok(positionPenalty('ST', 'CF') < positionPenalty('ST', 'CB'));
  assert.equal(positionPenalty('GK', 'ST'), 40);
  const card = makeCard(players.find(p => p.pos === 'CB')!.id);
  assert.equal(slotOvr(card, 'CB'), ovr(card));
  assert.equal(slotOvr(card, 'ST'), ovr(card) - positionPenalty('CB', 'ST'));
});

test('Tối ưu ĐH xếp đúng sở trường; đổi chỗ, dự bị vào sân, đổi sơ đồ giữ người; bộ A/B/C riêng', () => {
  const pick = (pos: string, n: number) => players.filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr).slice(0, n);
  const team = [...pick('LW', 1), ...pick('ST', 2), ...pick('RW', 1), ...pick('CM', 2), ...pick('CDM', 1), ...pick('LB', 1), ...pick('CB', 2), ...pick('RB', 1), ...pick('GK', 2)];
  const cards = cardsOf(team.map(p => p.id));
  let state = { ...initialSave(), cards, squad: cards.map(c => c.uid) };
  assert.deepEqual(getLineups(state).sets[0].slots, Array(XI).fill(null));
  state = optimizeLineup(state, 0);
  const set = getLineups(state).sets[0], byUid = new Map(cards.map(c => [c.uid, c]));
  assert.equal(set.formation, DEFAULT_FORMATION);
  set.slots.forEach((uid, i) => assert.equal(positionPenalty(getPlayer(byUid.get(uid!)!).pos, FORMATIONS[set.formation][i].role), 0, FORMATIONS[set.formation][i].label));
  const summary = lineupSummary(state, set);
  assert.equal(summary.filled, XI);
  assert.equal(summary.wage, set.slots.reduce((sum, uid) => sum + (getPlayer(byUid.get(uid!)!).wage ?? 0), 0));
  // Hai ô đổi chỗ; dự bị vào sân thì cầu thủ cũ về dự bị.
  const [a, b] = [set.slots[0]!, set.slots[1]!];
  const swapped = placeCard(state, 0, 1, a);
  assert.deepEqual(getLineups(swapped).sets[0].slots.slice(0, 2), [b, a]);
  const bench = cards.find(c => !set.slots.includes(c.uid))!;
  const subbed = placeCard(state, 0, 10, bench.uid);
  assert.equal(getLineups(subbed).sets[0].slots[10], bench.uid);
  assert.ok(!getLineups(subbed).sets[0].slots.includes(set.slots[10]));
  assert.equal(getLineups(placeCard(state, 0, 3, null)).sets[0].slots[3], null);
  assert.throws(() => placeCard(state, 0, 11, a));
  assert.throws(() => placeCard(state, 3, 0, a));
  // Đổi sơ đồ: vẫn đúng 11 người cũ. Bộ B riêng, chọn bộ đang dùng được lưu.
  const changed = setFormation(state, 0, '3-5-2');
  assert.deepEqual(new Set(getLineups(changed).sets[0].slots), new Set(set.slots));
  assert.throws(() => setFormation(state, 0, '9-9-9'));
  const other = selectLineup(setFormation(state, 1, '4-4-2'), 1);
  assert.equal(getLineups(other).active, 1);
  assert.equal(getLineups(other).sets[1].formation, '4-4-2');
  assert.deepEqual(getLineups(other).sets[0].slots, set.slots);
  assert.deepEqual(getLineups(clearLineup(state, 0)).sets[0].slots, Array(XI).fill(null));
  // Ít hơn 11 người: tối ưu vẫn xếp hết, ô còn lại để trống.
  const few = optimizeLineup({ ...state, squad: cards.slice(0, 4).map(c => c.uid), lineups: undefined }, 0);
  assert.equal(getLineups(few).sets[0].slots.filter(Boolean).length, 4);
});

test('Sơ đồ đã lưu: thẻ rời đội hình / bị bán thì ô thành trống; dữ liệu sai cấu trúc bị bỏ khi đọc bản lưu', () => {
  const cards = cardsOf(players.filter(p => p.pos === 'ST').slice(0, 3).map(p => p.id));
  let state = optimizeLineup({ ...initialSave(), cards, squad: cards.map(c => c.uid) }, 0);
  const uid = getLineups(state).sets[0].slots.find(Boolean)!;
  state = removeFromSquad(state, uid);
  assert.ok(!getLineups(state).sets[0].slots.includes(uid));
  assert.ok(validateSave(JSON.parse(JSON.stringify(state))));
  const broken = { ...state, lineups: { active: 5, sets: [] } } as unknown as Save;
  assert.ok(validateSave(broken));
  assert.equal(broken.lineups, undefined);
  const unknownFormation = { ...state, lineups: { active: 0, sets: [0, 1, 2].map(() => ({ formation: 'x', slots: Array(XI).fill(null) })) } };
  assert.equal(getLineups(unknownFormation).sets[0].formation, DEFAULT_FORMATION);
});