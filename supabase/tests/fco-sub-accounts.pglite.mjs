// Acc phụ (202611220017_fco_sub_accounts.sql): node fco-sub-accounts.pglite.mjs <thư mục dự án>
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
const root = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text unique, created_at timestamptz not null default now(), banned_until timestamptz,
    encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
    email_confirmed_at timestamptz, last_sign_in_at timestamptz, confirmation_token text, email_change_token_new text, recovery_token text);
  create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
    identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
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
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 160)); try { await db.exec('rollback'); } catch {} }
}
console.log('migration lỗi (bỏ qua):', errs.join(' | ') || 'không');
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
const err = async (sql, args = []) => { try { await db.query(sql, args); return null; } catch (e) { return e.message; } };
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
ok(!errs.some(e => e.startsWith('202611220017')), 'Migration 202611220017 chạy được ' + errs.filter(e => e.startsWith('202611220017')).join(' | '));

const A = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1', Q = '00000000-0000-0000-0000-0000000000b2';
await db.query(`insert into auth.users(id, email) values ($1, 'subadminacc@gmail.com'), ($2, 'subplayerpp@gmail.com'), ($3, 'subplayerqq@gmail.com')`, [A, P, Q]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [A]);
for (const u of [A, P, Q]) await db.query(`select public.fco_wallet_lock($1)`, [u]);

// Tạo acc phụ
await as(P);
ok((await err(`select public.fco_admin_sub_create('sukien01', 'matkhau123')`))?.includes('FCO_ADMIN_ONLY'), 'người chơi thường không tạo được acc phụ');
await as(A);
const made = (await db.query(`select public.fco_admin_sub_create('SuKien01', 'matkhau123', 'Đập Thẻ 1', 'livestream') r`)).rows[0].r;
const S = made.id;
ok(made.login === 'sukien01' && made.name === 'Đập Thẻ 1', `tạo được acc phụ ${JSON.stringify(made)}`);
const u = (await db.query(`select email, email_confirmed_at is not null c, encrypted_password = extensions.crypt('matkhau123', encrypted_password) pw, aud, role from auth.users where id = $1`, [S])).rows[0];
ok(u.email === 'sukien01@players.fco.invalid' && u.c && u.pw && u.aud === 'authenticated', `auth.users đúng: đăng nhập bằng tên, đã xác nhận, mật khẩu khớp (${JSON.stringify(u)})`);
ok(Number((await db.query(`select count(*) c from auth.identities where user_id = $1 and provider = 'email' and provider_id = $1::text`, [S])).rows[0].c) === 1, 'có identity email');
ok((await db.query(`select name from public.fco_display_names where user_id = $1`, [S])).rows[0]?.name === 'Đập Thẻ 1', 'tên HLV = tên admin nhập');
ok((await err(`select public.fco_admin_sub_create('sukien01', 'matkhau123')`))?.includes('FCO_SUB_TAKEN'), 'trùng tên đăng nhập bị chặn');
ok((await err(`select public.fco_admin_sub_create('ab', 'matkhau123')`))?.includes('FCO_SUB_LOGIN'), 'tên đăng nhập sai bị chặn');
ok((await err(`select public.fco_admin_sub_create('sukien02', '123')`))?.includes('FCO_BAD_PASSWORD'), 'mật khẩu ngắn bị chặn');
ok((await err(`select public.fco_admin_sub_create('sukien03', 'matkhau123', 'Đập Thẻ 1')`))?.includes('FCO_NAME_TAKEN'), 'tên HLV trùng bị chặn');
const S2 = (await db.query(`select public.fco_admin_sub_create('sukien02', 'matkhau123') r`)).rows[0].r.id;
ok((await db.query(`select name from public.fco_display_names where user_id = $1`, [S2])).rows[0]?.name === 'sukien02', 'không nhập tên HLV thì dùng tên đăng nhập');
await as(null);
ok((await err(`insert into auth.users(id, email) values (gen_random_uuid(), 'tudangky@players.fco.invalid')`))?.includes('FCO_GMAIL_ONLY'), 'đăng ký thẳng tên đăng nhập (không qua admin) vẫn bị chặn');
ok((await err(`insert into auth.users(id, email) values (gen_random_uuid(), 'nguoimoidangky@gmail.com')`)) === null, 'đăng ký Gmail bình thường vẫn được');
await db.query(`select public.fco_wallet_lock($1)`, [S]);

