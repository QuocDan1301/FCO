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
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  // Bỏ bước chặn 'chưa đồng bộ gói ctp-*' (máy thử không có dữ liệu kho thẻ).
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.startsWith('202611220004')) { // giá giả: cầu thủ id i, cấp l → (i % 97 + 1) × 10 triệu × l
    const ids = [...text.matchAll(/\((\d+),(\d+)\)/g)].map(m => +m[1]);
    for (let k = 0; k < ids.length; k += 500) await db.exec('insert into public.fco_cat_players(id, name, ovrs, prices, fixed, insurance) values ' + ids.slice(k, k + 500).map(id => `(${id}, 'P${id}', array[100,101,102,103,104,105,106,107,108,109,110,111,112], array[${Array.from({ length: 13 }, (_, l) => (id % 97 + 1) * 10000000 * (l + 1)).join(',')}]::bigint[], true, 0)`).join(',') + ' on conflict do nothing');
  }
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 160)); try { await db.exec('rollback'); } catch {} }
}
console.log('migration lỗi (bỏ qua):', errs.join(' | ') || 'không');
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('20261122000')), 'Migration 202611220001 → 0004 chạy được ' + errs.filter(e => e.startsWith('20261122000')).join(' | '));
const ADMIN = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1';
await db.query(`insert into auth.users(id, email) values ($1, 'ctpadmin@gmail.com'), ($2, 'ctpplayer@gmail.com')`, [ADMIN, P]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [ADMIN]);
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
await call(P, `public.fco_wallet_lock(auth.uid())`);
await db.query(`insert into public.fco_game_saves(user_id, data, revision) values ($1, '{"version":1,"balance":0,"cards":[],"history":[],"inv":"1"}', 1) on conflict (user_id) do nothing`, [P]);
await db.query(`update public.fco_ctp_state set open = true where id = 1`);
const pool = (await db.query(`select player_id, level from public.fco_ctp_draft_pool order by player_id`)).rows;
ok(pool.length > 2000 && pool.every(r => r.level >= 1 && r.level <= 12), 'Danh sách Tuyển chọn ' + pool.length + ' cầu thủ');
// rẻ: id % 97 nhỏ
const cheap = pool.filter(r => r.player_id % 97 < 3).slice(0, 12).map(r => r.player_id);
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 10)])).e?.includes('FCO_CTP_NO_BADGE'), 'Không có huy hiệu thì không tuyển chọn được');
await db.query(`update public.fco_wallets set ctp_badges = 5 where user_id = $1`, [P]);
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 9)])).e?.includes('FCO_CTP_DRAFT_SIZE'), 'Lượt 1 phải đủ 10 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [[...cheap.slice(0, 9), cheap[0]]])).e?.includes('FCO_CTP_DRAFT_SIZE'), 'Không trùng người');
ok((await call(P, `public.fco_ctp_draft($1)`, [[...cheap.slice(0, 9), 99999999]])).e?.includes('FCO_CTP_DRAFT_PLAYER'), 'Cầu thủ ngoài danh sách bị chặn');
const dear = pool.filter(r => r.player_id % 97 > 90 && r.level >= 11).slice(0, 10).map(r => r.player_id);
ok((await call(P, `public.fco_ctp_draft($1)`, [dear])).e?.includes('FCO_CTP_DRAFT_CAP'), 'Tổng quá 6 tỷ BP bị chặn');
const d1 = (await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 10)])).r;
ok(d1 && cheap.slice(0, 10).includes(d1.playerId) && d1.chances.length === 10 && Math.abs(d1.chances.reduce((s, c) => s + Number(c.chance), 0) - 1) < 1e-3, 'Lượt 1: nhận 1 trong 10, tổng tỷ lệ = 100%');
const c = d1.chances.sort((a, b) => a.price - b.price); ok(Number(c[0].chance) >= Number(c.at(-1).chance), 'Người rẻ hơn tỷ lệ cao hơn');
ok(d1.save.data.cards[0].playerId === d1.playerId && d1.wallet.ctp.badges === 4 && d1.wallet.ctp.draftOpened === 1, 'Thẻ vào kho, trừ 1 huy hiệu, lượt mở = 1');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 10)])).e?.includes('FCO_CTP_DRAFT_SIZE'), 'Lượt 2 phải đúng 9 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 9)])).r?.playerId, 'Lượt 2: 9 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 7)])).r?.playerId, 'Lượt 3: 7 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 5)])).r?.playerId, 'Lượt 4: 5 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 5)])).r?.playerId, 'Lượt 5 vẫn 5 người');
ok((await call(P, `public.fco_ctp_draft($1)`, [cheap.slice(0, 5)])).e?.includes('FCO_CTP_NO_BADGE'), 'Hết huy hiệu');
// tần suất: 2 người giá 1 : 3 → tỷ lệ ~75% : 25%
const a = pool.find(r => r.player_id % 97 === 0 && r.level === 10).player_id, b = pool.find(r => r.player_id % 97 === 2 && r.level === 10).player_id;
let hitA = 0;
for (let k = 0; k < 200; k++) { await db.query(`update public.fco_wallets set ctp_badges = 1, ctp_draft_count = 3 where user_id = $1`, [P]); const others = pool.filter(r => r.level === 10 && r.player_id % 97 === 0 && r.player_id !== a).slice(0, 4).map(r => r.player_id); const r = (await call(P, `public.fco_ctp_draft($1)`, [[a, ...others]])).r; if (r?.playerId === a) hitA++; }
ok(hitA > 20 && hitA < 70, `5 người cùng giá: người A ra ${hitA}/200 (~20%)`);
await call(ADMIN, `public.fco_admin_account_reset($1, false)`, [P]);
ok((await db.query(`select ctp_draft_count from public.fco_wallets where user_id = $1`, [P])).rows[0].ctp_draft_count === 0, 'Reset về lượt mở 1');
const priv = (await db.query(`select has_function_privilege('authenticated', 'public.fco_ctp_draft(integer[])', 'execute') a, has_function_privilege('anon', 'public.fco_ctp_draft(integer[])', 'execute') b, has_table_privilege('authenticated', 'public.fco_ctp_draft_pool', 'select') c`)).rows[0];
ok(priv.a && !priv.b && !priv.c, 'Quyền: người chơi gọi được, khách không; bảng danh sách khoá');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');