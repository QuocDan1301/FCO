// Chạy thử migration ví FC trên PGlite (không cần Supabase). Cài PGlite ở thư mục tạm rồi chạy từ thư mục dự án:
//   npm i --prefix <tmp> @electric-sql/pglite@0.2.17 && NODE_PATH=<tmp>/node_modules node supabase/tests/fco-wallet.pglite.mjs . supabase/migrations/202611070001_fco_wallet.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of ['202610300001_fco_accounts.sql', '202610300002_delete_own_account.sql']) await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, 'utf8'));
// Tạo người chơi trước migration để thử câu thêm admin.
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid')`, [A, B]);
await db.exec(`insert into public.fco_game_saves values ('${B}', 1, '{"version":1,"cards":[],"fc":999999}')`);
await db.exec(readFileSync(process.argv[3], 'utf8'));
console.log('migration OK');

// Gọi hàm như người chơi: SET ROLE authenticated + uid.
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}
const rpc = async (uid, fn, args = '') => Object.values(await as(uid, `select public.${fn}(${args}) as r`))[0];
const fails = async (p, re) => { await assert.rejects(p, e => re.test(e.message), `expected ${re}`); };

// Bản lưu cũ có FC đã bị gỡ; ghi bản lưu mới cũng bỏ FC.
assert.equal((await db.query(`select data ? 'fc' as has from public.fco_game_saves where user_id = $1`, [B])).rows[0].has, false);
const saved = await rpc(B, 'fco_commit_save', `'{"version":1,"cards":[],"fc":500000}'::jsonb, 1`);
assert.equal(saved.data.fc, undefined);

// Ví mới: 0 FC, điểm sự kiện lấy từ bản lưu, admin đúng người.
let w = await rpc(B, 'fco_wallet', '1234');
assert.deepEqual([w.fc, w.event.points, w.event.free, w.admin, w.dailyClaimed], [0, 1234, 0, false, false]);
assert.equal((await rpc(B, 'fco_wallet', '999999')).event.points, 1234, 'chỉ lấy điểm lần đầu');
assert.equal((await rpc(A, 'fco_wallet')).admin, true);

// Không đăng nhập: bị chặn; bảng không đọc trực tiếp được.
await fails(rpc(null, 'fco_wallet'), /permission denied|Authentication/);
await fails(as(B, 'select * from public.fco_wallets'), /permission denied/);
await fails(as(B, `select public.fco_apply_fc('${B}', 100000, 'hack')`), /permission denied/);
await fails(as(B, `update public.fco_wallets set fc = 1`), /permission denied/);

// Quà mỗi ngày: +1.000, một lần.
w = await rpc(B, 'fco_claim_daily'); assert.equal(w.fc, 1000); assert.equal(w.dailyClaimed, true);
await fails(rpc(B, 'fco_claim_daily'), /FCO_DAILY_CLAIMED/);

// Mua gói: trừ FC, không đủ thì từ chối, không cho số âm / lý do lạ.
w = await rpc(B, 'fco_spend_fc', `300, 'shop', '{"pack":"x","count":3}'`); assert.equal(w.fc, 700);
await fails(rpc(B, 'fco_spend_fc', `701, 'shop'`), /FCO_NOT_ENOUGH_FC/);
await fails(rpc(B, 'fco_spend_fc', `-50, 'shop'`), /FCO_BAD_AMOUNT/);
await fails(rpc(B, 'fco_spend_fc', `10, 'event'`), /FCO_BAD_REASON/);

