// Chạy thử 202611090014 (lọc hoạt động) và 202611090015 (reset tiền nạp) trên PGlite: node accounts-filter-reset.mjs <thư mục dự án>
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
const dir = `${root}/supabase/migrations`;
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const reset = '202611090015_fco_topup_reset.sql';
for (const f of files.slice(0, 2)) await db.exec(readFileSync(`${dir}/${f}`, 'utf8'));
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid'), ($3, 'player_c@players.fco.invalid'), ($4, 'player_d@players.fco.invalid')`, [A, B, C, D]);
for (const f of files.slice(2).filter(f => f !== reset)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(`insert into public.fco_admins(user_id) values ('${A}') on conflict do nothing`);
console.log('migrations OK');

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
const logins = list => list.accounts.map(a => a.login).sort();

// Online: A (admin) và B; C vào game 1 giờ trước; D chưa từng vào.
await db.exec(`insert into public.fco_presence(user_id, last_seen) values ('${A}', now()), ('${B}', now() - interval '30 seconds'), ('${C}', now() - interval '1 hour')`);
let r = await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, null)`);
assert.equal(r.total, 4); assert.equal(r.online, 2);
assert.deepEqual(logins(await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, 'active')`)), ['player_b', 'quocdan06']);
assert.deepEqual(logins(await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, 'inactive')`)), ['player_c', 'player_d']);
r = await as(A, `select public.fco_admin_accounts('player', 'new', 50, 0, 'inactive')`);
assert.equal(r.matched, 2);
// Tạm dừng hàng loạt "tất cả khớp bộ lọc Không hoạt động": chỉ C, D.
r = await as(A, `select public.fco_admin_accounts_pause(true, null, true, null, 'inactive')`);
assert.equal(r.changed, 2);
assert.deepEqual(logins(await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, 'paused')`)), ['player_c', 'player_d']);
await as(A, `select public.fco_admin_accounts_pause(false, null, true, null, 'paused')`);
assert.deepEqual(logins(await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, 'paused')`)), []);
await assert.rejects(as(B, `select public.fco_account_status_match('${B}', 'active')`), /permission denied/);
console.log('filter OK');

// Reset tiền nạp: nạp 1.000 + 5.000, tặng 500; sau reset Đã nạp = 0, ví giữ nguyên, nạp mới tính lại.
await as(B, 'select public.fco_wallet()'); await as(C, 'select public.fco_wallet()');
await as(A, `select public.fco_admin_credit('player_b', 1000, 'bill 1')`);
await as(A, `select public.fco_admin_credit('player_c', 5000, 'bill 2')`);
await as(A, `select public.fco_admin_credit('player_b', 500, 'quà', true)`);
const topup = async login => (await as(A, `select public.fco_admin_accounts(null, 'new', 50, 0, null)`)).accounts.find(a => a.login === login).topupFc;
assert.equal(await topup('player_b'), 1000); assert.equal(await topup('player_c'), 5000);
await db.exec(readFileSync(`${dir}/${reset}`, 'utf8'));
assert.equal(await topup('player_b'), 0); assert.equal(await topup('player_c'), 0);
const fc = async uid => (await db.query(`select fc from public.fco_wallets where user_id = '${uid}'`)).rows[0].fc;
assert.equal(await fc(B), 1500); assert.equal(await fc(C), 5000);
const old = (await db.query(`select count(*)::int n from public.fco_fc_ledger where reason = 'admin_old' and detail ? 'topup_reset'`)).rows[0].n;
assert.equal(old, 2);
assert.equal((await db.query(`select count(*)::int n from public.fco_fc_ledger where reason = 'admin_gift'`)).rows[0].n, 1, 'quà tặng giữ nguyên');
await as(A, `select public.fco_admin_credit('player_b', 2000, 'bill 3')`);
assert.equal(await topup('player_b'), 2000, 'nạp sau reset tính lại từ 0');
const stats = await as(A, 'select public.fco_admin_stats()').catch(() => null);
if (stats?.summary) assert.equal(stats.summary.topupFcAll, 2000);
console.log('reset OK');
console.log('ALL OK');
