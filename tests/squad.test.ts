import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayer, makeCard, ovr, players, upgrade, validateSave } from '../src/game.ts';
import type { Save, Tier } from '../src/game.ts';
import clubHistory from '../src/player-club-history.json';
import { initialSave } from './stocked-save.ts';
import { activeTeamColors, addToSquad, clearLineup, DEFAULT_FORMATION, FORMATIONS, getLineups, isLocked, lineupSlots, lineupSummary, moveSlot, optimizeLineup, placeCard, playerClubs, playerPenalty, playerPositions, positionPenalty, releaseCard, removeFromSquad, resetPositions, selectLineup, setFormation, slotOvr, squadCards, squadSummary, teamColorBonuses, teamColorDetails, toggleLock, LINEUP_BONUS, zoneAt, SQUAD_LIMIT, SQUAD_WAGE_CAP, XI } from '../src/squad.ts';
import { sellPlayer } from '../src/market.ts';
import { readFileSync } from 'node:fs';

test('Vùng vị trí: hàng trống là một vùng rộng, có người thì chia đôi hoặc chia ba, hai biên có vùng riêng', () => {
  const none = new Set<string>();
  assert.equal(zoneAt(50, 10, none)!.label, 'ST');
  assert.equal(zoneAt(30, 10, none)!.label, 'ST', 'Hàng tiền đạo trống: cả dải giữa là ST');
  assert.equal(zoneAt(10, 10, none)!.label, 'LW');
  assert.equal(zoneAt(90, 10, none)!.label, 'RW');
  assert.equal(zoneAt(10, 40, none)!.label, 'LM');
  assert.equal(zoneAt(90, 80, none)!.label, 'RB');
  assert.equal(zoneAt(50, 95, none)!.label, 'GK');
  assert.equal(zoneAt(50, 60, none)!.label, 'CDM');
  assert.equal(zoneAt(30, 45, new Set(['RCM']))!.label, 'LCM', 'Có RCM thì chia đôi');
  assert.equal(zoneAt(60, 45, new Set(['LCM']))!.label, 'RCM');
  assert.equal(zoneAt(50, 60, new Set(['CDM']))!.label, 'CDM', 'Có người ở giữa thì chia ba');
  assert.equal(zoneAt(25, 60, new Set(['CDM']))!.label, 'LDM');
  assert.equal(zoneAt(75, 60, new Set(['CDM']))!.label, 'RDM');
  assert.equal(zoneAt(-1, 50, none), null);
  assert.equal(zoneAt(50, 101, none), null);
  // Mọi điểm trên sân đều thuộc một vùng và vùng đó chứa đúng điểm ấy.
  for (const taken of [none, new Set(['LCM', 'RCM', 'CDM', 'ST'])]) for (let x = 0; x <= 100; x += 3) for (let y = 0; y <= 100; y += 3) {
    const z = zoneAt(x, y, taken)!;
    assert.ok(x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1, `${x},${y} → ${z.label}`);
  }
});

test('Kéo cầu thủ: đổi vị trí và OVR, lưu riêng từng bộ, không trùng vị trí; đổi sơ đồ hoặc Về sơ đồ thì bỏ', () => {
  const st = players.find(p => p.pos === 'ST')!, card = makeCard(st.id);
  let state: Save = { ...initialSave(), cards: [card], squad: [card.uid] };
  state = placeCard(state, 0, 1, card.uid);
  assert.throws(() => moveSlot(state, 0, 1, 'LB', 12, 80), /đã có người/);
  assert.throws(() => moveSlot(state, 0, 1, 'XX', 12, 80), /không tồn tại/);
  const moved = moveSlot(state, 0, 1, 'CM', 50, 45), set = getLineups(moved).sets[0], slot = lineupSlots(set)[1];
  assert.deepEqual([slot.label, slot.role, slot.x, slot.y], ['CM', 'CM', 50, 45]);
  assert.equal(lineupSummary(moved, set).colors.players[0].baseOvr, slotOvr(card, 'CM'));
  assert.ok(slotOvr(card, 'CM') < ovr(card));
  // Chỉ bộ A đổi, bản lưu đọc lại còn nguyên.
  assert.equal(getLineups(moved).sets[1].custom, undefined);
  const reloaded = JSON.parse(JSON.stringify(moved));
  assert.ok(validateSave(reloaded));
  assert.deepEqual(lineupSlots(getLineups(reloaded).sets[0])[1].label, 'CM');
  // Di chuyển trong cùng vùng được phép; tối ưu giữ vị trí đã kéo.
  assert.equal(lineupSlots(getLineups(moveSlot(moved, 0, 1, 'CM', 55, 42)).sets[0])[1].x, 55);
  assert.equal(lineupSlots(getLineups(optimizeLineup(moved, 0)).sets[0])[1].label, 'CM');
  // Về sơ đồ và đổi sơ đồ đều bỏ phần tuỳ chỉnh, cầu thủ vẫn đá chính.
  const reset = getLineups(resetPositions(moved, 0)).sets[0];
  assert.equal(reset.custom, undefined);
  assert.equal(lineupSlots(reset)[1].label, 'ST');
  assert.equal(reset.slots[1], card.uid);
  assert.equal(getLineups(setFormation(moved, 0, '4-4-2')).sets[0].custom, undefined);
});

