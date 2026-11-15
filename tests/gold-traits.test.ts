import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { goldTraitOf } from '../src/gold-traits.ts';
import { players } from '../src/game.ts';

const data = JSON.parse(readFileSync('src/gold-traits.json', 'utf8')) as { names: Record<string, string>; desc: Record<string, string>; cards: Record<string, string> };

test('Chỉ số ẩn vàng (fifaaddict): mã nào cũng có tên tiếng Việt và mô tả, thẻ trỏ tới cầu thủ có thật', () => {
  const ids = Object.keys(data.names);
  assert.ok(ids.length >= 10, `${ids.length} loại`);
  for (const id of ids) { assert.ok(data.names[id] && !/[А-яㄱ-힝]/.test(data.names[id]), `tên ${id}`); assert.ok(data.desc[id], `mô tả ${id}`); }
  const known = new Set(players.map(p => p.id));
  const cards = Object.entries(data.cards);
  assert.ok(cards.length > 500, `${cards.length} thẻ có chỉ số ẩn vàng`);
  for (const [pid, id] of cards) { assert.ok(known.has(Number(pid)), `mã cầu thủ ${pid}`); assert.ok(data.names[id], `thẻ ${pid} trỏ mã ${id}`); }
});

test('goldTraitOf: thẻ có / không có chỉ số ẩn vàng', () => {
  const [pid, id] = Object.entries(data.cards)[0];
  const g = goldTraitOf(Number(pid))!;
  assert.deepEqual({ id: g.id, name: g.name, desc: g.desc }, { id, name: data.names[id], desc: data.desc[id] });
  assert.match(g.icon, new RegExp(`/assets/traits/gold-${id}\\.png$`));
  const none = players.find(p => !data.cards[String(p.id)])!;
  assert.equal(goldTraitOf(none.id), null);
});

test('Mỗi chỉ số ẩn vàng có biểu tượng vàng trong public/assets/traits', () => {
  for (const id of Object.keys(data.names)) assert.ok(existsSync(`public/assets/traits/gold-${id}.png`), `thiếu biểu tượng ${id}`);
});
