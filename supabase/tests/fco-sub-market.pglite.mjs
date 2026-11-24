// Acc phụ mua thẻ hệ thống bán (202611220018_fco_sub_market_buy.sql) + bán cho hệ thống (202611240007_fco_sub_market_sell.sql): node fco-sub-market.pglite.mjs <thư mục dự án>
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
ok(!errs.some(e => e.startsWith('20261122001') || e.startsWith('202611240007')), 'Migration 202611220017 / 0018 / 202611240007 chạy được ' + errs.filter(e => e.startsWith('20261122001') || e.startsWith('202611240007')).join(' | '));
const S = 'bbbbbbbb-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002', C = 'bbbbbbbb-0000-0000-0000-000000000003';
const prices = Array.from({ length: 13 }, (_, i) => Math.round(100000 * 1.5 ** i));
const ovrs = Array.from({ length: 13 }, (_, i) => 100 + i);
const card = (uid, playerId, level = 1) => ({ uid, playerId, level, received: 0 });
const save = (balance, cards) => JSON.stringify({ version: '1', inv: '1', balance, cards, history: [] });
await db.exec(`
  insert into auth.users(id, email) values ('${S}', 'submktsubacc@gmail.com'), ('${B}', 'submktsellerb@gmail.com'), ('${C}', 'submktbuyerc@gmail.com');
  insert into public.fco_sub_accounts(user_id) values ('${S}');
  update public.fco_inventory set version = 'v1', enforced = true,
    rules = '{"marketFee":40,"sellBand":10,"maxLevel":13,"maxBulkSell":99,"flatPrice":0,"priceEpoch":0,"pricePeriodMs":18000000,"priceSwing":10,"membership":{"svip":28,"premium":20}}' where id = 1;
  insert into public.fco_cat_players(id, name, ovrs, prices, fixed, insurance, grp) values
    (10, 'Phoi', '{${ovrs}}', '{${prices}}', true, 0, 1),
    (20, 'Sao', '{${ovrs}}', '{${prices}}', true, 0, 3),
    (4100, 'EL', '{${ovrs}}', '{${prices}}', true, 0, 3);
  insert into public.fco_game_saves(user_id, revision, data) values
    ('${S}', 1, '${save(100_000_000, [card('s1', 10)])}'),
    ('${B}', 1, '${save(10_000_000, [])}'),
    ('${C}', 1, '${save(10_000_000, [])}');
`);
const as = async uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
const bal = async uid => Number((await db.query(`select data from public.fco_game_saves where user_id = $1`, [uid])).rows[0].data.balance);
const offer = async (p, l = 1) => (await db.query(`select public.fco_mkt_sys_offer($1, $2) r`, [p, l])).rows[0].r;
const o10 = await offer(10), o20 = await offer(20), o4100 = await offer(4100);
console.log('giá hệ thống', JSON.stringify({ o10, o20, o4100 }));
const sys10 = Number(o10.price);

// Lệnh bán treo của người chơi thật B, rẻ hơn hệ thống (nếu acc phụ khớp thì BP chảy sang B).
// Tắt bước hệ thống nhận lệnh treo (fco_mkt_settle) để lệnh của B còn mở trong lúc thử.
await db.exec(`create or replace function public.fco_mkt_settle() returns void language plpgsql as $$ begin end $$`);
const cheap = Math.ceil(sys10 * 0.95);
await db.exec(`insert into public.fco_mkt_orders (user_id, side, player_id, level, price, tax, card) values ('${B}', 'sell', 10, 1, ${cheap}, 40, '{"uid":"bsell","playerId":10,"level":1}')`);
const before = await bal(S);
const r1 = await call(S, `public.fco_mkt_buy('v1', 10, 1, $1)`, [sys10]);
ok(!r1.e && r1.r.system === true && Number(r1.r.price) === sys10, 'acc phụ mua thẻ hệ thống bán, giá hệ thống ' + (r1.e ?? JSON.stringify({ s: r1.r?.system, p: r1.r?.price })));
ok(await bal(S) === before - sys10, 'trừ đúng BP');
ok((await db.query(`select status from public.fco_mkt_orders where card->>'uid' = 'bsell'`)).rows[0].status === 'open', 'không khớp lệnh bán rẻ hơn của người chơi thật (lệnh của B vẫn mở)');
ok((await db.query(`select count(*)::int n from public.fco_mkt_deliveries where user_id = $1 and kind = 'buy'`, [S])).rows[0].n === 1, 'thẻ chờ nhận ở TTCN');
const r1d = await call(S, `public.fco_mkt_buy('v1', 10, 1, $1, true)`, [sys10]);
ok(!r1d.e && (await db.query(`select data from public.fco_game_saves where user_id = $1`, [S])).rows[0].data.cards.filter(c => c.playerId === 10).length === 2, 'mua thẳng vào kho (p_direct) ' + (r1d.e ?? ''));
const r2 = await call(S, `public.fco_mkt_bulk_buy('v1', 10, 1, 3, $1)`, [sys10]);
ok(!r2.e && r2.r.bought === 3, 'mua nhiều 3 thẻ hệ thống ' + (r2.e ?? JSON.stringify(r2.r?.bought)));
ok((await db.query(`select status from public.fco_mkt_orders where card->>'uid' = 'bsell'`)).rows[0].status === 'open', 'mua nhiều cũng không đụng lệnh của B');

