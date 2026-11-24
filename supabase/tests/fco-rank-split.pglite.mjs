// BXH chia 2 đợt mỗi tuần (migration 202611240004_fco_rank_split_rounds.sql) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-rank-split.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
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
const iso = async sql => new Date(await one(sql)).toISOString();
const vn = s => new Date(s).toISOString();

// Mốc kết thúc: 23:59 Thứ 4 và 23:59 Chủ nhật (giờ VN) xen kẽ → vòng 3 ngày (T2–T4) rồi 4 ngày (T5–CN).
assert.equal(await iso(`select public.fco_rank_next_end(timestamptz '2026-11-23 10:00+07')`), vn('2026-11-25T23:59:00+07:00'), 'Thứ 2 → hết 23:59 Thứ 4');
assert.equal(await iso(`select public.fco_rank_next_end(timestamptz '2026-11-25 23:59+07')`), vn('2026-11-29T23:59:00+07:00'), 'hết T4 → vòng sau hết 23:59 CN (4 ngày)');
assert.equal(await iso(`select public.fco_rank_next_end(timestamptz '2026-11-29 23:59+07')`), vn('2026-12-02T23:59:00+07:00'), 'hết CN → vòng sau hết 23:59 T4 (3 ngày)');
assert.equal(await iso(`select public.fco_rank_next_end(timestamptz '2026-11-26 00:30+07')`), vn('2026-11-29T23:59:00+07:00'), 'Thứ 5 → hết CN');
assert.equal(await iso(`select public.fco_rank_round_start(timestamptz '2026-11-25 23:59+07')`), vn('2026-11-22T23:59:00+07:00'));
assert.equal(await iso(`select public.fco_rank_round_start(timestamptz '2026-11-29 23:59+07')`), vn('2026-11-25T23:59:00+07:00'));

// Bước rút vòng trong migration: vòng đang đặt hết xa (vd. CN tuần sau) → rút về mốc T4 / CN gần nhất sau bây giờ; vòng đã gần thì giữ nguyên.
await db.exec(`update public.fco_rank_round set ends_at = public.fco_rank_next_end(now()) + interval '7 days' where id = 1`);
const shrink = readFileSync(`${dir}/202611240004_fco_rank_split_rounds.sql`, 'utf8').match(/update public\.fco_rank_round set ends_at = public\.fco_rank_next_end\(now\(\)\)[^;]*;/)[0];
await db.exec(shrink);
// Sau migration: vòng hiện tại hết ở mốc T4 / CN gần nhất sau bây giờ.
assert.equal(await iso('select ends_at from public.fco_rank_round where id = 1'), await iso('select public.fco_rank_next_end(now())'));
const dow = await one(`select extract(isodow from (ends_at at time zone 'Asia/Ho_Chi_Minh'))::integer from public.fco_rank_round where id = 1`);
assert.ok(dow === 3 || dow === 7);

// Vòng đã quá giờ từ lâu: tick chốt từng vòng, mốc mới vẫn là mốc T4 / CN gần nhất sau bây giờ, số vòng tăng đúng số đợt đã qua.
await db.exec(`update public.fco_rank_round set round = 10, ends_at = timestamptz '2026-11-04 23:59+07' where id = 1`);
await db.exec('select public.fco_rank_round_tick()');
assert.equal(await iso('select ends_at from public.fco_rank_round where id = 1'), await iso('select public.fco_rank_next_end(now())'));
const passed = await one(`select count(*)::integer from generate_series(date '2026-11-04', (now() at time zone 'Asia/Ho_Chi_Minh')::date, interval '1 day') g(d)
  where extract(isodow from g.d) in (3, 7) and ((g.d::date)::timestamp + time '23:59') at time zone 'Asia/Ho_Chi_Minh' <= now()`);
assert.equal(await one('select round from public.fco_rank_round where id = 1'), 10 + passed, 'mỗi đợt đã qua chốt đúng 1 lần');
// Đầu vòng Đập 8 = mốc kết thúc vòng trước.
assert.equal(await iso('select public.fco_plus8_since()'), await iso('select public.fco_rank_round_start(ends_at) from public.fco_rank_round where id = 1'));
console.log('rank split OK');