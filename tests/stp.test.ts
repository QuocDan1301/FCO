import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCard, packs, players, validateSave } from '../src/game.ts';
import { findPack } from '../src/event.ts';
import { MARKET_FEE_PERCENT, marketQuote, sellCards, sellPlayer, sellRange } from '../src/market.ts';
import { mergeProtected, sameSettings } from '../src/inventory-sync.ts';
import { applyWallet } from '../src/wallet-state.ts';
import { STP_PACKAGES, grantStp, stpHistoryDetail, stpHistoryTitle, taxWithVoucher, voucherCount } from '../src/stp.ts';
import { initialSave } from './stocked-save.ts';

const sql = readFileSync('supabase/migrations/202611110007_fco_star_point.sql', 'utf8');
const update = ['202611110008_fco_stp_24hr.sql', '202611110009_fco_stp_ca.sql', '202611110010_fco_stp_26hr.sql', '202611110011_fco_stp_ld.sql'].map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join(String.fromCharCode(10));

test('Gói Star Point: giá và vật phẩm khớp bảng fco_stp_packages của migration, thứ tự Siêu cấp → Tân binh', () => {
  const rows = [...sql.matchAll(/\('(\w+)', '([^']+)', (\d+), (\d+), '(\[[^']+\])'\)/g)].map(m => ({ id: m[1], name: m[2], price: Number(m[3]), sort: Number(m[4]), items: JSON.parse(m[5]) }));
  // Migration sau cập nhật vật phẩm (202611110008: thêm gói 24HR vào Siêu cấp).
  for (const m of update.matchAll(/update public\.fco_stp_packages set items = '(\[[^']+\])' where id = '(\w+)'/g)) rows.find(r => r.id === m[2])!.items = JSON.parse(m[1]);
  assert.deepEqual(rows.map(r => r.id), ['ultimate', 'super', 'challenge', 'rookie']);
  assert.deepEqual(STP_PACKAGES.map(p => p.price), [100, 50, 30, 15]);
  for (const [i, pkg] of STP_PACKAGES.entries()) {
    assert.equal(rows[i].id, pkg.id); assert.equal(rows[i].name, pkg.name); assert.equal(rows[i].price, pkg.price); assert.equal(rows[i].sort, i + 1);
    assert.deepEqual(rows[i].items, pkg.items, pkg.id);
  }
});

test('Gói Star Point: mọi gói cầu thủ có trong game, là gói quà (không bán Shop), có cầu thủ và ảnh riêng', () => {
  for (const pkg of STP_PACKAGES) for (const item of pkg.items) {
    if (!('pack' in item)) continue;
    const pack = findPack(item.pack);
    assert.ok(pack, item.pack);
    assert.equal(pack.eventOnly, true, item.pack);
    assert.equal(pack.back, `/assets/custom/${item.pack}-back.webp`);
  }
  assert.equal(packs.filter(p => p.id.startsWith('stp-')).length, 25);
  // Phiếu theo đúng thứ tự gói: 30% / 20% / 10% / 10%; BP 75M / 55M / 35M / 15M.
  assert.deepEqual(STP_PACKAGES.map(p => p.items.find(i => 'voucher' in i)), [{ voucher: 30, count: 1 }, { voucher: 20, count: 1 }, { voucher: 10, count: 1 }, { voucher: 10, count: 1 }]);
  assert.deepEqual(STP_PACKAGES.map(p => p.items.find(i => 'bp' in i)), [{ bp: 75_000_000 }, { bp: 55_000_000 }, { bp: 35_000_000 }, { bp: 15_000_000 }]);
});