// Admin cộng FC; người thường không gọi được hàm admin.
await fails(rpc(B, 'fco_admin_credit', `'player_b', 100000`), /FCO_ADMIN_ONLY/);
let c = await rpc(A, 'fco_admin_credit', `' Player_B ', 50000, 'bill 200k'`); assert.deepEqual(c, { login: 'player_b', fc: 50700 });
await fails(rpc(A, 'fco_admin_credit', `'khong_co', 10`), /FCO_USER_NOT_FOUND/);
await fails(rpc(A, 'fco_admin_credit', `'player_b', -999999`), /FCO_NOT_ENOUGH_FC/);
const ledger = await rpc(A, 'fco_admin_ledger', `10`);
assert.equal(ledger[0].login, 'player_b'); assert.equal(ledger[0].delta, 50000); assert.equal(ledger[0].note, 'bill 200k'); assert.equal(ledger[0].admin, true);
assert.equal((await rpc(A, 'fco_admin_ledger', `10, 'player_b'`)).length, 3);

// Gift code: code cũ đã chuyển lên; mỗi tài khoản một lần; hết hạn; admin tạo / xoá.
const h = code => createHash('sha256').update(`fco-gift:${code}`).digest('hex');
const codes = await rpc(A, 'fco_admin_gift_codes'); assert.equal(codes.length, 1); assert.deepEqual(codes[0].rewards, [{ fc: 13000 }]);
await fails(rpc(B, 'fco_admin_gift_save', `'${h('TEST1')}', 'TE•••', '[{"fc":10}]'`), /FCO_ADMIN_ONLY/);
await rpc(A, 'fco_admin_gift_save', `'${h('TEST1')}', 'TE•••', '[{"fc":10},{"bp":5000},{"pack":"eternal","count":2}]'`);
await fails(rpc(A, 'fco_admin_gift_save', `'${h('TEST1')}', 'TE•••', '[{"fc":10}]'`), /FCO_GIFT_EXISTS/);
await fails(rpc(A, 'fco_admin_gift_save', `'${h('BAD')}', 'BA•', '[{"fc":-1}]'`), /FCO_GIFT_BAD_REWARDS/);
await fails(rpc(A, 'fco_admin_gift_save', `'${h('BAD')}', 'BA•', '[{"fc":1.5}]'`), /FCO_GIFT_BAD_REWARDS/);
await rpc(A, 'fco_admin_gift_save', `'${h('OLD')}', 'OL•', '[{"fc":10}]', '2020-01-01'`);
let g = await rpc(B, 'fco_redeem_gift', `'${h('TEST1')}'`);
assert.equal(g.wallet.fc, 50710); assert.equal(g.rewards.length, 3);
await fails(rpc(B, 'fco_redeem_gift', `'${h('TEST1')}'`), /FCO_GIFT_USED/);
await fails(rpc(B, 'fco_redeem_gift', `'${h('NOPE')}'`), /FCO_GIFT_INVALID/);
await fails(rpc(B, 'fco_redeem_gift', `'${h('OLD')}'`), /FCO_GIFT_EXPIRED/);
assert.equal((await rpc(A, 'fco_admin_gift_codes')).find(x => x.hint === 'TE•••').used, 1);
assert.equal((await rpc(A, 'fco_admin_gift_delete', `'${h('OLD')}'`)).length, 2);

// Nhiệm vụ → lượt miễn phí.
w = await rpc(B, 'fco_event_mission', `'daily'`); assert.equal(w.event.free, 1);
await fails(rpc(B, 'fco_event_mission', `'daily'`), /FCO_MISSION_DONE/);
await fails(rpc(B, 'fco_event_mission', `'play'`), /FCO_MISSION_INCOMPLETE/);
await fails(rpc(B, 'fco_event_mission', `'hack'`), /FCO_MISSION_UNKNOWN/);
w = await rpc(B, 'fco_event_mission', `'pack'`); assert.equal(w.event.free, 2);

