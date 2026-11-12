import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR_COLORS, cursorUrls } from '../src/fx-cursor.ts';
import { NAME_EFFECTS } from '../src/name-effects.ts';

test('Con trỏ chuột theo hiệu ứng: đủ màu cho mọi hiệu ứng Premium; mũi tên / nút bấm là SVG hợp lệ, điểm nhấn ở đầu mũi', () => {
  for (const fx of NAME_EFFECTS) {
    assert.equal(CURSOR_COLORS[fx.id].length, 3, fx.id);
    const { arrow, pointer } = cursorUrls(fx.id);
    assert.match(arrow, /^url\("data:image\/svg\+xml,.+"\) 3 2$/);
    const svg = decodeURIComponent(pointer.slice(pointer.indexOf(',') + 1, pointer.lastIndexOf('")')));
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(svg.includes(CURSOR_COLORS[fx.id][1]), 'tô đúng màu hiệu ứng');
    assert.notEqual(arrow, pointer, 'nút bấm có ngôi sao riêng');
  }
});
