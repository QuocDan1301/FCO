// Phiếu giảm thuế không cộng dồn với gói thành viên (202611270002_fco_voucher_no_stack_membership.sql): node fco-voucher-no-stack.pglite.mjs <thư mục dự án>
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
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  // Bỏ bước chặn 'chưa đồng bộ gói ctp-*' (máy thử không có dữ liệu kho thẻ).
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 120)); try { await db.exec('rollback'); } catch {} }
}
let fails = 0;
const ok = (cond, msg) => { console.log(cond ? 'PASS' : 'FAIL', msg); if (!cond) fails++; };
ok(!errs.some(e => e.startsWith('202611270002')), 'Migration 202611270002 chạy được ' + errs.filter(e => e.startsWith('202611270002')).join(' | '));
const C = 'dddddddd-0000-0000-0000-000000000001', S = 'dddddddd-0000-0000-0000-000000000002', P = 'dddddddd-0000-0000-0000-000000000003';
const prices = Array.from({ length: 13 }, (_, i) => Math.round(100000 * 1.5 ** i));
const ovrs = Array.from({ length: 13 }, (_, i) => 100 + i);
const save = cards => JSON.stringify({ version: '1', inv: '1', balance: 100_000_000, cards, history: [], taxVouchers: { '10': 5, '30': 5, '40': 5 } });
const card = uid => ({ uid, playerId: 10, level: 1, received: 0 });
await db.exec(`
  insert into auth.users(id, email) values ('${C}', 'voucherclassic@gmail.com'), ('${S}', 'vouchersvip@gmail.com'), ('${P}', 'voucherprem@gmail.com');
  update public.fco_inventory set version = 'v1', enforced = true,
    rules = '{"marketFee":40,"sellBand":10,"maxLevel":13,"maxBulkSell":99,"flatPrice":0,"priceEpoch":0,"pricePeriodMs":18000000,"priceSwing":0,"membership":{"svip":30,"premium":50}}' where id = 1;
  insert into public.fco_cat_players(id, name, ovrs, prices, fixed, insurance, grp) values (10, 'Phoi', '{${ovrs}}', '{${prices}}', true, 0, 1);
  insert into public.fco_game_saves(user_id, revision, data) values
    ('${C}', 1, '${save([card('c1'), card('c2')])}'), ('${S}', 1, '${save([card('s1'), card('s2'), card('s3')])}'), ('${P}', 1, '${save([card('p1'), card('p2')])}');
  insert into public.fco_wallets(user_id) values ('${C}'), ('${S}'), ('${P}') on conflict (user_id) do nothing;
  update public.fco_wallets set svip_until = now() + interval '3 days' where user_id = '${S}';
  update public.fco_wallets set premium_until = now() + interval '3 days' where user_id = '${P}';
`);
const as = async uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
const ref = Number((await db.query(`select public.fco_inv_price(10, 1) r`)).rows[0].r);
const sell = (uid, cu, v) => call(uid, `public.fco_mkt_sell('v1', $1::jsonb, $2)`, [JSON.stringify([{ uid: cu, price: ref }]), v]);
const tax = async uid => Number((await db.query(`select tax from public.fco_mkt_orders where user_id = $1 order by id desc limit 1`, [uid])).rows[0]?.tax);
const vouchers = async (uid, v) => Number((await db.query(`select data->'taxVouchers'->>$2 n from public.fco_game_saves where user_id = $1`, [uid, String(v)])).rows[0].n);
// 1) Không có gói: phiếu 30 % → 40 × 70 % = 28 %.
let r = await sell(C, 'c1', 30);
ok(!r.e && await tax(C) === 28, `không gói + phiếu 30%: thuế ${await tax(C)}% (mong 28%) ${r.e ?? ''}`);
ok(await vouchers(C, 30) === 4, 'không gói: phiếu 30% bị trừ 1');
// 2) SVIP Class (28 %) + phiếu 40 % → lấy mức thấp hơn 24 %, không phải 16,8 %.
r = await sell(S, 's1', 40);
ok(!r.e && await tax(S) === 24, `SVIP + phiếu 40%: thuế ${await tax(S)}% (mong 24%, không cộng dồn 16,8%) ${r.e ?? ''}`);
// 3) SVIP + phiếu 10 % (36 % > 28 %) → vô dụng, không mất phiếu.
r = await sell(S, 's2', 10);
ok(/FCO_VOUCHER_USELESS/.test(r.e ?? ''), `SVIP + phiếu 10%: báo vô dụng (${r.e ?? 'không lỗi'})`);
ok(await vouchers(S, 10) === 5, 'SVIP + phiếu 10%: giữ nguyên phiếu');
// 4) Gói Premium (20 %) + phiếu 40 % (24 %) → vô dụng, không mất phiếu (trước: 12 %).
r = await sell(P, 'p1', 40);
ok(/FCO_VOUCHER_USELESS/.test(r.e ?? ''), `gói Premium + phiếu 40%: báo vô dụng (${r.e ?? 'không lỗi, thuế ' + await tax(P)})`);
ok(await vouchers(P, 40) === 5, 'gói Premium + phiếu 40%: giữ nguyên phiếu');
// 5) Gói Premium bán không phiếu → 20 %.
r = await sell(P, 'p2', null);
ok(!r.e && await tax(P) === 20, `gói Premium không phiếu: thuế ${await tax(P)}% ${r.e ?? ''}`);
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);