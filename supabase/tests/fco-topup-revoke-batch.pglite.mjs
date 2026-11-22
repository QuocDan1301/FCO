// Thu hồi loạt KM tự cộng (202611220014_fco_topup_revoke_auto_batch.sql): node fco-topup-revoke-batch.pglite.mjs <thư mục dự án>
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
ok(!errs.some(e => e.startsWith('20261122001')), 'Migration 202611220012 → 0014 chạy được ' + errs.filter(e => e.startsWith('20261122001')).join(' | '));
const A = '00000000-0000-0000-0000-0000000000e1', B = '00000000-0000-0000-0000-0000000000e2';
await db.query(`insert into auth.users(id, email) values ($1, 'batchplayera@gmail.com'), ($2, 'batchplayerb@gmail.com')`, [A, B]);
for (const u of [A, B]) await db.query(`select public.fco_wallet_lock($1)`, [u]);
await db.query(`select public.fco_apply_fc($1, 5000, 'admin', '{}')`, [A]);   // FC nạp thật (trigger không cộng gì: chưa có đợt)
// Loạt chạy migration: 1 giao dịch → cùng now().
await db.exec(`do $$ begin
  perform public.fco_apply_fc('${A}', 4000, 'topup_bonus', '{"note":"Nạp tích luỹ · mốc 20.000đ · tự cộng"}');
  perform public.fco_apply_fc('${A}', 6000, 'topup_bonus', '{"note":"Nạp tích luỹ · mốc 30.000đ · tự cộng"}');
  perform public.fco_apply_fc('${B}', 4000, 'topup_bonus', '{"note":"Nạp tích luỹ · mốc 20.000đ · tự cộng"}');
end $$;`);
const at = (await db.query(`select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS') t from public.fco_fc_ledger where reason = 'topup_bonus' order by id limit 1`)).rows[0].t;
// Lần tự cộng hợp lệ ở thời điểm khác (1 phút sau) không thuộc loạt.
await db.query(`insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, created_at) values ($1, 8000, 0, 'topup_bonus', '{"note":"Nạp tích luỹ · mốc 40.000đ · tự cộng"}', now() + interval '1 minute')`, [A]);
await db.query(`select public.fco_apply_fc($1, -3000, 'shop', '{}')`, [B]);   // B tiêu, còn 1.000
const fc = async u => Number((await db.query(`select fc from public.fco_wallets where user_id = $1`, [u])).rows[0].fc);
const batches = (await db.query(`select * from public.fco_topup_auto_batches()`)).rows;
ok(batches.length === 1 && Number(batches[0].so_lan) === 3 && Number(batches[0].tong_fc) === 14000, `liệt kê đúng 1 loạt 3 lần · 14.000 FC (${JSON.stringify(batches)})`);
const pv = (await db.query(`select * from public.fco_topup_revoke_batch($1::timestamp, false)`, [at])).rows;
ok(pv.length === 2 && await fc(A) === 15000 && await fc(B) === 1000, `xem trước 2 người, chưa trừ (${pv.map(r => r.bi_cong).join(',')})`);
const done = (await db.query(`select * from public.fco_topup_revoke_batch($1::timestamp, true)`, [at])).rows;
ok(await fc(A) === 5000, `A bị trừ 10.000, còn đúng FC nạp thật (${await fc(A)})`);
ok(await fc(B) === 0 && Number(done.find(r => r.user_id === B)?.con_thieu) === 3000, 'B trừ hết 1.000, ghi thiếu 3.000');
await db.query(`select * from public.fco_topup_revoke_batch($1::timestamp, true)`, [at]);
ok(await fc(A) === 5000 && await fc(B) === 0, 'chạy lại không trừ thêm');
ok(Number((await db.query(`select count(*) c from public.fco_topup_revokes`)).rows[0].c) === 3, 'lần tự cộng ngoài loạt không bị thu hồi');
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);