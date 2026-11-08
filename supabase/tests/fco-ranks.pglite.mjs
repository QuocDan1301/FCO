// Chạy thử migration bảng xếp hạng HLV trên PGlite (cài như fco-wallet.pglite.mjs):
//   NODE_PATH=<tmp>/node_modules node supabase/tests/fco-ranks.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611080001_fco_ranks.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, ...files] = process.argv.slice(2);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['202610300001_fco_accounts.sql', '202610300002_delete_own_account.sql']) await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.query(`insert into auth.users(id, email) values ($1, 'alpha@players.fco.invalid'), ($2, 'bravo@players.fco.invalid'), ($3, 'charlie@players.fco.invalid')`, [A, B, C]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
console.log('migrations OK');

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0] ?? {})[0]; } finally { await db.exec('reset role'); }
}
const board = uid => as(uid, 'select public.fco_leaderboard()');

// Chưa có số: bảng trống, hạng null.
let b = await board(A);
assert.deepEqual(b, { ovr: [], squad: [], me: { ovr: null, ovrRank: null, squad: null, squadRank: null } });

// Kỷ lục đập thẻ: chỉ ghi khi cao hơn.
await as(A, 'select public.fco_rank_upgrade(130, 1, 5)');
await as(A, 'select public.fco_rank_upgrade(128, 2, 9)');
await as(B, 'select public.fco_rank_upgrade(135, 31, 7)');
await as(C, 'select public.fco_rank_upgrade(130, 32, 4)');
b = await board(A);
assert.deepEqual(b.ovr.map(r => [r.name, r.ovr, r.playerId, r.level, r.mine]), [['bra***', 135, 31, 7, false], ['alp***', 130, 1, 5, true], ['cha***', 130, 32, 4, false]]);
assert.equal(b.me.ovr, 130); assert.equal(b.me.ovrRank, 2);
await as(A, 'select public.fco_rank_upgrade(140, 3, 10)');
assert.equal((await board(A)).me.ovrRank, 1);

// Giá trị đội hình: thay bằng số mới (lên hay xuống).
await as(A, 'select public.fco_rank_squad(5000000000)');
await as(B, 'select public.fco_rank_squad(9000000000)');
await as(B, 'select public.fco_rank_squad(3000000000)');
b = await board(B);
assert.deepEqual(b.squad.map(r => [r.name, Number(r.value), r.mine]), [['alp***', 5000000000, false], ['bra***', 3000000000, true]]);
assert.equal(b.me.squadRank, 2);

// Kiểm tra đầu vào và quyền.
await assert.rejects(as(A, 'select public.fco_rank_upgrade(0, 1, 1)'), /FCO_RANK_INVALID/);
await assert.rejects(as(A, 'select public.fco_rank_squad(-1)'), /FCO_RANK_INVALID/);
await assert.rejects(as('', 'select public.fco_leaderboard()'), /./);
await db.exec(`reset role; set role anon;`);
await assert.rejects(db.query('select public.fco_leaderboard()'), /permission denied/);
await assert.rejects(db.query('select * from public.fco_ranks'), /permission denied/);
await db.exec('reset role');
console.log('RANKS PASS');
