// Penalty đối kháng (migration 202611240006_fco_penalty_pvp.sql + 202611240008_fco_pvp_test_mode.sql + 202611240009_fco_pvp_alternate.sql) trên PGlite, áp mọi migration của dự án theo thứ tự.
// Chạy: node fco-pvp.pglite.mjs <thư mục dự án>  (từ thư mục có @electric-sql/pglite, ví dụ D:\FCOvv-tmp\pg)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz, encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz);
  create schema extensions; create extension pgcrypto schema extensions;
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const dir = `${root}/supabase/migrations`;
const errs = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 120)); try { await db.exec('rollback'); } catch {} }
}
assert.ok(!errs.some(x => x.startsWith('20261124000')), 'migration mới lỗi: ' + errs.join(' | '));
console.log('migrations áp xong, migration khác lỗi (bỏ qua):', errs.length);
const one = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const users = {};
for (const [k, n] of [['A', 1], ['B', 2], ['C', 3], ['D', 4]]) {
  users[k] = `00000000-0000-0000-0000-0000000000e${n}`;
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [users[k], `pvptester${n}@gmail.com`]);
}
const as = async k => db.query(`select set_config('test.uid', $1, false)`, [users[k]]);
const rpc = async (k, sql, params = []) => { await as(k); return one(sql, params); };
const pick = (k, id, round, sx = .8, sy = .7, dx = -.8, dy = .2) => rpc(k, `select public.fco_pvp_pick($1, $2, $3::jsonb, $4::jsonb)`,
  [id, round, JSON.stringify({ x: sx, y: sy, kind: 'normal' }), JSON.stringify({ x: dx, y: dy })]);
const pts = async k => Number((await db.query('select points from public.fco_pvp_ranks where user_id = $1', [users[k]])).rows[0]?.points ?? 1000);

// 0. Chế độ thử nghiệm (202611240008): mặc định chỉ admin + acc phụ chơi được.
const E = '00000000-0000-0000-0000-0000000000e9', S = '00000000-0000-0000-0000-0000000000ea';
await db.query(`insert into auth.users(id, email) values ($1, 'pvpadminx@gmail.com'), ($2, 'pvpsubaccx@gmail.com')`, [E, S]);
await db.query('insert into public.fco_admins(user_id) values ($1)', [E]);
await db.query('insert into public.fco_sub_accounts(user_id) values ($1)', [S]);
users.E = E; users.S = S;
let acc = await rpc('A', 'select public.fco_pvp_access()');
assert.deepEqual([acc.open, acc.allowed, acc.admin], [false, false, false], 'thử nghiệm: người chơi thường không thấy');
await assert.rejects(rpc('A', 'select public.fco_pvp_find()'), /FCO_PVP_CLOSED/);
await assert.rejects(rpc('A', 'select public.fco_pvp_room_create()'), /FCO_PVP_CLOSED/);
assert.equal((await rpc('E', 'select public.fco_pvp_access()')).allowed, true, 'admin được thử');
assert.equal((await rpc('S', 'select public.fco_pvp_access()')).allowed, true, 'acc phụ được thử');
const tr = await rpc('E', 'select public.fco_pvp_room_create()');
const tj = await rpc('S', 'select public.fco_pvp_room_join($1)', [tr.code]);
assert.equal(tj.status, 'playing', 'admin tạo phòng, acc phụ vào được');
await rpc('E', 'select public.fco_pvp_leave($1)', [tr.id]);
const tq = await rpc('S', 'select public.fco_pvp_find()'); const tq2 = await rpc('E', 'select public.fco_pvp_find()');
assert.equal(tq2.id, tq.id, 'thử nghiệm: admin ghép ngẫu nhiên gặp acc phụ đang chờ');
await rpc('S', 'select public.fco_pvp_leave($1)', [tq.id]);
assert.equal(await one('select count(*)::integer from public.fco_pvp_ranks where user_id in ($1, $2)', [E, S]), 0, 'trận có acc phụ không tính BXH');
await assert.rejects(rpc('A', 'select public.fco_admin_pvp_open(true)'), /./, 'chỉ admin mở được');
acc = await rpc('E', 'select public.fco_admin_pvp_open(true)');
assert.equal(acc.open, true);
assert.equal((await rpc('A', 'select public.fco_pvp_access()')).allowed, true, 'đã mở: người chơi thường chơi được');
await assert.rejects(rpc('S', 'select public.fco_pvp_find()'), /FCO_SUB_ACCOUNT/, 'đã mở: acc phụ không chơi nữa');
// 1. Ghép ngẫu nhiên: A chờ, B vào cùng trận.
let a = await rpc('A', 'select public.fco_pvp_find()');
assert.equal(a.status, 'waiting'); assert.equal(a.mode, 'random');
let b = await rpc('B', 'select public.fco_pvp_find()');
assert.equal(b.id, a.id, 'B nối vào trận A đang chờ'); assert.equal(b.status, 'playing'); assert.equal(b.round, 1);
a = await rpc('A', 'select public.fco_pvp_current()');
assert.equal(a.status, 'playing'); assert.ok(a.opponent?.name, 'thấy tên đối thủ');
await assert.rejects(rpc('A', 'select public.fco_pvp_room_create()'), /FCO_PVP_BUSY/, 'đang đá thì không tạo phòng');

