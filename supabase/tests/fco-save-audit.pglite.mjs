// Chạy thử migration theo dõi bất thường trên PGlite (cài như fco-wallet.pglite.mjs):
//   NODE_PATH=<tmp>/node_modules node supabase/tests/fco-save-audit.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611070002_fco_save_audit.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, walletSql, auditSql] = process.argv.slice(2);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['202610300001_fco_accounts.sql', '202610300002_delete_own_account.sql']) await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.query(`insert into auth.users values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid'), ($3, 'player_c@players.fco.invalid')`, [A, B, C]);
await db.exec(readFileSync(walletSql, 'utf8'));
await db.exec(readFileSync(auditSql, 'utf8'));
console.log('migrations OK');

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const commit = async (uid, data, rev) => Object.values(await as(uid, `select public.fco_commit_save($1::jsonb, $2) as r`, [JSON.stringify(data), rev]))[0];
const anomalies = async () => Object.values(await as(A, `select public.fco_admin_anomalies() as r`))[0];
const card = (uid, level = 1) => ({ uid, playerId: 1, level, received: 1 });
const h = (id, type) => ({ id, time: 1, type, title: 't', detail: 'd' });
const save = (balance, cards, unopened, history) => ({ version: 1, balance, cards, unopened, history, daily: '', opened: 0, upgrades: 0, sound: false, reduced: false });

// Người chơi thật: mỗi thay đổi có lịch sử đi kèm → không bị đánh dấu.
let s = save(0, [], { a: 0 }, []);
let r = await commit(B, s, 0);
s = save(0, [], { a: 3 }, [h('1', 'shop')]); r = await commit(B, s, r.revision);                                   // mua 3 gói
s = save(0, [card('x'), card('y')], { a: 1 }, [h('2', 'pack'), h('1', 'shop')]); r = await commit(B, s, r.revision); // mở 2 gói
s = save(5_000_000, [card('y')], { a: 1 }, [h('3', 'market'), h('2', 'pack'), h('1', 'shop')]); r = await commit(B, s, r.revision); // bán thẻ
s = save(1_000_000, [card('y', 5)], { a: 1 }, [h('4', 'upgrade'), h('3', 'market'), h('2', 'pack'), h('1', 'shop')]); r = await commit(B, s, r.revision); // nâng cấp
s = save(60_000_000, [card('y', 5)], { a: 2 }, [h('5', 'event'), h('4', 'upgrade'), h('3', 'market'), h('2', 'pack'), h('1', 'shop')]); r = await commit(B, s, r.revision); // sự kiện
s = { ...s, sound: true }; r = await commit(B, s, r.revision); // đổi cài đặt
assert.deepEqual(await anomalies(), [], 'chơi bình thường không bị đánh dấu');

// Gian lận: sửa BP, gói, thẻ, cấp mà không có lịch sử.
s = { ...s, balance: 9_000_000_000_000 }; r = await commit(B, s, r.revision);
s = { ...s, unopened: { a: 500 } }; r = await commit(B, s, r.revision);
s = { ...s, cards: [...s.cards, card('z', 13)] }; r = await commit(B, s, r.revision);
s = { ...s, cards: s.cards.map(c => c.uid === 'y' ? { ...c, level: 13 } : c) }; r = await commit(B, s, r.revision);
// Gian lận gộp nhiều thứ cùng lúc.
s = { ...s, balance: s.balance + 1, unopened: { a: 501 }, cards: [...s.cards, card('w')] }; r = await commit(B, s, r.revision);
// Lịch sử giả sai loại (vd. thêm dòng 'upgrade' để che BP tăng) vẫn bị bắt.
s = { ...s, balance: s.balance + 5, history: [h('6', 'upgrade'), ...s.history] }; r = await commit(B, s, r.revision);
let list = await anomalies();
assert.deepEqual(list.map(x => x.flags), [['bp_no_source'], ['bp_no_source', 'packs_no_source', 'cards_no_source'], ['level_no_source'], ['cards_no_source'], ['packs_no_source'], ['bp_no_source']]);
assert.equal(list.at(-1).login, 'player_b');
assert.deepEqual([list.at(-1).bpBefore, list.at(-1).bpAfter], [60_000_000, 9_000_000_000_000]);
assert.deepEqual(list[0].history, ['upgrade']);

// Tài khoản mới mà bản lưu đầu đã có đồ.
await commit(C, save(1_000_000, [card('q')], {}, []), 0);
list = await anomalies();
assert.deepEqual(list[0].flags, ['new_account_items']); assert.equal(list[0].login, 'player_c');

// Bản lưu lạ không làm hỏng việc lưu.
const odd = await commit(C, { version: 1, cards: [], balance: 'abc', unopened: [1, 2], history: 'x' }, 1);
assert.equal(odd.revision, 2);

// Quyền: người chơi không xem được; admin đánh dấu đã xem.
await assert.rejects(as(B, `select public.fco_admin_anomalies()`), /FCO_ADMIN_ONLY/);
await assert.rejects(as(B, `select * from public.fco_save_audit`), /permission denied/);
await assert.rejects(as(B, `select public.fco_audit_save('${B}', 1, null, '{}')`), /permission denied/);
const first = (await anomalies()).find(x => x.login === 'player_c');
list = Object.values(await as(A, `select public.fco_admin_anomaly_review($1) as r`, [first.id]))[0];
assert.ok(!list.some(x => x.login === 'player_c'));
const one = list[0];
list = Object.values(await as(A, `select public.fco_admin_anomaly_review($1, true) as r`, [one.id]))[0];
assert.deepEqual(list, []);
assert.equal((Object.values(await as(A, `select public.fco_admin_anomalies(100, true) as r`))[0]).length, 7);
// FC vẫn bị bỏ khỏi bản lưu.
assert.equal((await db.query(`select data ? 'fc' as has from public.fco_game_saves where user_id = $1`, [B])).rows[0].has, false);
console.log('AUDIT PASS');
