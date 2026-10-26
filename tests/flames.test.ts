import test from 'node:test';
import assert from 'node:assert/strict';
import { flameTone } from '../src/cinema/flames';

test('máy phun lửa trong hầm: đỏ từ 100M, tím từ 1B, dưới 100M hoặc chưa có giá thì không phun', () => {
  assert.equal(flameTone(null), null);
  assert.equal(flameTone(99_999_999), null);
  assert.equal(flameTone(100_000_000), 'red');
  assert.equal(flameTone(999_999_999), 'red');
  assert.equal(flameTone(1_000_000_000), 'purple');
  assert.equal(flameTone(25_000_000_000), 'purple');
});