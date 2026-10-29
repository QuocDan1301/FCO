import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { flameTone } from '../src/cinema/flames';

test('máy phun lửa khi mở thẻ: thường từ 1M, bạc từ 100M, tím từ 1B; dưới 1M hoặc chưa có giá thì không phun', () => {
  assert.equal(flameTone(null), null);
  assert.equal(flameTone(999_999), null);
  assert.equal(flameTone(1_000_000), 'red');
  assert.equal(flameTone(99_999_999), 'red');
  assert.equal(flameTone(100_000_000), 'silver');
  assert.equal(flameTone(999_999_999), 'silver');
  assert.equal(flameTone(1_000_000_000), 'purple');
  assert.equal(flameTone(25_000_000_000), 'purple');
  for (const file of ['pf-flame-silver-1', 'pf-flame-silver-2', 'pf-flame-silver-3', 'rs-fw-silver-1', 'rs-fw-silver-2']) assert.ok(existsSync(`public/assets/${file}.webp`), file);
});
