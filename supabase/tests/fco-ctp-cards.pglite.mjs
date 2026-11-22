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
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 160)); try { await db.exec('rollback'); } catch {} }
}
console.log('migration lỗi (bỏ qua):', errs.join(' | ') || 'không');
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('20261122000')), 'Migration 202611220001 → 0003 chạy được ' + errs.filter(e => e.startsWith('20261122000')).join(' | '));
const ADMIN = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1';
await db.query(`insert into auth.users(id, email) values ($1, 'ctpadmin@gmail.com'), ($2, 'ctpplayer@gmail.com')`, [ADMIN, P]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [ADMIN]);
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
const w = async () => (await db.query(`select * from public.fco_wallets where user_id = $1`, [P])).rows[0];
await call(P, `public.fco_wallet_lock(auth.uid())`);
await db.query(`update public.fco_wallets set fc = 100000 where user_id = $1`, [P]);
await db.query(`update public.fco_ctp_state set open = true where id = 1`);
// không thẻ
ok((await call(P, `public.fco_ctp_play(1, 'fc', true, null)`)).e?.includes('FCO_CTP_NO_CARD'), 'Không có Thẻ Cơ Hội thì không dùng được');
ok((await call(P, `public.fco_ctp_play(1, 'fc', false, '{orange,green,red}')`)).e?.includes('FCO_CTP_NO_CARD'), 'Không có Thẻ Khí Vận thì không dùng được');
ok((await call(P, `public.fco_ctp_play(1, 'fc')`)).r?.paid === 10, 'Chơi thường (2 tham số) vẫn chạy, lượt đầu 10 FC');
await db.query(`update public.fco_wallets set ctp_card_chance = 2, ctp_card_luck = 2 where user_id = $1`, [P]);
ok((await call(P, `public.fco_ctp_play(1, 'fc', false, '{orange,green}')`)).e?.includes('FCO_CTP_BAD_EXCLUDE'), 'Phải bỏ đúng 3 màu');
ok((await call(P, `public.fco_ctp_play(1, 'fc', false, '{orange,green,blue}')`)).e?.includes('FCO_CTP_BAD_EXCLUDE'), 'Màu không có thật bị chặn');
// Khí Vận: 50 lượt chỉ trúng 5 dải còn lại
const ex = ['yellow', 'white', 'cyan'];
const k = (await call(P, `public.fco_ctp_play(50, 'fc', false, $1)`, [ex])).r;
const rails = k.plays.filter(p => p.rail).map(p => p.rail);
ok(k.paid === 900 && rails.length > 0 && rails.every(r => !ex.includes(r)), `Khí Vận: ${rails.length} cú sút không trúng Vàng / Trắng / Xanh ngọc`);
ok((await w()).ctp_card_luck === 1, 'Trừ 1 Thẻ Khí Vận cho cả lần bấm 50 lượt');
// Cơ Hội: chờ chọn
const before = await w();
const c = (await call(P, `public.fco_ctp_play(10, 'fc', true, null)`)).r;
ok(c && c.pending && c.pending.outcomes.length === 2 && c.paid === 190 && c.pending.outcomes.every(o => o.plays.filter(p => !p.bonus).length === 10), 'Cơ Hội: trả 190 FC, nhận 2 bộ quà A / B mỗi bộ 10 lượt');
const mid = await w();
ok(mid.ctp_card_chance === 1 && mid.ctp_pos === before.ctp_pos && mid.ctp_points === before.ctp_points && Number(mid.fc) === Number(before.fc) - 190, 'Chưa chọn: trừ thẻ + FC, chưa đổi ô / điểm');
ok((await call(P, `public.fco_wallet_json(auth.uid())`)).r.ctp.pending === true, 'Ví báo đang chờ chọn');
ok((await call(P, `public.fco_ctp_play(1, 'fc')`)).e?.includes('FCO_CTP_PENDING'), 'Đang chờ chọn thì không chơi tiếp được');
const pend = (await call(P, `public.fco_ctp_pending()`)).r;
ok(pend && pend.count === 10 && pend.outcomes.length === 2, 'Xem lại lượt chờ chọn');
const B = pend.outcomes[1];
const pick = (await call(P, `public.fco_ctp_pick(1)`)).r;
const after = await w();
ok(pick && after.ctp_pos === B.pos && after.ctp_points === before.ctp_points + B.ptsWon && JSON.stringify(pick.plays.map(p => p.to)) === JSON.stringify(B.plays.map(p => p.to)), 'Chọn bộ B: ô, điểm, đường đi đúng bộ B');
ok((await call(P, `public.fco_ctp_pick(0)`)).e?.includes('FCO_CTP_NO_PENDING'), 'Không chọn lại được');
ok((await call(P, `public.fco_ctp_pending()`)).r === null, 'Hết lượt chờ');
// Dùng cả 2 thẻ
const both = (await call(P, `public.fco_ctp_play(10, 'fc', true, '{pink,white,purple}')`)).r;
ok(both.pending.exclude.length === 3 && both.pending.outcomes.every(o => o.plays.filter(p => p.rail).every(p => !['pink', 'white', 'purple'].includes(p.rail))), 'Dùng cùng lúc 2 thẻ: cả 2 bộ đều bỏ 3 màu');
const wb = await w(); ok(wb.ctp_card_chance === 0 && wb.ctp_card_luck === 0, 'Trừ mỗi loại 1 thẻ');
await call(P, `public.fco_ctp_pick(0)`);
// reset xoá chờ chọn
await db.query(`update public.fco_wallets set ctp_card_chance = 1 where user_id = $1`, [P]);
await call(P, `public.fco_ctp_play(1, 'fc', true, null)`);
await call(ADMIN, `public.fco_admin_account_reset($1, false)`, [P]);
ok((await db.query(`select count(*)::int n from public.fco_ctp_pending`)).rows[0].n === 0, 'Reset xoá lượt chờ chọn');
const priv = (await db.query(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') b from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'fco_ctp_%' order by 1`)).rows;
console.log(priv.map(r => `${r.proname}:${r.a}/${r.b}`).join(' '));
const open = ['fco_ctp_config', 'fco_ctp_play', 'fco_ctp_mission_accept', 'fco_ctp_mission_claim', 'fco_ctp_claim', 'fco_ctp_pick', 'fco_ctp_pending', 'fco_ctp_draft', 'fco_ctp_top'];
ok(priv.every(r => !r.b && r.a === open.includes(r.proname)), 'Quyền: chỉ các hàm chơi / xem mở cho người chơi');
ok(priv.filter(r => r.proname === 'fco_ctp_play').length === 1, 'Chỉ còn 1 bản fco_ctp_play');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');