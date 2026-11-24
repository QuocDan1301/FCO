import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCard, players, validateSave } from '../src/game.ts';
import type { Save } from '../src/game.ts';
import { initialSave } from './stocked-save.ts';
import { addToSquad, getLineups, lineupSlots, membersOf, normalizeSquad, placeCard, removeFromSet, removeFromSquad, selectLineup, setReserve, squadCards, swapPositions, SQUAD_LIMIT, SQUAD_RULES_VERSION } from '../src/squad.ts';

// Nhóm Thay thế / Dự bị của đội hình (2026-11-23): Lineup.reserve, mỗi bộ A/B/C riêng.
const build = () => {
  const cards = [10, 11, 12, 13].map(id => makeCard(id));
  let state: Save = { ...initialSave(), cards: [...initialSave().cards, ...cards] };
  for (const c of cards) state = addToSquad(state, c.uid);
  // Người mới đăng ký vào Dự bị: đưa lên Thay thế để các thử nghiệm dưới đây bắt đầu từ Thay thế.
  for (const c of cards) state = setReserve(state, 0, c.uid, false);
  return { state, cards };
};

test('Dự bị: chuyển xuống / lên, riêng từng bộ, không cho người đang đá chính', () => {
  const { state, cards } = build();
  const [a, b] = cards;
  const down = setReserve(state, 0, a.uid, true);
  assert.deepEqual(getLineups(down).sets[0].reserve, [a.uid]);
  assert.equal(getLineups(down).sets[1].reserve, undefined, 'Bộ B không bị ảnh hưởng');
  assert.deepEqual(getLineups(setReserve(down, 0, b.uid, true)).sets[0].reserve, [a.uid, b.uid]);
  assert.equal(getLineups(setReserve(down, 0, a.uid, false)).sets[0].reserve, undefined, 'Lên lại Thay thế thì bỏ khỏi danh sách');
  // Người đã đá chính không xuống Dự bị trực tiếp.
  const placed = placeCard(state, 0, 0, b.uid);
  assert.throws(() => setReserve(placed, 0, b.uid, true), /đá chính/);
});

test('Dự bị: được đưa ra sân thì tự rời Dự bị; rời đội hình riêng thì mất khỏi Dự bị; lưu và đọc lại giữ nguyên', () => {
  const { state, cards } = build();
  const [a, b] = cards;
  let s = setReserve(setReserve(state, 0, a.uid, true), 0, b.uid, true);
  s = placeCard(s, 0, 3, a.uid);
  assert.deepEqual(getLineups(s).sets[0].reserve, [b.uid], 'a ra sân nên không còn Dự bị');
  const removed = removeFromSquad(s, b.uid);
  assert.equal(getLineups(removed).sets[0].reserve, undefined, 'b rời đội hình riêng');
  const round = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(round));
  assert.deepEqual(getLineups(round).sets[0].reserve, [b.uid]);
  const bad = JSON.parse(JSON.stringify(s));
  bad.lineups.sets[0].reserve = [1, 2];
  assert.ok(validateSave(bad), 'reserve sai kiểu không làm hỏng cả bản lưu');
  assert.ok(bad.lineups, 'đội hình vẫn giữ');
  assert.equal(getLineups(bad).sets[0].reserve, undefined, 'reserve sai kiểu thì bỏ');
});

// Quy tắc 11 + 7 + 10 (2026-11-23): thủ môn, Dự bị tối đa 10, chuyển dữ liệu cũ một lần.
const gkIds = () => players.filter(p => p.pos === 'GK').slice(0, 3).map(p => p.id);
const fieldIds = (n: number) => players.filter(p => p.pos !== 'GK').slice(0, n).map(p => p.id);
const stateOf = (ids: number[]): { state: Save; cards: ReturnType<typeof makeCard>[] } => {
  const cards = ids.map(id => makeCard(id));
  return { state: { ...initialSave(), cards: [...initialSave().cards, ...cards] }, cards };
};