// 2. Luân phiên (202611240009): quả 1 một người sút, người kia bắt; lựa chọn giữ kín tới khi đủ hai bên.
const shooterA = a.iShoot; b = await rpc('B', 'select public.fco_pvp_state($1)', [a.id]);
assert.equal(b.iShoot, !shooterA, 'đúng một người sút, người kia làm thủ môn');
a = await pick('A', a.id, 1);
assert.equal(a.picked, true); assert.equal(a.rounds.length, 0);
b = await rpc('B', 'select public.fco_pvp_state($1)', [a.id]);
assert.equal(b.oppPicked, true); assert.ok(!JSON.stringify(b).includes('"x":0.8') && !JSON.stringify(b).includes('"x":-0.8'), 'không lộ lựa chọn của A');
b = await pick('B', a.id, 1, -.5, .3, .9, .8);
assert.equal(b.rounds.length, 1); assert.ok(['goal', 'save', 'miss'].includes(b.rounds[0].o));
assert.equal(b.rounds[0].shooter, shooterA ? 'opp' : 'me');
// Lựa chọn của người sút là điểm sút của quả, của thủ môn là hướng bay người.
if (shooterA) { assert.deepEqual(b.rounds[0].shot, { x: .8, y: .7, kind: 'normal' }); assert.deepEqual(b.rounds[0].dive, { x: .9, y: .8 }); }
else { assert.deepEqual(b.rounds[0].shot, { x: -.5, y: .3, kind: 'normal' }); assert.deepEqual(b.rounds[0].dive, { x: -.8, y: .2 }); }
assert.equal(b.round, 2); assert.equal(b.iShoot, shooterA, 'quả 2 đổi vai');
// Người sút chỉ cần gửi điểm sút, thủ môn chỉ cần hướng bay người.
const keeperK = b.iShoot ? 'A' : 'B', shooterK = b.iShoot ? 'B' : 'A';
await assert.rejects(rpc(shooterK, `select public.fco_pvp_pick($1, 2, null, '{"x":0,"y":0}'::jsonb)`, [a.id]), /FCO_PVP_BAD_PICK/, 'người sút phải có điểm sút');
await rpc(keeperK, `select public.fco_pvp_pick($1, 2, null, '{"x":0.1,"y":0.2}'::jsonb)`, [a.id]);
const two = await rpc(shooterK, `select public.fco_pvp_pick($1, 2, '{"x":-0.6,"y":0.4,"kind":"curl"}'::jsonb, null)`, [a.id]);
assert.equal(two.rounds.length, 2); assert.deepEqual(two.rounds[1].dive, { x: .1, y: .2 }); assert.equal(two.rounds[1].shot.kind, 'curl');

