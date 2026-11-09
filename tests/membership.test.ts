import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialSave, makeCard, validateSave } from '../src/game.ts';
import { MARKET_FEE_PERCENT, marketQuote, saleFee, saleTaxPercent, sellCards, sellPlayer, sellRange } from '../src/market.ts';
import { MEMBERSHIPS, bestMembership, membershipLeft } from '../src/membership.ts';
import { applyWallet } from '../src/wallet-state.ts';
import type { Wallet } from '../src/wallet-state.ts';

const future = Date.now() + 86_400_000, past = Date.now() - 1000;

test('Giá gói thành viên ở game khớp với máy chủ', () => {
  const sql = readFileSync('supabase/migrations/202611090005_fco_membership_prices.sql', 'utf8');
  for (const item of MEMBERSHIPS) assert.match(sql, new RegExp(`when '${item.id}' then price := ${item.price};`));
  assert.deepEqual(MEMBERSHIPS.map(item => [item.id, item.price, item.discount]), [['svip', 1000, 30], ['premium', 1500, 50]]);
});

test('Thuế bán: 40% khi không có gói, SVIP 28%, Premium 20%, hết hạn thì về 40%', () => {
  assert.equal(saleTaxPercent({}), MARKET_FEE_PERCENT);
  assert.equal(saleTaxPercent({ membership: { svip: future } }), 28);
  assert.equal(saleTaxPercent({ membership: { premium: future } }), 20);
  assert.equal(saleTaxPercent({ membership: { svip: future, premium: future } }), 20, 'có cả hai thì lấy gói giảm nhiều hơn');
  assert.equal(saleTaxPercent({ membership: { svip: future, premium: past } }), 28, 'Premium hết hạn thì còn SVIP');
  assert.equal(saleTaxPercent({ membership: { svip: past, premium: null } }), 40);
});

test('Bán lẻ và bán hàng loạt trừ đúng thuế đã giảm', () => {
  const cards = [makeCard(47), makeCard(47)];
  const state = { ...initialSave(), balance: 0, cards, membership: { premium: future } };
  const quote = marketQuote(cards[0], saleTaxPercent(state));
  const single = sellPlayer(state, cards[0].uid);
  assert.equal(single.quote.feePercent, 20);
  assert.equal(single.state.balance, quote.price! - Math.floor(quote.price! * 20 / 100));
  assert.match(single.state.history[0].detail, /Phí 20%/);

  const price = sellRange(cards[0])!.price;
  const bulk = sellCards(state, cards.map(card => ({ uid: card.uid, price })));
  assert.equal(bulk.fees, saleFee(price, 20) * 2);
  assert.match(bulk.state.history[0].detail, /Phí 20%/);

  const noPass = sellCards({ ...state, membership: undefined }, [{ uid: cards[0].uid, price }]);
  assert.equal(noPass.fees, saleFee(price));
  assert.match(noPass.state.history[0].detail, /Phí 40%/);
});

test('Hạn gói lấy từ ví máy chủ; ví chưa có trường này thì giữ nguyên bản lưu', () => {
  const wallet: Wallet = { fc: 5, dailyClaimed: false, event: { points: 0, free: 0, paid: 0, missions: [] }, admin: false };
  assert.equal('membership' in applyWallet(initialSave(), wallet), false);
  assert.deepEqual(applyWallet(initialSave(), { ...wallet, membership: { svip: future, premium: null } }).membership, { svip: future, premium: null });
  assert.deepEqual(applyWallet({ ...initialSave(), membership: { svip: future } }, wallet).membership, { svip: future });
});

test('Bản lưu: hạn sai kiểu thì bỏ, không làm hỏng cả bản lưu', () => {
  const good = JSON.parse(JSON.stringify({ ...initialSave(), membership: { svip: future, premium: null } }));
  assert.ok(validateSave(good));
  assert.deepEqual(good.membership, { svip: future, premium: null });
  const bad = JSON.parse(JSON.stringify({ ...initialSave(), membership: { svip: 'mãi mãi' } }));
  assert.ok(validateSave(bad));
  assert.equal(bad.membership, undefined);
});

test('Thời gian còn lại hiển thị trong Shop', () => {
  const at = 1_000_000_000_000, HOUR = 3_600_000;
  assert.equal(membershipLeft(null, at), null);
  assert.equal(membershipLeft(at - 1, at), null);
  assert.equal(membershipLeft(at + 5 * HOUR, at), 'Còn 5 giờ');
  assert.equal(membershipLeft(at + 24 * HOUR, at), 'Còn 24 giờ');
  assert.equal(membershipLeft(at + 7 * 24 * HOUR, at), 'Còn 7 ngày 0 giờ');
  assert.equal(membershipLeft(at + 50 * HOUR, at), 'Còn 2 ngày 2 giờ');
  assert.equal(bestMembership(undefined, at), null);
});
