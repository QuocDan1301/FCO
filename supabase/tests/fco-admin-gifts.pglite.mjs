// Chạy thử admin tặng quà trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-admin-gifts.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
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

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql) => Object.values(await as(uid, `select ${sql} as r`))[0];
const sendFc = (uid, user, fc, note = 'Đền bù') => rpc(uid, `public.fco_admin_send_gift('${user}', p_fc => ${fc}, p_note => '${note}')`);
const sendPack = (uid, user, pack, count) => rpc(uid, `public.fco_admin_send_gift('${user}', p_pack => '${pack}', p_count => ${count})`);
const pending = uid => rpc(uid, 'public.fco_my_admin_gifts()');
const ack = (uid, ids) => rpc(uid, `public.fco_my_admin_gifts_ack(array[${ids.join(',')}]::bigint[])`);

// Tặng FC: ví tăng ngay, sổ cái lý do riêng.
const fcGift = await sendFc(ADMIN, B, 5000);
assert.equal(fcGift.fc, 5000);
assert.deepEqual((await db.query(`select delta, balance, reason, detail->>'note' as note from public.fco_fc_ledger where user_id = $1`, [B])).rows, [{ delta: 5000, balance: 5000, reason: 'admin_gift', note: 'Đền bù' }]);

// Tặng gói: không đụng ví và sổ cái.
const packGift = await sendPack(ADMIN, B, 'the-moment', 3);
assert.equal(packGift.fc, null);
assert.equal((await db.query(`select count(*)::int as n from public.fco_fc_ledger where user_id = $1`, [B])).rows[0].n, 1);

// Không vào Đã nạp, doanh thu, số người đã nạp; FC quà khi tiêu mới tính là đã dùng.
let s = await rpc(ADMIN, 'public.fco_admin_stats()');
assert.deepEqual([s.summary.topupFcAll, s.summary.topupVndAll, s.summary.topupVndToday, s.summary.payers], [0, 0, 0, 0]);
assert.equal(s.days[0].topupVnd, 0);
const row = s.players.find(p => p.login === 'player_b');
assert.deepEqual([row.topupFc, row.topupVnd, row.fc], [0, 0, 5000]);
const account = (await rpc(ADMIN, `public.fco_admin_accounts()`)).accounts.find(a => a.login === 'player_b');
assert.deepEqual([account.topupFc, account.topupVnd, account.fc], [0, 0, 5000]);
assert.deepEqual(await rpc(B, 'public.fco_my_fc_stats()'), { topup: 0, spent: 0 });
await rpc(B, `public.fco_spend_fc(1200, 'shop', '{}'::jsonb)`);
assert.deepEqual(await rpc(B, 'public.fco_my_fc_stats()'), { topup: 0, spent: 1200 });

// Người chơi thấy đúng quà của mình; nhận xong không còn chờ; không ack được quà của người khác; FC không cộng lần hai.
let mine = await pending(B);
assert.deepEqual(mine.map(g => g.rewards), [[{ fc: 5000 }], [{ pack: 'the-moment', count: 3 }]]);
assert.equal(mine[0].note, 'Đền bù');
assert.deepEqual(await pending(C), []);
assert.equal(await ack(C, [fcGift.id, packGift.id]), 0);
assert.equal((await pending(B)).length, 2);
assert.equal(await ack(B, [fcGift.id]), 1);
assert.equal(await ack(B, [fcGift.id]), 0);
assert.deepEqual((await pending(B)).map(g => g.id), [packGift.id]);
assert.equal((await db.query(`select fc::int from public.fco_wallets where user_id = $1`, [B])).rows[0].fc, 3800);
assert.deepEqual((await rpc(ADMIN, `public.fco_admin_gift_list('${B}')`)).map(g => [g.id, g.claimed]), [[packGift.id, false], [fcGift.id, true]]);

// Tài khoản chưa có ví vẫn được tặng.
assert.equal((await sendFc(ADMIN, C, 100)).fc, 100);

// Dữ liệu sai bị từ chối.
await assert.rejects(rpc(ADMIN, `public.fco_admin_send_gift('${B}')`), /FCO_GIFT_BAD_REWARDS/);
await assert.rejects(rpc(ADMIN, `public.fco_admin_send_gift('${B}', p_fc => 1, p_pack => 'x', p_count => 1)`), /FCO_GIFT_BAD_REWARDS/);
await assert.rejects(sendFc(ADMIN, B, -5), /FCO_BAD_AMOUNT/);
await assert.rejects(sendFc(ADMIN, B, 0), /FCO_BAD_AMOUNT/);
await assert.rejects(sendPack(ADMIN, B, 'the-moment', 0), /FCO_GIFT_BAD_REWARDS/);
await assert.rejects(sendPack(ADMIN, B, 'the-moment', 1001), /FCO_GIFT_BAD_REWARDS/);
await assert.rejects(sendPack(ADMIN, B, 'gói lạ', 1), /FCO_GIFT_BAD_REWARDS/);
await assert.rejects(sendFc(ADMIN, '00000000-0000-0000-0000-0000000000ff', 1), /FCO_USER_NOT_FOUND/);

// Quyền: chỉ admin tặng / xem; khách không gọi được; không đọc bảng trực tiếp.
await assert.rejects(sendFc(B, B, 100), /FCO_ADMIN_ONLY/);
await assert.rejects(sendPack(B, B, 'the-moment', 1), /FCO_ADMIN_ONLY/);
await assert.rejects(rpc(B, `public.fco_admin_gift_list('${B}')`), /FCO_ADMIN_ONLY/);
await assert.rejects(pending(null), /permission denied/);
await assert.rejects(sendFc(null, B, 100), /permission denied/);
await assert.rejects(as(B, 'select * from public.fco_admin_gifts'), /permission denied/);
await assert.rejects(as(B, `update public.fco_admin_gifts set claimed_at = null`), /permission denied/);

// Xoá tài khoản thì xoá quà.
await db.query(`delete from auth.users where id = $1`, [C]);
assert.equal((await db.query(`select count(*)::int as n from public.fco_admin_gifts where user_id = $1`, [C])).rows[0].n, 0);
console.log('fco-admin-gifts OK');
