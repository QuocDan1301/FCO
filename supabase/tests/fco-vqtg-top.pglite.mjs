// Kiểm tra 202611130007_fco_vqtg_top (Đua top nhận quà hot) trên PGlite: node fco-vqtg-top.pglite.mjs <thư mục dự án>
// (chạy từ thư mục có @electric-sql/pglite, vd. D:\FCOvv-tmp\pg).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz, encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}');
  create schema extensions; create extension pgcrypto schema extensions;
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
const dir = `${root}/supabase/migrations`;
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const f of files.slice(0, 2)) await db.exec(readFileSync(`${dir}/${f}`, 'utf8'));
const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-0000-0000-0000000000d${i}`);
const U = ids[0];
for (const [i, id] of ids.entries()) await db.query(`insert into auth.users(id, email) values ($1, $2)`, [id, `top${i}@players.fco.invalid`]);
for (const f of files.slice(2)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
async function as(sql, uid = U) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
for (const id of ids) await as('select public.fco_wallet()', id);
const setTickets = (id, n) => db.exec(`update public.fco_wallets set vqtg_tickets = ${n} where user_id = '${id}'`);

// Chưa ai có vé: bảng trống, mình chưa có hạng; quà 5 hạng.
let r = await as('select public.fco_vqtg_top()');
assert.deepEqual(r.top, []); assert.equal(r.me.rank, null);
assert.deepEqual(r.rewards.map(x => x.rank), [1, 2, 3, 4, 5]);

// 7 người có vé; chỉ hiện 5, xếp theo vé giảm dần; bằng vé thì ai đạt trước đứng trên.
await setTickets(ids[1], 300); await setTickets(ids[2], 120); await setTickets(ids[3], 500);
await setTickets(ids[4], 120); await setTickets(ids[5], 80); await setTickets(ids[6], 10); await setTickets(U, 20);
r = await as('select public.fco_vqtg_top()');
assert.deepEqual(r.top.map(x => x.tickets), [500, 300, 120, 120, 80]);
assert.deepEqual(r.top.map(x => x.rank), [1, 2, 3, 4, 5]);
assert.equal(r.top[2].name, 'top2'); assert.equal(r.top[3].name, 'top4');
assert.ok(r.top.every(x => !x.mine));
assert.deepEqual(r.me, { tickets: 20, rank: 6 });
// Vượt lên: mình lên hạng 2 và có cờ mine.
await setTickets(U, 400);
r = await as('select public.fco_vqtg_top()');
assert.equal(r.top[1].mine, true); assert.equal(r.me.rank, 2);
// Chơi thật cũng ghi thời điểm đạt vé (trigger).
await db.exec(`update public.fco_wallets set fc = 100 where user_id = '${ids[6]}'`);
const played = await as(`select public.fco_vqtg_play(1, 'fc')`, ids[6]);
const at = (await db.query(`select vqtg_tickets, vqtg_tickets_at from public.fco_wallets where user_id = '${ids[6]}'`)).rows[0];
assert.equal(at.vqtg_tickets, 10 + played.plays[0].tickets); assert.ok(at.vqtg_tickets_at);
console.log('fco-vqtg-top OK');
