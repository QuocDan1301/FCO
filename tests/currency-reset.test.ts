import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BP_RESET, initialSave, validateSave } from '../src/game.ts';

test('Tài khoản mới bắt đầu với 0 BP', () => {
  assert.equal(initialSave().balance, 0);
});

test('Đặt lại BP của bản lưu hiện có một lần, giữ các tài sản và tiến trình khác', () => {
  const saved = { ...initialSave(), balance: 987654321, fc: 12500, unopened: { eternal: 7 }, opened: 21, upgrades: 3 };
  delete saved.bpReset;
  const expected = structuredClone(saved);
  assert.equal(validateSave(saved), true);
  assert.deepEqual(saved, { ...expected, balance: 0, bpReset: BP_RESET });
  saved.balance = 456789;
  const reloaded = JSON.parse(JSON.stringify(saved));
  assert.equal(validateSave(reloaded), true);
  assert.equal(reloaded.balance, 456789);
});

test('Không sửa số dư âm thành bản lưu hợp lệ khi đặt lại BP', () => {
  const saved = { ...initialSave(), balance: -1 };
  delete saved.bpReset;
  assert.equal(validateSave(saved), false);
  assert.equal(saved.balance, -1);
});