test('Đội hình chính chỉ một thủ môn; Thay thế không giới hạn thủ môn', () => {
  const [g1, g2] = gkIds().map(id => makeCard(id));
  const field = makeCard(fieldIds(1)[0]);
  let state: Save = { ...initialSave(), cards: [...initialSave().cards, g1, g2, field] };
  state = addToSquad(addToSquad(addToSquad(state, g1.uid), g2.uid), field.uid);
  const slotsDef = lineupSlots(getLineups(state).sets[0]), gkSlot = slotsDef.findIndex(s => s.role === 'GK'), other = slotsDef.findIndex(s => s.role !== 'GK');
  state = placeCard(state, 0, gkSlot, g1.uid);
  assert.throws(() => placeCard(state, 0, other, g2.uid), /1 thủ môn/);
  const swapped = placeCard(state, 0, gkSlot, g2.uid);
  assert.equal(getLineups(swapped).sets[0].slots[gkSlot], g2.uid, 'Thay thủ môn bằng thủ môn khác vẫn được');
  assert.equal(squadCards(state).filter(c => c.uid === g2.uid).length, 1, 'Thủ môn thứ hai nằm ở Thay thế');
});

test('Dự bị tối đa 10; Thay thế tối đa 7; tổng đăng ký tối đa 28', () => {
  const { state: base, cards } = stateOf(fieldIds(12));
  let state = base;
  for (const c of cards.slice(0, 7)) state = addToSquad(state, c.uid);
  for (const c of cards.slice(0, 7)) state = setReserve(state, 0, c.uid, true);
  for (const c of cards.slice(7, 10)) { state = addToSquad(state, c.uid); state = setReserve(state, 0, c.uid, true); }
  assert.equal(getLineups(state).sets[0].reserve!.length, 10);
  assert.throws(() => addToSquad(state, cards[10].uid), /Dự bị đã đủ 10/);
  // Đủ 7 Thay thế thì không đưa người từ Dự bị lên lại.
  let seven = base;
  for (const c of cards.slice(0, 8)) { seven = addToSquad(seven, c.uid); seven = setReserve(seven, 0, c.uid, true); }
  for (const c of cards.slice(0, 7)) seven = setReserve(seven, 0, c.uid, false);
  assert.throws(() => setReserve(seven, 0, cards[7].uid, false), /Thay thế đã đủ/);
});

test('Chuyển dữ liệu cũ một lần: 2 thủ môn đá chính còn 1, quá 28 người tự rời đội hình (thẻ còn trong kho)', () => {
  const gks = gkIds().map(id => makeCard(id)), field = fieldIds(30).map(id => makeCard(id));
  const cards = [...gks.slice(0, 2), ...field];
  const old: Save = { ...initialSave(), cards: [...initialSave().cards, ...cards], squad: cards.map(c => c.uid) };
  const slotsDef = lineupSlots(getLineups(old).sets[0]), gkSlot = slotsDef.findIndex(s => s.role === 'GK'), other = slotsDef.findIndex(s => s.role !== 'GK');
  const slots = Array(11).fill(null) as (string | null)[]; slots[gkSlot] = gks[0].uid; slots[other] = gks[1].uid;
  slotsDef.forEach((s, i) => { if (!slots[i]) slots[i] = field[i].uid; });
  const dirty: Save = { ...old, lineups: { active: 0, sets: [{ formation: getLineups(old).sets[0].formation, slots }, getLineups(old).sets[1], getLineups(old).sets[2]] } };
  const fixed = normalizeSquad(dirty);
  const set = getLineups(fixed).sets[0];
  assert.equal(set.slots.filter(u => u === gks[0].uid || u === gks[1].uid).length, 1, 'chỉ còn 1 thủ môn đá chính');
  assert.equal(squadCards(fixed).length, 27, '10 đá chính + 7 thay thế + 10 dự bị');
  assert.equal(set.reserve!.length, 10, 'người dư chuyển xuống Dự bị');
  assert.ok(squadCards(fixed).length <= SQUAD_LIMIT);
  assert.ok(fixed.cards.length > squadCards(fixed).length, 'thẻ vẫn còn trong kho');
  assert.equal(fixed.squadRules, SQUAD_RULES_VERSION);
  assert.equal(normalizeSquad(fixed), fixed, 'chạy lần hai không đổi gì');
  const reserveHeavy = { ...fixed, squadRules: undefined, lineups: { ...fixed.lineups!, sets: fixed.lineups!.sets.map((s, i) => i === 0 ? { ...s, reserve: squadCards(fixed).slice(12, 24).map(c => c.uid) } : s) } } as Save;
  assert.equal(getLineups(normalizeSquad(reserveHeavy)).sets[0].reserve!.length, 10, 'Dự bị cắt còn 10');
});

