// Chạy thử chế độ bảo trì trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-maintenance.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
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
const ADMIN = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid')`, [ADMIN, B]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql, params) => Object.values(await as(uid, `select ${sql} as r`, params))[0];
const save = JSON.stringify({ version: 1, balance: 1, cards: [] });
const set = (uid, on, msg = '') => rpc(uid, 'public.fco_admin_maintenance_set($1, $2)', [on, msg]);
const playerCalls = [`public.fco_wallet(0)`, `public.fco_heartbeat()`, `public.fco_claim_daily()`, `public.fco_spend_fc(1, 'shop', '{}'::jsonb)`, `public.fco_bilac_play(1, 'free')`, `public.fco_event_play(1, 'fc')`, `public.fco_my_fc_stats()`, `public.fco_rank_upgrade(100, 1, 1)`, `public.fco_jackpot_state()`];

// Mặc định tắt: chơi bình thường; ai cũng đọc được trạng thái; bypass chỉ đúng với admin.
assert.deepEqual(await rpc(null, 'public.fco_maintenance_state()'), { enabled: false, message: '', bypass: false });
assert.deepEqual(await rpc(B, 'public.fco_maintenance_state()'), { enabled: false, message: '', bypass: false });
assert.deepEqual(await rpc(ADMIN, 'public.fco_maintenance_state()'), { enabled: false, message: '', bypass: true });
await rpc(B, 'public.fco_wallet(0)');
await rpc(B, 'public.fco_commit_save($1::jsonb, 0)', [save]);

// Chỉ admin bật / tắt được; bảng không đọc / ghi trực tiếp được; hàm phụ không lộ ra.
await assert.rejects(set(B, true), /FCO_ADMIN_ONLY/);
await assert.rejects(set(null, true), /permission denied/);
await assert.rejects(as(B, 'select * from public.fco_maintenance'), /permission denied/);
await assert.rejects(as(B, 'update public.fco_maintenance set enabled = false'), /permission denied/);
await assert.rejects(rpc(B, 'public.fco_require_account()'), /permission denied/);
await assert.rejects(set(ADMIN, null), /Invalid maintenance state/);

// Bật: mọi thao tác của người chơi bị chặn ở máy chủ; thông báo được cắt khoảng trắng và tối đa 300 ký tự.
assert.deepEqual(await set(ADMIN, true, '  Nâng cấp máy chủ  '), { enabled: true, message: 'Nâng cấp máy chủ', bypass: true });
assert.deepEqual(await rpc(null, 'public.fco_maintenance_state()'), { enabled: true, message: 'Nâng cấp máy chủ', bypass: false });
for (const call of playerCalls) await assert.rejects(rpc(B, call), /FCO_MAINTENANCE/, call);
assert.equal(Number((await db.query(`select fc from public.fco_wallets where user_id = $1`, [B])).rows[0].fc), 0);
assert.equal((await set(ADMIN, true, 'x'.repeat(400))).message.length, 300);
await assert.rejects(set(B, false), /FCO_MAINTENANCE/, 'người chơi không tắt được');
assert.equal((await rpc(null, 'public.fco_maintenance_state()')).enabled, true);

// Vẫn đồng bộ được phần vừa chơi; kiểm tra phiên bản vẫn còn tác dụng.
assert.equal(Number((await rpc(B, 'public.fco_commit_save($1::jsonb, 1)', [save])).revision), 2);
await assert.rejects(rpc(B, 'public.fco_commit_save($1::jsonb, 1)', [save]), /FCO_SAVE_CONFLICT/);

// Admin không bị chặn: vẫn chơi và vẫn dùng được trang quản trị.
await rpc(ADMIN, 'public.fco_wallet(0)');
await rpc(ADMIN, `public.fco_admin_credit('player_b', 500, 'trong bảo trì')`);
await rpc(ADMIN, 'public.fco_admin_stats()');

// Tài khoản bị khoá vẫn bị chặn đúng lý do, kể cả đồng bộ.
await db.query(`update auth.users set banned_until = now() + interval '1 day' where id = $1`, [B]);
await assert.rejects(rpc(B, 'public.fco_commit_save($1::jsonb, 2)', [save]), /FCO_ACCOUNT_LOCKED/);
await assert.rejects(rpc(B, 'public.fco_wallet(0)'), /FCO_ACCOUNT_LOCKED/);
await db.query(`update auth.users set banned_until = null where id = $1`, [B]);

// Tắt: người chơi chơi lại bình thường, không mất gì.
assert.deepEqual(await set(ADMIN, false), { enabled: false, message: '', bypass: true });
const wallet = await rpc(B, 'public.fco_wallet(0)');
assert.equal(wallet.fc, 500);
assert.equal(Number((await rpc(B, 'public.fco_commit_save($1::jsonb, 2)', [save])).revision), 3);
console.log('fco-maintenance OK');