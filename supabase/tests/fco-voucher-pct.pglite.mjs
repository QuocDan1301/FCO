// Phiếu giảm thuế giảm theo % của thuế (migration 202611240011_fco_voucher_percent_of_tax.sql) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-voucher-pct.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
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
assert.ok(!errs.some(x => x.startsWith('2026112400')), 'migration mới lỗi: ' + errs.join(' | '));
console.log('migrations áp xong, migration khác lỗi (bỏ qua):', errs.length);
const one = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];

const def = await one(`select pg_get_functiondef('public.fco_mkt_sell(text, jsonb, integer)'::regprocedure)`);
assert.match(def, /tax := tax \* \(100 - p_voucher\) \/ 100;/, 'tài khoản thường: thuế × (100 − phiếu)%');
assert.match(def, /\(rules->>'marketFee'\)::double precision \* \(100 - p_voucher\) \/ 100/, 'hạng tài khoản: so với thuế gốc × (100 − phiếu)%');
assert.ok(!/precision - p_voucher|tax - p_voucher/.test(def), 'không còn trừ thẳng điểm %');
assert.match(def, /phiếu giảm ' \|\| p_voucher \|\| '% thuế/);
assert.match(def, /not public\.fco_is_sub\(uid\)/, 'giữ bản vá acc phụ bán (202611240007)');
assert.match(def, /'royal'/, 'giữ Royal (202611240003)');
// Chạy lại được.
await db.exec(readFileSync(`${dir}/202611240011_fco_voucher_percent_of_tax.sql`, 'utf8'));
assert.equal(await one(`select pg_get_functiondef('public.fco_mkt_sell(text, jsonb, integer)'::regprocedure)`), def);
console.log('voucher pct OK');