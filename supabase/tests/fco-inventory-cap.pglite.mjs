// Giới hạn kho thẻ (202611230002_fco_inventory_cap.sql, 200 → 500 ở 202611250012_fco_inventory_cap_500.sql): node fco-inventory-cap.pglite.mjs <thư mục dự án>
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
const root = process.argv[2];
const CAP = 500; // 202611250012
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
let fails = 0;
const ok = (cond, msg) => { console.log(cond ? 'PASS' : 'FAIL', msg); if (!cond) fails++; };
ok(!errs.some(e => e.startsWith('20261123')), 'Migration 202611230002 chạy được ' + errs.filter(e => e.startsWith('20261123')).join(' | '));
const A = 'cccccccc-0000-0000-0000-000000000001', B = 'cccccccc-0000-0000-0000-000000000002', C = 'cccccccc-0000-0000-0000-000000000003', S = 'cccccccc-0000-0000-0000-000000000004';
const prices = Array.from({ length: 13 }, (_, i) => Math.round(100000 * 1.5 ** i));
const ovrs = Array.from({ length: 13 }, (_, i) => 100 + i);
const cards = (n, tag) => Array.from({ length: n }, (_, i) => ({ uid: `${tag}${i}`, playerId: 10, level: 1, received: 0 }));
const save = (balance, cs) => JSON.stringify({ version: '1', inv: '1', balance, cards: cs, history: [] });
await db.exec(`
  insert into auth.users(id, email) values ('${A}', 'capuseraaa@gmail.com'), ('${B}', 'capuserbbb@gmail.com'), ('${C}', 'capusercc@gmail.com'), ('${S}', 'capusersub@gmail.com');
  insert into public.fco_sub_accounts(user_id) values ('${S}');
  update public.fco_inventory set version = 'v1', enforced = true,
    rules = '{"marketFee":40,"sellBand":10,"maxLevel":13,"maxBulkSell":99,"flatPrice":0,"priceEpoch":0,"pricePeriodMs":18000000,"priceSwing":10,"membership":{"svip":28,"premium":20}}' where id = 1;
  insert into public.fco_cat_players(id, name, ovrs, prices, fixed, insurance, grp) values (10, 'Phoi', '{${ovrs}}', '{${prices}}', true, 0, 1);
  insert into public.fco_game_saves(user_id, revision, data) values
    ('${A}', 1, '${save(50_000_000, cards(CAP - 1, 'a'))}'),
    ('${B}', 1, '${save(50_000_000, cards(CAP, 'b'))}'),
    ('${C}', 1, '${save(50_000_000, cards(CAP + 50, 'c'))}'),
    ('${S}', 1, '${save(50_000_000, cards(CAP, 's'))}');
`);
// Mô phỏng bước "ghi danh sách miễn" của migration cho dữ liệu vừa tạo (C đang 250 thẻ lúc áp dụng).
await db.exec(`insert into public.fco_inv_cap_exempt (user_id, cards) select s.user_id, jsonb_array_length(s.data->'cards') from public.fco_game_saves s where jsonb_array_length(s.data->'cards') > ${CAP} on conflict do nothing`);
const err = async (sql, args = []) => { try { await db.query(sql, args); return null; } catch (e) { return e.message; } };
const setCards = (uid, cs, balance = 50_000_000) => err(`update public.fco_game_saves set data = $2::jsonb where user_id = $1`, [uid, save(balance, cs)]);
const n = async uid => Number((await db.query(`select jsonb_array_length(data->'cards') n from public.fco_game_saves where user_id = $1`, [uid])).rows[0].n);
ok((await db.query(`select count(*)::int c from public.fco_inv_cap_exempt`)).rows[0].c === 1, 'chỉ tài khoản đang vượt trần vào danh sách miễn (C)');

ok(await setCards(A, cards(CAP, 'a')) === null && await n(A) === CAP, `A: ${CAP - 1} → ${CAP} thẻ được`);
const e1 = await setCards(A, cards(CAP + 1, 'a'));
ok(e1?.includes('FCO_INVENTORY_FULL') && await n(A) === CAP, `A: ${CAP} → ${CAP + 1} bị chặn (${e1})`);
ok(await setCards(A, cards(CAP - 1, 'a')) === null && await n(A) === CAP - 1, 'A: giảm 1 thẻ (bán / xoá) được');
ok(await setCards(B, cards(CAP, 'b'), 12345) === null, 'B: đổi BP khi đang đầy kho (không thêm thẻ) được');
ok((await setCards(B, cards(CAP + 5, 'b')))?.includes('FCO_INVENTORY_FULL'), 'B: đầy kho → thêm 5 thẻ một lượt bị chặn');
ok(await setCards(C, cards(CAP + 51, 'c')) === null && await n(C) === CAP + 51, 'C (miễn giới hạn): thêm 1 thẻ được');
ok(await setCards(S, cards(CAP + 5, 's')) === null, 'acc phụ: thêm thẻ vượt trần được');

// Luồng thật: B (đầy kho) mua thẻ từ hệ thống vào thẳng kho → bị chặn, BP không đổi.
await setCards(B, cards(CAP, 'b'), 50_000_000);
await db.query(`select set_config('test.uid', $1, false)`, [B]);
const b0 = Number((await db.query(`select data->>'balance' b from public.fco_game_saves where user_id = $1`, [B])).rows[0].b);
const buy = await err(`select public.fco_mkt_buy('v1', 10, 1, $1, true)`, [prices[0]]);
const b1 = Number((await db.query(`select data->>'balance' b from public.fco_game_saves where user_id = $1`, [B])).rows[0].b);
ok(buy?.includes('FCO_INVENTORY_FULL'), `B đầy kho: mua thẻ hệ thống vào kho bị chặn (${buy})`);
ok(b1 === b0 && await n(B) === CAP, 'bị chặn thì không mất BP, không thêm thẻ');
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);
