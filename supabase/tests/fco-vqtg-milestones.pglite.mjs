// Kiểm tra 202611130006_fco_vqtg_milestones (Shop Đổi Vé) trên PGlite: node fco-vqtg-milestones.pglite.mjs <thư mục dự án>
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
const U = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users(id, email) values ($1, 'vqm@players.fco.invalid')`, [U]);
for (const f of files.slice(2)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
async function as(sql) {
  await db.exec(`reset role; select set_config('test.uid', '${U}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
await as('select public.fco_wallet()');
const setTickets = n => db.exec(`update public.fco_wallets set vqtg_tickets = ${n} where user_id = '${U}'`);

// Cấu hình: 23 mốc 1 → 1.900 vé, vòng 1.900; mốc 1 chỉ nhận 1 lần và chỉ bằng lượt trả phí.
const cfg = await as('select public.fco_vqtg_config()');
assert.equal(cfg.milestones.length, 23);
assert.equal(cfg.round, 1900);
assert.deepEqual(cfg.milestones.slice(0, 5).map(m => m.tickets), [1, 10, 20, 30, 50]);
assert.ok(cfg.milestones.slice(0, 5).every(m => m.options.length === 1));
assert.ok(cfg.milestones.slice(5).every(m => m.options.length >= 3));
assert.equal(cfg.milestones[0].once && cfg.milestones[0].paidOnly, true);

// Lượt miễn phí được vé nhưng chưa nhận được mốc 1 (chỉ lượt trả phí).
let r = await as(`select public.fco_vqtg_play(1, 'free')`);
assert.equal(r.wallet.vqtg.tickets, r.plays[0].tickets); assert.ok(r.plays[0].tickets >= 1); assert.equal(r.wallet.vqtg.paid, false);
await assert.rejects(as('select public.fco_vqtg_claim(0)'), /FCO_MILESTONE_PAID_ONLY/);
await db.exec(`update public.fco_wallets set fc = 1000 where user_id = '${U}'`);
r = await as(`select public.fco_vqtg_play(1, 'fc')`);
assert.equal(r.wallet.vqtg.paid, true);
r = await as('select public.fco_vqtg_claim(0)');
assert.deepEqual(r.rewards, [{ pack: 'blm-1-1', count: 1 }, { voucher: 30, count: 1 }]);
assert.deepEqual(r.wallet.vqtg.claimed, [1]);
await assert.rejects(as('select public.fco_vqtg_claim(0)'), /FCO_MILESTONE_CLAIMED/);

// Chưa đủ vé thì khoá; đủ thì nhận, vé không bị trừ.
await assert.rejects(as('select public.fco_vqtg_claim(1)'), /FCO_MILESTONE_LOCKED/);
await setTickets(75);
r = await as('select public.fco_vqtg_claim(1)');
assert.equal(r.wallet.vqtg.tickets, 75, 'không trừ vé');
// Mốc nhiều lựa chọn phải chọn; chọn sai báo lỗi; mảng claimed luôn từ 1, đệm 0.
await assert.rejects(as('select public.fco_vqtg_claim(5)'), /FCO_MILESTONE_CHOICE/);
await assert.rejects(as('select public.fco_vqtg_claim(5, 3)'), /FCO_MILESTONE_CHOICE/);
r = await as('select public.fco_vqtg_claim(5, 1)');
assert.deepEqual(r.rewards, cfg.milestones[5].options[1]);
assert.deepEqual(r.wallet.vqtg.claimed, [1, 1, 0, 0, 0, 1]);
await assert.rejects(as('select public.fco_vqtg_claim(5, 0)'), /FCO_MILESTONE_CLAIMED/);
// Vòng 2 (vé ≥ 70 + 1.900): mốc 70 nhận thêm 1 lần; mốc 1 (once) thì không.
await setTickets(70 + 1900);
r = await as('select public.fco_vqtg_claim(5, 2)');
assert.equal(r.wallet.vqtg.claimed[5], 2);
await assert.rejects(as('select public.fco_vqtg_claim(0)'), /FCO_MILESTONE_CLAIMED/);
await assert.rejects(as('select public.fco_vqtg_claim(23)'), /FCO_MILESTONE_UNKNOWN/);
// Mốc 1.900 lựa chọn 3 có phiếu thuế; lịch sử ghi chữ phiếu.
await setTickets(1900);
r = await as('select public.fco_vqtg_claim(22, 2)');
assert.ok(r.rewards.some(x => x.voucher === 30));
// Reset tài khoản (202611130009): xoá vé, mốc đã nhận, vị trí, Chỉ định; "đã chơi trả phí" tính lại từ sau reset.
await db.query(`insert into public.fco_admins(user_id) values ($1) on conflict do nothing`, [U]);
await db.exec(`update public.fco_wallets set vqtg_pos = 7, vqtg_picks = 2 where user_id = '${U}'`);
r = await as(`select public.fco_admin_account_reset('${U}', false)`);
assert.equal(r.reset, true);
let w = await as('select public.fco_wallet()');
assert.equal(w.vqtg.tickets, 0); assert.deepEqual(w.vqtg.claimed, []); assert.equal(w.vqtg.pos, 0); assert.equal(w.vqtg.picks, 0);
assert.equal(w.vqtg.paid, false, 'lượt trả phí trước reset không tính');
const top = await as('select public.fco_vqtg_top()');
assert.equal(top.me.rank, null, 'BXH Đua top mất theo vé');
await as(`select public.fco_vqtg_play(1, 'fc')`);
w = await as('select public.fco_wallet()');
assert.equal(w.vqtg.paid, true);
r = await as('select public.fco_vqtg_claim(0)');
assert.deepEqual(r.wallet.vqtg.claimed, [1], 'mốc 1 nhận lại được sau reset');
console.log('fco-vqtg-milestones OK');
