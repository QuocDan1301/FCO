// Chạy thử migration điểm danh 7 ngày trên PGlite (cài như fco-wallet.pglite.mjs):
//   NODE_PATH=<tmp>/node_modules node supabase/tests/fco-checkin.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql supabase/migrations/202611070002_fco_save_audit.sql supabase/migrations/202611070003_fco_stats.sql supabase/migrations/202611070004_fco_checkin.sql
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
const B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users(id, email) values ($1, 'player_b@players.fco.invalid')`, [B]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
console.log('migrations OK');

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
// Giả lập "sang ngày mới": lùi ngày đã nhận lại 1 ngày (hoặc nhiều ngày = bỏ lỡ).
const shift = days => db.exec(`update public.fco_wallets set daily = daily - ${days}, checkin_date = checkin_date - ${days} where user_id = '${B}'`);
const claim = () => as(B, 'select public.fco_claim_daily()');

let w = await as(B, 'select public.fco_wallet()');
assert.deepEqual(w.checkin, { claimedToday: false, day: 1, done: 0 });
const bonus = [300, 500, 0, 700, 900, 0, 0];
let fc = 0;
for (let day = 1; day <= 7; day++) {
  if (day > 1) await shift(1);
  w = await claim();
  fc += 1000 + bonus[day - 1];
  assert.deepEqual(w.checkin, { claimedToday: true, day, done: day }, `ngày ${day}`);
  assert.equal(w.fc, fc, `FC ngày ${day}`);
  await assert.rejects(claim(), /FCO_DAILY_CLAIMED/);
}
// Đủ 7 ngày: hôm sau quay lại ngày 1.
await shift(1);
assert.deepEqual((await as(B, 'select public.fco_wallet()')).checkin, { claimedToday: false, day: 1, done: 0 });
w = await claim(); assert.equal(w.checkin.day, 1); fc += 1300; assert.equal(w.fc, fc);
await shift(1); w = await claim(); assert.equal(w.checkin.day, 2);
// Đang ở ngày 2, bỏ lỡ 1 ngày (lùi 2): quay lại ngày 1.
await shift(2);
assert.deepEqual((await as(B, 'select public.fco_wallet()')).checkin, { claimedToday: false, day: 1, done: 0 });
w = await claim(); assert.equal(w.checkin.day, 1);
// Chưa nhận hôm nay nhưng hôm qua đã nhận ngày 1: hiển thị đã xong 1, hôm nay là ngày 2.
await shift(1);
assert.deepEqual((await as(B, 'select public.fco_wallet()')).checkin, { claimedToday: false, day: 2, done: 1 });
// Sổ cái: lý do checkin chỉ cho các ngày có FC.
const rows = (await db.query(`select (detail->>'day')::int d, delta from public.fco_fc_ledger where reason = 'checkin' order by id`)).rows;
assert.deepEqual(rows.map(r => [r.d, Number(r.delta)]).slice(0, 4), [[1, 300], [2, 500], [4, 700], [5, 900]]);
await assert.rejects(as(B, `select public.fco_checkin_next(1::smallint, current_date, current_date)`), /permission denied/);
console.log('CHECKIN PASS');