// 3. Đá hết trận (có lượt hết giờ máy tự chọn), kiểm luật kết thúc kiểu luân phiên.
let id = a.id, guard = 0, s;
while (guard++ < 60) {
  s = await rpc('A', 'select public.fco_pvp_state($1)', [id]);
  if (s.status === 'done') break;
  await pick('A', id, s.round);
  if (guard % 4 === 0) { await db.query(`update public.fco_pvp_matches set deadline = now() - interval '10 seconds' where id = $1`, [id]); await rpc('A', 'select public.fco_pvp_state($1)', [id]); }
  else await pick('B', id, s.round, -.7, .6, .7, .7);
}
assert.equal(s.status, 'done');
const [mine, theirs] = s.score;
assert.equal(s.winner, mine > theirs ? 'me' : mine < theirs ? 'opp' : 'draw');
const n = s.rounds.length;
for (let i = 1; i < n; i++) assert.notEqual(s.rounds[i].shooter, s.rounds[i - 1].shooter, 'luân phiên người sút');
assert.equal(mine, s.rounds.filter(x => x.shooter === 'me' && x.o === 'goal').length);
assert.equal(theirs, s.rounds.filter(x => x.shooter === 'opp' && x.o === 'goal').length);
const kMine = s.rounds.filter(x => x.shooter === 'me').length, kTheirs = n - kMine;
if (n < 10) assert.ok(mine > theirs + (5 - kTheirs) || theirs > mine + (5 - kMine), `kết thúc sớm hợp lệ sau ${n} quả`);
else if (s.winner !== 'draw') assert.ok(n === 10 || n % 2 === 0, `luân lưu kết thúc sau cặp đủ 2 quả (${n})`);
assert.ok(n <= 30);
const pa = await pts('A'), pb = await pts('B');
assert.equal(pa + pb, 2000, 'Elo cộng / trừ bằng nhau');
if (s.winner === 'me') assert.ok(pa >= 1005); if (s.winner === 'opp') assert.ok(pa <= 995);
// 4. Phòng mã: A tạo, B nhập (chữ thường cũng được); giao hữu → không đổi điểm. Rời trận = thua.
const room = await rpc('A', 'select public.fco_pvp_room_create()');
assert.match(room.code, /^[A-Z2-9]{6}$/); assert.equal(room.status, 'waiting');
await assert.rejects(rpc('C', `select public.fco_pvp_room_join('ZZZZZZ')`), /FCO_PVP_NO_ROOM/);
const joined = await rpc('B', 'select public.fco_pvp_room_join($1)', [room.code.toLowerCase()]);
assert.equal(joined.id, room.id); assert.equal(joined.status, 'playing'); assert.equal(joined.mode, 'room');
const left = await rpc('A', 'select public.fco_pvp_leave($1)', [room.id]);
assert.equal(left.winner, 'opp'); assert.equal(left.reason, 'leave');
assert.equal(await pts('A'), pa, 'phòng giao hữu không đổi điểm');

// 5. Mất kết nối quá 45 giây = thua.
await rpc('C', 'select public.fco_pvp_find()'); const dd = await rpc('D', 'select public.fco_pvp_find()');
assert.equal(dd.status, 'playing');
await db.query(`update public.fco_pvp_matches set p1_seen = now() - interval '2 minutes' where id = $1`, [dd.id]);
const after = await rpc('D', 'select public.fco_pvp_state($1)', [dd.id]);
assert.equal(after.winner, 'me'); assert.equal(after.reason, 'away');

// 6. Người chờ đã rời (không hỏi trạng thái 20 giây) thì không được ghép.
const w = await rpc('C', 'select public.fco_pvp_find()');
await db.query(`update public.fco_pvp_matches set p1_seen = now() - interval '1 minute' where id = $1`, [w.id]);
const w2 = await rpc('A', 'select public.fco_pvp_find()');
assert.notEqual(w2.id, w.id); assert.equal(w2.status, 'waiting');
assert.equal(await one('select status from public.fco_pvp_matches where id = $1', [w.id]), 'cancelled');

// 7. BXH: chỉ người đã đá trận xếp hạng.
const board = await rpc('B', 'select public.fco_pvp_board()');
assert.ok(board.top.length >= 2); assert.equal(board.top[0].rank, 1); assert.ok(board.me && board.me.rank >= 1);
await assert.rejects(rpc('A', `select public.fco_pvp_pick(${w2.id}, 1, '{"x":5,"y":0}'::jsonb, '{"x":0,"y":0}'::jsonb)`), /FCO_PVP_BAD_PICK/);
console.log('pvp OK');