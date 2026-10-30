import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSaveStore, SaveConflict } from '../src/cloud-save.ts';
import type { CloudRecord, SaveRemote } from '../src/cloud-save.ts';
import { initialSave, makeCard, STORAGE_KEY } from '../src/game.ts';

function disk() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
function remote() {
  let row: CloudRecord | null = null;
  let offline = false;
  const api: SaveRemote = {
    async load() { if (offline) throw new Error('Offline'); return structuredClone(row); },
    async write(data, revision) {
      if (offline) throw new Error('Offline');
      if ((row?.revision ?? 0) !== revision) throw new SaveConflict();
      row = { data: structuredClone(data), revision: revision + 1 };
      return structuredClone(row);
    },
  };
  return { api, read: () => structuredClone(row!), offline: (value: boolean) => { offline = value; } };
}
const state = (store: CloudSaveStore) => JSON.parse(store.getItem('')!);

test('New cloud accounts have zero players and do not import guest progress', async () => {
  const storage = disk(), server = remote();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...initialSave(), cards: [makeCard(11)] }));
  const store = new CloudSaveStore('account:a', server.api, storage);
  await store.initialize();
  assert.equal(server.read().data.cards.length, 0);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)!).cards.length, 1);
  assert.equal(store.status, 'saved');
});

test('A second device loads cards, balance, squad and items from the account', async () => {
  const server = remote(), first = new CloudSaveStore('a', server.api, disk());
  await first.initialize();
  const card = makeCard(11);
  first.setItem('', JSON.stringify({ ...state(first), cards: [card], balance: 123456, squad: [card.uid], fc: 150, unopened: { eternal: 3 } }));
  await first.flush();
  const second = new CloudSaveStore('a', server.api, disk());
  await second.initialize();
  assert.deepEqual(state(second), state(first));
});

test('A failed upload stays durable and resumes after restarting the app', async () => {
  const storage = disk(), server = remote(), first = new CloudSaveStore('a', server.api, storage);
  await first.initialize(); server.offline(true);
  first.setItem('', JSON.stringify({ ...state(first), fc: 234 }));
  await assert.rejects(first.flush(), /Offline/);
  assert.equal(first.status, 'error');
  assert.equal(JSON.parse(storage.getItem('a')!).dirty, true);
  server.offline(false);
  const second = new CloudSaveStore('a', server.api, storage);
  await second.initialize();
  assert.equal(server.read().data.fc, 234);
  assert.equal(second.status, 'saved');
});

test('A stale device cannot overwrite the progress of another device', async () => {
  const server = remote(), storageA = disk(), storageB = disk();
  const a = new CloudSaveStore('a', server.api, storageA), b = new CloudSaveStore('a', server.api, storageB);
  await a.initialize(); await b.initialize();
  a.setItem('', JSON.stringify({ ...state(a), fc: 10 })); await a.flush();
  b.setItem('', JSON.stringify({ ...state(b), fc: 20 }));
  await assert.rejects(b.flush(), SaveConflict);
  assert.equal(b.status, 'conflict');
  assert.equal(server.read().data.fc, 10);
  assert.equal(state(b).fc, 20);
  await b.initialize();
  assert.equal(b.status, 'conflict');
  await b.useCloudCopy();
  assert.equal(state(b).fc, 10);
  assert.equal([...storageB.entries.keys()].some(key => key.startsWith('a:backup:')), true);
});

test('A lost acknowledgement is recovered without overwriting cloud progress', async () => {
  const storage = disk(), server = remote(), store = new CloudSaveStore('a', server.api, storage);
  await store.initialize();
  const value = { ...state(store), fc: 88 };
  await server.api.write(value, 1);
  storage.setItem('a', JSON.stringify({ revision: 1, data: value, dirty: true }));
  await store.initialize();
  assert.equal(store.status, 'saved');
  assert.equal(server.read().revision, 2);
});

test('Account caches stay separate and logging back in cannot reuse another account', async () => {
  const storage = disk(), serverA = remote(), serverB = remote();
  const a = new CloudSaveStore('a', serverA.api, storage), b = new CloudSaveStore('b', serverB.api, storage);
  await a.initialize(); a.setItem('', JSON.stringify({ ...state(a), fc: 12 })); await a.flush();
  await b.initialize(); assert.equal(state(b).fc ?? 0, 0);
  assert.equal(state(a).fc, 12);
});

test('A cloud read failure never replaces a valid cache with a fresh account', async () => {
  const storage = disk(), server = remote(), a = new CloudSaveStore('a', server.api, storage);
  await a.initialize(); a.setItem('', JSON.stringify({ ...state(a), fc: 52 })); await a.flush();
  const before = storage.getItem('a'); server.offline(true);
  const b = new CloudSaveStore('a', server.api, storage);
  await assert.rejects(b.initialize());
  assert.equal(storage.getItem('a'), before);
  assert.equal(b.status, 'error');
});

test('Concurrent actions while uploading are queued in order', async () => {
  const server = remote(); let release!: () => void;
  const store = new CloudSaveStore('a', server.api, disk()); await store.initialize();
  const write = server.api.write;
  server.api.write = async (data, revision) => { await new Promise<void>(resolve => { release = resolve; }); return write(data, revision); };
  store.setItem('', JSON.stringify({ ...state(store), fc: 1 }));
  store.setItem('', JSON.stringify({ ...state(store), fc: 2 }));
  server.api.write = write; release();
  await store.flush();
  assert.equal(server.read().data.fc, 2);
  assert.equal(store.status, 'saved');
});

test('A remote refresh never discards a new action made while the read is in flight', async () => {
  const server = remote(), store = new CloudSaveStore('a', server.api, disk()); await store.initialize();
  const old = server.read(); let release!: () => void;
  server.api.load = () => new Promise(resolve => { release = () => resolve({ ...old, revision: 9 }); });
  const refreshing = store.refresh();
  store.setItem('', JSON.stringify({ ...state(store), fc: 19 }));
  release(); await refreshing; await store.flush();
  assert.equal(state(store).fc, 19);
});
