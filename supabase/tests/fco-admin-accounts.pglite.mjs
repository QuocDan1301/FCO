// Chạy thử migration quản lý tài khoản trên PGlite (cài như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-admin-accounts.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611070002_fco_save_audit.sql supabase/migrations/202611070003_fco_stats.sql supabase/migrations/202611080008_fco_admin_accounts.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, ...files] = process.argv.slice(2);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['202610300001_fco_accounts.sql', '202610300002_delete_own_account.sql']) await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
const ADMIN = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d', E = '00000000-0000-0000-0000-00000000000e';
await db.query(`insert into auth.users(id, email, created_at) values
  ($1, 'quocdan06@players.fco.invalid', now() - interval '20 days'),
  ($2, 'player_b@players.fco.invalid', now() - interval '3 days'),
  ($3, 'playerxc@players.fco.invalid', now() - interval '2 days'),
  ($4, 'that.email@gmail.com', now() - interval '1 day'),
  ($5, 'moi_dang_ky@players.fco.invalid', now())`, [ADMIN, B, C, D, E]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
console.log('migrations OK');

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql, params) => Object.values(await as(uid, `select ${sql} as r`, params))[0];
const list = (uid, args = `null, 'new', 50, 0`) => rpc(uid, `public.fco_admin_accounts(${args})`);
const save = { version: 1, balance: 500, cards: [{ uid: 'a' }, { uid: 'b' }], unopened: { eternal: 3 } };

// Chỉ admin xem / khoá / xoá được; khách không gọi được; các hàm phụ không lộ ra ngoài.
await assert.rejects(list(B), /FCO_ADMIN_ONLY/);
await assert.rejects(list(null), /permission denied/);
await assert.rejects(rpc(B, 'public.fco_admin_account_lock($1, true)', [C]), /FCO_ADMIN_ONLY/);
await assert.rejects(rpc(B, 'public.fco_admin_account_delete($1)', [C]), /FCO_ADMIN_ONLY/);
await assert.rejects(rpc(B, 'public.fco_admin_target($1)', [C]), /permission denied/);
await assert.rejects(rpc(B, `public.fco_login_name('x')`), /permission denied/);

// Mọi tài khoản đều hiện, kể cả tài khoản vừa đăng ký chưa từng vào game; mới đăng ký lên đầu.
await rpc(B, 'public.fco_commit_save($1::jsonb, 0)', [JSON.stringify(save)]);
await rpc(B, 'public.fco_heartbeat()');
await rpc(ADMIN, `public.fco_admin_credit('player_b', 2000, 'bill')`);
let r = await list(ADMIN);
assert.equal(r.total, 5); assert.equal(r.matched, 5);
assert.deepEqual(r.accounts.map(a => a.login), ['moi_dang_ky', 'that.email@gmail.com', 'playerxc', 'player_b', 'quocdan06']);
const fresh = r.accounts[0];
assert.deepEqual([fresh.lastSeen, fresh.hasSave, fresh.fc, fresh.bp, fresh.cards, fresh.locked, fresh.admin], [null, false, 0, 0, 0, false, false]);
const b = r.accounts.find(a => a.login === 'player_b');
assert.deepEqual([b.id, b.bp, b.cards, b.packs, b.fc, b.topupFc, b.online, b.hasSave], [B, 500, 2, 3, 2000, 2000, true, true]);
assert.equal(r.accounts.find(a => a.login === 'quocdan06').admin, true);

// Tìm kiếm: dấu _ là ký tự thường (không phải ký tự đại diện); tổng vẫn đếm mọi tài khoản.
r = await list(ADMIN, `'player_', 'new', 50, 0`);
assert.deepEqual(r.accounts.map(a => a.login), ['player_b']); assert.equal(r.matched, 1); assert.equal(r.total, 5);
r = await list(ADMIN, `' GMAIL ', 'new', 50, 0`);
assert.deepEqual(r.accounts.map(a => a.login), ['that.email@gmail.com']);