test('Đổi vị trí 2 cầu thủ: ô-ô, ô-thay thế, thay thế-dự bị, cùng nhóm bị chặn, không làm 2 thủ môn', () => {
  const { state: base, cards } = stateOf(fieldIds(5));
  let state = base;
  for (const c of cards) state = addToSquad(state, c.uid);
  for (const c of cards) state = setReserve(state, 0, c.uid, false);
  const [p, q, r, s] = cards;
  state = placeCard(placeCard(state, 0, 0, p.uid), 0, 1, q.uid);
  // ô - ô
  const sw1 = swapPositions(state, 0, p.uid, q.uid);
  assert.deepEqual(getLineups(sw1).sets[0].slots.slice(0, 2), [q.uid, p.uid]);
  // ô - thay thế: người thay thế vào ô, người đá chính xuống Thay thế
  const sw2 = swapPositions(state, 0, p.uid, r.uid);
  assert.equal(getLineups(sw2).sets[0].slots[0], r.uid);
  assert.ok(!getLineups(sw2).sets[0].slots.includes(p.uid));
  // p (vừa xuống Thay thế) đứng đúng vị trí cũ của r trong danh sách Thay thế.
  assert.equal(getLineups(sw2).sets[0].subs!.indexOf(p.uid), getLineups(state).sets[0].subs!.indexOf(r.uid));
  // thay thế - dự bị: hai người đổi nhóm
  const withReserve = setReserve(state, 0, s.uid, true);
  const sw3 = swapPositions(withReserve, 0, r.uid, s.uid);
  assert.deepEqual(getLineups(sw3).sets[0].reserve, [r.uid]);
  // ô - dự bị: người dự bị vào ô, người đá chính xuống Dự bị
  const sw4 = swapPositions(withReserve, 0, p.uid, s.uid);
  assert.equal(getLineups(sw4).sets[0].slots[0], s.uid);
  assert.deepEqual(getLineups(sw4).sets[0].reserve, [p.uid]);
  // cùng nhóm: hai người Thay thế
  assert.throws(() => swapPositions(state, 0, r.uid, s.uid), /cùng một nhóm/);
  assert.throws(() => swapPositions(state, 0, p.uid, 'khong-co'), /không còn/);
  // Không làm đội hình chính có 2 thủ môn.
  const [g1, g2] = gkIds().map(id => makeCard(id));
  let gs: Save = { ...initialSave(), cards: [...initialSave().cards, g1, g2, p] };
  gs = addToSquad(addToSquad(addToSquad(gs, g1.uid), g2.uid), p.uid);
  const def = lineupSlots(getLineups(gs).sets[0]), gkSlot = def.findIndex(x => x.role === 'GK'), other = def.findIndex(x => x.role !== 'GK');
  gs = placeCard(placeCard(gs, 0, gkSlot, g1.uid), 0, other, p.uid);
  assert.throws(() => swapPositions(gs, 0, p.uid, g2.uid), /1 thủ môn/);
});
test('Mỗi bộ A / B / C là một đội riêng: B và C ban đầu trống, thêm / bỏ ở bộ này không đổi bộ kia', () => {
  const { state: base, cards } = stateOf(fieldIds(4));
  const [p, q, r] = cards;
  // Dữ liệu cũ (chưa chuyển): bộ đang chọn A nhận cả đội, B và C trống.
  const legacy: Save = { ...initialSave(), cards: [...initialSave().cards, ...cards], squad: [p.uid, q.uid, r.uid] };
  const fixed = normalizeSquad(legacy);
  const sets = getLineups(fixed).sets;
  assert.equal(membersOf(sets[0]).length, 3, 'Bộ A giữ cả 3 người đã đăng ký');
  assert.equal(membersOf(sets[1]).length, 0, 'Bộ B trống');
  assert.equal(membersOf(sets[2]).length, 0, 'Bộ C trống');
  // Sang bộ B: danh sách trống; thêm cùng một thẻ đã có ở A vẫn được, vào Dự bị của B.
  let s = selectLineup(fixed, 1);
  assert.equal(getLineups(s).active, 1);
  s = addToSquad(s, p.uid);
  assert.deepEqual(getLineups(s).sets[1].reserve, [p.uid]);
  assert.equal(membersOf(getLineups(s).sets[0]).length, 3, 'Bộ A không đổi');
  assert.throws(() => addToSquad(s, p.uid), /đã có trong đội hình/);
  // Xếp ra sân ở B không ảnh hưởng A.
  s = placeCard(s, 1, 0, p.uid);
  assert.equal(getLineups(s).sets[1].slots[0], p.uid);
  assert.ok(!getLineups(s).sets[0].slots.includes(p.uid));
  // Bỏ khỏi B: A vẫn giữ; bỏ nốt khỏi A thì mới rời danh sách đăng ký chung.
  s = removeFromSet(s, 1, p.uid);
  assert.equal(membersOf(getLineups(s).sets[1]).length, 0);
  assert.ok(squadCards(s).some(c => c.uid === p.uid), 'Còn ở bộ A nên vẫn đăng ký');
  s = removeFromSet(s, 0, p.uid);
  assert.ok(!squadCards(s).some(c => c.uid === p.uid), 'Không bộ nào còn dùng thì rời danh sách đăng ký');
  assert.ok(base.cards.length > 0);
});

