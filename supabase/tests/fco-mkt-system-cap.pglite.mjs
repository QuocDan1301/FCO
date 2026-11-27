// Hệ thống mua tối đa bằng giá tham chiếu (202611270001_fco_mkt_system_take_cap.sql): node fco-mkt-system-cap.pglite.mjs <thư mục dự án>
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
ok(!errs.some(e => e.startsWith('202611270001')), 'Migration 202611270001 chạy được ' + errs.filter(e => e.startsWith('202611270001')).join(' | '));
const A = 'cccccccc-0000-0000-0000-000000000001', P = 'cccccccc-0000-0000-0000-000000000002';
const prices = Array.from({ length: 13 }, (_, i) => Math.round(100000 * 1.5 ** i));
const ovrs = Array.from({ length: 13 }, (_, i) => 100 + i);
const save = (balance, cards) => JSON.stringify({ version: '1', inv: '1', balance, cards, history: [] });
const card = (uid, level = 1) => ({ uid, playerId: 10, level, received: 0 });
await db.exec(`
  insert into auth.users(id, email) values ('${A}', 'capseller@gmail.com'), ('${P}', 'capbuyer@gmail.com');
  update public.fco_inventory set version = 'v1', enforced = true,
    rules = '{"marketFee":40,"sellBand":10,"maxLevel":13,"maxBulkSell":99,"flatPrice":0,"priceEpoch":0,"pricePeriodMs":18000000,"priceSwing":10,"membership":{"svip":28,"premium":20}}' where id = 1;
  insert into public.fco_cat_players(id, name, ovrs, prices, fixed, insurance, grp) values (10, 'Phoi', '{${ovrs}}', '{${prices}}', true, 0, 1);
  insert into public.fco_game_saves(user_id, revision, data) values
    ('${A}', 1, '${save(100_000_000, [card('a1'), card('a2'), card('a3')])}'),
    ('${P}', 1, '${save(100_000_000, [])}');
`);
const as = async uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
const ref = Number((await db.query(`select public.fco_inv_price(10, 1) r`)).rows[0].r);
const hi = Math.floor(ref * 1.1), lo = Math.ceil(ref * 0.95);
const last = async () => (await db.query(`select o.price, o.fill_price, o.tax, o.status, d.bp from public.fco_mkt_orders o join public.fco_mkt_deliveries d on d.order_id = o.id where o.user_id = $1 order by o.id desc limit 1`, [A])).rows[0];
// 1) Treo +10 %, không ai đặt mua → hệ thống trả đúng giá tham chiếu.
let r = await call(A, `public.fco_mkt_sell('v1', $1::jsonb)`, [JSON.stringify([{ uid: 'a1', price: hi }])]);
let o = await last();
ok(!r.e && o.status === 'system' && Number(o.fill_price) === ref, `treo ${hi} (+10%): hệ thống mua ${o?.fill_price} = giá tham chiếu ${ref} ` + (r.e ?? ''));
ok(Number(o.bp) === ref - Math.floor(ref * Number(o.tax) / 100), `BP nhận = giá tham chiếu − thuế (${o.bp})`);
// 2) Treo thấp hơn giá tham chiếu → hệ thống trả đúng giá treo.
r = await call(A, `public.fco_mkt_sell('v1', $1::jsonb)`, [JSON.stringify([{ uid: 'a2', price: lo }])]);
o = await last();
ok(!r.e && Number(o.fill_price) === lo, `treo ${lo} (−5%): hệ thống mua đúng giá treo ${o?.fill_price}`);
// 3) Có người chơi đặt mua +10 % → vẫn khớp theo giá treo cao như cũ.
await db.exec(`insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values ('${P}', 'buy', 10, 1, ${hi})`);
r = await call(A, `public.fco_mkt_sell('v1', $1::jsonb)`, [JSON.stringify([{ uid: 'a3', price: hi }])]);
const s3 = (await db.query(`select status, fill_price from public.fco_mkt_orders where user_id = $1 and side = 'sell' order by id desc limit 1`, [A])).rows[0];
ok(!r.e && r.r.matched === 1 && s3.status === 'filled' && Number(s3.fill_price) === hi, `có lệnh đặt mua ${hi}: khớp với người chơi đúng giá ${s3?.fill_price}`);
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);