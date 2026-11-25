import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { players } from '../src/game.ts';
import { GOLD_GK_TRAITS, cardGoldTraits, dropClosedGold, goldChoicesFor, goldExtras, goldSlotOpen, goldSlotsFor, goldTraitId } from '../src/gold-traits.ts';

const pick = (pred: (p: typeof players[number]) => boolean) => players.find(pred)!;

test('CSA vàng thêm: ô +11 cho mọi thẻ, ô +7 chỉ ICON TM / INFINITE PRIME / PRIME / EL', () => {
  for (const tier of ['eternal', 'prime', 'prm', 'naruto']) assert.deepEqual(goldSlotsFor(tier), ['7', '11'], tier);
  assert.deepEqual(goldSlotsFor('el'), ['5', '7', '11'], 'EL thêm ô +5');
  for (const tier of ['stellar', 'wb', 'ep24', 'up26']) assert.deepEqual(goldSlotsFor(tier), ['11'], tier);
  assert.equal(goldSlotOpen('eternal', 6, '7'), false); assert.equal(goldSlotOpen('eternal', 7, '7'), true);
  assert.equal(goldSlotOpen('stellar', 13, '7'), false); assert.equal(goldSlotOpen('stellar', 10, '11'), false); assert.equal(goldSlotOpen('stellar', 11, '11'), true);
});

test('CSA vàng thêm: GK chỉ CSA GK, cầu thủ khác không có CSA GK; không trùng CSA gốc / ô khác; tụt cấp thì mất', () => {
  const gk = goldChoicesFor('GK'), st = goldChoicesFor('ST');
  assert.deepEqual([...gk].sort(), [...GOLD_GK_TRAITS].sort());
  assert.ok(st.length >= 10 && st.every(id => !(GOLD_GK_TRAITS as readonly string[]).includes(id)));
  const outfield = pick(p => p.tier === 'eternal' && p.pos !== 'GK');
  const native = goldTraitId(outfield.id), free = st.filter(id => id !== native);
  const card = { uid: 'x', playerId: outfield.id, level: 11, received: 0, gold: { '7': free[0], '11': free[1] } };
  assert.deepEqual(goldExtras(card, outfield.tier, outfield.pos), [free[0], free[1]]);
  assert.deepEqual(goldExtras({ ...card, gold: { '7': free[0], '11': free[0] } }, outfield.tier, outfield.pos), [free[0]], 'trùng ô khác');
  assert.deepEqual(goldExtras({ ...card, gold: { '11': gk[0] } }, outfield.tier, outfield.pos), [], 'cầu thủ thường không dùng CSA GK');
  if (native) assert.deepEqual(goldExtras({ ...card, gold: { '11': native } }, outfield.tier, outfield.pos), [], 'trùng CSA gốc');
  assert.deepEqual(cardGoldTraits(card, outfield.tier, outfield.pos), [...(native ? [native] : []), free[0], free[1]]);
  // Tụt từ +11 xuống +10: mất ô 11, giữ ô 7; xuống +6: mất hết.
  assert.deepEqual(dropClosedGold({ ...card, level: 10 }, outfield.tier).gold, { '7': free[0] });
  assert.equal('gold' in dropClosedGold({ ...card, level: 6 }, outfield.tier), false);
  const keeper = pick(p => p.pos === 'GK');
  assert.deepEqual(goldExtras({ uid: 'g', playerId: keeper.id, level: 13, received: 0, gold: { '11': free[0] } }, keeper.tier, keeper.pos), [], 'GK không dùng CSA cầu thủ thường');
});

test('Migration CSA vàng thêm: hàm đặt CSA, trigger xoá khi tụt cấp, đối thủ GLXH có gx, giữ miniface', () => {
  const sql = readFileSync('supabase/migrations/202611160006_fco_gold_extra.sql', 'utf8');
  assert.match(sql, /create trigger fco_game_saves_gold_clean before insert or update of data on public\.fco_game_saves/);
  assert.match(sql, /k = '7' and \(lv < 7 or coalesce\(season, ''\) not in \('ICON TM', 'INFINITE PRIME', 'PRIME', 'EL'\)\)/);
  assert.match(sql, /k = '11' and lv < 11/);
  assert.match(sql, /gk_traits constant text\[\] := array\['57', '60', '68'\]/);
  assert.match(sql, /'gx', coalesce/);
  assert.match(sql, /'faces', case when bot then null else public\.fco_public_faces/);
  assert.match(sql, /grant execute on function public\.fco_inv_gold\(text, text, text\) to authenticated/);
});

test('NARUTO có ô CSA vàng +7: máy chủ (202611250006) khớp tên mùa của game cho mọi mùa trong GOLD_EXTRA_TIERS', async () => {
  const { seasons } = await import('../src/game.ts');
  const { GOLD_EXTRA_TIERS } = await import('../src/gold-traits.ts');
  const sql = readFileSync('supabase/migrations/202611250007_fco_gold_el_5.sql', 'utf8');
  const list = /k = '7' and \(lv < 7 or coalesce\(season, ''\) not in \(([^)]*)\)\)/.exec(sql)![1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual([...list].sort(), GOLD_EXTRA_TIERS.map(t => seasons[t]).sort());
  assert.match(sql, /k = '11' and lv < 11/);
});

test('Mùa EL: ô CSA vàng +5 (ngoài +7, +11), tụt dưới +5 thì mất; máy chủ (202611250007) có ô 5 chỉ cho EL', () => {
  const el = pick(p => p.tier === 'el' && p.pos !== 'GK'), other = pick(p => p.tier === 'eternal' && p.pos !== 'GK');
  const native = goldTraitId(el.id), free = goldChoicesFor(el.pos).filter(id => id !== native);
  assert.equal(goldSlotOpen('el', 4, '5'), false); assert.equal(goldSlotOpen('el', 5, '5'), true); assert.equal(goldSlotOpen('eternal', 13, '5'), false);
  const card = { uid: 'e', playerId: el.id, level: 11, received: 0, gold: { '5': free[0], '7': free[1], '11': free[2] } };
  assert.deepEqual(goldExtras(card, el.tier, el.pos), [free[0], free[1], free[2]]);
  assert.deepEqual(goldExtras({ ...card, level: 6 }, el.tier, el.pos), [free[0]]);
  assert.deepEqual(goldExtras({ ...card, playerId: other.id }, other.tier, other.pos).includes(free[0]), false, 'mùa khác không có ô +5');
  assert.deepEqual(dropClosedGold({ ...card, level: 6 }, el.tier).gold, { '5': free[0] });
  assert.equal('gold' in dropClosedGold({ ...card, level: 4 }, el.tier), false);
  const sql = readFileSync('supabase/migrations/202611250007_fco_gold_el_5.sql', 'utf8');
  assert.match(sql, /foreach k in array array\['11', '7', '5'\]/);
  assert.match(sql, /k = '5' and \(lv < 5 or coalesce\(season, ''\) not in \('EL'\)\)/);
  assert.match(sql, /p_slot not in \(''5'', ''7'', ''11''\)/);
});
