import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { defaultPacks, draw, getPlayer, initialSave, isPackAvailable, makeCard, MAX_LEVEL, openPacks, packs, players, upgrade, validateSave } from '../src/game';
import { buyPlayer, formatMarketPrice, marketQuote, sellPlayer } from '../src/market';
import { getTeamLogo } from '../src/teamLogos';
import { rngFor } from './pack-rng.ts';

// Định nghĩa gốc: trang quản trị có thể đổi tên / giá / cấp hoặc ẩn gói đang bán.
const pack = defaultPacks.find(p => p.id === 'prime')!;
const roster = players.filter(p => p.tier === 'prime');

test('60 thẻ INFINITE PRIME có ID riêng, đúng khoảng OVR, đủ ảnh và dữ liệu trên thẻ', () => {
  assert.equal(roster.length, 60);
  assert.equal(new Set(players.map(p => p.id)).size, players.length);
  assert.equal(Math.min(...roster.map(p => p.ovr)), 124);
  assert.equal(Math.max(...roster.map(p => p.ovr)), 136);
  assert.equal(pack.range, '124–136');
  assert.deepEqual(roster.filter(p => p.flag === 'VN').map(p => [p.name, p.ovr, p.pos, p.wage]), [
    ['Đỗ Hùng Dũng', 124, 'CM', 29], ['Nguyễn Quang Hải', 124, 'CAM', 30],
  ]);
  assert.equal(roster.find(p => p.name === 'G. Buffon')?.ovr, 136);
  assert.equal(roster.find(p => p.name === 'F. Beckenbauer')?.pos, 'CB');
  assert.equal(roster.find(p => p.name === 'Ronaldinho')?.ovr, 136);
  for (const p of roster) {
    assert.ok(p.cardFace?.startsWith('/assets/prime-'));
    assert.ok(existsSync(new URL(`../public${p.cardFace}`, import.meta.url)));
    assert.ok(p.wage && p.wage >= 29 && p.wage <= 38);
    assert.equal(getTeamLogo(p), '/assets/prime-team.webp');
  }
});

test('Mọi thẻ mới đều mở được trong gói PRIME, lưu được và tương thích tiến trình cũ', () => {
  assert.ok(isPackAvailable(pack));
  const cards = roster.map(p => {
    const card = draw(pack, rngFor(pack, p.id));
    assert.equal(card.playerId, p.id);
    assert.equal(card.level, 1);
    return card;
  });
  const legacy = { ...initialSave(), unopened: { ...initialSave().unopened, [pack.id]: 15 } };
  const snapshot = structuredClone(legacy);
  const opened = openPacks(legacy, pack, 10, () => .9999, true);
  assert.equal(opened.cards.length, 10);
  assert.ok(opened.cards.every(c => getPlayer(c).tier === 'prime'));
  assert.equal(opened.state.unopened?.prime, 5);
  assert.deepEqual(legacy, snapshot);
  assert.ok(validateSave(JSON.parse(JSON.stringify({ ...opened.state, cards: [...cards, ...legacy.cards] }))));
  const state = { ...legacy, cards: [cards[0], cards[1]], balance: 10000000 };
  const upgraded = upgrade(state, cards[0].uid, [cards[1].uid], () => 0, true);
  assert.equal(upgraded.result.playerId, cards[0].playerId);
  assert.ok(validateSave(JSON.parse(JSON.stringify(upgraded.state))));
});

test('Thẻ PRIME giao dịch theo giá từng cấp; chỉ chặn ô chưa có giá', () => {
  const state = initialSave();
  assert.equal(formatMarketPrice(null), 'Chưa có giá');
  for (const p of roster) {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const card = { ...makeCard(p.id), level };
      const quote = marketQuote(card);
      if (!quote.available) {
        assert.equal(quote.price, null);
        assert.equal(quote.proceeds, null);
        assert.throws(() => buyPlayer(state, p.id, level, true), /Chưa có giá/);
        assert.throws(() => sellPlayer({ ...state, cards: [card] }, card.uid, true), /Chưa có giá/);
      } else {
        assert.equal(buyPlayer(state, p.id, level, true).card.level, level);
        assert.ok(!sellPlayer({ ...state, cards: [card] }, card.uid, true).state.cards.some(c => c.uid === card.uid));
      }
    }
  }
});
