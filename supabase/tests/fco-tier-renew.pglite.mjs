// Premium / Luxury tự gia hạn khi nạp đủ trong kỳ (migration 202611240005_fco_tier_auto_renew.sql) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-tier-renew.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
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
let seq = 0;
const mk = async (tier, untilExpr) => {
  const id = `00000000-0000-0000-0000-0000000000${(++seq).toString(16).padStart(2, '0')}`;
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [id, `renewtest${seq}@gmail.com`]);
  await db.query('select public.fco_wallet_lock($1)', [id]);
  await db.query(`update public.fco_wallets set account_tier = $2, account_tier_until = ${untilExpr}, tier_renew_checked = null where user_id = $1`, [id, tier]);
  return id;
};
const topup = (id, delta, agoExpr, reason = 'admin') => db.query(`insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, created_at) values ($1, $2, 0, $3, '{}'::jsonb, ${agoExpr})`, [id, delta, reason]);
const tier = id => one('select public.fco_account_tier($1)', [id]);
const until = id => one('select account_tier_until from public.fco_wallets where user_id = $1', [id]);
const iv = (a, b) => (new Date(a) - new Date(b)) / 86400000;

// 1. Premium hết hạn 1 giờ trước, nạp 10.000 FC trong kỳ vừa qua → tự cộng 7 ngày liền mạch.
const a = await mk('premium', `now() - interval '1 hour'`); const a0 = await until(a);
await topup(a, 10000, `now() - interval '3 days'`);
assert.equal(await tier(a), 'classic', 'trước khi chốt: đã hết hạn');
assert.equal(await one('select public.fco_tier_auto_renew($1)', [a]), true);
assert.equal(await tier(a), 'premium');
assert.ok(Math.abs(iv(await until(a), a0) - 7) < 1e-6, 'cộng đúng 7 ngày từ hạn cũ (không hở)');
assert.equal(await one('select public.fco_tier_auto_renew($1)', [a]), false, 'gọi lại không cộng thêm');

// 2. Thiếu 1 FC thì không gia hạn; hạn đã xét không tính lại.
const b = await mk('premium', `now() - interval '1 hour'`); const b0 = await until(b);
await topup(b, 9999, `now() - interval '3 days'`);
assert.equal(await one('select public.fco_tier_auto_renew($1)', [b]), false);
assert.equal(await tier(b), 'classic');
assert.equal(String(await until(b)), String(b0));
assert.equal(String(await one('select tier_renew_checked from public.fco_wallets where user_id = $1', [b])), String(b0), 'đánh dấu đã xét');
// nạp thêm SAU hạn không cứu được kỳ đã xét
await topup(b, 50000, `now() - interval '10 minutes'`);
assert.equal(await one('select public.fco_tier_auto_renew($1)', [b]), false);

// 3. Nạp NGOÀI kỳ (trước đầu kỳ 7 ngày) không tính; thu hồi (âm) trừ vào tổng.
const c = await mk('premium', `now() - interval '1 hour'`);
await topup(c, 50000, `now() - interval '9 days'`);
await topup(c, 10000, `now() - interval '2 days'`); await topup(c, -2000, `now() - interval '1 day'`);
assert.equal(await one('select public.fco_tier_auto_renew($1)', [c]), false, 'ngoài kỳ không tính, thu hồi trừ: còn 8.000 < 10.000');
// FC khuyến mãi / quà admin không tính
const c2 = await mk('premium', `now() - interval '1 hour'`);
await topup(c2, 100000, `now() - interval '2 days'`, 'topup_bonus'); await topup(c2, 100000, `now() - interval '2 days'`, 'admin_gift');
assert.equal(await one('select public.fco_tier_auto_renew($1)', [c2]), false);

// 4. Luxury: mốc 50.000 FC, kỳ 30 ngày.
const d = await mk('luxury', `now() - interval '1 hour'`); const d0 = await until(d);
await topup(d, 49999, `now() - interval '10 days'`);
assert.equal(await one('select public.fco_tier_auto_renew($1)', [d]), false);
const d2 = await mk('luxury', `now() - interval '1 hour'`); const d20 = await until(d2);
await topup(d2, 30000, `now() - interval '20 days'`); await topup(d2, 20000, `now() - interval '5 days'`);
assert.equal(await one('select public.fco_tier_auto_renew($1)', [d2]), true);
assert.ok(Math.abs(iv(await until(d2), d20) - 30) < 1e-6, 'Luxury +30 ngày');
assert.equal(await tier(d2), 'luxury');

// 5. Nghỉ nhiều kỳ rồi mới vào: xét lần lượt từng kỳ đã qua (kỳ 1 và 2 đủ, kỳ 3 không).
const e = await mk('premium', `now() - interval '15 days'`); const e0 = await until(e);
await topup(e, 10000, `now() - interval '18 days'`);   // kỳ [E−7, E)
await topup(e, 10000, `now() - interval '11 days'`);   // kỳ [E, E+7)
assert.equal(await one('select public.fco_tier_auto_renew($1)', [e]), true);
assert.ok(Math.abs(iv(await until(e), e0) - 14) < 1e-6, 'gia hạn 2 kỳ rồi dừng ở kỳ thiếu nạp');
assert.equal(await tier(e), 'classic', 'hạn mới (14 ngày) vẫn đã qua');

// 6. Tính thuế bán tự chốt gia hạn: Premium hết hạn nhưng nạp đủ → thuế 14%, không phải 40%.
const f = await mk('premium', `now() - interval '1 hour'`); await topup(f, 10000, `now() - interval '2 days'`);
const rules = JSON.stringify({ marketFee: 40, membership: { svip: 28, premium: 20 } });
assert.ok(Math.abs(Number(await one('select public.fco_inv_tax($1, $2::jsonb)', [f, rules])) - 14) < 1e-9, 'Premium 14%');
const g = await mk('premium', `now() - interval '1 hour'`);
assert.equal(Number(await one('select public.fco_inv_tax($1, $2::jsonb)', [g, rules])), 40, 'không nạp đủ: thuế thường');

// 7. Người chơi tải ví (fco_wallet) cũng chốt gia hạn.
const h = await mk('luxury', `now() - interval '1 hour'`); await topup(h, 60000, `now() - interval '3 days'`);
await db.query(`select set_config('test.uid', $1, false)`, [h]);
const w = await one('select public.fco_wallet(0)');
assert.equal(w.tier, 'luxury'); assert.ok(w.tierUntil > Date.now(), 'hạn mới trả về game');
console.log('tier renew OK');