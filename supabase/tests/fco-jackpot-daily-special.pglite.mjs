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
assert.ok(!errs.some(x => x.startsWith('20261124000')), 'migration jackpot lỗi: ' + errs.join(' | '));
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
// 1. Hôm nay: quỹ rất lớn (bot chắc chắn nổ) nhưng Giải Đặc Biệt chỉ nổ đúng 1 lần dù chạy 300 nhịp.
await db.exec(`update public.fco_jackpot set pot = 30000, feed = '[]', at = now() - interval '1 hour', speed = 0, special_day = null`);
const today = await one('select public.fco_today()::text');
let log = await run(300);
const specials = log.filter(e => e.kind === 'special');
assert.equal(specials.length, 1, `Giải Đặc Biệt phải đúng 1 lần/ngày, thực tế ${specials.length}`);
assert.equal(await one('select special_day::text from public.fco_jackpot'), today);
assert.ok(log.filter(e => e.kind === 'mini').length > 0, 'Giải Phụ vẫn nổ bình thường');
// Quỹ vẫn tích lũy sau khi đã trúng trong ngày (không bị reset về 2.000 nhiều lần).
assert.ok(Number(await one('select pot from public.fco_jackpot')) > 2000);

// 2. Người chơi trúng Giải Đặc Biệt hôm nay (tin ghi trong bảng tin) thì bot cũng không nổ thêm.
await db.exec(`update public.fco_jackpot set pot = 30000, special_day = null, at = now() - interval '1 hour',
  feed = jsonb_build_array(jsonb_build_object('name','Người chơi','amount',5000,'kind','special','time',(extract(epoch from now()) * 1000)::bigint))`);
log = await run(60);
assert.equal(log.filter(e => e.kind === 'special').length, 0, 'người chơi đã trúng hôm nay thì bot không nổ Giải Đặc Biệt');

// 3. Sang ngày mới (special_day cũ, bảng tin không còn tin hôm nay) thì bot lại được nổ Giải Đặc Biệt đúng 1 lần.
await db.exec(`update public.fco_jackpot set pot = 30000, special_day = (public.fco_today() - 1), at = now() - interval '1 hour',
  feed = jsonb_build_array(jsonb_build_object('name','Cũ','amount',1,'kind','special','time',0))`);
log = await run(300);
assert.equal(log.filter(e => e.kind === 'special').length, 1, 'ngày mới: đúng 1 Giải Đặc Biệt');
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
