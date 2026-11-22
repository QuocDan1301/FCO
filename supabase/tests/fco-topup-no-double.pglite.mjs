// KM nạp không cộng đôi (202611220012_fco_topup_no_double_bonus.sql): node fco-topup-no-double.pglite.mjs <thư mục dự án>
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
console.log('migration lỗi (bỏ qua):', errs.join(' | ') || 'không');
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('202611220012')), 'Migration 202611220012 chạy được ' + errs.filter(e => e.startsWith('202611220012')).join(' | '));
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const U = '00000000-0000-0000-0000-0000000000c1', V = '00000000-0000-0000-0000-0000000000c2';
await db.query(`insert into auth.users(id, email) values ($1, 'topupplayeru@gmail.com'), ($2, 'topupplayerv@gmail.com')`, [U, V]);
await db.query(`select public.fco_wallet_lock($1)`, [U]); await db.query(`select public.fco_wallet_lock($1)`, [V]);
await db.exec(`delete from public.fco_topup_tiers; insert into public.fco_topup_tiers(min_vnd, bonus_fc) values (100000, 10000), (500000, 60000);
  delete from public.fco_topup_rates; insert into public.fco_topup_rates(vnd_per_1000, effective_from) values (5000, '2020-01-01');
  insert into public.fco_topup_events(title, starts_at, ends_at) values ('Đợt thử', now() - interval '2 days', now() + interval '2 days');`);
const E = (await db.query(`select id from public.fco_topup_events order by id desc limit 1`)).rows[0].id;
const bonus = async uid => Number((await db.query(`select coalesce(sum(delta), 0) s from public.fco_fc_ledger where user_id = $1 and reason = 'topup_bonus'`, [uid])).rows[0].s);
// U: mốc 100.000đ đã nhận KM theo đơn cũ (đợt 0) trong lúc đợt đang chạy; tiền đơn đó (20.000 FC = 100.000đ) tính vào đợt.
await db.query(`insert into public.fco_topup_tier_claims(user_id, event_id, min_vnd, bonus_fc, claimed_at) values ($1, 0, 100000, 10000, now() - interval '1 day')`, [U]);
await db.query(`select public.fco_apply_fc($1, 20000, 'admin', '{}')`, [U]);
ok(await bonus(U) === 0, `mốc đã nhận theo đơn không bị cộng lại (KM ${await bonus(U)})`);
await as(U);
const me = (await db.query(`select public.fco_topup_tiers_me() r`)).rows[0].r;
ok(me.tiers.find(t => t.vnd === 100000)?.claimed === true && me.tiers.find(t => t.vnd === 500000)?.claimed === false, 'thanh trang nạp: 100k đã nhận, 500k chưa');
let claimErr = ''; try { await db.query(`select public.fco_topup_tier_claim(100000)`); } catch (e) { claimErr = e.message; }
ok(claimErr.includes('FCO_MILESTONE_CLAIMED'), 'bấm Nhận lại mốc 100k bị chặn');
// Nạp thêm 80.000 FC (= 400.000đ) → tổng 500.000đ: chỉ cộng mốc 500k, đúng 1 lần.
await db.query(`select public.fco_apply_fc($1, 80000, 'admin', '{}')`, [U]);
ok(await bonus(U) === 60000, `đạt mốc mới vẫn tự cộng đúng 1 lần (KM ${await bonus(U)})`);
await db.query(`select public.fco_apply_fc($1, 1000, 'admin', '{}')`, [U]);
ok(await bonus(U) === 60000, 'nạp tiếp không cộng lặp');
// Mốc đợt 0 nhận TRƯỚC khi đợt bắt đầu thì đợt vẫn được nhận (đợt tính lại từ đầu).
await db.query(`insert into public.fco_topup_tier_claims(user_id, event_id, min_vnd, bonus_fc, claimed_at) values ($1, 0, 100000, 10000, now() - interval '10 days')`, [V]);
await db.query(`select public.fco_apply_fc($1, 20000, 'admin', '{}')`, [V]);
ok(await bonus(V) === 10000, `mốc nhận trước đợt vẫn nhận lại trong đợt mới (KM ${await bonus(V)})`);
// Danh sách cộng đôi: tạo giả một ca bị lỗi cũ (đợt 0 trong đợt + đợt E cùng mốc).
const W = '00000000-0000-0000-0000-0000000000c3';
await db.query(`insert into auth.users(id, email) values ($1, 'topupplayerw@gmail.com')`, [W]); await db.query(`select public.fco_wallet_lock($1)`, [W]);
await db.query(`insert into public.fco_topup_tier_claims(user_id, event_id, min_vnd, bonus_fc, claimed_at) values ($1, 0, 100000, 10000, now() - interval '1 day'), ($1, $2, 100000, 10000, now())`, [W, E]);
const dbl = (await db.query(`select * from public.fco_topup_double_awards()`)).rows;
ok(dbl.length === 1 && dbl[0].user_id === W && Number(dbl[0].bonus_fc) === 10000, `danh sách cộng đôi chỉ có ca lỗi (${dbl.length} dòng)`);
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);