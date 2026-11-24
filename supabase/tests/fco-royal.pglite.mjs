// Hạng Royal (migration 202611240003_fco_royal.sql) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-royal.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz, encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz);
  create schema extensions; create extension pgcrypto schema extensions;
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const dir = `${root}/supabase/migrations`;
const errs = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 120)); try { await db.exec('rollback'); } catch {} }
}
assert.ok(!errs.some(x => x.startsWith('20261124000')), 'migration mới lỗi: ' + errs.join(' | '));
console.log('migrations áp xong, migration khác lỗi (bỏ qua):', errs.length);
const one = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);

// Hạng Royal (202611240003_fco_royal.sql): tự lên khi tổng FC nạp ≥ 100.000, thuế giảm 85%, hiệu ứng độc quyền.
const U = '00000000-0000-0000-0000-0000000000a1';
await db.query(`insert into auth.users(id, email) values ($1, 'royaltester@gmail.com')`, [U]);
await as(U);
await db.query('select public.fco_wallet_lock($1)', [U]);
const credit = async (delta, reason = 'admin') => db.query(`insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail) values ($1, $2, 0, $3, '{}'::jsonb)`, [U, delta, reason]);
const tier = () => one('select public.fco_account_tier($1)', [U]);
const rules = { marketFee: 40, membership: { svip: 28, premium: 20 } };
const tax = () => one('select public.fco_inv_tax($1, $2::jsonb)', [U, JSON.stringify(rules)]);

assert.equal(await tier(), 'classic');
assert.equal(Number(await tax()), 40);
await credit(60000);
await credit(50000, 'topup_bonus');            // FC khuyến mãi không tính vào mốc
assert.equal(await tier(), 'classic', 'mới nạp 60.000 FC (KM không tính) thì chưa Royal');
await credit(40000);                           // tổng nạp 100.000
assert.equal(await tier(), 'royal', 'nạp đủ 100.000 FC → Royal');
assert.ok(Math.abs(Number(await tax()) - 6) < 1e-9, 'Royal: thuế 40% → 6%');
// Admin đặt Luxury vẫn là Royal (Royal đứng trên).
await db.query(`update public.fco_wallets set account_tier = 'luxury', account_tier_until = now() + interval '30 days' where user_id = $1`, [U]);
assert.equal(await tier(), 'royal');

// Hiệu ứng Royal: đặt được, hiện ra; Luxury thì bị chặn.
await db.query(`select public.fco_set_name_effect('emperor')`);
assert.equal(await one('select public.fco_name_effect($1)', [U]), 'emperor');

// Mọi hàm bán có luật "không cộng dồn phiếu" đã nhận Royal.
const left = await one(`select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%fco_account_tier(uid) in (''premium'', ''luxury'')%' and p.prosrc not like '%''royal''%' and p.proname <> 'fco_admin_account_tier'`);
assert.equal(left, 0, 'còn hàm bán chưa nhận Royal');
const withRoyal = await one(`select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%fco_account_tier(uid) in (''premium'', ''luxury'', ''royal'')%'`);
assert.ok(withRoyal >= 1, 'có hàm bán đã nhận Royal');

// Thu hồi nạp (dòng 'admin' âm) xuống dưới mốc → mất Royal; hiệu ứng Royal không còn hiện (về Luxury đang còn hạn).
await credit(-30000);
assert.equal(await tier(), 'luxury');
assert.equal(await one('select public.fco_name_effect($1)', [U]), null, 'Luxury không hiện hiệu ứng Royal');
await assert.rejects(db.query(`select public.fco_set_name_effect('nebula')`), /FCO_ROYAL_ONLY/);
console.log('royal OK');