test('Cả đội hình riêng được +5; team color chỉ cộng thêm cho người đá chính', () => {
  const nation = players.find(p => players.filter(o => o.nation === p.nation).length >= 4)!.nation;
  const cards = players.filter(p => p.nation === nation).reduce<typeof players>((list, p) => list.some(o => o.id === p.id) ? list : [...list, p], []).slice(0, 4).map(p => makeCard(p.id));
  let state: Save = { ...initialSave(), cards, squad: cards.map(c => c.uid) };
  for (const [slot, card] of cards.slice(0, 3).entries()) state = placeCard(state, 0, slot, card.uid);
  const bonuses = teamColorBonuses(state);
  for (const card of cards.slice(0, 3)) assert.ok(bonuses.get(card.uid)! >= LINEUP_BONUS + 1, 'Vào đội hình +5, đủ 3 người cùng quốc gia thì được cộng thêm');
  // Số hiển thị trên sân (finalOvr) đã gồm phần cộng, cộng đúng vào OVR theo vị trí.
  const set = getLineups(state).sets[0], slots = lineupSlots(set), result = lineupSummary(state, set).colors.players;
  for (const [i, card] of cards.slice(0, 3).entries()) {
    const row = result.find(r => r.playerId === card.uid)!;
    assert.equal(row.finalOvr, slotOvr(card, slots[i].role) + bonuses.get(card.uid)!, getPlayer(card).name);
    assert.ok(row.applied.length >= 1);
  }
  // Dự bị trong đội hình riêng: chỉ +5, không có team color.
  assert.equal(bonuses.get(cards[3].uid), LINEUP_BONUS);
  // Thẻ không nằm trong đội hình riêng thì không được cộng.
  assert.equal(teamColorBonuses(removeFromSquad(state, cards[3].uid)).has(cards[3].uid), false);
  // Rời sân thì nhóm còn 2 người, không còn team color, chỉ còn +5 vì đang đá chính.
  const off = placeCard(state, 0, 0, null);
  assert.equal(teamColorBonuses(off).get(cards[1].uid), LINEUP_BONUS);
  assert.equal(LINEUP_BONUS, 5);
  assert.deepEqual(teamColorDetails(off).get(cards[1].uid)!.applied.map(a => [a.kind, a.ovr]), [['lineup', 5]]);
});

test('Đổi vị trí trong cùng hàng không bị trừ OVR, sang hàng khác mới bị trừ', () => {
  const lines = [['ST', 'CF', 'LW', 'RW', 'LF', 'RF'], ['CAM', 'CM', 'CDM', 'LM', 'RM'], ['CB', 'LB', 'RB', 'LWB', 'RWB']];
  for (const line of lines) for (const from of line) for (const to of line) assert.equal(positionPenalty(from, to), 0, `${from} → ${to}`);
  assert.ok(positionPenalty('ST', 'CM') > 0);
  assert.ok(positionPenalty('LW', 'CDM') > 0);
  assert.ok(positionPenalty('CM', 'CB') > 0);
  assert.ok(positionPenalty('ST', 'CB') > positionPenalty('ST', 'CM'));
  assert.equal(positionPenalty('GK', 'GK'), 0);
  assert.equal(positionPenalty('GK', 'CB'), 40);
  assert.equal(positionPenalty('ST', 'GK'), 40);
});

