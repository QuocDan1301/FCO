// Chạy thử thống kê FC của người chơi trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-my-fc-stats.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611080009_fco_my_fc_stats.sql
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
const ADMIN = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid'), ($3, 'player_c@players.fco.invalid')`, [ADMIN, B, C]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql, params) => Object.values(await as(uid, `select ${sql} as r`, params))[0];
const stats = uid => rpc(uid, 'public.fco_my_fc_stats()');

// Tài khoản mới: 0 / 0; khách không gọi được; không đọc trực tiếp được sổ cái.
assert.deepEqual(await stats(B), { topup: 0, spent: 0 });
await assert.rejects(stats(null), /permission denied/);
await assert.rejects(as(B, 'select * from public.fco_fc_ledger'), /permission denied/);

// Admin cộng 10.000; quà ngày không phải nạp, cũng không phải đã dùng.
await rpc(ADMIN, `public.fco_admin_credit('player_b', 10000, 'bill')`);
await rpc(B, 'public.fco_claim_daily()');
assert.deepEqual(await stats(B), { topup: 10000, spent: 0 });

// Mua Shop và chơi sự kiện cộng vào Đã dùng; admin trừ nhầm chỉ giảm Đã nạp, không tính là người chơi đã dùng.
await rpc(B, `public.fco_spend_fc(1500, 'shop', '{}'::jsonb)`);
await rpc(B, `public.fco_event_play(1, 'fc')`);
await rpc(ADMIN, `public.fco_admin_credit('player_b', -2000, 'nham')`);
const s = await stats(B);
assert.equal(s.topup, 8000); assert.equal(s.spent, 1520);

// Tiền thắng không làm giảm Đã dùng: dòng cộng FC bất kỳ (trừ admin) không đổi hai số.
await db.query(`select public.fco_apply_fc($1, 500, 'jackpot')`, [B]);
assert.deepEqual(await stats(B), s);

// Mỗi người chỉ thấy số của mình; trừ quá số đã nạp thì Đã nạp không âm.
assert.deepEqual(await stats(C), { topup: 0, spent: 0 });
await rpc(ADMIN, `public.fco_admin_credit('player_b', -8500, 'chinh')`).catch(() => {});
assert.ok((await stats(B)).topup >= 0);
console.log('fco-my-fc-stats OK');