// Thu hồi KM nạp cộng trùng (202611220013_fco_topup_revoke_duplicates.sql): node fco-topup-revoke.pglite.mjs <thư mục dự án>
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
ok(!errs.some(e => e.startsWith('20261122001')), 'Migration 202611220012 / 0013 chạy được ' + errs.filter(e => e.startsWith('20261122001')).join(' | '));
const U = '00000000-0000-0000-0000-0000000000d1', U2 = '00000000-0000-0000-0000-0000000000d2', V = '00000000-0000-0000-0000-0000000000d3';
await db.query(`insert into auth.users(id, email) values ($1, 'revokeplayeru@gmail.com'), ($2, 'revokeplayeru2@gmail.com'), ($3, 'revokeplayerv@gmail.com')`, [U, U2, V]);
for (const u of [U, U2, V]) await db.query(`select public.fco_wallet_lock($1)`, [u]);
await db.exec(`delete from public.fco_topup_tiers; insert into public.fco_topup_tiers(min_vnd, bonus_fc) values (100000, 10000), (500000, 60000);
  insert into public.fco_topup_events(title, starts_at, ends_at) values ('Đợt thử', now() - interval '5 days', now() + interval '2 days');`);
const E = (await db.query(`select id from public.fco_topup_events order by id desc limit 1`)).rows[0].id;
const credit = (u, fc, detail) => db.query(`select public.fco_apply_fc($1, $2, 'topup_bonus', $3::jsonb)`, [u, fc, JSON.stringify(detail)]);
// U: KM theo đơn (không ghi đợt) trong lúc đợt chạy + đợt cộng lại cùng mốc (TRÙNG) + mốc 500k hợp lệ.
await credit(U, 10000, { note: 'Khuyến mãi mốc 100000đ · đơn FCOAAA', order: 'FCOAAA' });
await credit(U, 10000, { note: 'Đợt thử · mốc 100.000đ · tự cộng', event: E });
await credit(U, 60000, { note: 'Đợt thử · mốc 500.000đ · tự cộng', event: E });
// U2: bị cộng trùng nhưng đã tiêu, còn 3.000 FC.
await credit(U2, 10000, { note: 'Đợt thử · mốc 100.000đ · tự cộng', event: E });
await credit(U2, 10000, { note: 'Đợt thử · mốc 100.000đ · tự cộng', event: E });
await db.query(`select public.fco_apply_fc($1, -17000, 'shop', '{}')`, [U2]);
// V: mốc 100k nhận TRƯỚC khi có đợt (10 ngày trước) + nhận lại trong đợt → hợp lệ (đợt tính lại từ đầu).
await db.query(`insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, created_at) values ($1, 10000, 10000, 'topup_bonus', '{"note":"Khuyến mãi mốc nạp 100.000đ"}', now() - interval '10 days')`, [V]);
await db.query(`update public.fco_wallets set fc = 10000 where user_id = $1`, [V]);
await credit(V, 10000, { note: 'Đợt thử · mốc 100.000đ · tự cộng', event: E });
const fc = async u => Number((await db.query(`select fc from public.fco_wallets where user_id = $1`, [u])).rows[0].fc);
const dup = (await db.query(`select * from public.fco_topup_duplicate_bonus()`)).rows;
ok(dup.length === 2 && dup.every(d => [U, U2].includes(d.user_id) && Number(d.amount) === 10000 && Number(d.tier_vnd) === 100000), `chỉ 2 lần cộng trùng (U, U2), V không bị tính (${dup.map(d => d.user_id.slice(-2) + ':' + d.amount).join(', ')})`);
const preview = (await db.query(`select * from public.fco_topup_revoke_duplicates(false)`)).rows;
ok(preview.length === 2 && await fc(U) === 80000 && await fc(U2) === 3000, 'xem trước không trừ FC');
const done = (await db.query(`select * from public.fco_topup_revoke_duplicates(true)`)).rows;
ok(await fc(U) === 70000, `U bị trừ đúng 10.000 (còn ${await fc(U)})`);
ok(await fc(U2) === 0 && Number(done.find(r => r.user_id === U2)?.con_thieu) === 7000, `U2 trừ hết 3.000, ghi thiếu 7.000 (${JSON.stringify(done.find(r => r.user_id === U2))})`);
ok(await fc(V) === 20000, 'V không bị trừ');
await db.query(`select * from public.fco_topup_revoke_duplicates(true)`);
ok(await fc(U) === 70000 && await fc(U2) === 0, 'chạy lại không trừ thêm');
const neg = (await db.query(`select count(*) c from public.fco_fc_ledger where reason = 'topup_bonus' and delta < 0 and detail ? 'revoke'`)).rows[0].c;
ok(Number(neg) === 2, `sổ cái có 2 dòng thu hồi (${neg})`);
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);