test('Vị trí ở mùa thẻ nào thì mọi mùa của cầu thủ đó đều đá được', () => {
  const messi = players.filter(p => p.name === 'L. Messi'), positions = new Set(messi.flatMap(p => playerPositions(p)));
  assert.ok(messi.length > 1);
  for (const pos of ['CF', 'CAM', 'RW']) assert.ok(positions.has(pos), pos);
  for (const card of messi) {
    assert.deepEqual(new Set(playerPositions(card)), positions, 'Thẻ mùa nào cũng có đủ vị trí');
    assert.equal(playerPenalty(card, 'CM'), 0, 'Hàng giữa nhờ có mùa đá CAM');
    assert.equal(playerPenalty(card, 'ST'), 0, 'Hàng công');
    assert.ok(playerPenalty(card, 'CB') > 0, 'Hàng thủ vẫn bị trừ');
  }
  // Thẻ RW của Messi đá CM không bị trừ dù vị trí trên thẻ là hàng công.
  const rw = messi.find(p => p.pos === 'RW')!, card = makeCard(rw.id);
  assert.ok(positionPenalty('RW', 'CM') > 0);
  assert.equal(slotOvr(card, 'CM'), ovr(card));
});

test('Không gộp hai người trùng tên, không gộp thủ môn với cầu thủ trên sân', () => {
  const onanaGk = players.find(p => p.name === 'A. Onana' && p.pos === 'GK')!, onanaMid = players.find(p => p.name === 'A. Onana' && p.pos === 'CDM')!;
  assert.deepEqual(playerPositions(onanaGk), ['GK']);
  assert.ok(!playerPositions(onanaMid).includes('GK'));
  assert.equal(playerPenalty(onanaGk, 'CDM'), 40);
  for (const p of players.filter(x => x.name === 'Diego López')) assert.equal(playerPositions(p).includes('GK'), p.pos === 'GK');
  const suarez = players.filter(p => p.name === 'L. Suárez');
  assert.ok(new Set(suarez.map(p => p.nation)).size > 1);
  for (const p of suarez) for (const q of suarez.filter(o => o.nation !== p.nation && !players.some(x => x.name === p.name && x.nation === p.nation && x.pos === o.pos))) assert.ok(!playerPositions(p).includes(q.pos), `${p.nation} không mượn vị trí ${q.pos}`);
});

test('CLB cũ được tính team color: đội 11 người từng khoác áo Barcelona lên cấp 4', () => {
  assert.deepEqual(playerClubs({ name: 'L. Messi', club: 'Inter Miami' }), ['Inter Miami', 'Barcelona', 'Paris']);
  assert.equal(playerClubs({ name: 'Pedri', club: 'Barcelona' }).filter(c => c === 'Barcelona').length, 1, 'CLB trùng chỉ tính một lần');
  assert.ok(!playerClubs({ name: 'T. Henry', club: 'Ballon d’Or' }).includes('Ballon d’Or'), 'Tên mùa không phải CLB');
  assert.ok(playerClubs({ name: 'T. Henry', club: 'Ballon d’Or' }).includes('Arsenal'));
  const team: [string, Tier][] = [['Ronaldinho', 'uc'], ['T. Henry', 'bdo'], ['L. Messi', 'prm'], ['Pedri', 'stellar'], ['Y. Touré', 'eternal'], ['Rodri', 'uc'], ['João Cancelo', 'prm'], ['Pau Cubarsí', 'wb'], ['L. Thuram', 'eternal'], ['G. Zambrotta', 'eternal'], ['J. Cillessen', 'gru']];
  const cards = team.map(([name, tier]) => makeCard(players.find(p => p.name === name && p.tier === tier)!.id));
  let state: Save = { ...initialSave(), cards, squad: cards.map(c => c.uid) };
  cards.forEach((card, slot) => { state = placeCard(state, 0, slot, card.uid); });
  const report = lineupSummary(state, getLineups(state).sets[0]).colors;
  const barca = report.active.find(c => c.key === 'Barcelona')!;
  assert.deepEqual([barca.tier, barca.ovr, barca.members.length, barca.beneficiaries.length], [4, 4, 11, 11]);
  assert.ok(report.players.every(r => r.ovrBonus === 4 + LINEUP_BONUS));
  // Huy hiệu màu đội ở Quản lý CT lấy CLB của team color đang kích hoạt.
  assert.equal(activeTeamColors(state).club, 'Barcelona');
  // Huy hiệu cấp thẻ: thẻ +1 chưa kích hoạt; 8 thẻ +8 thì Vàng mốc 8 thẻ.
  assert.equal(activeTeamColors(state).upgrade, undefined);
  const gold = { ...state, cards: state.cards.map((c, i) => i < 8 ? { ...c, level: 8 } : c) };
  assert.deepEqual(activeTeamColors(gold).upgrade, { color: 'gold', name: 'Vàng', tier: 3, minPlayers: 8, ovr: 4 });
});

