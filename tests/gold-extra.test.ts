import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { players } from '../src/game.ts';
import { GOLD_GK_TRAITS, cardGoldTraits, dropClosedGold, goldChoicesFor, goldExtras, goldSlotOpen, goldSlotsFor, goldTraitId } from '../src/gold-traits.ts';

const pick = (pred: (p: typeof players[number]) => boolean) => players.find(pred)!;

test('CSA vàng thêm: ô +11 cho mọi thẻ, ô +7 chỉ ICON TM / INFINITE PRIME / PRIME / EL', () => {
  for (const tier of ['eternal', 'prime', 'prm', 'el']) assert.deepEqual(goldSlotsFor(tier), ['7', '11'], tier);
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