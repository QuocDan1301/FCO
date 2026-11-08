// Chạy thử tạm dừng tài khoản trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-account-pause.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
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
const id = n => `00000000-0000-0000-0000-0000000000${n}`;
const ADMIN = id('0a'), B = id('0b'), C = id('0c'), D = id('0d'), E = id('0e');
await db.query(`insert into auth.users(id, email, created_at) values ($1, 'quocdan06@players.fco.invalid', now() - interval '9 days'), ($2, 'player_b@players.fco.invalid', now() - interval '3 days'), ($3, 'playerxc@players.fco.invalid', now() - interval '2 days'), ($4, 'player_d@players.fco.invalid', now() - interval '1 day'), ($5, 'khac@players.fco.invalid', now())`, [ADMIN, B, C, D, E]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql, params) => Object.values(await as(uid, `select ${sql} as r`, params))[0];
const pause = (uid, on, users) => rpc(uid, 'public.fco_admin_accounts_pause($1, $2::uuid[])', [on, users]);
const pauseAll = (uid, on, search = null, status = null) => rpc(uid, 'public.fco_admin_accounts_pause($1, null, true, $2, $3)', [on, search, status]);
const paused = async () => (await db.query(`select u.email from public.fco_account_pauses p join auth.users u on u.id = p.user_id order by 1`)).rows.map(r => r.email.split('@')[0]);
const save = JSON.stringify({ version: 1, balance: 1, cards: [] });

// Quyền: chỉ admin; khách không gọi được; không đọc / ghi bảng trực tiếp.
await assert.rejects(pause(B, true, [C]), /FCO_ADMIN_ONLY/);
await assert.rejects(pause(null, true, [C]), /permission denied/);
await assert.rejects(as(B, 'select * from public.fco_account_pauses'), /permission denied/);
await assert.rejects(as(B, `delete from public.fco_account_pauses`), /permission denied/);
// Danh sách rỗng không được hiểu là "tất cả"; tham số phải rõ ràng.
await assert.rejects(pause(ADMIN, true, []), /FCO_NO_ACCOUNTS/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_accounts_pause(true)'), /FCO_NO_ACCOUNTS/);
await assert.rejects(rpc(ADMIN, `public.fco_admin_accounts_pause(null, '{}'::uuid[], true)`), /Invalid pause request/);
assert.deepEqual(await paused(), []);

await rpc(B, 'public.fco_commit_save($1::jsonb, 0)', [save]);
await rpc(B, 'public.fco_wallet(0)');
await rpc(ADMIN, `public.fco_admin_credit('player_b', 700, 'x')`);

// Tạm dừng theo danh sách: bỏ qua admin và id lạ; lặp lại không tính; người khác không đổi.
assert.deepEqual(await pause(ADMIN, true, [B, C, ADMIN, id('ff')]), { changed: 2, skippedAdmins: 1 });
assert.deepEqual(await paused(), ['player_b', 'playerxc']);
assert.deepEqual(await pause(ADMIN, true, [B]), { changed: 0, skippedAdmins: 0 });

// Người bị tạm dừng: mọi thao tác bị chặn, vẫn đồng bộ được, biết trạng thái của mình; người khác và admin vẫn chơi.
for (const call of [`public.fco_wallet(0)`, `public.fco_heartbeat()`, `public.fco_claim_daily()`, `public.fco_spend_fc(1, 'shop', '{}'::jsonb)`, `public.fco_bilac_play(1, 'free')`, `public.fco_my_fc_stats()`]) await assert.rejects(rpc(B, call), /FCO_ACCOUNT_PAUSED/, call);
assert.equal(Number((await rpc(B, 'public.fco_commit_save($1::jsonb, 1)', [save])).revision), 2);
assert.equal((await rpc(B, 'public.fco_maintenance_state()')).paused, true);
assert.equal((await rpc(D, 'public.fco_maintenance_state()')).paused, false);
assert.equal((await rpc(null, 'public.fco_maintenance_state()')).paused, false);
await rpc(D, 'public.fco_wallet(0)');
await rpc(ADMIN, 'public.fco_wallet(0)');
// Admin vẫn cộng FC / reset được cho người đang tạm dừng; reset không tự bỏ tạm dừng.
await rpc(ADMIN, 'public.fco_admin_account_reset($1)', [B]);
assert.deepEqual(await paused(), ['player_b', 'playerxc']);

// Danh sách cho admin: có cờ paused, lọc được người đang tạm dừng.
let r = await rpc(ADMIN, `public.fco_admin_accounts()`);
assert.equal(r.total, 5); assert.equal(r.matched, 5);
assert.deepEqual(r.accounts.filter(a => a.paused).map(a => a.login).sort(), ['player_b', 'playerxc']);
r = await rpc(ADMIN, `public.fco_admin_accounts(null, 'new', 50, 0, 'paused')`);
assert.equal(r.total, 5); assert.equal(r.matched, 2); assert.deepEqual(r.accounts.map(a => a.login), ['playerxc', 'player_b']);
assert.equal((await rpc(ADMIN, `public.fco_admin_accounts('player_', 'new', 50, 0, 'paused')`)).matched, 1, 'dấu _ là ký tự thường');

// Bỏ tạm dừng theo danh sách; tài khoản bị khoá vẫn báo khoá, không phải tạm dừng.
assert.deepEqual(await pause(ADMIN, false, [C]), { changed: 1, skippedAdmins: 0 });
assert.deepEqual(await paused(), ['player_b']);
await db.query(`update auth.users set banned_until = now() + interval '1 day' where id = $1`, [B]);
await assert.rejects(rpc(B, 'public.fco_wallet(0)'), /FCO_ACCOUNT_LOCKED/);
await db.query(`update auth.users set banned_until = null where id = $1`, [B]);

// Tất cả theo tìm kiếm: chỉ đúng phần khớp, dấu _ không phải ký tự đại diện.
assert.deepEqual(await pauseAll(ADMIN, false), { changed: 1, skippedAdmins: 0 });
assert.deepEqual(await pauseAll(ADMIN, true, 'player_'), { changed: 2, skippedAdmins: 0 });
assert.deepEqual(await paused(), ['player_b', 'player_d']);
// Đang lọc "đang tạm dừng" mà bấm tạm dừng tất cả: không lan sang người khác.
assert.deepEqual(await pauseAll(ADMIN, true, null, 'paused'), { changed: 0, skippedAdmins: 0 });
assert.deepEqual(await paused(), ['player_b', 'player_d']);
// Tất cả: mọi người trừ admin; bỏ tất cả thì chơi lại.
assert.deepEqual(await pauseAll(ADMIN, true), { changed: 2, skippedAdmins: 1 });
assert.deepEqual(await paused(), ['khac', 'player_b', 'player_d', 'playerxc']);
await rpc(ADMIN, 'public.fco_wallet(0)');
assert.deepEqual(await pauseAll(ADMIN, false, null, 'paused'), { changed: 4, skippedAdmins: 0 });
assert.deepEqual(await paused(), []);
await rpc(B, 'public.fco_wallet(0)');

// Xoá tài khoản thì bản ghi tạm dừng xoá theo.
await pause(ADMIN, true, [E]);
await rpc(ADMIN, 'public.fco_admin_account_delete($1)', [E]);
assert.deepEqual(await paused(), []);
console.log('fco-account-pause OK');