import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { players } from '../src/game.ts';
import { MAX_BASE_TRAITS, extraOf, traitIdsOf } from '../src/player-extra.ts';

// Mỗi cầu thủ chỉ có tối đa 7 chỉ số ẩn phụ (chỉ số ẩn thường, mã < 50) — người dùng 2026-11-25.
test('Mọi thẻ chỉ hiện tối đa 7 chỉ số ẩn thường; thẻ có 8 chỉ số trong dữ liệu giữ 7 chỉ số đầu; CSA vàng không bị cắt', () => {
  assert.equal(MAX_BASE_TRAITS, 7);
  const raw = JSON.parse(readFileSync('src/player-extra.json', 'utf8')).cards as Record<string, [string | null, number, number, number[]]>;
  let capped = 0;
  for (const p of players) {
    const ex = extraOf(p.id);
    if (!ex) continue;
    assert.ok(ex.traits.length <= 7 && ex.traits.every(id => id < 50), p.name);
    const base = traitIdsOf(p.id).filter(id => id < 50), gold = traitIdsOf(p.id).filter(id => id >= 50);
    assert.deepEqual(base, ex.traits, p.name);
    assert.ok(gold.length <= 1 + 1, p.name);
    const own = raw[String(p.id)];
    if (own) {
      const all = own[3].filter(id => id < 50);
      assert.deepEqual(ex.traits, all.slice(0, 7), p.name);
      assert.deepEqual(traitIdsOf(p.id).filter(id => id >= 50), own[3].filter(id => id >= 50), p.name);
      if (all.length > 7) capped++;
    }
  }
  assert.equal(capped, 43);
});
