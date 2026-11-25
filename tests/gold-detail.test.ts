import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goldSlotOpen, goldSlotsFor } from '../src/gold-traits.ts';

// Tự chọn CSA vàng thêm trong Thông tin cầu thủ (2026-11-24). PlayerDetail kéo theo file .css nên không dựng được trong node:test: kiểm mã nguồn + luật mở ô.
test('Thông tin cầu thủ: ô CSA vàng thêm bấm được (cần onGold và đúng cấp thật của thẻ), mở bảng chọn thay danh sách thông tin', () => {
  const src = readFileSync('src/PlayerDetail.tsx', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(src, /const canPickGold = !!onGold && level === owned\.level && !other;/);
  assert.match(src, /canPickGold && open \? <button [^>]*className="pd-slot-btn"/);
  assert.match(src, /canPickGold && goldOpen \? <div className="pd-goldx-view"[\s\S]*<GoldExtraPicker card=\{owned\} player=\{p\} onChoose=\{onGold!\}\/>/);
  assert.match(src, /tone === 'is-gold' && canPickGold\s*[\s\S]*?className="pd-slot-btn"[^>]*title="Thêm chỉ số ẩn vàng"/, 'ô vàng ở dòng Chỉ số ẩn mới bấm được');
  assert.match(app, /<PlayerDetail [^\n]*onGold=\{\(slot, trait\) => chooseGold\(detail\.uid, slot, trait\)\}/);
});

test('Luật ô CSA vàng thêm: ICON TM / PRIME / PRM / EL có ô 7 và 11 (EL thêm ô 5), mùa khác chỉ ô 11; mở theo cấp thẻ', () => {
  assert.deepEqual(goldSlotsFor('el'), ['5', '7', '11']);
  assert.equal(goldSlotOpen('el', 7, '7'), true); assert.equal(goldSlotOpen('el', 6, '7'), false);
  assert.equal(goldSlotOpen('el', 10, '11'), false); assert.equal(goldSlotOpen('el', 11, '11'), true);
  assert.deepEqual(goldSlotsFor('uc'), ['11']);
  assert.equal(goldSlotOpen('uc', 11, '7'), false, 'mùa thường không có ô 7');
});