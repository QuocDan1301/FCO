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
ok(!errs.some(e => e.startsWith('20261122000')), 'Migration 202611220001 + 202611220002 chạy được');
const ADMIN = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1';
await db.query(`insert into auth.users(id, email) values ($1, 'ctpadmin@gmail.com'), ($2, 'ctpplayer@gmail.com')`, [ADMIN, P]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [ADMIN]);
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
await call(P, `public.fco_wallet_lock(auth.uid())`);
await db.query(`update public.fco_wallets set fc = 100000 where user_id = $1`, [P]);
await db.query(`update public.fco_ctp_state set open = true where id = 1`);
const cfg = (await call(P, `public.fco_ctp_config()`)).r;
ok(cfg.milestones.length === 36 && cfg.round === 1800 && cfg.milestones.filter(m => m.special).length === 12, '36 mốc, vòng 1.800 điểm, 12 mốc đặc biệt');
const M = cfg.milestones;
ok(M[0].points === 1 && M[0].once && M[0].paidOnly && M[7].options.length === 3 && M[24].points === 9000 && M[26].options[0].some(r => r.ctpBadge === 1), 'Mốc 1 once + paid, mốc 200 có 3 lựa chọn, mốc 12.600 có Huy Hiệu');
await db.query(`update public.fco_wallets set ctp_points = 5 where user_id = $1`, [P]);
ok((await call(P, `public.fco_ctp_claim(0, '{0}')`)).e?.includes('FCO_MILESTONE_PAID_ONLY'), 'Mốc 1 điểm cần lượt trả FC');
await call(P, `public.fco_ctp_play(1, 'fc')`);
await db.query(`update public.fco_wallets set ctp_points = 5 where user_id = $1`, [P]);
const c0 = (await call(P, `public.fco_ctp_claim(0, '{0}')`)).r;
ok(c0 && c0.rewards.some(r => r.pack === 'ctpm-1-1') && c0.rewards.some(r => r.voucher === 30), 'Nhận mốc 1: gói + phiếu 30% ' + JSON.stringify(c0?.rewards));
ok((await call(P, `public.fco_ctp_claim(0, '{0}')`)).e?.includes('FCO_MILESTONE_CLAIMED'), 'Mốc 1 chỉ 1 lần');
ok((await call(P, `public.fco_ctp_claim(1, '{0}')`)).e?.includes('FCO_MILESTONE_LOCKED'), 'Chưa đủ 15 điểm thì khoá');
await db.query(`update public.fco_wallets set ctp_points = 200 + 1800 * 2 where user_id = $1`, [P]);
const many = (await call(P, `public.fco_ctp_claim(7, '{0,1,2}')`)).r;
ok(many && many.count === 3 && many.rewards.find(r => r.ctpCard === 'chance')?.count === 3 && many.rewards.find(r => r.bp)?.bp === 30000000 && many.rewards.find(r => r.voucher === 30)?.count === 3,
  'Mốc 200 đủ 3 vòng: chọn nhanh 3 lượt, gộp 3 Thẻ Cơ Hội / 30 tr BP / 3 phiếu ' + JSON.stringify(many?.rewards));
ok((await call(P, `public.fco_ctp_claim(7, '{0}')`)).e?.includes('FCO_MILESTONE_CLAIMED'), 'Hết lượt mốc 200 trong 3 vòng');
ok((await call(P, `public.fco_ctp_claim(7, '{5}')`)).e != null, 'Lựa chọn ngoài danh sách bị chặn');
const wj = (await call(P, `public.fco_wallet_json(auth.uid())`)).r.ctp;
ok(wj.cards.chance === 3 && wj.cards.luck === 0 && wj.badges === 0 && wj.claimed[7] === 3 && wj.claimed[0] === 1 && wj.paid === true, 'Ví: 3 Thẻ Cơ Hội, đã nhận mốc 1 và 200×3 ' + JSON.stringify(wj));
// đặc biệt
const sp = M.findIndex(m => m.points === 12600 && m.options[0].some(r => r.ctpBadge));
await db.query(`update public.fco_wallets set ctp_points = 12000, ctp_claimed = '{}' where user_id = $1`, [P]);
ok((await call(P, `public.fco_ctp_claim($1, '{0}')`, [sp])).e?.includes('FCO_MILESTONE_LOCKED'), 'Mốc đặc biệt 12.600: chưa đủ điểm thì khoá');
await db.query(`update public.fco_wallets set ctp_points = 13000 where user_id = $1`, [P]);
ok((await call(P, `public.fco_ctp_claim($1, '{0}')`, [sp])).e?.includes('FCO_MILESTONE_LOCKED'), 'Đủ điểm nhưng chưa nhận quà mốc thường nào thì khoá');
await call(P, `public.fco_ctp_claim(1, '{0}')`);
const b = (await call(P, `public.fco_ctp_claim($1, '{0}')`, [sp])).r;
ok(b && (await call(P, `public.fco_wallet_json(auth.uid())`)).r.ctp.badges === 1 && b.rewards.some(r => r.voucher === 40), 'Nhận mốc đặc biệt: +1 Huy Hiệu Tuyển Chọn, phiếu 40%');
ok((await call(P, `public.fco_ctp_claim($1, '{0}')`, [sp])).e?.includes('FCO_MILESTONE_CLAIMED'), 'Mốc đặc biệt chỉ 1 lần');
// phiếu 35/40 bán được
const src = (await db.query(`select prosrc from pg_proc where proname = 'fco_mkt_sell'`)).rows[0].prosrc;
ok(src.includes('(10, 20, 30, 35, 40)'), 'Bán thẻ nhận phiếu 35% / 40%');
const priv = (await db.query(`select has_function_privilege('authenticated', 'public.fco_ctp_claim(integer, integer[])', 'execute') a, has_function_privilege('anon', 'public.fco_ctp_claim(integer, integer[])', 'execute') b, has_function_privilege('authenticated', 'public.fco_ctp_reached(public.fco_ctp_milestones, integer, integer[])', 'execute') c`)).rows[0];
ok(priv.a && !priv.b && !priv.c, 'Quyền: người chơi gọi fco_ctp_claim, khách không; hàm nội bộ khoá');
await call(ADMIN, `public.fco_admin_account_reset($1, false)`, [P]);
const wr = (await db.query(`select ctp_claimed, ctp_card_chance, ctp_badges from public.fco_wallets where user_id = $1`, [P])).rows[0];
ok(wr.ctp_claimed.length === 0 && wr.ctp_card_chance === 0 && wr.ctp_badges === 0, 'Reset xoá mốc / thẻ / huy hiệu');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');