// Sắp xếp và phân trang; giá trị sắp xếp lạ thì về mặc định, không lỗi.
r = await list(ADMIN, `null, 'topup', 1, 0`); assert.equal(r.accounts[0].login, 'player_b'); assert.equal(r.accounts.length, 1); assert.equal(r.matched, 5);
r = await list(ADMIN, `null, 'active', 1, 0`); assert.equal(r.accounts[0].login, 'player_b');
r = await list(ADMIN, `null, 'new', 2, 2`); assert.deepEqual(r.accounts.map(a => a.login), ['playerxc', 'player_b']);
r = await list(ADMIN, `null, 'x; drop table', 1, 0`); assert.equal(r.accounts[0].login, 'moi_dang_ky');
r = await list(ADMIN, `null, 'new', 50, 99`); assert.deepEqual(r.accounts, []); assert.equal(r.matched, 5);

// Khoá: mất phiên, JWT còn hạn cũng bị chặn ở ví và bản lưu; dữ liệu giữ nguyên. Mở khoá thì chơi lại được.
await db.query(`insert into auth.sessions(user_id) values ($1), ($2)`, [B, C]);
await rpc(B, 'public.fco_wallet(0)');
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_lock($1, true)', [B]), { locked: true });
assert.equal((await db.query(`select count(*)::int n from auth.sessions where user_id = $1`, [B])).rows[0].n, 0);
assert.equal((await db.query(`select count(*)::int n from auth.sessions where user_id = $1`, [C])).rows[0].n, 1, 'phiên người khác không bị đụng');
await assert.rejects(rpc(B, 'public.fco_wallet(0)'), /FCO_ACCOUNT_LOCKED/);
await assert.rejects(rpc(B, 'public.fco_heartbeat()'), /FCO_ACCOUNT_LOCKED/);
await assert.rejects(rpc(B, 'public.fco_commit_save($1::jsonb, 1)', [JSON.stringify({ ...save, balance: 999 })]), /FCO_ACCOUNT_LOCKED/);
await rpc(C, 'public.fco_wallet(0)');
r = await list(ADMIN, `'player_b', 'new', 50, 0`);
assert.deepEqual([r.accounts[0].locked, r.accounts[0].bp, r.accounts[0].fc], [true, 500, 2000]);
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_lock($1, false)', [B]), { locked: false });
assert.equal((await db.query(`select banned_until from auth.users where id = $1`, [B])).rows[0].banned_until, null);
await rpc(B, 'public.fco_wallet(0)');
await rpc(B, 'public.fco_commit_save($1::jsonb, 1)', [JSON.stringify({ ...save, balance: 999 })]);
// Lệnh khoá hết hạn (đặt tay trong Supabase) thì không còn chặn.
await db.query(`update auth.users set banned_until = now() - interval '1 minute' where id = $1`, [B]);
await rpc(B, 'public.fco_wallet(0)');
await db.query(`update auth.users set banned_until = null where id = $1`, [B]);

// Không khoá / xoá được admin, kể cả chính mình; đích không tồn tại báo rõ; trạng thái khoá phải rõ ràng.
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_lock($1, true)', [ADMIN]), /FCO_ADMIN_PROTECTED/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_delete($1)', [ADMIN]), /FCO_ADMIN_PROTECTED/);
const nobody = '00000000-0000-0000-0000-0000000000ff';
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_lock($1, true)', [nobody]), /FCO_USER_NOT_FOUND/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_delete($1)', [nobody]), /FCO_USER_NOT_FOUND/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_lock($1, null)', [B]), /Invalid lock state/);

// Xoá: chỉ đúng tài khoản đó, dữ liệu liên quan xoá theo.
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_delete($1)', [B]), { deleted: true });
for (const table of ['fco_game_saves', 'fco_wallets', 'fco_fc_ledger', 'fco_presence']) assert.equal((await db.query(`select count(*)::int n from public.${table} where user_id = $1`, [B])).rows[0].n, 0, table);
r = await list(ADMIN);
assert.equal(r.total, 4); assert.ok(!r.accounts.some(a => a.id === B)); assert.ok(r.accounts.some(a => a.id === C));
console.log('fco-admin-accounts OK');