// Hệ thống không bán → báo FCO_SUB_MARKET, không đặt lệnh chờ.
ok((await db.query(`select count(*)::int n from public.fco_mkt_orders where counterparty = $1 or (user_id = $1 and counterparty is not null)`, [S])).rows[0].n === 0, 'acc phụ không có giao dịch nào với người chơi');
if (!o4100 || o4100.price == null) {
  const b4 = await bal(S);
  const r3 = await call(S, `public.fco_mkt_buy('v1', 4100, 1, $1)`, [prices[0]]);
  ok(r3.e?.includes('FCO_SUB_MARKET') && await bal(S) === b4, 'thẻ hệ thống không bán: báo lỗi, không đặt mua, không mất BP ' + (r3.e ?? ''));
  const r3b = await call(S, `public.fco_mkt_bulk_buy('v1', 4100, 1, 2, $1)`, [prices[0] * 2]);
  ok(r3b.e?.includes('FCO_SUB_MARKET'), 'mua nhiều thẻ hệ thống không bán: báo lỗi ' + (r3b.e ?? ''));
}
// Hàng giới hạn mỗi phút: acc phụ không làm giảm lượt của người chơi.
if (o20.price != null && o20.left != null) {
  const left0 = Number(o20.left);
  for (let i = 0; i < left0 + 2; i++) await call(S, `public.fco_mkt_buy('v1', 20, 1, $1, true)`, [Number(o20.price)]);
  ok(Number((await offer(20)).left) === left0, `hàng giới hạn: acc phụ mua ${left0 + 2} thẻ, lượt còn lại vẫn ${left0}`);
} else console.log('(bỏ qua kiểm tra hàng giới hạn: hệ thống không giới hạn thẻ 20)', JSON.stringify(o20));
// 202611240007: acc phụ BÁN được — hệ thống mua ngay, KHÔNG khớp lệnh đặt mua (giá cao hơn) của người chơi thật C.
const bp = (await db.query(`select public.fco_mkt_check_price(10, 1, ${prices[0]}, 10) is null as ok`).catch(() => ({ rows: [{}] })));
await db.exec(`insert into public.fco_mkt_orders (user_id, side, player_id, level, price, tax, card) values ('${C}', 'buy', 10, 1, ${Math.floor(prices[0] * 1.1)}, 0, null)`);
const r4 = await call(S, `public.fco_mkt_sell('v1', $1::jsonb)`, [JSON.stringify([{ uid: 's1', price: prices[0] }])]);
ok(!r4.e && r4.r.placed === 1 && r4.r.matched === 0 && r4.r.system === 1, 'acc phụ bán thẻ: hệ thống mua ngay, không khớp lệnh mua của người chơi ' + (r4.e ?? JSON.stringify(r4.r && { placed: r4.r.placed, matched: r4.r.matched, system: r4.r.system })));
ok(!(await db.query(`select data from public.fco_game_saves where user_id = $1`, [S])).rows[0].data.cards.some(c => c.uid === 's1'), 'thẻ đã rời kho');
ok((await db.query(`select status from public.fco_mkt_orders where user_id = $1 and side = 'buy' and player_id = 10 and price = $2`, [C, Math.floor(prices[0] * 1.1)])).rows[0].status === 'open', 'lệnh đặt mua của C vẫn mở');
ok((await db.query(`select count(*)::int n from public.fco_mkt_deliveries where user_id = $1 and kind = 'sell'`, [S])).rows[0].n === 1, 'BP chờ nhận ở Lịch sử chuyển nhượng');
// Đặt lệnh mua chờ vẫn chặn.
let blocked = false; try { await db.exec(`insert into public.fco_mkt_orders (user_id, side, player_id, level, price, tax) values ('${S}', 'buy', 10, 1, 1, 0)`); } catch (e) { blocked = /FCO_SUB_MARKET/.test(e.message); }
ok(blocked, 'acc phụ đặt lệnh mua chờ vẫn bị chặn');
await db.exec(`delete from public.fco_mkt_orders where user_id = '${C}' and side = 'buy'`);
// Người chơi thật vẫn khớp lệnh của B như cũ.
const r5 = await call(C, `public.fco_mkt_buy('v1', 10, 1, $1)`, [sys10]);
ok(!r5.e && r5.r.matched === true && r5.r.system === false, 'người chơi thường vẫn khớp lệnh bán rẻ của B ' + (r5.e ?? JSON.stringify(r5.r)));
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);
