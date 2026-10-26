import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCard, players, upgradeInfo } from '../src/game.ts';
import type { Card } from '../src/game.ts';
import { marketQuote } from '../src/market.ts';
import { autoPickMaterials } from '../src/autoPick.ts';
import { seededRng } from '../src/upgrade/rng.ts';

const price = (cards: Card[]) => cards.reduce((sum, c) => sum + (marketQuote(c).price ?? 1e15), 0);
// Vét cạn mọi bộ 1–5 thẻ: năng lượng cao nhất, rồi tổng giá thấp nhất.
function bruteForce(target: Card, pool: Card[]) {
  let best = { energy: 0, price: Infinity };
  const walk = (start: number, chosen: Card[]) => {
    if (chosen.length) {
      const energy = upgradeInfo(target, chosen).energy, cost = price(chosen);
      if (energy > best.energy || (energy === best.energy && cost < best.price)) best = { energy, price: cost };
    }
    if (chosen.length === 5) return;
    for (let i = start; i < pool.length; i++) walk(i + 1, [...chosen, pool[i]]);
  };
  walk(0, []);
  return best;
}

test('Chọn tự động: đủ 5 vạch với tổng giá thấp nhất, không đủ thì nạp nhiều nhất; khớp vét cạn', () => {
  const rng = seededRng(7), priced = players.filter(p => marketQuote({ playerId: p.id, level: 1 }).price !== null);
  for (let round = 0; round < 40; round++) {
    const pick = () => priced[Math.floor(rng() * priced.length)];
    const target = { ...makeCard(pick().id), level: 1 + Math.floor(rng() * 12) };
    const pool = Array.from({ length: 10 }, () => ({ ...makeCard(pick().id), level: 1 + Math.floor(rng() * 13) }));
    const result = autoPickMaterials(target, pool);
    const chosen = result.ids.map(id => pool.find(c => c.uid === id)!);
    const best = bruteForce(target, pool);
    assert.ok(chosen.length >= 1 && chosen.length <= 5 && new Set(result.ids).size === chosen.length);
    assert.equal(upgradeInfo(target, chosen).energy, best.energy, `vòng ${round}`);
    assert.equal(result.energy, best.energy);
    assert.equal(price(chosen), best.price, `vòng ${round}: tổng giá`);
  }
});

test('Chọn tự động: không có thẻ thì không chọn gì; thẻ chưa có giá chỉ dùng khi bắt buộc', () => {
  const target = { ...makeCard(players[0].id), level: 3 };
  assert.deepEqual(autoPickMaterials(target, []), { ids: [], energy: 0 });
  const unpriced = players.find(p => marketQuote({ playerId: p.id, level: 13 }).price === null);
  if (unpriced) {
    const strong = Array.from({ length: 5 }, () => ({ ...makeCard(target.playerId), level: 13 }));
    const result = autoPickMaterials(target, [{ ...makeCard(unpriced.id), level: 13 }, ...strong]);
    if (upgradeInfo(target, strong).energy === 100) assert.ok(result.ids.every(id => strong.some(c => c.uid === id)));
  }
});
