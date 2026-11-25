// Ô CSA vàng +5 mùa EL — 202611250007_fco_gold_el_5.sql
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
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
  // Bỏ bước chặn 'chưa đồng bộ gói ctp-*' (máy thử không có dữ liệu kho thẻ).
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 160)); try { await db.exec('rollback'); } catch {} }
}
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('202611250004')), 'Migration 202611250004 chạy được ' + errs.filter(e => e.startsWith('202611250004')).join(' | '));
console.log(errs.map(e => e.slice(0, 200)).join(' || '));
ok(!errs.some(e => e.startsWith('20261125000')), 'Migration 20261125 chạy được ' + errs.filter(e => e.startsWith('20261125')).join(' | '));
const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='fco_cat_players'`)).rows.map(r => r.column_name);
console.log('cols', cols.join(','));
const base = { id: 1, season: 'EL', pos: 'ST' };
const ctype = Object.fromEntries((await db.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='fco_cat_players'`)).rows.map(r => [r.column_name, r.data_type]));
const dflt = { 'jsonb': '[]', 'json': '[]', 'text': 'x', 'integer': 1, 'bigint': 1, 'numeric': 1, 'boolean': false, 'ARRAY': '{}', 'smallint': 1, 'double precision': 1 };
const ins = async (id, season, pos) => { const r = Object.fromEntries(cols.map(c => [c, dflt[ctype[c]] ?? null])); Object.assign(r, { id, season, pos, name: 'P' + id }); const ks = cols.filter(c => r[c] !== null); await db.query(`insert into public.fco_cat_players(${ks.join(',')}) values (${ks.map((_, i) => '$' + (i + 1)).join(',')})`, ks.map(k => r[k])); };
try { await ins(91, 'EL', 'ST'); await ins(92, 'ICON TM', 'ST'); await ins(93, 'NARUTO', 'GK'); } catch (e) { console.log('insert err', e.message); }
const gc = async (pid, lv, gold) => (await db.query(`select public.fco_gold_card($1::jsonb) c`, [JSON.stringify({ uid: 'x', playerId: pid, level: lv, gold })])).rows[0].c.gold ?? null;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(eq(await gc(91, 11, { 5: '50', 7: '51', 11: '52' }), { 11: '52', 7: '51', 5: '50' }) || eq(Object.keys(await gc(91, 11, { 5: '50', 7: '51', 11: '52' })).sort(), ['11', '5', '7']), 'EL +11 giữ cả 3 ô');
ok(eq(await gc(91, 6, { 5: '50', 7: '51', 11: '52' }), { 5: '50' }), 'EL +6 chỉ còn ô 5');
ok(await gc(91, 4, { 5: '50' }) === null, 'EL +4 mất ô 5');
ok(eq(await gc(92, 13, { 5: '50', 7: '51' }), { 7: '51' }), 'ICON TM không có ô 5');
ok(eq(await gc(91, 11, { 5: '50', 11: '50' }), { 11: '50' }), 'trùng CSA: giữ ô cao hơn');
ok(eq(await gc(93, 7, { 7: '57' }), { 7: '57' }), 'NARUTO GK vẫn có ô 7');
const one = async (sql, p) => Object.values((await db.query(sql, p)).rows[0])[0];
const def = await one(`select pg_get_functiondef('public.fco_inv_gold(text, text, text)'::regprocedure)`);
ok(def.includes(`p_slot not in ('5', '7', '11')`), 'fco_inv_gold nhận ô 5');
// chạy lại được
const again = readFileSync(`${dir}/202611250007_fco_gold_el_5.sql`, 'utf8');
try { await db.exec(again); ok(true, 'chạy lại được'); } catch (e) { ok(false, 'chạy lại: ' + e.message); }
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
