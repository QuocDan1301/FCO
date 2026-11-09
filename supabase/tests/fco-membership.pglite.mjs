// Chạy thử gói thành viên trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-membership.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
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

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql) => Object.values(await as(uid, `select ${sql} as r`))[0];
const buy = (uid, tier) => rpc(uid, `public.fco_buy_membership('${tier}')`);
const WEEK = 7 * 86_400_000, SLACK = 60_000;
const near = (value, expected, label) => assert.ok(Math.abs(Number(value) - expected) < SLACK, `${label}: ${value} so với ${expected}`);

// Ví mới chưa có gói; không đủ FC thì không trừ và không có hạn.
let wallet = await rpc(B, 'public.fco_wallet(0)');
assert.deepEqual(wallet.membership, { svip: null, premium: null });
await assert.rejects(buy(B, 'svip'), /FCO_NOT_ENOUGH_FC/);
assert.deepEqual((await rpc(B, 'public.fco_wallet(0)')).membership, { svip: null, premium: null });

await rpc(ADMIN, `public.fco_wallet(0)`);
await rpc(ADMIN, `public.fco_admin_credit('player_b', 4000, 'thử')`);

// Giá do máy chủ quyết định, hạn 7 ngày.
wallet = await buy(B, 'svip');
assert.equal(wallet.fc, 3000);
near(wallet.membership.svip, Date.now() + WEEK, 'SVIP mua lần đầu');
assert.equal(wallet.membership.premium, null);

// Mua thêm khi còn hạn thì cộng dồn.
wallet = await buy(B, 'svip');
assert.equal(wallet.fc, 2000);
near(wallet.membership.svip, Date.now() + 2 * WEEK, 'SVIP cộng dồn');

// Hai gói có hạn riêng.
wallet = await buy(B, 'premium');
assert.equal(wallet.fc, 500);
near(wallet.membership.premium, Date.now() + WEEK, 'Premium');
near(wallet.membership.svip, Date.now() + 2 * WEEK, 'SVIP không đổi khi mua Premium');

// Hết hạn rồi mua lại thì tính từ bây giờ, không cộng từ hạn cũ.
await db.query(`update public.fco_wallets set premium_until = now() - interval '30 days', fc = 1500 where user_id = $1`, [B]);
wallet = await buy(B, 'premium');
near(wallet.membership.premium, Date.now() + WEEK, 'Premium mua lại sau khi hết hạn');

// Sổ cái ghi đúng giá và lý do.
const ledger = (await db.query(`select delta, reason, detail->>'membership' as tier from public.fco_fc_ledger where user_id = $1 and reason = 'shop' order by id`, [B])).rows;
assert.deepEqual(ledger, [
  { delta: -1000, reason: 'shop', tier: 'svip' }, { delta: -1000, reason: 'shop', tier: 'svip' },
  { delta: -1500, reason: 'shop', tier: 'premium' }, { delta: -1500, reason: 'shop', tier: 'premium' },
]);
assert.equal((await rpc(B, 'public.fco_my_fc_stats()')).spent, 5000);

// Gói lạ bị từ chối; khách không gọi được; người chơi không tự sửa được hạn.
await assert.rejects(buy(B, 'gold'), /FCO_BAD_MEMBERSHIP/);
await assert.rejects(as(null, `select public.fco_buy_membership('svip')`), /permission denied/);
await assert.rejects(as(B, `update public.fco_wallets set premium_until = now() + interval '1 year'`), /permission denied/);

console.log('fco-membership OK');
