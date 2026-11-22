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
ok(!errs.some(e => e.startsWith('202611220001')), 'Migration 202611220001_fco_ctp.sql chạy được');
const ADMIN = '00000000-0000-0000-0000-0000000000a1', P = '00000000-0000-0000-0000-0000000000b1';
await db.query(`insert into auth.users(id, email) values ($1, 'ctpadmin@gmail.com'), ($2, 'ctpplayer@gmail.com')`, [ADMIN, P]);
await db.query(`insert into public.fco_admins(user_id) values ($1)`, [ADMIN]);
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const call = async (uid, sql, params = []) => { await as(uid); try { return { r: (await db.query(`select ${sql} as r`, params)).rows[0].r }; } catch (e) { return { e: e.message } } };
const wallet = async uid => (await db.query(`select * from public.fco_wallets where user_id = $1`, [uid])).rows[0];
await call(P, `public.fco_wallet_json(auth.uid())`); await call(ADMIN, `public.fco_wallet_json(auth.uid())`);
await call(P, `public.fco_wallet_lock(auth.uid())`); await call(ADMIN, `public.fco_wallet_lock(auth.uid())`);
await db.query(`update public.fco_wallets set fc = 1000000 where user_id in ($1, $2)`, [ADMIN, P]);

ok((await call(P, `public.fco_ctp_play(1, 'fc')`)).e?.includes('FCO_EVENT_CLOSED'), 'Sự kiện đóng: người chơi không chơi được');
const w0 = (await call(P, `public.fco_wallet_json(auth.uid())`)).r;
ok(w0.ctp && w0.ctp.pos === 28 && w0.ctp.free === 0 && w0.ctp.firstDone === false && w0.ctp.mission === 'none', 'Ví có ctp: đứng ô 28 (LUCKY), chưa chơi ' + JSON.stringify(w0.ctp));
const first = (await call(ADMIN, `public.fco_ctp_play(1, 'fc')`)).r;
ok(first && first.paid === 10, 'Admin chơi thử khi đóng; lượt đầu tiên 10 FC: ' + first?.paid);
const second = (await call(ADMIN, `public.fco_ctp_play(1, 'fc')`)).r;
ok(second.paid === 20, 'Lượt sau 20 FC');
for (const [n, p] of [[10, 190], [50, 900], [100, 1800]]) ok((await call(ADMIN, `public.fco_ctp_play($1, 'fc')`, [n])).r?.paid === p, `${n} lượt = ${p} FC`);
ok((await call(ADMIN, `public.fco_ctp_play(5, 'fc')`)).e?.includes('FCO_BAD_COUNT'), '5 lượt không có trong bảng giá');
await db.query(`update public.fco_ctp_state set open = true where id = 1`);
const pot0 = Number((await db.query(`select pot from public.fco_jackpot where id = 1`)).rows[0].pot);
const big = (await call(P, `public.fco_ctp_play(100, 'fc')`)).r;
ok(big && big.paid === 1800, 'Mở sự kiện: người chơi chơi 100 lượt (lượt đầu chỉ giảm khi mua 1 lượt) ' + (big?.paid ?? ''));
const plays = big.plays;
const main = plays.filter(p => !p.bonus);
ok(main.length === 100, '100 lượt chính, thêm ' + (plays.length - 100) + ' bước Special');
let pos = 28, okPath = true, okPts = true, okKind = true;
for (const p of plays) {
  if (p.from !== pos) okPath = false;
  if (p.to !== (pos + p.steps - 1) % 28 + 1 || p.steps !== p.roll + (p.roll === 6 ? 1 : 0)) okPath = false;
  if (p.points !== [1, 1, 2, 3, 3, 4][p.roll - 1] * (p.double ? 2 : 1)) okPts = false;
  const k = { 7: 'mini', 14: 'special', 21: 'ultimate', 28: 'lucky' }[p.to] ?? 'ball';
  if (p.kind !== k) okKind = false;
  pos = p.to;
}
ok(okPath, 'Đường đi đúng: from = ô trước, đi số lắc (+1 khi ra 6), vòng 28 ô');
ok(okPts && big.points === plays.reduce((s, p) => s + p.points, 0), 'Điểm theo bảng 1,1,2,3,3,4 (×2 sau Special), tổng ' + big.points);
ok(okKind, 'Loại ô đúng 7 mini / 14 special / 21 ultimate / 28 lucky');
const specials = plays.map((p, i) => [p, plays[i + 1]]).filter(([p]) => p.kind === 'special');
ok(specials.every(([p, n]) => p.reward === null && n && n.bonus && n.double), 'Special: không quà, bước kế tiếp là bước thưởng ×2 (' + specials.length + ' lần)');
ok(plays.filter(p => p.kind === 'ball').every(p => p.reward && p.rail && p.slot >= 0 && p.slot <= 4), 'Ô bóng luôn có quà sút kèm dải / vị trí');
const lucky = plays.filter(p => p.kind === 'lucky');
ok(lucky.every(p => p.reward && (p.free === (p.roll > p.lucky ? 2 : 1))), 'Lucky: quà + 2 lượt nếu số lắc > số may mắn, không thì 1 (' + lucky.length + ' lần)');
const freeWon = lucky.reduce((s, p) => s + p.free, 0);
ok(big.free === freeWon, 'Lượt miễn phí cộng đúng: ' + big.free);
const dbl = plays.filter(p => p.double && p.reward && !p.reward.jackpot);
const rails = (await db.query(`select id, rewards from public.fco_ctp_rails`)).rows;
const base = p => rails.find(r => r.id === p.rail).rewards[p.slot];
ok(dbl.every(p => { const b = base(p); return 'bp' in b ? p.reward.bp === b.bp * 2 : 'fc' in b ? p.reward.fc === b.fc * 2 : p.reward.count === 2; }), 'Quà sau Special nhân đôi (' + dbl.length + ')');
ok(plays.filter(p => p.reward && !p.double && !p.reward.jackpot).every(p => JSON.stringify(p.reward) === JSON.stringify(base(p))), 'Quà thường đúng món trên kệ');
const pot1 = Number((await db.query(`select pot from public.fco_jackpot where id = 1`)).rows[0].pot);
console.log('quỹ', pot0, '→', pot1);
// Lượt miễn phí
const wf = await wallet(P);
ok((await call(P, `public.fco_ctp_play($1, 'free')`, [wf.ctp_free + 1])).e?.includes('FCO_NO_FREE_PLAYS'), 'Không chơi quá số lượt miễn phí');
if (wf.ctp_free > 0) {
  const fr = (await call(P, `public.fco_ctp_play(1, 'free')`)).r;
  ok(fr.paid === 0 && (await wallet(P)).ctp_free === wf.ctp_free - 1 + fr.plays.filter(p => p.free).reduce((s, p) => s + p.free, 0), 'Chơi 1 lượt miễn phí: không trừ FC, trừ 1 lượt');
}
// Jackpot: ép tỷ lệ bằng quỹ lớn + đứng ngay trước ô 21 nhiều lần
await db.query(`update public.fco_jackpot set pot = 50000 where id = 1`);
let hits = { special: 0, mini: 0 };
for (let k = 0; k < 400 && hits.special + hits.mini < 6; k++) {
  await db.query(`update public.fco_wallets set ctp_pos = 20, ctp_jp_at = null, ctp_jp_prev = null, ctp_mini_at = null, ctp_mini_prev = null where user_id = $1`, [P]);
  await db.query(`update public.fco_jackpot set pot = 50000 where id = 1`);
  const r = (await call(P, `public.fco_ctp_play(1, 'fc')`)).r;
  for (const p of r.plays) if (p.reward?.jackpot) hits[p.reward.jackpot]++;
}
console.log('trúng thử', hits);
const feed = (await db.query(`select feed from public.fco_jackpot where id = 1`)).rows[0].feed;
ok(hits.special === 0 || feed.some(e => e.kind === 'special' && e.uid === P), 'Trúng Ultimate ghi bảng tin Jackpot chung');
// giới hạn 2 lần / 24 giờ
await db.query(`update public.fco_wallets set ctp_jp_at = now(), ctp_jp_prev = now() where user_id = $1`, [P]);
let blocked = true;
for (let k = 0; k < 300; k++) {
  await db.query(`update public.fco_wallets set ctp_pos = 20 where user_id = $1`, [P]); await db.query(`update public.fco_jackpot set pot = 50000 where id = 1`);
  const r = (await call(P, `public.fco_ctp_play(1, 'fc')`)).r;
  if (r.plays.some(p => p.reward?.jackpot === 'special')) blocked = false;
}
ok(blocked, 'Đã trúng Ultimate 2 lần trong 24 giờ thì không trúng thêm (300 lượt thử)');
// Mini trừ quỹ
await db.query(`update public.fco_wallets set ctp_mini_at = null, ctp_mini_prev = null where user_id = $1`, [P]);
let miniOk = null;
for (let k = 0; k < 600 && miniOk === null; k++) {
  await db.query(`update public.fco_wallets set ctp_pos = 2 where user_id = $1`, [P]); await db.query(`update public.fco_jackpot set pot = 50000, at = now() where id = 1`);
  const r = (await call(P, `public.fco_ctp_play(1, 'fc')`)).r;
  const m = r.plays.find(p => p.reward?.jackpot === 'mini');
  if (m) { miniOk = m.reward.fc === 5000 && r.jackpot.pot === 50000 + 1 - 5000 && r.jackpot.feed.some(e => e.kind === 'mini' && e.mine); console.log('mini', m.reward, r.jackpot.pot); }
}
ok(miniOk === true, 'Mini Prize = 1/10 quỹ (5.000 FC), trừ vào quỹ, ghi tin mini');
// Sổ FC
const led = (await db.query(`select reason, count(*)::int n from public.fco_fc_ledger where user_id = $1 group by 1 order by 1`, [P])).rows.map(r => `${r.reason}:${r.n}`);
ok(led.some(x => x.startsWith('ctp:')), 'Sổ FC ghi "ctp" khi trả lượt: ' + led.join(','));
// Nhiệm vụ GLXH
ok((await call(P, `public.fco_ctp_mission_claim()`)).e?.includes('FCO_MISSION_NOT_READY'), 'Chưa nhận nhiệm vụ thì không nhận lượt');
await db.query(`insert into public.fco_ranked_matches(user_id, at, opponent, goals_for, goals_against, delta, points) values ($1, now() - interval '1 minute', 'x', 3, 0, 10, 1010)`, [P]);
const acc = (await call(P, `public.fco_ctp_mission_accept()`)).r;
ok(acc.wallet.ctp.mission === 'accepted', 'Bấm Nhận nhiệm vụ → accepted (trận thắng TRƯỚC lúc nhận không tính)');
await db.query(`insert into public.fco_ranked_matches(user_id, at, opponent, goals_for, goals_against, delta, points) values ($1, now() + interval '1 second', 'x', 1, 1, 0, 1010)`, [P]);
ok((await call(P, `public.fco_wallet_json(auth.uid())`)).r.ctp.mission === 'accepted', 'Hoà không tính');
await db.query(`insert into public.fco_ranked_matches(user_id, at, opponent, goals_for, goals_against, delta, points) values ($1, now() + interval '2 second', 'x', 2, 1, 10, 1020)`, [P]);
ok((await call(P, `public.fco_wallet_json(auth.uid())`)).r.ctp.mission === 'ready', 'Thắng 1 trận GLXH → ready');
const fb = (await wallet(P)).ctp_free;
const cl = (await call(P, `public.fco_ctp_mission_claim()`)).r;
ok(cl.wallet.ctp.mission === 'done' && cl.wallet.ctp.free === fb + 1, 'Nhận +1 lượt miễn phí, nhiệm vụ xong hôm nay');
ok((await call(P, `public.fco_ctp_mission_claim()`)).e?.includes('FCO_MISSION_DONE'), 'Không nhận lần 2 trong ngày');
// Quyền
const priv = (await db.query(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') b from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'fco_ctp_%' order by 1`)).rows;
console.log(priv.map(r => `${r.proname}:${r.a}/${r.b}`).join(' '));
const open = ['fco_ctp_config', 'fco_ctp_play', 'fco_ctp_mission_accept', 'fco_ctp_mission_claim', 'fco_ctp_claim', 'fco_ctp_pick', 'fco_ctp_pending', 'fco_ctp_draft', 'fco_ctp_top'];
ok(priv.every(r => !r.b && r.a === open.includes(r.proname)), 'Chỉ 5 hàm mở cho người chơi đăng nhập (chơi, nhiệm vụ, cấu hình, nhận quà mốc), khách không gọi được');
ok(!(await db.query(`select has_table_privilege('authenticated', 'public.fco_ctp_rails', 'select') a`)).rows[0].a, 'Bảng quà khoá với người chơi');
// Reset
await call(ADMIN, `public.fco_admin_account_reset($1, false)`, [P]);
const wr = await wallet(P);
ok(wr.ctp_pos === 28 && wr.ctp_points === 0 && wr.ctp_free === 0, 'Reset tài khoản xoá tiến trình Cờ tỷ phú');
// Cân quà: 20.000 lần sút
const st = (await db.query(`select s->'reward' r from (select public.fco_ctp_shot(false) s from generate_series(1, 20000)) t`)).rows;
const fcShots = st.filter(x => 'fc' in x.r).length;
console.log('FC trong 20.000 lần sút:', fcShots);
ok(fcShots < 40, 'Quà FC rất hiếm (< 0,2 %)');
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
