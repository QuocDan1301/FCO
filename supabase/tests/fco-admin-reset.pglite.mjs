// Chạy thử reset tài khoản trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-admin-reset.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, ...files] = process.argv.slice(2);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['202610300001_fco_accounts.sql', '202610300002_delete_own_account.sql']) await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
const ADMIN = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid'), ($3, 'player_c@players.fco.invalid'), ($4, 'player_d@players.fco.invalid')`, [ADMIN, B, C, D]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql, params) => Object.values(await as(uid, `select ${sql} as r`, params))[0];
const row = async (table, uid) => (await db.query(`select * from public.${table} where user_id = $1`, [uid])).rows[0];
const full = { version: 1, balance: 900000, cards: [{ uid: 'a', playerId: 1, level: 9, received: 1 }], history: [{ id: 'h' }], daily: 'x', opened: 7, upgrades: 9, sound: true, reduced: false, quick: true,
  unopened: { eternal: 5 }, prepaid: { eternal: 2 }, squad: ['a'], lineups: { active: 0 }, event: { points: 40 }, bridge: { x: 1 }, reset: 'R1', bpReset: 'B1', codes: ['c'.repeat(64)] };

// Người chơi B có đủ loại dữ liệu; C là người khác để chắc không bị đụng.
for (const uid of [B, C]) {
  await rpc(uid, 'public.fco_commit_save($1::jsonb, 0)', [JSON.stringify(full)]);
  await rpc(uid, 'public.fco_wallet(0)');
  await rpc(uid, 'public.fco_rank_upgrade(130, 1, 9)');
  await db.query(`update public.fco_wallets set event_points = 40, event_free = 3, event_paid = 2, event_missions = '{open}', bilac_points = 90, bilac_claimed = '{0,1}', checkin_day = 3 where user_id = $1`, [uid]);
}
await rpc(ADMIN, `public.fco_admin_credit('player_b', 5000, 'bill')`);
await rpc(B, 'public.fco_claim_daily()');
await rpc(B, `public.fco_spend_fc(1000, 'shop', '{}'::jsonb)`);
await db.query(`update public.fco_wallets set bilac_free_day = public.fco_today() where user_id = $1`, [B]);
const before = await rpc(B, 'public.fco_my_fc_stats()');
const fcBefore = (await row('fco_wallets', B)).fc;

// Quyền: chỉ admin; khách không gọi được; đích phải tồn tại; tuỳ chọn phải rõ ràng.
await assert.rejects(rpc(C, 'public.fco_admin_account_reset($1)', [B]), /FCO_ADMIN_ONLY/);
await assert.rejects(rpc(null, 'public.fco_admin_account_reset($1)', [B]), /permission denied/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_reset($1)', ['00000000-0000-0000-0000-0000000000ff']), /FCO_USER_NOT_FOUND/);
await assert.rejects(rpc(ADMIN, 'public.fco_admin_account_reset($1, null)', [B]), /Invalid reset option/);
assert.equal((await row('fco_game_saves', B)).data.cards.length, 1);

// Reset mặc định: giữ FC.
const revision = Number((await row('fco_game_saves', B)).revision);
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_reset($1)', [B]), { reset: true, fc: Number(fcBefore) });
let s = await row('fco_game_saves', B), w = await row('fco_wallets', B);
assert.equal(Number(s.revision), revision + 1);
assert.deepEqual(s.data, { version: 1, balance: 0, cards: [], history: [], unopened: {}, daily: '', opened: 0, upgrades: 0, sound: true, reduced: false, quick: true, reset: 'R1', bpReset: 'B1', codes: full.codes });
assert.equal(Number(w.fc), Number(fcBefore));
assert.deepEqual([Number(w.event_points), w.event_free, w.event_paid, w.event_missions, Number(w.bilac_points), w.bilac_claimed, w.checkin_day], [0, 0, 0, [], 0, [], 0]);
assert.equal(await row('fco_ranks', B), undefined);

// Không tạo thêm quà trong ngày: quà ngày và lượt Bi Lắc miễn phí vẫn tính là đã dùng.
await assert.rejects(rpc(B, 'public.fco_claim_daily()'), /FCO_DAILY_CLAIMED/);
await assert.rejects(rpc(B, `public.fco_bilac_play(1, 'free')`), /FCO_NO_FREE_PLAYS/);

// Máy người chơi còn giữ đồ cũ không đẩy lên được; đồng bộ theo revision mới thì được.
await assert.rejects(rpc(B, 'public.fco_commit_save($1::jsonb, $2)', [JSON.stringify(full), revision]), /FCO_SAVE_CONFLICT/);
assert.equal((await row('fco_game_saves', B)).data.cards.length, 0);
const next = await rpc(B, 'public.fco_commit_save($1::jsonb, $2)', [JSON.stringify({ ...s.data, opened: 1 }), revision + 1]);
assert.equal(Number(next.revision), revision + 2);

// Người khác không bị đụng.
assert.equal((await row('fco_game_saves', C)).data.cards.length, 1);
assert.equal(Number((await row('fco_wallets', C)).event_points), 40);
assert.ok(await row('fco_ranks', C));

// Sổ cái ghi lại ai reset; thống kê FC giữ nguyên.
let log = (await db.query(`select delta, balance, reason, actor from public.fco_fc_ledger where user_id = $1 and reason = 'reset'`, [B])).rows;
assert.deepEqual(log.map(l => [Number(l.delta), Number(l.balance), l.actor]), [[0, Number(fcBefore), ADMIN]]);
assert.deepEqual(await rpc(B, 'public.fco_my_fc_stats()'), before);

// Reset kèm xoá FC: FC về 0, không tính vào Đã dùng, Đã nạp vẫn còn; chơi Bi Lắc tiếp không vướng gì.
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_reset($1, true)', [B]), { reset: true, fc: 0 });
assert.equal(Number((await row('fco_wallets', B)).fc), 0);
assert.deepEqual(await rpc(B, 'public.fco_my_fc_stats()'), before);
log = (await db.query(`select delta from public.fco_fc_ledger where user_id = $1 and reason = 'reset' order by id`, [B])).rows;
assert.equal(Number(log[1].delta), -Number(fcBefore));
await assert.rejects(rpc(B, `public.fco_bilac_play(1, 'fc')`), /FCO_NOT_ENOUGH_FC/);

// Tài khoản chưa từng vào game: reset vẫn được, không tự tạo bản lưu.
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_reset($1)', [D]), { reset: true, fc: 0 });
assert.equal(await row('fco_game_saves', D), undefined);

// Reset chính admin: vẫn còn quyền admin.
assert.deepEqual(await rpc(ADMIN, 'public.fco_admin_account_reset($1)', [ADMIN]), { reset: true, fc: 0 });
await rpc(ADMIN, `public.fco_admin_ledger(1)`);
console.log('fco-admin-reset OK');