test('Tên CLB trong dữ liệu lịch sử phải trùng tên CLB trong game, tên cầu thủ phải có thật', () => {
  const known = new Set(players.map(p => p.club)), names = new Set(players.flatMap(p => [p.name, `${p.name}|${p.nation}`]));
  for (const [name, clubs] of Object.entries(clubHistory.clubs) as [string, string[]][]) {
    assert.ok(names.has(name), `Không có cầu thủ ${name}`);
    for (const club of clubs) assert.ok(known.has(club), `${name}: CLB ${club} không có trong game`);
  }
});

test('Vị trí đã kéo trong bản lưu bị hỏng thì quay về sơ đồ', () => {
  const card = makeCard(players[0].id), base = { ...initialSave(), cards: [card], squad: [card.uid] };
  const withCustom = (custom: unknown) => ({ ...base, lineups: { active: 0, sets: [0, 1, 2].map(() => ({ formation: '4-1-2-3', slots: Array(XI).fill(null), custom })) } }) as unknown as Save;
  assert.equal(getLineups(withCustom('x')).sets[0].custom, undefined);
  assert.equal(getLineups(withCustom([{ label: 'NOPE', x: 1, y: 1 }])).sets[0].custom, undefined);
  assert.equal(getLineups(withCustom([{ label: 'CM', x: 'a', y: 1 }])).sets[0].custom, undefined);
  assert.equal(getLineups(withCustom([{ label: 'ST', x: 1, y: 1 }])).sets[0].custom, undefined, 'Trùng với ô ST của sơ đồ');
  assert.ok(getLineups(withCustom([{ label: 'CM', x: 50, y: 45 }])).sets[0].custom);
});

test('Điện thoại cầm ngang: danh sách cầu thủ phải tự co theo cột để cuộn được', () => {
  // phone.css đặt flex:none; landscape.css bỏ max-height thì phải trả lại flex, nếu không danh sách bị cắt mà không cuộn được.
  assert.match(readFileSync('src/landscape.css', 'utf8'), /:root \.squad-list\{flex:1 1 0;min-height:0;max-height:none;overflow-y:auto/);
});

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

test('Chặn thêm trùng thẻ, trùng cầu thủ, thẻ không có; cho phép vượt mốc lương 310', () => {
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

test('Tối ưu ĐH cho tổng OVR cao nhất; đổi chỗ, dự bị vào sân, đổi sơ đồ giữ người; bộ A/B/C riêng', () => {
  const pick = (pos: string, n: number) => players.filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr).slice(0, n);
  const team = [...pick('LW', 1), ...pick('ST', 2), ...pick('RW', 1), ...pick('CM', 2), ...pick('CDM', 1), ...pick('LB', 1), ...pick('CB', 2), ...pick('RB', 1), ...pick('GK', 2)];
  const cards = cardsOf(team.map(p => p.id));
  let state = { ...initialSave(), cards, squad: cards.map(c => c.uid) };
  assert.deepEqual(getLineups(state).sets[0].slots, Array(XI).fill(null));
  state = optimizeLineup(state, 0);
  const set = getLineups(state).sets[0], byUid = new Map(cards.map(c => [c.uid, c]));
  assert.equal(set.formation, DEFAULT_FORMATION);
  const slots = FORMATIONS[set.formation], total = set.slots.reduce((sum, uid, i) => sum + slotOvr(byUid.get(uid!)!, slots[i].role), 0);
  // Xếp tay mỗi người đúng sở trường theo thứ tự ô 4-1-2-3: LW, ST, RW, LCM, RCM, CDM, LB, LCB, RCB, RB, GK.
  const natural = [cards[0], cards[1], cards[3], cards[4], cards[5], cards[6], cards[7], cards[8], cards[9], cards[10], cards[11]];
  natural.forEach((card, i) => assert.equal(playerPenalty(getPlayer(card), slots[i].role), 0, slots[i].label));
  assert.ok(total >= natural.reduce((sum, card) => sum + ovr(card), 0), 'Không thấp hơn cách xếp đúng sở trường');
  assert.equal(getPlayer(byUid.get(set.slots[10]!)!).pos, 'GK', 'Ô thủ môn là thủ môn');
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