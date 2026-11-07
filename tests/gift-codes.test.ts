import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getPackStock, initialSave, packs, validateSave } from '../src/game.ts';
import { applyGiftRewards, giftCodeError, giftCodeHint, hashGiftCode, normalizeGiftCode, prepareGiftCode } from '../src/gift-codes.ts';

const pack = packs[0];

test('Gift code: chuẩn hoá, băm đúng cách máy chủ so (sha256 "fco-gift:<CODE>"), từ chối code sai định dạng', async () => {
  const { code, hash } = await prepareGiftCode('  chaomung 2026 ');
  assert.equal(code, 'CHAOMUNG2026');
  assert.equal(hash, createHash('sha256').update('fco-gift:CHAOMUNG2026').digest('hex'));
  assert.equal(await hashGiftCode(normalizeGiftCode('chaomung2026')), hash);
  assert.equal(giftCodeHint('CHAOMUNG2026'), 'CH••••••••••');
  await assert.rejects(prepareGiftCode(''), /Hãy nhập/);
  await assert.rejects(prepareGiftCode('ab'), /4–32/);
  await assert.rejects(prepareGiftCode('mã có dấu'), /4–32/);
});

test('Gift code: BP và gói cộng vào bản lưu, FC để máy chủ cộng; ghi lịch sử', () => {
  const before = { ...initialSave(), fc: 500 };
  const { state, text } = applyGiftRewards(before, 'CHAOMUNG2026', [{ fc: 1000 }, { bp: 5000 }, { pack: pack.id, count: 2 }]);
  assert.equal(state.fc, 500, 'FC không cộng ở trình duyệt');
  assert.equal(state.balance, before.balance + 5000);
  assert.equal(getPackStock(state, pack), getPackStock(before, pack) + 2);
  assert.match(state.history[0].title, /CHAOMUNG2026/);
  assert.match(text, /1\.000 FC/);
  assert.ok(validateSave(JSON.parse(JSON.stringify(state))));
});

test('Kiểm tra mục gift code (dùng ở bảng admin)', async () => {
  const ids = packs.map(p => p.id), base = { hash: await hashGiftCode('ABCD'), hint: 'AB••', expires: null, created: '2026-11-07' };
  assert.equal(giftCodeError({ ...base, rewards: [{ fc: 1 }] }, ids), null);
  assert.equal(giftCodeError({ ...base, rewards: [{ pack: 'khong-co', count: 1 }] }, ids), 'Gói khong-co không có trong Shop.');
  assert.equal(giftCodeError({ ...base, rewards: [{ fc: 0 }] }, ids), 'Phần quà phải là số nguyên dương (gói tối đa 1000).');
});
