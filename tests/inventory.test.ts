import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudSaveStore } from '../src/cloud-save.ts';
import type { CloudRecord, SaveRemote } from '../src/cloud-save.ts';
import { GAUGE_ABOVE_STEP, MAX_INVENTORY_OPEN, MAX_LEVEL, PROTECT_MIN_LEVEL, RESTORE_MIN_LEVEL, UPGRADE_LEVELS, initialSave, makeCard, materialGauge, packs, players } from '../src/game.ts';
import type { Entry, Save } from '../src/game.ts';
import { buildCatalog, catalogVersion } from '../src/inventory-catalog.ts';
import { inventoryMode, mergeHistory, mergeProtected, sameSettings } from '../src/inventory-sync.ts';
import { CHECKIN_REWARDS } from '../src/checkin.ts';
import { MEMBERSHIPS } from '../src/membership.ts';

const sql = readFileSync(new URL('../supabase/migrations/202611100013_fco_inventory_server.sql', import.meta.url), 'utf8');

test('Bộ dữ liệu đồng bộ: đủ cầu thủ / gói, tỷ lệ mỗi gói cộng lại 1, luật đập khớp game', async () => {
  const catalog = buildCatalog();
  assert.equal(catalog.players.length, players.length);
  assert.equal(catalog.packs.length, packs.length);
  assert.equal(new Set(catalog.packs.map(p => p.id)).size, catalog.packs.length);
  const ids = new Set(catalog.players.map(p => p[0]));
  for (const p of catalog.players) {
    assert.equal(p[2].length, MAX_LEVEL); assert.equal(p[3].length, MAX_LEVEL);
    assert.ok(p[2].every(Number.isInteger), `${p[1]}: OVR nguyên`);
  }
  for (const pack of catalog.packs.filter(p => p.available)) {
    assert.ok(pack.players.every(id => ids.has(id)), pack.id);
    if (!pack.choose) assert.ok(Math.abs(pack.weights.reduce((s, w) => s + w, 0) - 1) < 1e-9, pack.id);
    assert.ok(Math.abs(pack.levelWeights.reduce((s, w) => s + w, 0) - 1) < 1e-9, pack.id);
    if (pack.choose) assert.ok(pack.draftSize >= 1 && pack.draftSize <= pack.draft.length && pack.draft.every(id => ids.has(id)), pack.id);
  }
  const { rules } = catalog;
  assert.deepEqual(rules.chances, UPGRADE_LEVELS.map(r => r.chance));
  assert.equal(rules.maxLevel, MAX_LEVEL); assert.equal(rules.maxOpen, MAX_INVENTORY_OPEN);
  assert.equal(rules.protectMin, PROTECT_MIN_LEVEL); assert.equal(rules.restoreMin, RESTORE_MIN_LEVEL);
  assert.deepEqual(rules.membership, Object.fromEntries(MEMBERSHIPS.map(m => [m.id, m.discount])));
  // Mã phiên bản ổn định trong một phiên và là SHA-256.
  const version = await catalogVersion();
  assert.match(version, /^[0-9a-f]{64}$/);
  assert.equal(await catalogVersion(), version);
});

test('Hằng số viết thẳng trong SQL khớp game (năng lượng phôi trên +10 OVR, gói điểm danh ngày 7)', () => {
  // fco_inv_gauge: chênh ≤ 10 dùng gaugeStep gửi lên; trên 10 nội suy 2,5 → 5 vạch (+0,5 mỗi OVR) như materialGauge.
  assert.match(sql, /2\.5 \+ \(diff - 10\) \* 0\.5/);
  for (let diff = 0; diff <= 20; diff++) {
    const expected = Math.min(5, diff <= 10 ? 1 + diff * GAUGE_ABOVE_STEP : 2.5 + (diff - 10) * .5);
    assert.ok(Math.abs(materialGauge(100, 100 + diff) - expected) < 1e-9, `chênh ${diff}`);
  }
  const day7 = CHECKIN_REWARDS[6];
  assert.ok('pack' in day7);
  assert.ok(sql.includes(`'[{"pack": "${day7.pack}", "count": ${day7.count}}]'`), 'gói ngày 7 trong fco_claim_daily');
});

