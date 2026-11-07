// Chạy thử migration thống kê trên PGlite (cài như fco-wallet.pglite.mjs):
//   NODE_PATH=<tmp>/node_modules node supabase/tests/fco-stats.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611070002_fco_save_audit.sql supabase/migrations/202611070003_fco_stats.sql
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
await db.query(`insert into auth.users(id, email, created_at) values ($1, 'quocdan06@players.fco.invalid', now() - interval '20 days'), ($2, 'player_b@players.fco.invalid', now()), ($3, 'player_c@players.fco.invalid', now() - interval '3 days')`, [A, B, C]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
console.log('migrations OK');

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, sql) => Object.values(await as(uid, `select ${sql} as r`))[0];

// Tín hiệu đầu chỉ tạo bản ghi; các lần sau cộng khoảng cách, tối đa 90 giây mỗi lần.
await rpc(B, 'public.fco_heartbeat()');
await db.exec(`update public.fco_presence set last_seen = now() - interval '60 seconds' where user_id = '${B}'`);
await rpc(B, 'public.fco_heartbeat()');
await db.exec(`update public.fco_presence set last_seen = now() - interval '3 hours' where user_id = '${B}'`);
await rpc(B, 'public.fco_heartbeat()');                       // vắng 3 giờ: chỉ cộng 90 giây
for (let i = 0; i < 20; i++) await rpc(B, 'public.fco_heartbeat()'); // gọi dồn dập: gần như không cộng
let p = (await db.query(`select play_seconds from public.fco_presence where user_id = $1`, [B])).rows[0];
assert.ok(p.play_seconds >= 150 && p.play_seconds <= 152, `play_seconds ${p.play_seconds}`);
// C chơi xong 10 phút trước (không còn online).
await rpc(C, 'public.fco_heartbeat()');
await db.exec(`update public.fco_presence set last_seen = now() - interval '10 minutes', play_seconds = 3600 where user_id = '${C}'`);
await db.exec(`insert into public.fco_play_days values ('${C}', public.fco_today() - 2, 3600)`);
await assert.rejects(rpc(null, 'public.fco_heartbeat()'), /permission denied|Authentication/);

// Nạp: admin cộng 100.000 cho B, cộng nhầm rồi trừ lại 5.000 cho C; quà ngày không tính là nạp.
await rpc(A, `public.fco_admin_credit('player_b', 100000, 'bill')`);
await rpc(A, `public.fco_admin_credit('player_c', 5000, 'nham')`);
await rpc(A, `public.fco_admin_credit('player_c', -5000, 'sua')`);
await rpc(B, 'public.fco_claim_daily()');

await assert.rejects(rpc(B, 'public.fco_admin_stats()'), /FCO_ADMIN_ONLY/);
await assert.rejects(as(B, 'select * from public.fco_presence'), /permission denied/);
const s = await rpc(A, 'public.fco_admin_stats()');
assert.equal(s.summary.registered, 3);
assert.equal(s.summary.registeredToday, 1);
assert.equal(s.summary.registered7, 2);
assert.equal(s.summary.online, 1);
assert.equal(s.summary.activeToday, 1);
assert.equal(s.summary.active7, 2);
assert.equal(s.summary.playSecondsAll, p.play_seconds + 3600);
assert.equal(s.summary.topupFcAll, 100000);
assert.equal(s.summary.topupFcToday, 100000);
assert.equal(s.summary.payers, 2);
assert.equal(s.days.length, 14);
assert.equal(s.days[0].topupFc, 100000); assert.equal(s.days[2].seconds, 3600);
assert.deepEqual(s.players.map(x => x.login), ['player_b', 'player_c', 'quocdan06']);
const b = s.players[0];
assert.deepEqual([b.online, b.topupFc, b.fc], [true, 100000, 101000]);
assert.equal(s.players[1].online, false); assert.equal(s.players[1].topupFc, 0);
assert.equal(s.players[2].lastSeen, null);
const filtered = await rpc(A, `public.fco_admin_stats('PLAYER_C')`);
assert.deepEqual(filtered.players.map(x => x.login), ['player_c']);
console.log('STATS PASS');
