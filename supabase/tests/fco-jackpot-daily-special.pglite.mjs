// Chạy thử luật "Giải Đặc Biệt tối đa 1 lần mỗi ngày" (migration 202611240001) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-jackpot-daily-special.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
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
assert.ok(!errs.some(x => x.startsWith('2026112400')), 'migration jackpot lỗi: ' + errs.join(' | '));
console.log('migrations áp xong, migration khác lỗi (bỏ qua):', errs.length);
const one = async sql => Object.values((await db.query(sql)).rows[0])[0];

// Chạy tick nhiều lần (mỗi lần coi như 5 phút trôi qua) và gom các tin trúng mới (so với các tin đã thấy).
async function run(steps) {
  const log = []; const seen = new Set((await one('select feed from public.fco_jackpot')).map(e => JSON.stringify(e)));
  for (let i = 0; i < steps; i++) {
    await db.exec(`update public.fco_jackpot set at = now() - interval '5 minutes'`);
    const feed = await one('select (public.fco_jackpot_tick()).feed');
    for (const e of [...feed].reverse()) { const k = JSON.stringify(e); if (!seen.has(k)) { seen.add(k); log.push(e); } }
  }
  return log;
}
// 1. (202611240014) Bot trúng Giải Đặc Biệt NHIỀU LẦN mỗi ngày, kể cả khi hôm nay đã có người trúng; 300 bot săn quỹ.
await db.exec(`update public.fco_jackpot set pot = 5000, feed = '[]', at = now() - interval '1 hour', speed = 0, special_day = public.fco_today()`);
const log = await run(36);
const specials = log.filter(e => e.kind === 'special');
assert.ok(specials.length >= 3, `bot phải trúng Giải Đặc Biệt nhiều lần trong 3 giờ, thực tế ${specials.length}`);
assert.ok(log.filter(e => e.kind === 'mini').length > 0, 'Giải Phụ vẫn nổ');
assert.ok(specials.every(e => e.amount >= 13000 && e.amount <= 23300), 'Giải Đặc Biệt trong khoảng 13.000–23.000: ' + specials.map(e => e.amount).join(', '));
assert.match(await one(`select pg_get_functiondef('public.fco_jackpot_tick()'::regprocedure)`), /hunters constant integer := 300;/);

// 4. Người chơi (Cờ tỷ phú, migration 202611240002): Giải Đặc Biệt tối đa 1 lần / ngày theo giờ Việt Nam.
const ctp = async (jpAt) => {
  const o = await one(`select public.fco_ctp_sim(4000, 1, 1, 30000, ${jpAt}, null, null, null, '{}'::text[])`);
  return JSON.stringify(o.plays).split('"jackpot":"special"').length - 1 + JSON.stringify(o.plays).split('"jackpot": "special"').length - 1;
};
// Mỗi cách chạy 4.000 lượt, lặp tối đa 15 lần cho tới khi có ít nhất 1 lần trúng (tỉ lệ trúng thấp nên có thể 0); mỗi lần chạy không bao giờ quá 1.
const best = async jpAt => { let max = 0; for (let i = 0; i < 15 && max === 0; i++) { const n = await ctp(jpAt); assert.ok(n <= 1, `một ngày chỉ trúng tối đa 1 lần, thực tế ${n}`); max = Math.max(max, n); } return max; };
assert.equal(await best('null'), 1, 'chưa trúng hôm nay: phải trúng được 1 lần');
assert.equal(await best(`now() - interval '1 day'`), 1, 'hôm qua trúng, hôm nay được trúng lại');
for (let i = 0; i < 5; i++) assert.equal(await ctp('now()'), 0, 'đã trúng hôm nay thì không trúng Giải Đặc Biệt nữa');console.log('jackpot daily special OK');
