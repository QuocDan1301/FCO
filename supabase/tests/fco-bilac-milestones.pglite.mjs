// Chạy thử quà mốc Bi Lắc trên PGlite: node ms-test.mjs <dự án> <mọi migration từ 202611070001, theo thứ tự>
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, ...files] = process.argv.slice(2);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz);
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
async function as(sql) {
  await db.exec(`reset role; select set_config('test.uid', '${B}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}
const fails = async (p, re) => assert.rejects(p, e => re.test(e.message), `expected ${re}`);
const cfg = await as('select public.fco_bilac_config()');
assert.equal(cfg.milestones.length, 23); assert.equal(cfg.round, 1250);
assert.equal(cfg.milestones[0].once, true); assert.equal(cfg.milestones[5].options.length, 3); assert.equal(cfg.milestones[22].options.length, 4);
assert.deepEqual(cfg.milestones[1].options[0], [{ pack: 'blm-10-1', count: 1 }, { bp: 800000 }]);
await as('select public.fco_wallet()');
await fails(as('select public.fco_bilac_claim(0)'), /FCO_MILESTONE_LOCKED/);
await db.exec(`update public.fco_wallets set bilac_points = 80 where user_id = '${B}'`);
let r = await as('select public.fco_bilac_claim(0)');
assert.deepEqual(r.rewards, [{ pack: 'blm-1-1', count: 1 }]);
await fails(as('select public.fco_bilac_claim(0)'), /FCO_MILESTONE_CLAIMED/);
await fails(as('select public.fco_bilac_claim(5)'), /FCO_MILESTONE_CHOICE/);
await fails(as('select public.fco_bilac_claim(5, 3)'), /FCO_MILESTONE_CHOICE/);
r = await as('select public.fco_bilac_claim(5, 2)');
assert.equal(r.rewards[1].bp, 5000000);
assert.deepEqual(r.wallet.bilac.claimed.slice(0, 6), [1, 0, 0, 0, 0, 1]);
await fails(as('select public.fco_bilac_claim(6, 0)'), /FCO_MILESTONE_LOCKED/);
// Vòng mới: đủ 1.250 điểm nữa thì mốc 70 nhận thêm 1 lần; mốc 1 điểm (once) vẫn chỉ 1 lần.
await db.exec(`update public.fco_wallets set bilac_points = 80 + 1250 where user_id = '${B}'`);
r = await as('select public.fco_bilac_claim(5, 0)');
await fails(as('select public.fco_bilac_claim(5, 0)'), /FCO_MILESTONE_CLAIMED/);
await fails(as('select public.fco_bilac_claim(0)'), /FCO_MILESTONE_CLAIMED/);
r = await as('select public.fco_bilac_claim(22, 3)');
assert.deepEqual(r.rewards[0], { pack: 'blm-1250-4', count: 1 });
assert.equal(r.wallet.bilac.claimed[5], 2);
// 202611100003: nhận mốc giữa khi chưa nhận mốc nào — mảng phải bắt đầu từ 1 (trước đây Postgres dời chỉ số đầu thành
// '[6:6]={1}' và to_jsonb trả [1], game hiểu nhầm là mốc 0). Chạy lại migration sửa để chuẩn hoá dữ liệu cũ đang lệch.
await db.exec(`update public.fco_wallets set bilac_points = 80, bilac_claimed = '{}' where user_id = '${B}'`);
r = await as('select public.fco_bilac_claim(5, 1)');
assert.deepEqual(r.wallet.bilac.claimed, [0, 0, 0, 0, 0, 1]);
r = await as('select public.fco_bilac_claim(0)');
assert.deepEqual(r.wallet.bilac.claimed, [1, 0, 0, 0, 0, 1]);
await db.exec(`update public.fco_wallets set bilac_claimed = '[4:6]={2,NULL,1}'::integer[] where user_id = '${B}'`);
await db.exec(readFileSync(files.find(f => f.endsWith('202611100003_fco_bilac_claimed_fix.sql')), 'utf8'));
r = await as('select public.fco_wallet()');
assert.deepEqual(r.bilac.claimed, [0, 0, 0, 2, 0, 1]);
console.log('MILESTONES PASS');