test('Gộp bản lưu: phần được bảo vệ lấy từ máy chủ, cài đặt giữ ở máy, lịch sử gộp theo id', () => {
  const card = makeCard(11);
  const entry = (id: string, time: number): Entry => ({ id, time, type: 'gift', title: id, detail: '' });
  const server: Save = { ...initialSave(), cards: [card], balance: 500, unopened: { eternal: 2 }, opened: 3, upgrades: 4, sound: false, history: [entry('s', 20), entry('both', 10)] };
  const local: Save = { ...initialSave(), cards: [], balance: 999, unopened: {}, opened: 0, upgrades: 0, sound: true, squad: ['x'], history: [entry('l', 30), { ...entry('both', 10), title: 'local' }] };
  const merged = mergeProtected(local, server);
  assert.deepEqual(merged.cards, [card]); assert.equal(merged.balance, 500); assert.deepEqual(merged.unopened, { eternal: 2 });
  assert.equal(merged.opened, 3); assert.equal(merged.upgrades, 4);
  assert.equal(merged.sound, true); assert.deepEqual(merged.squad, ['x']);
  assert.deepEqual(merged.history.map(e => e.id), ['l', 's', 'both']);
  assert.equal(merged.history[2].title, 'both', 'trùng id thì giữ bản máy chủ');
  assert.equal(mergeHistory(Array.from({ length: 150 }, (_, i) => entry(`a${i}`, i)), Array.from({ length: 150 }, (_, i) => entry(`b${i}`, i))).length, 200);
  assert.ok(sameSettings(merged, { ...merged, balance: 1, cards: [], history: [] }));
  assert.ok(!sameSettings(merged, { ...merged, sound: false }));
});

test('Chế độ kho: khớp mã → máy chủ; lệch mà chưa bắt buộc → như cũ; lệch đã bắt buộc → chặn', () => {
  const state = (version: string | null, enforced = false) => ({ version, enforced, syncedAt: null });
  assert.equal(inventoryMode(false, null, null), 'local');
  assert.equal(inventoryMode(true, null, 'v'), 'loading');
  assert.equal(inventoryMode(true, state('v'), 'v'), 'server');
  assert.equal(inventoryMode(true, state('old'), 'v'), 'local');
  assert.equal(inventoryMode(true, state(null), 'v'), 'local');
  assert.equal(inventoryMode(true, state('old', true), 'v'), 'blocked');
  assert.equal(inventoryMode(true, null, 'v', true), 'local', 'máy chủ chưa chạy migration');
});

// Máy chủ giả: gộp như fco_commit_save(p_merge) khi game gửi merge.
function server() {
  let row: CloudRecord | null = null;
  const api: SaveRemote = {
    async load() { return structuredClone(row); },
    async write(data, revision, merge = false) {
      if (merge && row) row = { data: mergeProtected(structuredClone(data), row.data), revision: row.revision + 1 };
      else { if ((row?.revision ?? 0) !== revision) throw new Error('FCO_SAVE_CONFLICT'); row = { data: structuredClone(data), revision: revision + 1 }; }
      return structuredClone(row);
    },
  };
  // Một thao tác trên máy chủ (mở gói, đập…) đổi phần được bảo vệ và tăng revision.
  const op = (change: (data: Save) => Save) => { row = { data: change(structuredClone(row!.data)), revision: row!.revision + 1 }; return structuredClone(row); };
  return { api, op, read: () => structuredClone(row!) };
}
function disk() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
const local = (store: CloudSaveStore) => JSON.parse(store.getItem('')!) as Save;

test('Máy chủ giữ kho: nhận bản lưu sau thao tác, cài đặt chưa gửi vẫn giữ, không còn xung đột revision', async () => {
  const remote = server(), store = new CloudSaveStore('a', remote.api, disk());
  await store.initialize();
  store.setItem('', JSON.stringify({ ...local(store), inv: 1, fc: 70 }));
  await store.flush();
  // Thao tác máy chủ: thêm thẻ + BP. Game nhận bản mới, giữ FC đang hiện ở máy.
  const card = makeCard(11);
  store.adopt(remote.op(data => ({ ...data, cards: [card], balance: 1000 })));
  assert.deepEqual(local(store).cards, [card]); assert.equal(local(store).balance, 1000);
  // Bản lưu cũ hơn (revision thấp) không ghi đè.
  store.adopt({ revision: 1, data: { ...initialSave(), inv: 1 } });
  assert.equal(local(store).balance, 1000);
  // Game cố tự cộng BP + đổi cài đặt: máy chủ giữ BP của mình, nhận cài đặt.
  store.setItem('', JSON.stringify({ ...local(store), balance: 999999, sound: true }));
  await store.flush();
  assert.equal(remote.read().data.balance, 1000); assert.equal(remote.read().data.sound, true);
  assert.equal(local(store).balance, 1000, 'trên máy cũng về số của máy chủ');
  assert.equal(store.status, 'saved');
  // Máy khác vừa thao tác (revision tăng) trong lúc máy này có cài đặt chưa gửi: mở lại thì gộp, không báo hai bản tiến trình.
  const storage = disk(), second = new CloudSaveStore('a', remote.api, storage);
  await second.initialize();
  second.setItem('', JSON.stringify({ ...local(second), quick: true }));
  remote.op(data => ({ ...data, balance: 5 }));
  const reopened = new CloudSaveStore('a', remote.api, storage);
  await reopened.initialize();
  assert.equal(reopened.status, 'saved');
  assert.equal(local(reopened).balance, 5); assert.equal(local(reopened).quick, true);
  assert.equal(remote.read().data.quick, true);
});
