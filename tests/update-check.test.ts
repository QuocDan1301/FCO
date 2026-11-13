import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isNewer, reloadAllowed, requestReload, setUpdateHold, updatePending, UPDATE_DEADLINE_MS } from '../src/update-check.ts';

test('Bản cập nhật: chỉ báo khi máy chủ có mã build khác mã đang chạy', () => {
  assert.equal(isNewer('abc-1', { build: 'abc-2' }), true);
  assert.equal(isNewer('abc-1', { build: 'abc-1' }), false);
  assert.equal(isNewer('', { build: 'abc-2' }), false, 'chạy dev / mothe.html không có mã thì không báo');
  assert.equal(isNewer('abc-1', null), false);
  assert.equal(isNewer('abc-1', { build: '' }), false);
  assert.equal(isNewer('abc-1', '<html>'), false, 'trang lỗi trả HTML không bị coi là bản mới');
});

test('Bản cập nhật: build ghi version.json, máy chủ không lưu đệm file này', () => {
  assert.match(readFileSync('vite.config.ts', 'utf8'), /fileName: 'version\.json'/);
  assert.match(readFileSync('public/_headers', 'utf8'), /\/version\.json\r?\n\s+Cache-Control: no-store/);
});

test('Bản cập nhật: hạn chót 2 phút; đang bận thì chờ, không tải lại liên tục cùng một bản', () => {
  assert.equal(UPDATE_DEADLINE_MS, 120_000);
  const store: Record<string, string> = {};
  const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  assert.equal(reloadAllowed(storage, 'b1', 1_000_000), true);
  assert.equal(reloadAllowed(storage, 'b1', 1_030_000), false, 'vừa tải lại cùng bản trong 60 giây');
  assert.equal(reloadAllowed(storage, 'b1', 1_070_000), true);
  assert.equal(reloadAllowed(storage, 'b2', 1_071_000), true, 'bản khác thì được');
  // Đang bận: yêu cầu tải lại chỉ ghi nhận chờ, không tải (môi trường test không có window — gọi tải lại sẽ lỗi).
  setUpdateHold('test', true);
  requestReload();
  assert.equal(updatePending(), true);
});
