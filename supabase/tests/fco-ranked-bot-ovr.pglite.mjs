// GLXH: OVR đội máy theo đội mình, hơn tối đa 4 — 202611250009_fco_ranked_bot_ovr.sql. Chạy: node fco-ranked-bot-ovr.pglite.mjs <thư mục dự án> (PowerShell, $PWD.Path)
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
ok(!errs.some(e => e.startsWith('202611250009')), 'Migration 202611250009 chạy được ' + errs.filter(e => e.startsWith('202611250009')).join(' | '));
const def = (await db.query(`select pg_get_functiondef('public.fco_ranked_play(jsonb)'::regprocedure) d`)).rows[0].d;
ok(def.includes('opp_ovr := least(180, greatest(60, my_ovr + least(4, greatest(0, (me.points - 1000) / 100)) - floor(random() * 3)::integer));'), 'công thức mới');
ok(!def.includes('115 + (me.points - 1000) / 20') && !def.includes('into bot_avg, bot_n'), 'bỏ công thức + truy vấn cũ');
ok(def.indexOf('my_ovr := round(total / 11.0)') < def.indexOf('my_ovr + least(4'), 'my_ovr tính trước khi dùng');
ok(def.includes("'gx'") && def.includes("'faces'") && def.includes('350'), 'giữ gx / faces / mốc lương');
try { await db.exec(readFileSync(`${dir}/202611250009_fco_ranked_bot_ovr.sql`, 'utf8')); ok(true, 'chạy lại được'); } catch (e) { ok(false, 'chạy lại: ' + e.message); }
// Công thức với mọi mức điểm (cùng biểu thức SQL): hơn tối đa 4, ít nhất kém 2.
const rows = (await db.query(`select p, min(v) lo, max(v) hi from (select p, 130 + least(4, greatest(0, (p - 1000) / 100)) - floor(random() * 3)::integer - 130 v from generate_series(0, 3000, 100) p, generate_series(1, 200)) x group by p order by p`)).rows;
console.log(rows.filter(r => [0, 1000, 1100, 1200, 1300, 1400, 2000, 3000].includes(r.p)).map(r => `${r.p}:${r.lo}..${r.hi}`).join(' '));
ok(rows.every(r => r.hi <= 4 && r.lo >= -2), 'bot hơn tối đa 4, kém tối đa 2');
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
