// Chạy thử migration Bi Lắc trên PGlite (cài như fco-wallet.pglite.mjs), truyền lần lượt các migration 0001…0005.
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
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid')`, [A, B]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
console.log('migrations OK');

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
const fails = async (p, re) => assert.rejects(p, e => re.test(e.message), `expected ${re}`);

const cfg = await as(B, 'select public.fco_bilac_config()');
assert.deepEqual(cfg.symbols.map(s => s.id), ['club', 'fc', 'special', 'bp', 'card']);
assert.equal(cfg.rows.length, 11); assert.equal(cfg.milestones.length, 7);
await fails(as(null, 'select public.fco_bilac_config()'), /permission denied|Authentication/);
await fails(as(B, 'select * from public.fco_bilac_rows'), /permission denied/);

let w = await as(B, 'select public.fco_wallet()');
assert.deepEqual(w.bilac, { points: 0, claimed: [], freeToday: true });
// Lượt miễn phí: 1 lần mỗi ngày.
let p = await as(B, `select public.fco_bilac_play(1, 'free')`);
assert.equal(p.paid, 0); assert.equal(p.plays.length, 1); assert.equal(p.wallet.bilac.freeToday, false);
await fails(as(B, `select public.fco_bilac_play(1, 'free')`), /FCO_NO_FREE_PLAYS/);
await fails(as(B, `select public.fco_bilac_play(1, 'fc')`), /FCO_NOT_ENOUGH_FC/);
await fails(as(B, `select public.fco_bilac_play(7, 'fc')`), /FCO_BAD_COUNT/);

// Kết quả đúng luật: hàng khớp với 3 quả bóng, quà thuộc hàng đó, điểm cộng dồn.
await as(A, `select public.fco_admin_credit('player_b', 1000000, 'test')`);
const rowsById = Object.fromEntries(cfg.rows.map(r => [r.id, r]));
let points = p.points, plays = [...p.plays];
for (let k = 0; k < 40; k++) { const r = await as(B, `select public.fco_bilac_play(50, 'fc')`); assert.equal(r.paid, 900); points += r.points; plays.push(...r.plays); }
const seen = new Set();
for (const play of plays) {
  const counts = {}; for (const b of play.balls) counts[b] = (counts[b] ?? 0) + 1;
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const row = rowsById[play.row];
  assert.equal(row.kind, n === 3 ? 'triple' : n === 2 ? 'pair' : 'mixed', JSON.stringify(play));
  if (n > 1) assert.equal(row.symbol, top);
  assert.equal(play.points, row.points);
  if (play.reward.jackpot) assert.ok(row.rewards[0].jackpot === play.reward.jackpot && play.reward.fc > 0);
  else assert.ok(row.rewards.some(r => JSON.stringify(r) === JSON.stringify(play.reward)), JSON.stringify(play));
  seen.add(play.row);
}
w = await as(B, 'select public.fco_wallet()');
assert.equal(w.bilac.points, points);
assert.ok(seen.has('mixed') && seen.has('special2'), [...seen].join(','));
console.log('rows seen in', plays.length, 'plays:', [...seen].sort().join(','));
// FC: sổ cái khớp số dư (trả phí + trúng FC + jackpot).
const sum = (await db.query(`select coalesce(sum(delta),0)::bigint s from public.fco_fc_ledger where user_id = $1`, [B])).rows[0].s;
assert.equal(Number(sum), w.fc);
const won = (await db.query(`select coalesce(sum(delta),0)::bigint s from public.fco_fc_ledger where user_id = $1 and reason = 'bilac_win'`, [B])).rows[0].s;
const expectedWin = plays.reduce((s, x) => s + (x.reward.fc ?? 0), 0);
assert.equal(Number(won), expectedWin);
// Quà mốc: đủ điểm mới nhận, mỗi mốc một lần.
const c = await as(B, 'select public.fco_bilac_claim(0)');
assert.deepEqual(c.wallet.bilac.claimed, [0]); assert.equal(c.rewards.length, 2);
await fails(as(B, 'select public.fco_bilac_claim(0)'), /FCO_MILESTONE_CLAIMED/);
await fails(as(B, 'select public.fco_bilac_claim(99)'), /FCO_MILESTONE_UNKNOWN/);
await db.exec(`update public.fco_wallets set bilac_points = 5 where user_id = '${B}'`);
await fails(as(B, 'select public.fco_bilac_claim(1)'), /FCO_MILESTONE_LOCKED/);
// Jackpot: 3 Special lấy cả quỹ, 2 Special lấy 1/10.
await db.exec(`update public.fco_bilac_symbols set weight = case id when 'special' then 1000000 else 0 end`);
await db.exec(`update public.fco_jackpot set pot = 9000, at = now(), feed = '[]'`);
p = await as(B, `select public.fco_bilac_play(1, 'fc')`);
assert.equal(p.plays[0].row, 'special3'); assert.equal(p.plays[0].reward.fc, 9020); assert.equal(p.jackpot.pot, 2000);
assert.equal(p.jackpot.feed[0].mine, true); assert.equal(p.jackpot.feed[0].kind, 'special');
console.log('BILAC PASS');
