// Cờ tỷ phú (202611220001): node ctp-sim.mjs <thư mục dự án>
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
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const strip = (f, text) => f.startsWith('20261122000') ? text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '').replace(/if n > 0 then raise exception/, 'if false then raise exception') : text;
for (const f of files.filter(f => f < '202611220010')) { try { await db.exec(strip(f, readFileSync(`${dir}/${f}`, 'utf8'))); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 120)); try { await db.exec('rollback'); } catch {} } }
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
const P = '00000000-0000-0000-0000-0000000000b1', Q = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users(id, email) values ($1, 'serialplayer@gmail.com'), ($2, 'serialplayertwo@gmail.com')`, [P, Q]);
const card = (uid, pid, rcv, lvl = 1) => ({ uid, playerId: pid, level: lvl, received: rcv });
await db.query(`insert into public.fco_game_saves(user_id, data, revision) values ($1, $2, 1), ($3, $4, 1)`, [P,
  JSON.stringify({ version: 1, balance: 0, history: [], inv: '1', cards: [card('a', 4085, 300), card('b', 4086, 100), card('x', 100, 50), card('c', 4085, 100)] }), Q,
  JSON.stringify({ version: 1, balance: 0, history: [], inv: '1', cards: [card('d', 4085, 200), card('e', 4085, 400, 5)] })]);
await db.query(`insert into public.fco_mkt_orders(user_id, side, player_id, level, price, card) values ($1, 'sell', 4085, 1, 1000, $2)`, [Q, JSON.stringify(card('f', 4085, 250))]);
for (const f of files.filter(f => f >= '202611220010')) { try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 200)); } }
ok(!errs.some(e => e.startsWith('202611220010')), 'Migration 202611220010_fco_el_serial.sql chạy được ' + errs.filter(e => e.startsWith('2026112200')).join(' | '));
const saves = Object.fromEntries((await db.query(`select user_id, data from public.fco_game_saves`)).rows.map(r => [r.user_id, r.data.cards]));
const ser = Object.fromEntries([...saves[P], ...saves[Q]].map(c => [c.uid, c.serial]));
const ord = (await db.query(`select card from public.fco_mkt_orders`)).rows[0].card;
// 4085: c(100) #1, d(200) #2, f(250, đang treo bán) #3, a(300) #4, e(400) #5; 4086: b #1; thẻ thường không có số
ok(ser.c === 1 && ser.d === 2 && ord.serial === 3 && ser.a === 4 && ser.e === 5 && ser.b === 1 && ser.x === undefined, 'Đánh số bù theo thời điểm nhận, riêng từng cầu thủ, cả thẻ đang treo bán: ' + JSON.stringify(ser) + ' order ' + ord.serial);
const n1 = (await db.query(`select public.fco_inv_new_card(4085, 1) c`)).rows[0].c, n2 = (await db.query(`select public.fco_inv_new_card(4086, 3) c`)).rows[0].c, n3 = (await db.query(`select public.fco_inv_new_card(100, 1) c`)).rows[0].c;
ok(n1.serial === 6 && n2.serial === 2 && n3.serial === undefined, 'Thẻ EL mới nhận số tiếp theo (Messi #6, 4086 #2), thẻ mùa khác không có số');
await db.exec(readFileSync(`${dir}/202611220010_fco_el_serial.sql`, 'utf8'));
const again = (await db.query(`select data from public.fco_game_saves where user_id = $1`, [P])).rows[0].data.cards;
ok(again.find(c => c.uid === 'a').serial === 4 && (await db.query(`select last from public.fco_card_serials where player_id = 4085`)).rows[0].last === 6, 'Chạy lại không đổi số, không nhảy dãy');
const up = (await db.query(`select jsonb_set($1::jsonb, '{level}', '8') c`, [JSON.stringify({ ...card('z', 4085, 1), serial: 7 })])).rows[0].c;
ok(up.serial === 7 && up.level === 8, 'Nâng cấp (jsonb_set level) giữ số');
const priv = (await db.query(`select has_function_privilege('authenticated', 'public.fco_inv_new_card(integer, integer, boolean)', 'execute') a, has_table_privilege('authenticated', 'public.fco_card_serials', 'update') b`)).rows[0];
ok(!priv.a && !priv.b, 'Người chơi không tự tạo thẻ / sửa dãy số');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');