// Không ghi dữ liệu acc phụ
const cnt = async (t, uid) => Number((await db.query(`select count(*) c from public.${t} where user_id = $1`, [uid])).rows[0].c);
await as(S);
await db.query(`insert into public.fco_ranks(user_id, best_ovr, best_at) values ($1, 140, now())`, [S]);
await db.query(`insert into public.fco_live_feed(kind, user_id, text) values ('upgrade', $1, 'acc phụ đập +10')`, [S]);
await db.query(`insert into public.fco_plus8(user_id, player_id) values ($1, 4100)`, [S]);
await db.query(`insert into public.fco_play_days(user_id, day, seconds) values ($1, current_date, 60)`, [S]);
await db.query(`insert into public.fco_devices(user_id, device, ip) values ($1, 'dev-1', '1.1.1.1')`, [S]);
ok(await cnt('fco_ranks', S) === 0 && await cnt('fco_live_feed', S) === 0 && await cnt('fco_plus8', S) === 0 && await cnt('fco_play_days', S) === 0 && await cnt('fco_devices', S) === 0,
  'acc phụ: BXH, tin LIVE, Đập +8, giờ chơi, thiết bị đều không ghi');
ok((await db.query(`select public.fco_leaderboard() r`)).rows[0].r.ovr.length === 0, 'BXH đập thẻ không có acc phụ');
// Chặn
ok((await err(`insert into public.fco_mkt_orders(user_id, side, player_id, level, price) values ($1, 'buy', 4100, 1, 1000)`, [S]))?.match(/FCO_SUB_(ACCOUNT|MARKET)/), 'chợ: đặt lệnh chờ bị chặn');
ok((await err(`insert into public.fco_mkt_sys_sold(player_id, level, minute, sold) values (4100, 1, 1, 1)`))?.includes('FCO_SUB_ACCOUNT'), 'chợ: mua từ hệ thống bị chặn');
ok((await err(`insert into public.fco_ranked(user_id) values ($1)`, [S]))?.includes('FCO_SUB_ACCOUNT'), 'GLXH bị chặn');
ok((await err(`update public.fco_wallets set vqtg_pos = 3 where user_id = $1`, [S]))?.includes('FCO_SUB_ACCOUNT'), 'VQTG bị chặn');
await db.exec(`update public.fco_ctp_state set open = true where id = 1`);
await db.query(`select public.fco_apply_fc($1, 100000, 'admin_gift', '{}')`, [S]);
// Cờ tỷ phú (202611220019): acc phụ chơi được nhưng không đụng jackpot chung. Ép tỷ lệ nổ 100% để chắc chắn.
await db.exec(`alter function public.fco_ctp_rules() rename to fco_ctp_rules_orig;
  create function public.fco_ctp_rules() returns jsonb language sql stable as $$ select public.fco_ctp_rules_orig() || '{"ultimateChance":1,"miniChance":1}'::jsonb $$;
  update public.fco_jackpot set pot = 500000, feed = '[]' where id = 1;`);
