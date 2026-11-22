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
ok(!errs.some(e => e.startsWith('20261122000')), 'Migration 202611220001 → 0005 chạy được ' + errs.filter(e => e.startsWith('20261122000')).join(' | '));
const ADMIN = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1', Q = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users(id, email) values ($1, 'ctpadmin@gmail.com'), ($2, 'ctpplayer@gmail.com'), ($3, 'ctpplayertwo@gmail.com')`, [ADMIN, P, Q]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [ADMIN]);
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
for (const u of [P, Q]) { await call(u, `public.fco_wallet_lock(auth.uid())`); }
await db.query(`update public.fco_wallets set fc = 100000 where user_id in ($1, $2)`, [P, Q]);
await db.query(`update public.fco_ctp_state set open = true where id = 1`);
await db.query(`update public.fco_ctp_race_rewards set rewards = '[]'`); // thử cả trường hợp chốt khi chưa có quà
const races = (await db.query(`select round, starts_at, ends_at from public.fco_ctp_races order by round`)).rows;
ok(races.length === 2 && new Date(races[0].ends_at).toISOString() === '2026-11-26T16:00:00.000Z' && new Date(races[1].starts_at).toISOString() === '2026-11-26T17:00:00.000Z' && new Date(races[1].ends_at).toISOString() === '2026-11-29T16:00:00.000Z', 'Đợt 1 hết 23h 26/11, đợt 2 từ 0h 27/11 tới 23h 29/11 (giờ VN)');
// đợt 1 đang chạy
await db.query(`update public.fco_ctp_races set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where round = 1`);
await db.query(`update public.fco_ctp_races set starts_at = now() + interval '2 hour', ends_at = now() + interval '3 hour' where round = 2`);
const a = (await call(P, `public.fco_ctp_play(10, 'fc')`)).r, b = (await call(Q, `public.fco_ctp_play(1, 'fc')`)).r;
const ptsP = a.plays.reduce((s, p) => s + p.points, 0), ptsQ = b.plays.reduce((s, p) => s + p.points, 0);
const t1 = (await call(P, `public.fco_ctp_top()`)).r.rounds;
ok(t1.length === 2 && t1[0].me.points === ptsP && t1[0].top[0].points === Math.max(ptsP, ptsQ) && t1[0].me.rank === (ptsP >= ptsQ ? 1 : 2) && !t1[0].ended, `Đợt 1: P ${ptsP} điểm, Q ${ptsQ} điểm, xếp hạng đúng`);
ok(t1[1].me.points === 0 && t1[1].top.length === 0, 'Đợt 2 chưa bắt đầu: chưa có điểm');
ok(t1[0].rewards.length === 5 && t1[0].rewards.every(r => r.rewards.length === 0), 'Quà 5 hạng đang trống (chờ người dùng gửi)');
// hết đợt 1 → chốt
await db.query(`update public.fco_ctp_races set ends_at = now() - interval '1 second' where round = 1`);
const before = (await call(P, `public.fco_ctp_play(1, 'fc')`)).r; // lượt sau giờ kết thúc không tính
const t2 = (await call(P, `public.fco_ctp_top()`)).r.rounds;
ok(t2[0].ended && t2[0].me.points === ptsP && t2[0].top.length === 2, 'Hết giờ: đợt 1 chốt, lượt sau giờ kết thúc không cộng');
const w = (await db.query(`select winners, settled_at from public.fco_ctp_races where round = 1`)).rows[0];
ok(w.settled_at && w.winners.length === 2 && w.winners.every(x => x.gifted === false), 'Người thắng lưu lại (chưa có quà nên chưa gửi)');
ok((await db.query(`select count(*)::int n from public.fco_admin_gifts`)).rows[0].n === 0, 'Không gửi quà rỗng');
// đợt 2 chạy + có quà
await db.query(`update public.fco_ctp_races set starts_at = now() - interval '1 minute', ends_at = now() + interval '1 hour' where round = 2`);
await db.query(`update public.fco_ctp_race_rewards set rewards = '[{"bp": 1000000}]' where round = 2 and rank = 1`);
await call(Q, `public.fco_ctp_play(10, 'fc')`);
await db.query(`update public.fco_ctp_races set ends_at = now() - interval '1 second' where round = 2`);
const t3 = (await call(Q, `public.fco_ctp_top()`)).r.rounds;
ok(t3[1].ended && t3[1].top[0].mine && t3[1].top.length === 1, 'Đợt 2 tính riêng: chỉ Q chơi trong đợt 2');
ok((await db.query(`select count(*)::int n from public.fco_admin_gifts where user_id = $1`, [Q])).rows[0].n === 1, 'Top 1 đợt 2 nhận quà qua Quà từ Admin');
await call(Q, `public.fco_ctp_top()`);
ok((await db.query(`select count(*)::int n from public.fco_admin_gifts`)).rows[0].n === 1, 'Chốt 1 lần, không gửi lại');
await call(ADMIN, `public.fco_admin_account_reset($1, false)`, [P]);
ok((await db.query(`select count(*)::int n from public.fco_ctp_race_points where user_id = $1`, [P])).rows[0].n === 0, 'Reset xoá điểm đua top');
const priv = (await db.query(`select has_function_privilege('authenticated', 'public.fco_ctp_top()', 'execute') a, has_function_privilege('anon', 'public.fco_ctp_top()', 'execute') b, has_function_privilege('authenticated', 'public.fco_ctp_race_tick()', 'execute') c, has_function_privilege('authenticated', 'public.fco_ctp_race_add(uuid, integer)', 'execute') d`)).rows[0];
ok(priv.a && !priv.b && !priv.c && !priv.d, 'Quyền: chỉ xem bảng mở cho người chơi');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');