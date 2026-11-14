// Kiểm tra 202611130004_fco_vqtg (sự kiện Vòng Quanh Thế Giới) trên PGlite: node fco-vqtg.pglite.mjs <thư mục dự án>
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
const U = '00000000-0000-0000-0000-0000000000b1';
await db.query(`insert into auth.users(id, email) values ($1, 'vq@players.fco.invalid')`, [U]);
for (const f of files.slice(2)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
async function as(sql) {
  await db.exec(`reset role; select set_config('test.uid', '${U}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
await as('select public.fco_wallet()');
await db.exec(`update public.fco_wallets set fc = 5000 where user_id = '${U}'`);
const ROLL_TICKETS = [1, 2, 2, 2, 3, 6];
const gained = res => res.plays.reduce((n, p) => n + p.tickets, 0);
const wallet = async () => (await db.query(`select fc::int, vqtg_pos, vqtg_picks from public.fco_wallets where user_id = '${U}'`)).rows[0];

// Cấu hình: 16 ô, ô 6/10/14 đặc biệt, ô quà có 4 món (quà thật từ 202611130005).
const cfg = await as('select public.fco_vqtg_config()');
assert.equal(cfg.tiles.length, 16);
assert.deepEqual(cfg.tiles.filter(t => t.kind !== 'reward').map(t => [t.idx, t.kind]), [[6, 'pick'], [10, 'bp'], [14, 'jackpot']]);
for (const t of cfg.tiles.filter(t => t.kind === 'reward')) assert.equal(t.rewards.length, 4, `ô ${t.idx}`);
assert.deepEqual(cfg.prices.map(p => p.price), [18, 190, 900]);
const potNow = async () => Number((await db.query('select pot from public.fco_jackpot where id = 1')).rows[0].pot);
assert.equal(cfg.bpPool, (await potNow()) * 5000000, 'Mini Jackpot = quỹ FC × 5.000.000 BP');
assert.deepEqual(cfg.tiles[0].rewards[3], { pack: 'vq-111-lwbb-78', count: 1 });
assert.deepEqual(cfg.tiles.filter(t => t.kind === 'bp' || t.kind === 'jackpot').map(t => t.rewards), [[], []]);
const w0 = await as('select public.fco_wallet_json(auth.uid())').catch(() => null);
assert.equal(w0, null, 'fco_wallet_json không gọi trực tiếp được');

// 1 lượt: trừ 18 FC, quân đi đúng số xúc xắc từ ô 0.
let r = await as(`select public.fco_vqtg_play(1, 'fc')`);
assert.equal(r.plays.length, 1); assert.equal(r.paid, 18);
assert.ok(r.plays[0].roll >= 1 && r.plays[0].roll <= 6);
assert.equal(r.plays[0].from, 0); assert.equal(r.plays[0].to, r.plays[0].roll);
// Vé theo số lắc (202611130008): 1 → 1, 2/3/4 → 2, 5 → 3, 6 → 6.
assert.equal(r.plays[0].tickets, ROLL_TICKETS[r.plays[0].roll - 1]);
assert.deepEqual(r.wallet.vqtg, { pos: r.pos, picks: r.picks, tickets: r.plays[0].tickets, freeToday: true, claimed: [], paid: true });
assert.equal(r.tickets, r.plays[0].tickets);
let ticketsNow = r.tickets;
let w = await wallet();
assert.equal(w.vqtg_pos, r.pos);

// 50 lượt: các bước nối nhau, vòng 16 → 1; số lượt Chỉ định = số lần dừng ô 6; FC trả + thắng khớp sổ.
const before = await wallet();
r = await as(`select public.fco_vqtg_play(50, 'fc')`);
assert.equal(r.plays.length, 50); assert.equal(r.paid, 900);
let pos = before.vqtg_pos, picks = before.vqtg_picks, won = 0;
for (const p of r.plays) {
  assert.equal(p.from, pos);
  assert.equal(p.to, (pos + p.roll - 1) % 16 + 1);
  if (p.to === 6) { assert.equal(p.pick, 1); assert.equal(p.reward, null); picks++; }
  else if (p.kind === 'reward') assert.ok(p.reward && cfg.tiles[p.to - 1].rewards.some(x => JSON.stringify(x) === JSON.stringify(p.reward)), `quà ô ${p.to}`);
  if (p.reward?.fc) won += p.reward.fc;
  pos = p.to;
}
w = await wallet();
assert.equal(w.vqtg_pos, pos); assert.equal(w.vqtg_picks, picks); assert.equal(w.fc, before.fc - 900 + won);
for (const p of r.plays) assert.equal(p.tickets, ROLL_TICKETS[p.roll - 1]);
ticketsNow += gained(r);
assert.equal(r.tickets, ticketsNow, 'vé = tổng vé theo số lắc');

// Miễn phí: 1 lần mỗi ngày.
r = await as(`select public.fco_vqtg_play(1, 'free')`);
assert.equal(r.paid, 0); assert.equal(r.wallet.vqtg.freeToday, false); ticketsNow += gained(r);
assert.equal(r.tickets, ticketsNow, 'lượt miễn phí cũng được vé');
await assert.rejects(as(`select public.fco_vqtg_play(1, 'free')`), /FCO_NO_FREE_PLAYS/);

// Chỉ định: không có lượt thì báo; có thì đi đúng số chọn; số dừng ô 10 / 14 bị chặn; chỉ dùng khi chơi 1 lượt.
await db.exec(`update public.fco_wallets set vqtg_picks = 0, vqtg_pos = 2 where user_id = '${U}'`);
await assert.rejects(as(`select public.fco_vqtg_play(1, 'fc', 3)`), /FCO_NO_PICKS/);
await db.exec(`update public.fco_wallets set vqtg_picks = 2, vqtg_pos = 5 where user_id = '${U}'`);
await assert.rejects(as(`select public.fco_vqtg_play(1, 'fc', 5)`), /FCO_PICK_BLOCKED/); // 5 + 5 = ô 10
await assert.rejects(as(`select public.fco_vqtg_play(10, 'fc', 2)`), /FCO_BAD_PICK/);
r = await as(`select public.fco_vqtg_play(1, 'fc', 3)`);
assert.equal(r.plays[0].roll, 3); assert.equal(r.plays[0].tickets, 2); assert.equal(r.plays[0].to, 8); assert.equal(r.picks, 1);
await db.exec(`update public.fco_wallets set vqtg_pos = 15 where user_id = '${U}'`);
r = await as(`select public.fco_vqtg_play(1, 'fc', 4)`); // 15 → 16 → 1 → 2 → 3
assert.equal(r.plays[0].to, 3); assert.equal(r.picks, 0);
await db.exec(`update public.fco_wallets set vqtg_picks = 1, vqtg_pos = 9 where user_id = '${U}'`);
await assert.rejects(as(`select public.fco_vqtg_play(1, 'fc', 5)`), /FCO_PICK_BLOCKED/); // 9 + 5 = ô 14
await assert.rejects(as(`select public.fco_vqtg_play(3, 'fc')`), /FCO_BAD_COUNT/);

// Quỹ BP: mỗi FC trả +20.000 BP; trúng quỹ thì về 100.000.000.
r = await as(`select public.fco_vqtg_play(10, 'fc')`);
const hit = r.plays.find(p => p.pool);
assert.equal(r.bpPool, r.jackpot.pot * 5000000, 'Mini Jackpot theo quỹ FC sau lượt');
if (hit) { assert.ok(hit.reward.bp > 0); assert.equal(r.miniFeed[0].mine, true); }

// Ô Giải Đặc Biệt: quỹ lớn → thử nhiều lần ô 14, phải có lúc trúng; quỹ FC chung tăng theo FC trả.
await db.exec(`update public.fco_wallets set fc = 100000 where user_id = '${U}'; update public.fco_jackpot set pot = 20000, feed = '[]' where id = 1`);
let jackpots = 0, minis = 0;
for (let k = 0; k < 200; k++) {
  await db.exec(`update public.fco_wallets set vqtg_pos = 13, vqtg_picks = 0 where user_id = '${U}'`);
  // Ô 14 chặn Chỉ định nên ép lắc 1 bằng cách lắc thường từ ô 13 cho tới khi dừng ở 14.
  const res = await as(`select public.fco_vqtg_play(1, 'fc')`);
  const p = res.plays[0];
  if (p.to === 14 && p.reward?.jackpot === 'special') { jackpots++; assert.equal(res.jackpot.pot, 2000); }
  if (p.to === 14 && p.reward?.jackpot === 'mini') minis++;
  assert.ok(p.to !== 14 || p.reward?.jackpot === 'special', 'chỉ trúng mới đứng ở ô 14 (202611140007)');
  assert.ok(p.to !== 10 || p.pool === true, 'chỉ trúng mới đứng ở ô 10 (202611140007)');
}
console.log('ô 14 trúng Giải Đặc Biệt', jackpots, '· Giải Phụ', minis);
assert.equal(minis, 0, 'ô 14 không còn Giải Phụ (202611130010)');
// Chắc chắn có 1 lần nổ: quỹ lớn, chơi tới khi ô 14 trúng; kiểm Mini Jackpot nổ theo (BP = quỹ FC × 5.000.000, cả hai về mức thấp).
let boom = null;
for (let k = 0; k < 3000 && !boom; k++) {
  await db.exec(`update public.fco_wallets set vqtg_pos = 13, vqtg_picks = 0, fc = 100000 where user_id = '${U}'; update public.fco_jackpot set pot = 22000 where id = 1`);
  const res = await as(`select public.fco_vqtg_play(1, 'fc')`);
  if (res.plays[0].reward?.jackpot === 'special') boom = res;
}
assert.ok(boom, 'ô 14 phải có lúc trúng Giải Đặc Biệt');
const hitPlay = boom.plays[0];
assert.equal(hitPlay.miniBp, undefined, 'người trúng Jackpot chỉ nhận FC');
assert.ok(!JSON.stringify(boom.save ?? {}).includes('"bp":' + hitPlay.reward.fc * 5000000));
assert.equal(boom.miniFeed[0].amount, hitPlay.reward.fc * 5000000, 'Mini Jackpot nổ cùng lúc');
assert.equal(boom.miniFeed[0].mine, false, 'Mini Jackpot về tay người khác');
assert.equal(boom.jackpot.pot, 2000); assert.equal(boom.bpPool, 2000 * 5000000, 'Mini Jackpot về mức thấp theo');
console.log("nổ Jackpot", hitPlay.reward.fc, "FC cho mình · Mini Jackpot", boom.miniFeed[0].amount, "BP cho", boom.miniFeed[0].name);
const feed = (await db.query('select feed from public.fco_jackpot where id = 1')).rows[0].feed;
assert.ok(Array.isArray(feed));

// Lịch sử FC: lý do vqtg / vqtg_win.
const reasons = (await db.query(`select distinct reason from public.fco_fc_ledger where user_id = '${U}'`)).rows.map(x => x.reason);
assert.ok(reasons.includes('vqtg'));
// Bot trúng Jackpot (ngoài VQTG): lần gọi cấu hình kế tiếp ghi tin Mini Jackpot cho HLV khác, không ghi trùng (202611130013).
await db.exec(`update public.fco_jackpot set feed = jsonb_build_array(jsonb_build_object('name', 'botX', 'amount', 13790, 'kind', 'special', 'time', 9999999999999)) || feed where id = 1`);
let c2 = await as('select public.fco_vqtg_config()');
assert.equal(c2.miniFeed[0].amount, 13790 * 5000000);
assert.equal(c2.miniFeed[0].mine, false);
const n2 = c2.miniFeed.length;
c2 = await as('select public.fco_vqtg_config()');
assert.equal(c2.miniFeed.length, n2, 'không ghi trùng');
// Quỹ < 10.000 FC: không bao giờ dừng ở ô 10 / 14 (202611130014, 202611130019); thử từ ô 8 (tới được 10) và ô 13.
for (let k = 0; k < 240; k++) {
  await db.exec(`update public.fco_wallets set vqtg_pos = ${k % 2 ? 13 : 8}, vqtg_picks = 0, fc = 100000 where user_id = '${U}'; update public.fco_jackpot set pot = 5000 where id = 1`);
  const res = await as(`select public.fco_vqtg_play(1, 'fc')`);
  assert.ok(![10, 14].includes(res.plays[0].to), 'quỹ dưới 10.000 FC không dừng ô 10 / 14');
  assert.equal(res.plays[0].tickets, [1, 2, 2, 2, 3, 6][res.plays[0].roll - 1]);
}
// Chỉ trúng mới đứng ở ô 10 / 14 (202611140007): quỹ ≥ 10.000 FC, nhiều lượt 10 từ ô 8 / 13 → mọi lượt dừng ô 10 / 14 đều là trúng.
for (let k = 0; k < 120; k++) {
  await db.exec(`update public.fco_wallets set vqtg_pos = ${k % 2 ? 13 : 8}, vqtg_picks = 0, fc = 100000 where user_id = '${U}'; update public.fco_jackpot set pot = 20000 where id = 1`);
  const res = await as(`select public.fco_vqtg_play(10, 'fc')`);
  for (const p of res.plays) {
    if (p.to === 10) assert.ok(p.pool && p.reward?.bp > 0, 'đứng ô 10 = trúng Mini Jackpot');
    if (p.to === 14) assert.equal(p.reward?.jackpot, 'special', 'đứng ô 14 = trúng Giải Đặc Biệt');
    assert.equal(p.tickets, [1, 2, 2, 2, 3, 6][p.roll - 1]);
  }
}
// Người đang đứng ô 10 / 14 mà không trúng: chạy lại migration thì lùi về ô trước; người trong bảng tin trúng giữ nguyên.
await db.exec(`update public.fco_wallets set vqtg_pos = 14 where user_id = '${U}'; update public.fco_jackpot set feed = '[]' where id = 1`);
await db.exec(readFileSync(`${root}/supabase/migrations/202611140007_fco_vqtg_stand_only_win.sql`, 'utf8'));
assert.equal((await wallet()).vqtg_pos, 13);// Dùng Chỉ định không tốn FC (202611130018): FC giữ nguyên, trừ 1 lượt Chỉ định, vẫn được vé.
await db.exec(`update public.fco_wallets set vqtg_picks = 1, vqtg_pos = 2, fc = 500 where user_id = '${U}'; update public.fco_jackpot set pot = 20000 where id = 1`);
const fcBefore = (await wallet()).fc;
const pr = await as(`select public.fco_vqtg_play(1, 'fc', 3)`);
assert.equal(pr.paid, 0); assert.equal(pr.picks, 0); assert.equal(pr.plays[0].tickets, 2);
assert.equal((await wallet()).fc, fcBefore + (pr.plays[0].reward?.fc ?? 0), 'không trừ FC');
console.log('fco-vqtg OK');