const jp = async () => (await db.query(`select pot, jsonb_array_length(feed) n from public.fco_jackpot where id = 1`)).rows[0];
const ctpOne = await err(`select public.fco_ctp_play(1, 'fc')`);
ok(ctpOne === null, `acc phụ chơi Cờ tỷ phú bằng FC được (${ctpOne})`);
ok(Number((await db.query(`select fc from public.fco_wallets where user_id = $1`, [S])).rows[0].fc) < 100000, 'trừ FC lượt chơi');
await db.query(`update public.fco_wallets set ctp_free = 300 where user_id = $1`, [S]);
const pot0 = Number((await jp()).pot);
let landed = 0, jackpots = 0;
for (let i = 0; i < 3; i++) {
  const r = (await db.query(`select public.fco_ctp_play(100, 'free') r`)).rows[0].r;
  for (const p of r.plays) { if ([7, 21].includes(p.to)) landed++; if (p.reward?.jackpot) jackpots++; }
}
const j1 = await jp();
ok(landed === 0 && jackpots === 0, `300 lượt: acc phụ không dừng ô 7 / 21, không trúng jackpot (dừng ${landed}, trúng ${jackpots})`);
ok(Number(j1.pot) === pot0 && Number(j1.n) === 0, `quỹ jackpot chung không đổi (${pot0} → ${j1.pot}), bảng tin jackpot trống`);
ok(await cnt('fco_ctp_race_points', S) === 0, 'không có điểm đua top Cờ tỷ phú');
await as(Q);
await db.query(`select public.fco_wallet_lock($1)`, [Q]);
await db.query(`update public.fco_wallets set ctp_free = 100 where user_id = $1`, [Q]);
const rq = (await db.query(`select public.fco_ctp_play(100, 'free') r`)).rows[0].r;
ok(rq.plays.some(p => p.reward?.jackpot) && Number((await jp()).n) > 0, 'người chơi thường vẫn trúng jackpot như cũ (đối chứng)');
await db.exec(`drop function public.fco_ctp_rules(); alter function public.fco_ctp_rules_orig() rename to fco_ctp_rules;`);
await as(S);
ok((await err(`update public.fco_wallets set vqtg_pos = 3 where user_id = $1`, [S]))?.includes('FCO_SUB_ACCOUNT'), 'VQTG (đang ẩn) vẫn chặn');
ok((await err(`select public.fco_apply_fc($1, 5000, 'admin', '{}')`, [S]))?.includes('FCO_SUB_TOPUP'), 'admin "nạp" FC cho acc phụ bị chặn');
ok((await err(`select public.fco_apply_fc($1, 5000, 'admin_gift', '{}')`, [S])) === null, 'admin tặng FC cho acc phụ được');
ok((await err(`select public.fco_apply_fc($1, -5000, 'admin', '{}')`, [S])) === null, 'admin sửa nạp nhầm (trừ) vẫn được');
await as(A);
ok((await err(`update public.fco_wallets set ctp_pos = 28, ctp_first_done = false where user_id = $1`, [S])) === null, 'admin sửa ví acc phụ vẫn được');

// Đánh dấu tài khoản có sẵn
await as(P);
await db.query(`insert into public.fco_ranks(user_id, best_ovr, best_at) values ($1, 150, now())`, [P]);
await db.query(`insert into public.fco_plus8(user_id, player_id) values ($1, 4101)`, [P]);
await db.query(`insert into public.fco_live_feed(kind, user_id, text) values ('upgrade', $1, 'P đập')`, [P]);
await db.query(`insert into public.fco_ranked(user_id) values ($1)`, [P]);
ok(await cnt('fco_ranks', P) === 1 && await cnt('fco_ranked', P) === 1, 'người chơi thường vẫn ghi BXH / GLXH');
await db.query(`insert into public.fco_mkt_orders(user_id, side, player_id, level, price, status) values ($1, 'buy', 4100, 1, 1000, 'open')`, [P]);
await as(A);
ok((await err(`select public.fco_admin_sub_set($1, true)`, [P]))?.includes('FCO_SUB_OPEN_ORDERS'), 'còn lệnh chợ đang mở thì chưa đánh dấu được');
await db.query(`update public.fco_mkt_orders set status = 'cancelled' where user_id = $1`, [P]);
const set = (await db.query(`select public.fco_admin_sub_set($1, true) r`, [P])).rows[0].r;
ok(set.sub && set.purged.ranks === 1 && set.purged.plus8 === 1 && set.purged.feed >= 1 && await cnt('fco_live_feed', P) === 0 && set.purged.ranked === 1, `đánh dấu xoá kỷ lục cũ ${JSON.stringify(set.purged)}`);
ok((await err(`select public.fco_admin_sub_set($1, true)`, [A]))?.includes('FCO_SUB_ADMIN'), 'không đánh dấu tài khoản admin');
const list = (await db.query(`select public.fco_admin_accounts(null, 'new', 50, 0, 'sub') r`)).rows[0].r;
ok(list.matched === 3 && list.accounts.every(a => a.sub === true), `lọc Acc phụ ra 3 tài khoản (${list.matched})`);
const all = (await db.query(`select public.fco_admin_accounts() r`)).rows[0].r;
ok(all.accounts.find(a => a.id === Q)?.sub === false, 'tài khoản thường có sub = false');
await db.query(`select public.fco_admin_sub_set($1, false)`, [P]);
await as(P);
await db.query(`insert into public.fco_ranks(user_id, best_ovr, best_at) values ($1, 151, now())`, [P]);
ok(await cnt('fco_ranks', P) === 1, 'bỏ đánh dấu thì tính lại bình thường');
await as(Q);
ok((await err(`select public.fco_admin_sub_set($1, true)`, [P]))?.includes('FCO_ADMIN_ONLY'), 'người chơi thường không đánh dấu được');
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);