// Chơi sự kiện: giá đúng, hũ hợp lệ, điểm cộng dồn, lượt miễn phí.
let before = (await rpc(B, 'fco_wallet')).fc;
let p = await rpc(B, 'fco_event_play', `10, 'fc'`);
assert.equal(p.paid, 190); assert.equal(p.hits.length, 10);
const jarFc = [100, 300, 500, 700, 900, 1100, 1300], pts = [1, 1, 2, 3, 5, 10, 15, 20];
assert.equal(p.jarFc, p.hits.filter(x => x.jar === 6).reduce((s, x) => s + jarFc[x.level], 0));
const jpWon = p.jackpotWins.reduce((s, x) => s + x.amount, 0);
assert.equal(p.wallet.fc, before - 190 + p.jarFc + jpWon);
assert.equal(p.wallet.event.points, 1234 + p.hits.reduce((s, x) => s + pts[x.jar], 0));
assert.ok(p.hits.every(x => x.level === 4 || x.level === 5), 'điểm 1234 → cấp 5 (900) hoặc lên cấp 6 (1400)');
assert.equal(p.wallet.event.paid, 10);
await fails(rpc(B, 'fco_event_play', `7, 'fc'`), /FCO_BAD_COUNT/);
await fails(rpc(B, 'fco_event_play', `3, 'free'`), /FCO_NO_FREE_PLAYS/);
p = await rpc(B, 'fco_event_play', `2, 'free'`); assert.equal(p.paid, 0); assert.equal(p.wallet.event.free, 0);
w = await rpc(B, 'fco_event_mission', `'play'`); assert.equal(w.event.free, 2);
// Không đủ FC thì không chơi được và không đổi gì.
await rpc(A, 'fco_admin_credit', `'player_b', ${-(await rpc(B, 'fco_wallet')).fc}`);
const pointsBefore = (await rpc(B, 'fco_wallet')).event.points;
await fails(rpc(B, 'fco_event_play', `1, 'fc'`), /FCO_NOT_ENOUGH_FC/);
assert.equal((await rpc(B, 'fco_wallet')).event.points, pointsBefore);

// Jackpot: quỹ tăng theo thời gian, bot nổ, FC người chơi góp vào quỹ; người chơi trúng thì ghi tên che bớt.
await db.exec(`update public.fco_jackpot set pot = 2000, at = now() - interval '1 hour', feed = '[]'`);
let jp = await rpc(B, 'fco_jackpot_state');
assert.ok(jp.feed.length > 0 && jp.feed.some(x => x.kind === 'special'), 'bot nổ Giải Đặc Biệt trong 1 giờ');
assert.ok(jp.feed.every(x => x.mine === false && !('uid' in x)));
await db.exec(`update public.fco_jackpot set pot = 9000, at = now(), feed = '[]'`);
await rpc(A, 'fco_admin_credit', `'player_b', 1800`);
p = await rpc(B, 'fco_event_play', `100, 'fc'`);
const pot = (await db.query('select pot from public.fco_jackpot')).rows[0].pot;
if (!p.jackpotWins.length) assert.equal(Number(pot), 9000 + 1800, 'không trúng thì cả 1.800 FC vào quỹ');
// Ép trúng: quỹ ở mức chắc chắn (pressure cao) để kiểm tra luồng trúng của người chơi.
let mine = null;
for (let k = 0; k < 3000 && !mine; k++) {
  await db.exec(`update public.fco_jackpot set pot = 19999, at = now(), feed = '[]'`);
  await rpc(A, 'fco_admin_credit', `'player_b', 20`);
  p = await rpc(B, 'fco_event_play', `1, 'fc'`);
  if (p.jackpotWins.length) mine = p;
}
assert.ok(mine, 'người chơi trúng được jackpot');
assert.equal(mine.jackpot.feed[0].mine, true); assert.equal(mine.jackpot.feed[0].name, 'pla***');
assert.equal((await rpc(A, 'fco_jackpot_state')).feed[0].mine, false);
assert.ok((await db.query(`select count(*) from public.fco_fc_ledger where reason = 'jackpot'`)).rows[0].count > 0);

// Sổ cái khớp số dư.
const sum = (await db.query(`select coalesce(sum(delta),0)::bigint s from public.fco_fc_ledger where user_id = $1`, [B])).rows[0].s;
assert.equal(Number(sum), (await rpc(B, 'fco_wallet')).fc);
console.log('ALL PASS');
