// Chạy thử 202611090010_fco_admin_fc_gift.sql trên PGlite: node admin-fc-gift.mjs <thư mục dự án>
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
for (const f of files.slice(0, 2)) await db.exec(readFileSync(`${dir}/${f}`, 'utf8'));
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid')`, [A, B]);
for (const f of files.slice(2)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(`insert into public.fco_admins(user_id) values ('${A}') on conflict do nothing`);
console.log(`migrations OK (${files.length})`);

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
const fails = async (p, re) => assert.rejects(p, e => re.test(e.message), `expected ${re}`);
const topup = async () => (await as(A, `select public.fco_admin_accounts()`)).accounts.find(a => a.login === 'player_b').topupFc;

await as(B, 'select public.fco_wallet()');
// Nạp (cách cũ, không truyền p_gift) vẫn tính vào Đã nạp.
let r = await as(A, `select public.fco_admin_credit('player_b', 1000, 'bill')`);
assert.equal(r.fc, 1000);
assert.equal(await topup(), 1000);
// Tặng FC: không tính vào Đã nạp, người chơi có quà chờ báo.
r = await as(A, `select public.fco_admin_credit('player_b', 500, 'tặng tân thủ', true)`);
assert.equal(r.fc, 1500);
assert.equal(await topup(), 1000);
const pending = await as(B, 'select public.fco_my_admin_gifts()');
assert.deepEqual(pending.map(g => g.rewards), [[{ fc: 500 }]]);
await fails(as(A, `select public.fco_admin_credit('player_b', -5, '', true)`), /FCO_BAD_AMOUNT/);
// Đổi lần nạp 1.000 FC cũ thành quà tặng rồi đổi lại.
let ledger = await as(A, `select public.fco_admin_ledger(10, 'player_b')`);
const credit = ledger.find(l => l.reason === 'admin');
assert.ok(credit.id > 0);
r = await as(A, `select public.fco_admin_ledger_mark_gift(${credit.id}, true)`);
assert.equal(r.reason, 'admin_gift');
assert.equal(await topup(), 0, 'không còn tính vào Đã nạp');
const stats = await as(A, 'select public.fco_admin_stats()').catch(() => null);
if (stats) assert.equal(stats.summary?.topupFcAll ?? 0, 0);
assert.equal((await db.query(`select fc from public.fco_wallets where user_id = '${B}'`)).rows[0].fc, 1500, 'số dư không đổi');
await as(A, `select public.fco_admin_ledger_mark_gift(${credit.id}, false)`);
assert.equal(await topup(), 1000);
// Không đổi được dòng không phải admin cộng FC, người chơi thường không gọi được.
await as(B, 'select public.fco_claim_daily()');
ledger = await as(A, `select public.fco_admin_ledger(10, 'player_b')`);
const daily = ledger.find(l => l.reason === 'daily');
await fails(as(A, `select public.fco_admin_ledger_mark_gift(${daily.id}, true)`), /FCO_LEDGER_NOT_ADMIN_CREDIT/);
await fails(as(B, `select public.fco_admin_ledger_mark_gift(${credit.id}, true)`), /FCO_NOT_ADMIN|admin/i);
await fails(as(A, `select public.fco_admin_ledger_mark_gift(999999, true)`), /FCO_LEDGER_NOT_FOUND/);
console.log('ALL OK');