test('10 chiến thuật: mặc định, chọn đổi sơ đồ, đổi sơ đồ cập nhật chiến thuật, đổi tên, lưu qua validateSave', async () => {
  const { getTactics, renameTactic, selectTactic, setFormation, TACTIC_COUNT } = await import('../src/squad.ts');
  const { state } = build();
  const base = getTactics(state);
  assert.equal(base.length, TACTIC_COUNT);
  assert.equal(base[4].name, 'Chiến thuật 5');
  let s = selectTactic(state, 0, 2);
  assert.equal(getLineups(s).sets[0].tactic, 2);
  const other = Object.keys((await import('../src/squad.ts')).FORMATIONS).find(f => f !== getLineups(s).sets[0].formation)!;
  s = setFormation(s, 0, other);
  assert.equal(getTactics(s)[2].formation, other);
  assert.equal(getLineups(s).sets[0].tactic, 2);
  s = selectTactic(s, 0, 0);
  assert.equal(getLineups(s).sets[0].formation, getTactics(s)[0].formation);
  s = selectTactic(s, 0, 2);
  assert.equal(getLineups(s).sets[0].formation, other);
  s = renameTactic(s, 2, '  DanTIKITAKA  ');
  assert.equal(getTactics(s)[2].name, 'DanTIKITAKA');
  assert.throws(() => renameTactic(s, 2, '   '));
  assert.throws(() => renameTactic(s, 2, 'x'.repeat(25)));
  assert.throws(() => selectTactic(s, 0, 10));
  const saved = JSON.parse(JSON.stringify(s)) as Save;
  assert.ok(validateSave(saved));
  assert.equal(getTactics(saved)[2].name, 'DanTIKITAKA');
  assert.equal(getTactics(saved)[2].formation, other);
  assert.equal(getLineups(saved).sets[0].tactic, 2);
});
