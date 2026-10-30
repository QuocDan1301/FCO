import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAccountCache, loginIdentity, registrationIdentity } from '../src/account-identity.ts';
import { deleteAccount } from '../src/account-deletion.ts';

test('Username sign-up and login share a normalized identity without asking for email', () => {
  const identity = registrationIdentity('  QuocDan_1301  ');
  assert.equal(identity.name, 'quocdan_1301');
  assert.equal(loginIdentity('QUOCDAN_1301'), identity.email);
  assert.throws(() => registrationIdentity('a'), /3–24/);
  assert.throws(() => registrationIdentity('name with spaces'), /3–24/);
  assert.throws(() => registrationIdentity('person@example.com'), /3–24/);
  assert.throws(() => registrationIdentity('đặng'), /3–24/);
  assert.throws(() => registrationIdentity('x'.repeat(25)), /3–24/);
});

test('Existing email accounts can still access the original save identity', () => {
  assert.equal(loginIdentity('  OLD@example.com '), 'old@example.com');
});

test('Wrong password cannot reach the deletion operation', async () => {
  let calls = 0;
  await assert.rejects(deleteAccount({ authenticate: async () => { throw new Error('Wrong password'); }, remove: async () => { calls++; return true; } }, 'a', 'wrong'), /Wrong password/);
  assert.equal(calls, 0);
});

test('Account deletion rejects a changed identity before calling the server', async () => {
  let calls = 0;
  await assert.rejects(deleteAccount({ authenticate: async () => 'b', remove: async () => { calls++; return true; } }, 'a', 'secret'), /Phiên đăng nhập/);
  assert.equal(calls, 0);
});

test('Account deletion requires a password and a positive server acknowledgement', async () => {
  const api = { authenticate: async () => 'a', remove: async () => false };
  await assert.rejects(deleteAccount(api, 'a', ''), /mật khẩu/);
  await assert.rejects(deleteAccount(api, 'a', 'secret'), /chưa xác nhận/);
  await deleteAccount({ ...api, remove: async () => true }, 'a', 'secret');
});

test('Deleting local data removes only that account and its backups', () => {
  const values = new Map([['account:a', 'save'], ['account:a:seen', 'seen'], ['account:a:backup:1', 'backup'], ['account:ab', 'other'], ['guest', 'guest']]);
  const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, removeItem: (key: string) => { values.delete(key); } };
  clearAccountCache(storage, 'account:a');
  assert.deepEqual([...values.keys()], ['account:ab', 'guest']);
});
