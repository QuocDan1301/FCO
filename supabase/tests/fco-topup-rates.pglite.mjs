// Chạy thử doanh thu theo tỉ giá lúc nạp trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-topup-rates.pglite.mjs . <mọi file trong supabase/migrations từ 202611070001 trở đi, theo thứ tự>
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
const credit = (login, fc) => rpc(ADMIN, `public.fco_admin_credit('${login}', ${fc})`);
const stats = () => rpc(ADMIN, 'public.fco_admin_stats()');
const accounts = sort => rpc(ADMIN, `public.fco_admin_accounts(null, '${sort}')`);

// Lần nạp cũ: lùi thời gian về trước khi có giá 5.000.
await credit('player_b', 100000);
await db.exec(`update public.fco_fc_ledger set created_at = now() - interval '2 days' where reason = 'admin'`);
assert.equal((await stats()).summary.topupVndAll, 400000, 'nạp cũ giữ giá 4.000');

// Lần nạp mới theo giá 5.000; số cũ không đổi.
await credit('player_c', 90000);
let s = await stats();
assert.equal(s.summary.topupFcAll, 190000);
assert.equal(s.summary.topupVndAll, 400000 + 450000);
assert.equal(s.summary.topupVndToday, 450000);
assert.equal(s.summary.topupVnd7, 850000);
assert.equal(s.summary.topupVnd30, 850000);
assert.equal(s.days[0].topupVnd, 450000);
assert.equal(s.days[2].topupVnd, 400000);
const byLogin = Object.fromEntries(s.players.map(p => [p.login, p]));
assert.equal(byLogin.player_b.topupVnd, 400000);
assert.equal(byLogin.player_c.topupVnd, 450000);

// Trừ FC khi cộng nhầm làm giảm doanh thu theo giá hiện tại.
await credit('player_c', -10000);
assert.equal((await stats()).summary.topupVndAll, 800000);

// "Nạp nhiều" xếp theo tiền: C đứng trên B dù nạp ít FC hơn, vì nạp ở giá cao hơn.
await credit('player_c', 10000);
const list = await accounts('topup');
assert.deepEqual(list.accounts.slice(0, 2).map(a => [a.login, a.topupFc, a.topupVnd]), [['player_c', 90000, 450000], ['player_b', 100000, 400000]]);

// Thêm tỉ giá mới chỉ ảnh hưởng các lần nạp sau đó.
await db.exec(`insert into public.fco_topup_rates values (now(), 6000)`);
await credit('player_b', 1000);
assert.equal((await stats()).summary.topupVndAll, 850000 + 6000);

// Quyền: chỉ admin xem thống kê; người chơi không đọc được bảng và không gọi được hàm quy đổi.
await assert.rejects(rpc(B, 'public.fco_admin_stats()'), /FCO_ADMIN_ONLY/);
await assert.rejects(as(B, 'select * from public.fco_topup_rates'), /permission denied/);
await assert.rejects(as(B, `insert into public.fco_topup_rates values (now(), 1)`), /permission denied/);
await assert.rejects(rpc(B, `public.fco_topup_vnd(1000, now())`), /permission denied/);
await assert.rejects(rpc(null, `public.fco_topup_vnd(1000, now())`), /permission denied/);
console.log('fco-topup-rates OK');
