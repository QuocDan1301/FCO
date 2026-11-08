import test from 'node:test';
import assert from 'node:assert/strict';
import { buyPacks, defaultPacks, getPackStock, openPacks, openSelectedPacks, validateSave } from '../src/game.ts';
import { initialSave as stockedSave } from './stocked-save.ts';

// Shop thật (src/packs.json) có thể chưa bán gói nào: test mua bằng danh sách gói mẫu lấy từ gói gốc ICONTM và 26TOTS.
const packs = ['eternal', 'stellar'].map(id => defaultPacks.find(p => p.id === id)!);
const buy = (state: Parameters<typeof buyPacks>[0], pack: (typeof packs)[number], count: number, free = false) => buyPacks(state, pack, count, free, packs);
const initialSave = () => ({ ...stockedSave(), fc: 100_000_000 });

test('Shop trừ đúng FC (không đụng BP), thêm gói vào kho, lưu lịch sử và không sửa bản lưu gốc', () => {
  const before = initialSave();
  const next = buy(before, packs[1], 10);
  assert.equal(next.fc, before.fc - packs[1].price * 10);
  assert.equal(next.balance, before.balance);
  assert.equal(getPackStock(next, packs[1]), 25);
  assert.equal(next.history[0].type, 'shop');
  assert.match(next.history[0].detail, /FC/);
  assert.ok(validateSave(JSON.parse(JSON.stringify(next))));
  assert.equal(before.unopened?.stellar, 15);
  assert.equal(next.cards, before.cards);
  assert.equal(next.opened, before.opened);
  assert.equal(next.upgrades, before.upgrades);
});

test('Mở gói miễn phí: gói mua ở Shop và gói quà đều không trừ BP hay FC, kể cả khi 0 BP', () => {
  const paid = buy(initialSave(), packs[1], 3);
  const opened = openPacks(paid, packs[1], 2);
  assert.equal(opened.state.balance, paid.balance);
  assert.equal(opened.state.fc, paid.fc);
  const mixed = openPacks(opened.state, packs[1], 3);
  assert.equal(mixed.state.balance, paid.balance);
  assert.equal(mixed.state.unopened?.stellar, 13);
  assert.ok(validateSave(mixed.state));
  // Gói quà khi không có BP: mở được, nhận đủ thẻ, BP vẫn 0, lịch sử không ghi trừ BP.
  const gift = { ...initialSave(), balance: 0, fc: 0, unopened: { [packs[0].id]: 2 } };
  const free = openPacks(gift, packs[0], 2);
  assert.equal(free.cards.length, 2);
  assert.equal(free.state.balance, 0); assert.equal(free.state.fc, 0);
  assert.equal(free.state.unopened?.[packs[0].id], 0);
  assert.doesNotMatch(free.state.history[0].detail, /BP/);
  const selected = openSelectedPacks({ ...gift, unopened: { [packs[0].id]: 1, [packs[1].id]: 1 } }, packs);
  assert.equal(selected.cards.length, 2); assert.equal(selected.state.balance, 0);
});

test('Mua và mở hết 150 gói khi FC còn 0, kể cả chọn nhiều loại gói', () => {
  let state = { ...initialSave(), balance: 0, fc: 80 * packs[0].price + 70 * packs[1].price, unopened: { [packs[0].id]: 0, [packs[1].id]: 0 } };
  state = buy(state, packs[0], 80);
  state = buy(state, packs[1], 70);
  assert.equal(state.fc, 0);
  const opened = openSelectedPacks(state, packs);
  assert.equal(opened.cards.length, 150);
  assert.equal(opened.state.balance, 0);
  assert.ok(validateSave(opened.state));
});

test('Shop chặn số lượng sai, thiếu FC, gói không bán và tràn kho; lỗi giữ nguyên bản lưu', () => {
  const before = { ...initialSave(), fc: packs[0].price * 149 };
  const snapshot = JSON.stringify(before);
  for (const count of [0, -1, 151, 1.5, NaN, Infinity]) assert.throws(() => buy(before, packs[0], count, true));
  assert.throws(() => buy(before, packs[0], 150), /Không đủ FC/);
  assert.throws(() => buy({ ...before, fc: undefined }, packs[0], 1), /Không đủ FC/);
  assert.throws(() => buy(before, { ...packs[0], id: 'unknown' }, 1), /chưa có/);
  assert.throws(() => buyPacks(before, packs[0], 1), /chưa có/, 'gói không nằm trong Shop thật thì không mua được');
  assert.throws(() => buy({ ...before, unopened: { [packs[0].id]: Number.MAX_SAFE_INTEGER } }, packs[0], 1, true), /giới hạn/);
  assert.equal(JSON.stringify(before), snapshot);
  const canonical = buy(before, { ...packs[0], price: 0 }, 1);
  assert.equal(canonical.fc, before.fc - packs[0].price);
});

test('Shop giữ số dư trong chế độ vô hạn, cộng dồn gói và giữ tối đa 200 lịch sử', () => {
  const before = { ...initialSave(), fc: 0 };
  const first = buy(before, packs[0], 150, true);
  const second = buy(first, packs[0], 150, true);
  assert.equal(second.fc, 0);
  assert.equal(second.unopened?.[packs[0].id], 315);
  const opened = openPacks(second, packs[0], 150, undefined);
  assert.equal(opened.state.unopened?.[packs[0].id], 165);
  assert.ok(validateSave(opened.state));
  const fullHistory = { ...before, history: Array.from({ length: 200 }, (_, i) => ({ id: String(i), time: i, type: 'gift' as const, title: 'Quà', detail: 'BP' })) };
  assert.equal(buy(fullHistory, packs[0], 1, true).history.length, 200);
});

test('Bản lưu cũ dùng được; số gói trả trước còn sót (kể cả sai) được bỏ, không làm hỏng bản lưu', () => {
  assert.ok(validateSave(initialSave()));
  const legacy = initialSave(); delete legacy.unopened;
  assert.equal(buy(legacy, packs[1], 1).unopened?.stellar, 1);
  for (const prepaid of [{ eternal: 2 }, { eternal: 9999 }, { eternal: -1 }, { unknown: 1.5 }, 'hong']) {
    const old: Record<string, unknown> = { ...initialSave(), prepaid };
    assert.equal(validateSave(old), true);
    assert.equal('prepaid' in old, false);
  }
});