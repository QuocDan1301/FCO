import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TIERS } from '../src/game.ts';

test('Mọi mùa đều có ảnh khung mùa cho nhãn cạnh tên cầu thủ', () => {
  const css = readFileSync('src/season-badges.css', 'utf8');
  for (const tier of TIERS) {
    assert.ok(existsSync(`public/assets/seasons/${tier}.webp`), `thiếu ảnh khung mùa ${tier}`);
    assert.ok(css.includes(`.season-tag-${tier}{--season-img:url(/assets/seasons/${tier}.webp)}`), `thiếu luật CSS mùa ${tier}`);
  }
  assert.ok(existsSync('scripts/season-badges/sheet.png'), 'bảng huy hiệu gốc phải còn để cắt khi thêm mùa mới');
  assert.match(readFileSync('src/squad.css', 'utf8'), /^@import '\.\/season-badges\.css';/, 'phải nạp trước các luật của squad.css');
});
