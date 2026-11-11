import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walletMessage } from '../src/wallet-state.ts';

const sql = readFileSync('supabase/migrations/202611110014_fco_anti_clone.sql', 'utf8');

test('Hạn chế clone: mã thiết bị lưu cố định trong trình duyệt, gửi kèm heartbeat', async () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const { deviceId } = await import('../src/device-id.ts');
  const id = deviceId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(store.get('fco-device'), id);
  assert.equal(deviceId(), id);
  assert.match(readFileSync('src/wallet.ts', 'utf8'), /'fco_heartbeat', \{ p_device: deviceId\(\) \}/);
});

test('Hạn chế clone: quà ngày, Bi Lắc miễn phí, gift code bị giới hạn theo thiết bị; thông báo dễ hiểu', () => {
  for (const kind of ["'daily:'", "'bilac:'", "'gift:'"]) assert.ok(sql.includes(kind), kind);
  assert.match(walletMessage(new Error('FCO_DEVICE_LIMIT')), /Mỗi thiết bị chỉ một tài khoản/);
});
