// Chạy thử luật "Giải Phụ trước Giải Đặc Biệt" (migration 202611090009) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node jackpot-mini-first.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
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
const dir = `${root}/supabase/migrations`;
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const f of files.slice(0, 2)) await db.exec(readFileSync(`${dir}/${f}`, 'utf8'));
const B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users(id, email) values ($1, 'player_b@players.fco.invalid')`, [B]);
for (const f of files.slice(2)) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
console.log(`migrations OK (${files.length})`);

const one = async sql => Object.values((await db.query(sql)).rows[0])[0];
async function as(sql) {
  await db.exec(`reset role; select set_config('test.uid', '${B}', false); set role authenticated;`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec('reset role'); }
}

// 1. Đọc "vòng này đã có Giải Phụ" từ bảng tin (mới nhất trước).
const done = feed => one(`select public.fco_jackpot_mini_done('${JSON.stringify(feed)}'::jsonb)`);
assert.equal(await done([]), false);
assert.equal(await done([{ kind: 'special' }, { kind: 'mini' }]), false);
assert.equal(await done([{ kind: 'mini' }, { kind: 'special' }]), true);
assert.equal(await done([{ kind: 'mini' }, { kind: 'mini' }]), true);
const pushed = await one(`select public.fco_jackpot_push('${JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ kind: 'mini', i })))}'::jsonb, '{"kind":"special"}'::jsonb)`);
assert.equal(pushed.length, 10); assert.equal(pushed[0].kind, 'special'); assert.equal(pushed[9].i, 8);
// Hàm phụ không cho người chơi gọi thẳng.
await assert.rejects(as(`select public.fco_jackpot_mini_done('[]'::jsonb)`), /permission denied/);

// 2. Bot: mô phỏng nhiều giờ quỹ chạy, mỗi Giải Đặc Biệt phải có Giải Phụ nổ trước trong cùng vòng.
await db.exec(`update public.fco_jackpot set pot = 2000, feed = '[{"kind":"special","name":"x","amount":1,"time":0}]', at = now() - interval '1 hour', speed = 0`);
const log = []; let head = JSON.stringify((await one('select feed from public.fco_jackpot'))[0]);
for (let step = 0; step < 1500; step++) {
  await db.exec(`update public.fco_jackpot set at = now() - interval '5 minutes'`);
  const feed = await one('select (public.fco_jackpot_tick()).feed');
  const at = feed.findIndex(e => JSON.stringify(e) === head);
  if (at < 0) throw new Error('bảng tin tràn trong một lần chạy, giảm thời gian mỗi lần');
  for (const e of feed.slice(0, at).reverse()) log.push(e);
  head = JSON.stringify(feed[0]);
}
let rounds = 0, minisInRound = 0, minisBeforeSpecial = [];
for (const e of log) {
  if (e.kind === 'mini') minisInRound++;
  else { rounds++; minisBeforeSpecial.push(minisInRound); minisInRound = 0; }
}
assert.ok(rounds > 200, `chỉ ${rounds} vòng`);
assert.ok(minisBeforeSpecial.every(n => n >= 1), 'vòng nào cũng có Giải Phụ trước Giải Đặc Biệt');
const specials = log.filter(e => e.kind === 'special').map(e => e.amount), minis = log.filter(e => e.kind === 'mini').map(e => e.amount);
const avg = a => Math.round(a.reduce((s, v) => s + v, 0) / a.length);
console.log(`bot: ${rounds} vòng · Giải Phụ mỗi vòng TB ${(minis.length / rounds).toFixed(2)} · Giải Phụ TB ${avg(minis)} FC (thấp nhất ${Math.min(...minis)}) · Giải Đặc Biệt TB ${avg(specials)} FC (thấp nhất ${Math.min(...specials)})`);

// 3. Người chơi đá trúng 3 Special khi vòng chưa có Giải Phụ: bot nhận Giải Phụ ngay trước, người chơi nhận phần còn lại.
await as('select public.fco_wallet()');
await db.exec(`update public.fco_wallets set fc = 100000 where user_id = '${B}'`);
await db.exec(`update public.fco_bilac_symbols set weight = case id when 'special' then 100 else 0 end`);
await db.exec(`update public.fco_jackpot set pot = 15000, at = now(), feed = '[{"kind":"special","name":"x","amount":1,"time":0}]'`);
let r = await as(`select public.fco_bilac_play(1, 'fc')`);
assert.equal(r.plays[0].reward.jackpot, 'special');
assert.equal(r.plays[0].reward.fc, 15020 - 1502, 'người chơi nhận quỹ sau khi trừ Giải Phụ');
let feed = await one('select feed from public.fco_jackpot');
assert.deepEqual(feed.slice(0, 3).map(e => [e.kind, e.amount, !!e.uid]), [['special', 13518, true], ['mini', 1502, false], ['special', 1, false]]);
assert.equal(feed[0].name, 'player_b', 'tên HLV hiện đầy đủ');
// 4. Vòng đã có Giải Phụ: người chơi nhận đủ quỹ, không chèn Giải Phụ.
await db.exec(`update public.fco_jackpot set pot = 15000, at = now(), feed = '[{"kind":"mini","name":"y","amount":1,"time":1},{"kind":"special","name":"x","amount":1,"time":0}]'`);
r = await as(`select public.fco_bilac_play(1, 'fc')`);
assert.equal(r.plays[0].reward.fc, 15020);
feed = await one('select feed from public.fco_jackpot');
assert.deepEqual(feed.slice(0, 2).map(e => e.kind), ['special', 'mini']);
// 5. Đá 10 lượt liền, mọi lượt đều 3 Special: vòng nào cũng có Giải Phụ trước.
await db.exec(`update public.fco_jackpot set pot = 3000, at = now(), feed = '[]'`);
r = await as(`select public.fco_bilac_play(10, 'fc')`);
feed = await one('select feed from public.fco_jackpot');
assert.deepEqual(feed.map(e => e.kind), Array.from({ length: 5 }, () => ['special', 'mini']).flat());
console.log('player OK');
console.log('ALL OK');