test('Mua gói Star Point (game tự cộng khi máy chủ chưa giữ kho): đủ gói, BP, phiếu; lịch sử đúng chữ máy chủ ghi', () => {
  const pkg = STP_PACKAGES[0], state = { ...initialSave(), balance: 1_000 };
  const next = grantStp(state, pkg);
  assert.equal(next.balance, 1_000 + 75_000_000);
  for (const item of pkg.items) if ('pack' in item) assert.equal(next.unopened?.[item.pack], (state.unopened?.[item.pack] ?? 0) + 1);
  assert.deepEqual(next.taxVouchers, { 30: 1 });
  assert.equal(next.history[0].type, 'gift');
  assert.equal(stpHistoryTitle(pkg), 'Mua Gói STP Siêu cấp');
  assert.equal(stpHistoryDetail(pkg), '9 gói cầu thủ, 1 phiếu giảm thuế 30%, 75M BP · −100 STP');
  // Gói Tân binh có gói PTG, WG All (+5) chung với gói Cao cấp; mua thêm thì cộng dồn phiếu.
  const twice = grantStp(grantStp(next, STP_PACKAGES[3]), STP_PACKAGES[3]);
  assert.deepEqual(twice.taxVouchers, { 30: 1, 10: 2 });
  assert.equal(twice.unopened?.['stp-pw-all'], (state.unopened?.['stp-pw-all'] ?? 0) + 2);
  assert.ok(validateSave(JSON.parse(JSON.stringify(twice))));
  // Ví máy chủ trả STP → hiện trên thanh trên cùng; STP không lưu như dữ liệu người chơi tự đổi được.
  const wallet = applyWallet(twice, { fc: 5, stp: 85, dailyClaimed: true, event: { points: 0, free: 0, paid: 0, missions: [] }, admin: false });
  assert.equal(wallet.stp, 85);
  assert.ok(sameSettings(wallet, { ...wallet, stp: 1 }));
});

test('Phiếu giảm thuế: trừ thẳng điểm % thuế cho một lần bán, dùng xong mất phiếu; không có phiếu thì không bán được bằng phiếu', () => {
  assert.equal(taxWithVoucher(40, 30), 10);
  assert.equal(taxWithVoucher(28, 30), 0);
  assert.equal(taxWithVoucher(40, null), 40);
  const priced = players.filter(p => marketQuote({ playerId: p.id, level: 1 }).available).slice(0, 2);
  const cards = priced.map(p => makeCard(p.id));
  const state = { ...initialSave(), balance: 0, cards, taxVouchers: { 30: 1 } };
  const price = sellRange(cards[0])!.max;
  assert.throws(() => sellCards(state, [{ uid: cards[0].uid, price }], false, 20), /phiếu/i);
  const sold = sellCards(state, [{ uid: cards[0].uid, price }], false, 30);
  assert.equal(sold.fees, Math.floor(price * (MARKET_FEE_PERCENT - 30) / 100));
  assert.equal(voucherCount(sold.state, 30), 0);
  assert.match(sold.state.history[0].detail, /Phí 10% \(phiếu −30%\)/);
  assert.throws(() => sellCards(sold.state, [{ uid: cards[1].uid, price: sellRange(cards[1])!.max }], false, 30), /phiếu/i);
  const single = sellPlayer({ ...state, taxVouchers: { 10: 2 } }, cards[1].uid, false, 10);
  assert.equal(single.quote.feePercent, 30);
  assert.deepEqual(single.state.taxVouchers, { 10: 1 });
});

test('Phiếu giảm thuế do máy chủ giữ: gộp bản lưu lấy phiếu của máy chủ; bản lưu hỏng thì bỏ phần sai', () => {
  const local = { ...initialSave(), taxVouchers: { 30: 9 } }, server = { ...initialSave(), taxVouchers: { 10: 1 } };
  assert.deepEqual(mergeProtected(local, server).taxVouchers, { 10: 1 });
  assert.deepEqual(mergeProtected(local, { ...server, taxVouchers: undefined }).taxVouchers, {});
  const dirty = JSON.parse(JSON.stringify({ ...initialSave(), stp: -5, taxVouchers: { 30: 2, 25: 1, 10: -1, 20: 1.5 } }));
  assert.ok(validateSave(dirty));
  assert.deepEqual(dirty.taxVouchers, { 30: 2 });
  assert.equal(dirty.stp, undefined);
});
