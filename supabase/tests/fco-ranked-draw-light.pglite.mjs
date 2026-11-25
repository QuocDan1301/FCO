// GLXH: hoà ± nhẹ — 202611250011_fco_ranked_draw_light.sql. Chạy: node fco-ranked-draw-light.pglite.mjs <thư mục dự án> (PowerShell, $PWD.Path)
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
ok(!errs.some(e => /^20261125001[01]/.test(e)), 'Migration 0010 + 0011 chạy được ' + errs.filter(e => /^20261125001[01]/.test(e)).join(' | '));
const U = '00000000-0000-0000-0000-0000000000f1';
await db.query(`insert into auth.users(id, email) values ($1, 'drawcheckuser@gmail.com')`, [U]);
await db.query(`insert into public.fco_ranked(user_id, points) values ($1, 1200)`, [U]);
const settle = async (f, a, opp) => (await db.query(`select public.fco_ranked_settle($1, $2, $3, 'X', $4, null, null, null) r`, [U, f, a, opp])).rows[0].r;
const reset = () => db.query(`update public.fco_ranked set points = 1200 where user_id = $1`, [U]);
const def = async () => (await db.query(`select pg_get_functiondef('public.fco_ranked_settle(uuid, integer, integer, text, integer, jsonb, integer, text)'::regprocedure) d`)).rows[0].d;
const expect = d => Math.max(-5, Math.min(5, Math.round(16 * (.5 - 1 / (1 + 10 ** (d / 400))))));
async function check(tag) {
  for (const [opp, want] of [[1200, 0], [1300, 2], [1400, 4], [1600, 5], [1100, -2], [1000, -4], [800, -5]]) {
    await reset(); const r = await settle(1, 1, opp);
    ok(r.delta === want && r.delta === expect(opp - 1200), `${tag}: hoà đối thủ ${opp} → ${r.delta} (muốn ${want})`);
  }
  await reset(); ok((await settle(2, 0, 1600)).delta >= 5, `${tag}: thắng vẫn ≥ +5`);
  await reset(); ok((await settle(0, 1, 800)).delta <= -5, `${tag}: thua vẫn ≤ −5`);
}
await check('0010 → 0011');
// 0010 chạy lại sau 0011: không đổi gì.
const before = await def();
await db.exec(readFileSync(`${dir}/202611250010_fco_ranked_draw_zero.sql`, 'utf8'));
ok((await def()) === before, '0010 chạy lại sau 0011 không đổi hàm');
await db.exec(readFileSync(`${dir}/202611250011_fco_ranked_draw_light.sql`, 'utf8'));
ok((await def()) === before, '0011 chạy lại được');
// Bỏ qua 0010: đưa hàm về dòng gốc rồi chạy 0011.
const orig = 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); end if;';
await db.exec(before.replace(/if result = 1 then delta[^\n]*202611250011: hoà ± nhẹ/, orig));
ok((await def()).includes(orig) && !(await def()).includes('202611250011'), 'đã đưa về luật gốc');
await db.exec(readFileSync(`${dir}/202611250011_fco_ranked_draw_light.sql`, 'utf8'));
await check('gốc → 0011');
const n = (await db.query(`select draws from public.fco_ranked where user_id = $1`, [U])).rows[0].draws;
ok(n === 14, `đếm đủ trận hoà (${n})`);
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
