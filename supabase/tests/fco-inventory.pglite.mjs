// Kho thẻ trên máy chủ (supabase/migrations/202611100013_fco_inventory_server.sql) chạy trên PGlite.
// Chuẩn bị: npx tsx scripts/inventory-fixture.ts <fixture.json>   (bộ dữ liệu + kết quả game tính để so)
// Chạy:     node fco-inventory.pglite.mjs <thư mục dự án> <fixture.json> <các migration theo thứ tự…>
// (cần @electric-sql/pglite: đặt file này cạnh node_modules có PGlite, ví dụ D:\FCOvv-tmp\pg).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, fixturePath, ...files] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const { catalog, version } = fixture;
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz, encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}');
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create schema extensions; create extension pgcrypto schema extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.query(`insert into auth.users(id, email) values ($1, 'quocdan06@players.fco.invalid'), ($2, 'player_b@players.fco.invalid'), ($3, 'player_c@players.fco.invalid')`, [A, B, C]);
for (const f of files) await db.exec(readFileSync(f, 'utf8'));
await db.query(`insert into public.fco_admins(user_id) values ($1) on conflict do nothing`, [A]);
console.log(`migrations OK (${files.length})`);

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : undefined; } finally { await db.exec('reset role'); }
}
const one = async (sql, params = []) => { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : undefined; };
const save = async uid => one(`select data from public.fco_game_saves where user_id = $1`, [uid]);
const setSave = (uid, data) => db.query(`update public.fco_game_saves set data = $2::jsonb where user_id = $1`, [uid, JSON.stringify(data)]);
const initial = extra => JSON.stringify({ version: 1, balance: 0, cards: [], history: [], daily: '', opened: 0, upgrades: 0, sound: false, reduced: false, ...extra });

// 1. Giá dao động: SQL đúng từng số như priceAt của game (mọi thẻ có giá dao động, 3 kỳ).
{
  const chunk = 20000;
  for (let i = 0; i < fixture.prices.length; i += chunk) {
    const rows = fixture.prices.slice(i, i + chunk);
    const bad = await one(`select coalesce(jsonb_agg(x), '[]') from (
      select r from jsonb_array_elements($1::jsonb) r
      where public.fco_inv_swung((r->>3)::bigint, public.fco_inv_swing((r->>0)::bigint, (r->>1)::bigint, (r->>2)::bigint), 10) <> (r->>4)::bigint limit 5) x`, [JSON.stringify(rows)]);
    assert.deepEqual(bad, [], `giá lệch: ${JSON.stringify(bad)}`);
  }
  assert.equal(await one(`select public.fco_inv_money(1234567)`), '1.23M');
  assert.equal(await one(`select public.fco_inv_money(2500000000)`), '2.5B');
  assert.equal(await one(`select public.fco_inv_money(123456)`), '123.456');
  console.log(`prices OK (${fixture.prices.length})`);
}

// 2. Chưa đồng bộ: thao tác báo FCO_CATALOG_MISSING; người chơi thường không đồng bộ được.
await as(B, `select public.fco_commit_save($1::jsonb, 0, true)`, [initial({ inv: 1 })]);
await assert.rejects(as(B, `select public.fco_inv_open($1, array['eternal'], 1)`, [version]), /FCO_CATALOG_MISSING/);
await assert.rejects(as(B, `select public.fco_admin_catalog_begin($1)`, [version]), /FCO_ADMIN_ONLY/);

// 3. Admin đồng bộ theo từng phần như AdminPanel.
async function sync(cat, ver) {
  await as(A, `select public.fco_admin_catalog_begin($1)`, [ver]);
  for (let i = 0; i < cat.players.length; i += 1000) await as(A, `select public.fco_admin_catalog_players($1, $2::jsonb)`, [ver, JSON.stringify(cat.players.slice(i, i + 1000))]);
  for (let i = 0; i < cat.packs.length; i += 20) await as(A, `select public.fco_admin_catalog_packs($1, $2::jsonb)`, [ver, JSON.stringify(cat.packs.slice(i, i + 20))]);
  return as(A, `select public.fco_admin_catalog_commit($1, $2::jsonb, $3, $4)`, [ver, JSON.stringify(cat.rules), cat.players.length, cat.packs.length]);
}
const state = await sync(catalog, version);
assert.equal(state.version, version); assert.equal(state.enforced, false);
assert.deepEqual(await as(B, `select public.fco_inventory_state()`).then(s => s.version), version);
assert.equal(await one(`select count(*)::int from public.fco_cat_players`), catalog.players.length);
await assert.rejects(as(B, `select public.fco_inv_open($1, array['eternal'], 1)`, ['0'.repeat(64)]), /FCO_CATALOG_STALE/);
console.log('catalog sync OK');

// 4. Mua gói Shop bằng FC: giá lấy từ bộ dữ liệu, gói vào kho, FC trừ ở ví.
const shopPack = catalog.packs.find(p => p.shop && p.available && !p.choose);
await db.query(`select public.fco_wallet_lock($1)`, [B]);
await db.query(`select public.fco_apply_fc($1, $2, 'admin')`, [B, shopPack.price * 3]);
let r = await as(B, `select public.fco_inv_shop($1, $2, 3)`, [version, shopPack.id]);
assert.equal(r.wallet.fc, 0);
assert.equal(r.save.data.unopened[shopPack.id], 3);
assert.equal(r.save.data.history[0].type, 'shop');
await assert.rejects(as(B, `select public.fco_inv_shop($1, $2, 1)`, [version, shopPack.id]), /FCO_NOT_ENOUGH_FC/);
await assert.rejects(as(B, `select public.fco_inv_shop($1, 'bl-113-lwbb', 1)`, [version]), /FCO_PACK_UNAVAILABLE/);

// 5. Mở gói: đúng số thẻ, cầu thủ / cấp thuộc gói, trừ kho, cộng opened, lịch sử.
r = await as(B, `select public.fco_inv_open($1, array[$2], 2)`, [version, shopPack.id]);
assert.equal(r.cards.length, 2); assert.equal(r.pack, shopPack.id);
assert.ok(r.cards.every(c => shopPack.players.includes(c.playerId) && shopPack.levels.includes(c.level)));
assert.equal(r.save.data.unopened[shopPack.id], 1); assert.equal(r.save.data.opened, 2); assert.equal(r.save.data.cards.length, 2);
assert.match(r.save.data.history[0].title, /^Mở 2 /);
await assert.rejects(as(B, `select public.fco_inv_open($1, array[$2], 5)`, [version, shopPack.id]), /FCO_NOT_ENOUGH_PACKS/);
// Mở theo lựa chọn (p_count null): mở hết, tối đa 150, bỏ gói chỉ định.
const ranged = catalog.packs.find(p => p.available && !p.choose && p.levels.length >= 3);
const choose = catalog.packs.find(p => p.available && p.choose);
await setSave(B, { ...(await save(B)), unopened: { [ranged.id]: 400, [choose.id]: 2, [shopPack.id]: 1 } });
r = await as(B, `select public.fco_inv_open($1, array[$2, $3, $4], null)`, [version, choose.id, shopPack.id, ranged.id]);
assert.equal(r.cards.length, 150); assert.equal(r.pack, shopPack.id);
assert.equal(r.save.data.unopened[ranged.id], 251); assert.equal(r.save.data.unopened[choose.id], 2);
await assert.rejects(as(B, `select public.fco_inv_open($1, array[$2], 1)`, [version, choose.id]), /FCO_CHOOSE_PACK/);
// Tỷ lệ cấp của gói có khoảng cấp: mở nhiều lần, tần suất gần bảng công bố.
{
  const counts = new Map();
  for (let i = 0; i < 2; i++) {
    const res = await as(B, `select public.fco_inv_open($1, array[$2], 125)`, [version, ranged.id]);
    for (const c of res.cards) counts.set(c.level, (counts.get(c.level) ?? 0) + 1);
  }
  const firstShare = (counts.get(ranged.levels[0]) ?? 0) / 250;
  assert.ok(Math.abs(firstShare - ranged.levelWeights[0]) < .1, `cấp thấp nhất ${firstShare} so với ${ranged.levelWeights[0]}`);
}
// Gói chỉ định: đúng danh sách → nhận 1 trong số đã chọn, cấp của gói.
const picks = choose.draft.slice(0, choose.draftSize);
r = await as(B, `select public.fco_inv_open_draft($1, $2, array(select jsonb_array_elements_text($3::jsonb)::int), 2)`, [version, choose.id, JSON.stringify(picks)]);
assert.equal(r.cards.length, 2); assert.ok(r.cards.every(c => picks.includes(c.playerId) && c.level === choose.draftLevel));
await assert.rejects(as(B, `select public.fco_inv_open_draft($1, $2, array[1, 2], 1)`, [version, choose.id]), /FCO_BAD_DRAFT|FCO_NOT_ENOUGH_PACKS/);
console.log('open OK');

// 6. Đập thẻ: năng lượng / tỷ lệ / khôi phục đúng như game cho 400 bộ phôi ngẫu nhiên.
{
  const base = await save(B);
  for (const [i, u] of fixture.upgrades.entries()) {
    const cards = [{ uid: 't', playerId: u.target[0], level: u.target[1], received: 0 }, ...u.materials.map(([p, l], k) => ({ uid: `m${k}`, playerId: p, level: l, received: 0 }))];
    await setSave(B, { ...base, cards, locked: [], balance: 0 });
    const res = await as(B, `select public.fco_inv_upgrade($1, 't', array(select jsonb_array_elements_text($2::jsonb)), 0)`, [version, JSON.stringify(u.materials.map((_, k) => `m${k}`))]);
    assert.equal(res.energy, u.energy, `#${i} năng lượng ${JSON.stringify(u)}`);
    assert.equal(res.rate, u.rate, `#${i} tỷ lệ ${JSON.stringify(u)}`);
    assert.equal(res.restoreChance, u.restore, `#${i} khôi phục`);
    if (u.restore > 0) assert.equal(res.keep, u.keep, `#${i} mức giữ`);
    const after = res.save.data;
    assert.equal(after.cards.length, 1); assert.equal(after.cards[0].uid, 't'); assert.equal(after.cards[0].level, res.card.level);
    if (res.success) assert.equal(res.card.level, u.target[1] + 1);
    else assert.ok(res.card.level <= u.target[1] && res.drop >= 1);
  }
  console.log(`upgrade math OK (${fixture.upgrades.length})`);
  // +1 → +2 tỷ lệ 100% khi đủ 5 vạch: luôn thành công; kỷ lục BXH do máy chủ ghi.
  const p = catalog.players.find(x => x[3][7] !== null && x[3][7] > 1000);
  await db.query(`delete from public.fco_ranks where user_id = $1`, [B]);
  await setSave(B, { ...base, cards: [1, 2, 3, 4, 5, 6].map(k => ({ uid: `c${k}`, playerId: p[0], level: 1, received: 0 })), balance: 0, upgrades: 0 });
  r = await as(B, `select public.fco_inv_upgrade($1, 'c1', array['c2','c3','c4','c5','c6'], 0)`, [version]);
  assert.equal(r.success, true); assert.equal(r.card.level, 2); assert.equal(r.save.data.upgrades, 1);
  assert.equal(await one(`select best_ovr from public.fco_ranks where user_id = $1`, [B]), p[2][1]);
  // Thẻ khoá không làm phôi được; phôi thiếu / trùng thẻ chính bị chặn.
  await setSave(B, { ...base, cards: [{ uid: 'a', playerId: p[0], level: 3, received: 0 }, { uid: 'b', playerId: p[0], level: 1, received: 0 }], locked: ['b'], balance: 0 });
  await assert.rejects(as(B, `select public.fco_inv_upgrade($1, 'a', array['b'], 0)`, [version]), /FCO_MATERIAL_LOCKED/);
  await assert.rejects(as(B, `select public.fco_inv_upgrade($1, 'a', array['a'], 0)`, [version]), /FCO_BAD_MATERIALS/);
  await assert.rejects(as(B, `select public.fco_inv_upgrade($1, 'a', array['zz'], 0)`, [version]), /FCO_MATERIAL_MISSING/);
  // Bảo vệ 100% ở thẻ +8: thất bại thì giữ nguyên cấp, phí trừ BP dù kết quả thế nào; thiếu BP thì không đập.
  const price8 = await one(`select public.fco_inv_price($1, 8)`, [p[0]]);
  const cost = Math.round(Math.round(price8 * p[5]) * 100 / 100);
  await setSave(B, { ...base, cards: [{ uid: 'a', playerId: p[0], level: 8, received: 0 }, { uid: 'b', playerId: p[0], level: 1, received: 0 }], locked: [], balance: cost - 1 });
  await assert.rejects(as(B, `select public.fco_inv_upgrade($1, 'a', array['b'], 100)`, [version]), /FCO_NOT_ENOUGH_BP/);
  for (let i = 0; i < 10; i++) {
    await setSave(B, { ...base, cards: [{ uid: 'a', playerId: p[0], level: 8, received: 0 }, { uid: 'b', playerId: catalog.players[0][0], level: 1, received: 0 }], locked: [], balance: cost });
    r = await as(B, `select public.fco_inv_upgrade($1, 'a', array['b'], 100)`, [version]);
    assert.equal(r.cost, cost); assert.equal(r.save.data.balance, 0);
    assert.equal(r.card.level, r.success ? 9 : 8); assert.equal(r.shielded, !r.success);
  }
  await assert.rejects(as(B, `select public.fco_inv_upgrade($1, 'a', array['b'], 30)`, [version]), /FCO_MATERIAL_MISSING/);
  // Khôi phục 100% (phôi bản sao cùng cấp, thẻ +6): thất bại thì không rớt dưới +6.
  for (let i = 0; i < 15; i++) {
    await setSave(B, { ...base, cards: [{ uid: 'a', playerId: p[0], level: 6, received: 0 }, { uid: 'b', playerId: p[0], level: 6, received: 0 }], locked: [], balance: 0 });
    r = await as(B, `select public.fco_inv_upgrade($1, 'a', array['b'], 0)`, [version]);
    assert.ok(r.card.level >= 6, `khôi phục: ${JSON.stringify(r.card)}`);
    if (!r.success) { assert.equal(r.restored, 6); assert.match(r.save.data.history[0].detail, /Khôi phục cấp thẻ/); }
  }
  console.log('upgrade rules OK');
}

// 7. Bán / mua: giá trong biên ±10%, thuế 40% (SVIP còn hạn 28%), BP cộng / trừ đúng.
{
  const p = catalog.players.find(x => x[3][4] !== null && x[3][4] > 100000 && !x[4]);
  const price = await one(`select public.fco_inv_price($1, 5)`, [p[0]]);
  const base = await save(B);
  await setSave(B, { ...base, cards: [{ uid: 's1', playerId: p[0], level: 5, received: 0 }, { uid: 's2', playerId: p[0], level: 5, received: 0 }, { uid: 's3', playerId: p[0], level: 5, received: 0 }], locked: ['s3'], balance: 0 });
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 's1', price: Math.floor(price * 1.2) }])]), /FCO_BAD_PRICE/);
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 's3', price }])]), /FCO_CARD_LOCKED/);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 's1', price }])]);
  assert.equal(r.fees, Math.floor(price * 40 / 100)); assert.equal(r.save.data.balance, price - Math.floor(price * 40 / 100));
  assert.match(r.save.data.history[0].detail, /Phí 40%/);
  await db.query(`update public.fco_wallets set svip_until = now() + interval '1 day' where user_id = $1`, [B]);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 's2', price }])]);
  assert.equal(r.tax, 28); assert.equal(r.fees, Math.floor(price * 28 / 100));
  const balance = r.save.data.balance;
  await assert.rejects(as(B, `select public.fco_inv_buy($1, $2, 5, 10)`, [version, p[0]]), /FCO_NOT_ENOUGH_BP/);
  r = await as(B, `select public.fco_inv_buy($1, $2, 5, 1)`, [version, p[0]]);
  assert.equal(r.save.data.balance, balance - price); assert.equal(r.cards[0].fromMarket, true);
  // Xoá thẻ: thẻ khoá không xoá được.
  await assert.rejects(as(B, `select public.fco_inv_release(array['s3'])`), /FCO_CARD_LOCKED/);
  r = await as(B, `select public.fco_inv_release(array[$1])`, [r.cards[0].uid]);
  assert.equal(r.save.data.cards.length, 1);
  console.log('market OK');
}

// 8. Gộp bản lưu: trình duyệt không đổi được thẻ / BP / gói; cài đặt và lịch sử vẫn nhận.
{
  const server = await save(B);
  const forged = { ...server, balance: 999999999, cards: [...server.cards, { uid: 'fake', playerId: 1, level: 13, received: 0 }], unopened: { eternal: 99 }, sound: true,
    history: [{ id: 'client-1', time: Date.now() + 1000, type: 'gift', title: 'x', detail: 'y' }, ...server.history] };
  const saved = await as(B, `select public.fco_commit_save($1::jsonb, 1, true)`, [JSON.stringify(forged)]);
  assert.equal(saved.data.balance, server.balance); assert.deepEqual(saved.data.cards, server.cards); assert.deepEqual(saved.data.unopened, server.unopened);
  assert.equal(saved.data.sound, true); assert.equal(saved.data.history[0].id, 'client-1');
  assert.equal(saved.data.history.length, Math.min(200, server.history.length + 1));
  // Thông tin HLV lưu một lần (202611110002): mục máy chủ đã có thì giữ, trình duyệt chỉ điền mục còn trống.
  const lockSql = files.find(f => f.includes('202611110002'));
  if (lockSql) {
    await setSave(B, { ...(await save(B)), profile: { gender: 'male' } });
    let p = await as(B, `select public.fco_commit_save($1::jsonb, 1, true)`, [JSON.stringify({ ...(await save(B)), profile: { gender: 'female', birthday: '01-01' } })]);
    assert.deepEqual(p.data.profile, { gender: 'male', birthday: '01-01' });
    p = await as(B, `select public.fco_commit_save($1::jsonb, 1, true)`, [JSON.stringify({ ...(await save(B)), profile: { gender: 'other', birthday: '09-09' } })]);
    assert.deepEqual(p.data.profile, { gender: 'male', birthday: '01-01' });
    p = await as(B, `select public.fco_commit_save($1::jsonb, 1, true)`, [JSON.stringify({ ...(await save(B)), profile: undefined })]);
    assert.deepEqual(p.data.profile, { gender: 'male', birthday: '01-01' }, 'bỏ profile ở trình duyệt cũng không xoá được');
  }
  // Chưa bắt buộc: game bản cũ (không gộp) vẫn ghi đè như trước.
  const legacy = await as(C, `select public.fco_commit_save($1::jsonb, 0)`, [initial({ balance: 5 })]);
  assert.equal(legacy.data.balance, 5);
  // Bắt buộc: kể cả gọi kiểu cũ cũng bị gộp; tài khoản mới bắt đầu kho trống.
  await as(A, `select public.fco_admin_inventory_enforce(true)`);
  const old = await as(C, `select public.fco_commit_save($1::jsonb, $2)`, [initial({ balance: 777 }), legacy.revision]);
  assert.equal(old.data.balance, 5);
  await db.query(`delete from public.fco_game_saves where user_id = $1`, [C]);
  const fresh = await as(C, `select public.fco_commit_save($1::jsonb, 0)`, [initial({ balance: 777, cards: [{ uid: 'x', playerId: 1, level: 13, received: 0 }] })]);
  assert.equal(fresh.data.balance, 0); assert.deepEqual(fresh.data.cards, []);
  await assert.rejects(as(C, `select public.fco_spend_fc(10, 'shop', '{}'::jsonb)`), /FCO_UPDATE_REQUIRED/);
  console.log('merge / enforce OK');
}

// 9. Quà: Bi Lắc, gift code, admin tặng cộng thẳng vào kho khi máy chủ giữ kho.
{
  await db.exec(`update public.fco_bilac_symbols set weight = case id when 'bp' then 100 when 'club' then 1 when 'card' then 1 else 0 end`);
  await db.query(`select public.fco_wallet_lock($1)`, [B]);
  const before = (await save(B)).balance;
  r = await as(B, `select public.fco_bilac_play(1, 'free')`);
  assert.ok(r.save, 'Bi Lắc trả bản lưu mới');
  const bp = r.plays.reduce((s, p) => s + (p.reward.bp ?? 0), 0);
  assert.equal(r.save.data.balance, before + bp); assert.match(r.save.data.history[0].title, /^Bi Lắc · 1 lượt miễn phí/);
  // Gift code có gói + BP.
  await db.query(`insert into public.fco_gift_codes(hash, hint, rewards) values ($1, 'GI••', $2::jsonb)`, ['a'.repeat(64), JSON.stringify([{ bp: 1000 }, { pack: 'eternal', count: 2 }, { fc: 5 }])]);
  const stock = (await save(B)).unopened.eternal ?? 0;
  r = await as(B, `select public.fco_redeem_gift($1)`, ['a'.repeat(64)]);
  assert.equal(r.save.data.unopened.eternal, stock + 2); assert.match(r.save.data.history[0].detail, /BP/);
  // Admin tặng gói: nhận một lần, lần sau không còn quà chờ.
  await as(A, `select public.fco_admin_send_gift($1, null, 'eternal', 3, 'thử')`, [B]);
  r = await as(B, `select public.fco_inv_claim_gifts()`);
  assert.equal(r.texts.length, 1); assert.equal(r.save.data.unopened.eternal, stock + 5);
  r = await as(B, `select public.fco_inv_claim_gifts()`);
  assert.deepEqual(r.texts, []);
  // Điểm danh ngày 7: gói the-moment vào kho.
  await db.query(`update public.fco_wallets set daily = null, checkin_day = 6, checkin_date = public.fco_today() - 1 where user_id = $1`, [B]);
  r = await as(B, `select public.fco_claim_daily()`);
  assert.equal(r.save.data.unopened['the-moment'], 1);
  // Kỷ lục BXH trình duyệt gửi bị bỏ qua khi máy chủ giữ kho.
  await as(B, `select public.fco_rank_upgrade(999, 1, 13)`);
  assert.notEqual(await one(`select best_ovr from public.fco_ranks where user_id = $1`, [B]), 999);
  console.log('grants OK');
}

// 10. Tắt bắt buộc + bản lưu không đánh dấu inv: quà trả về để game bản cũ tự cộng (save = null).
{
  await as(A, `select public.fco_admin_inventory_enforce(false)`);
  const legacy = await save(C);
  await setSave(C, { ...legacy, inv: undefined });
  await db.query(`select public.fco_wallet_lock($1)`, [C]);
  r = await as(C, `select public.fco_bilac_play(1, 'free')`);
  assert.equal(r.save, null);
  console.log('legacy grants OK');
}

// 11. Loại tài khoản do admin đặt (202611110003): mặc định classic, người chơi không tự đặt được, ví trả về tier.
if (files.some(f => f.includes('202611110003'))) {
  assert.equal((await as(B, `select public.fco_wallet()`)).tier, 'classic');
  await assert.rejects(as(B, `select public.fco_admin_account_tier($1, 'premium')`, [B]), /FCO_ADMIN_ONLY/);
  await assert.rejects(as(A, `select public.fco_admin_account_tier($1, 'vip')`, [B]), /FCO_BAD_TIER/);
  assert.equal((await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [B])).tier, 'premium');
  assert.equal((await as(B, `select public.fco_wallet()`)).tier, 'premium');
  assert.equal((await as(A, `select public.fco_admin_account_tier($1)`, [B])).tier, 'premium');
  console.log('account tier OK');
}
// 12. Hiệu ứng avatar + tên (202611110004): chỉ Premium đặt được; về Classic thì không hiện; BXH trả hiệu ứng.
if (files.some(f => f.includes('202611110004'))) {
  await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [B]);
  await assert.rejects(as(B, `select public.fco_set_name_effect('fire')`), /FCO_PREMIUM_ONLY/);
  assert.equal((await as(B, `select public.fco_set_name_effect(null)`)).effect, null);
  await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [B]);
  await assert.rejects(as(B, `select public.fco_set_name_effect('rainbow')`), /FCO_BAD_EFFECT/);
  assert.equal((await as(B, `select public.fco_set_name_effect('fire')`)).effect, 'fire');
  await db.query(`insert into public.fco_ranks(user_id, best_ovr, best_player, best_level, best_at) values ($1, 150, 1, 13, now()) on conflict (user_id) do update set best_ovr = 150`, [B]);
  let board = await as(B, `select public.fco_leaderboard()`);
  assert.equal(board.ovr.find(r => r.mine).effect, 'fire');
  await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [B]);
  assert.equal((await as(B, `select public.fco_wallet()`)).effect, null);
  board = await as(B, `select public.fco_leaderboard()`);
  assert.equal(board.ovr.find(r => r.mine).effect, null);
  console.log('name effect OK');
}
// 13. Sút phạt đền (202611110005): máy chủ quyết định, mỗi bàn +1, bị bắt là hết lượt; kỷ lục lên BXH; chặn ngắm sai / sút quá nhanh.
if (files.some(f => f.includes('202611110005'))) {
  await assert.rejects(as(B, `select public.fco_penalty_shoot(0, 0)`), /FCO_PENALTY_NO_RUN/);
  assert.equal((await as(B, `select public.fco_penalty_start()`)).streak, 0);
  await assert.rejects(as(B, `select public.fco_penalty_shoot(1.5, 0)`), /FCO_PENALTY_BAD_AIM/);
  await assert.rejects(as(B, `select public.fco_penalty_shoot(0, 'NaN'::float8)`), /FCO_PENALTY_BAD_AIM/);
  let goals = 0, over = false, shots = 0;
  while (!over && shots < 400) {
    await db.query(`update public.fco_penalty_runs set last_shot = now() - interval '1 second' where user_id = $1`, [B]);
    const r = await as(B, `select public.fco_penalty_shoot(0.98, 0.95)`);
    shots++;
    if (r.goal) { goals++; assert.equal(r.streak, goals); assert.ok(r.best >= goals); assert.equal(r.over, false); }
    else { over = true; assert.equal(r.over, true); assert.equal(r.streak, goals); assert.ok(r.keeper.x > 0, 'thủ môn bay đúng hướng bóng'); }
    if (!over && shots === 1) await assert.rejects(as(B, `select public.fco_penalty_shoot(0, 0)`), /FCO_PENALTY_TOO_FAST/);
  }
  assert.ok(over, 'thủ môn phải bắt được trước 400 quả');
  await assert.rejects(as(B, `select public.fco_penalty_shoot(0, 0)`), /FCO_PENALTY_NO_RUN/);
  const board = await as(B, `select public.fco_leaderboard()`);
  if (goals > 0) { assert.equal(board.penalty.find(r => r.mine).goals, goals); assert.equal(board.me.penalty, goals); assert.equal(board.me.penaltyRank, 1); }
  // Tỷ lệ bắt giữa khung ~80%: 2.000 lượt mô phỏng bằng hàm máy chủ.
  const saved = await one(`select avg((random() < public.fco_penalty_save_chance(0, 0, 0))::int)::float8 from generate_series(1, 2000)`);
  assert.ok(Math.abs(saved - .8) < .05, `giữa khung bắt ${saved}`);
  console.log(`penalty OK (${goals} bàn trước khi bị bắt)`);
}
// 14. Kiểu sút (202611110006): sai kiểu bị chặn; căng ngắm sát xà có lúc vọt xà, trivela sát cột có lúc dội cột; game cũ gọi 2 tham số vẫn chạy.
if (files.some(f => f.includes('202611110006'))) {
  await as(B, `select public.fco_penalty_start()`);
  await assert.rejects(as(B, `select public.fco_penalty_shoot(0, 0, 'chip')`), /FCO_PENALTY_BAD_KIND/);
  const seen = { bar: 0, post: 0, saved: 0, goal: 0 };
  for (let i = 0; i < 300; i++) {
    const k = i % 2 ? 'trivela' : 'power';
    await db.query(`update public.fco_penalty_runs set active = true, last_shot = now() - interval '1 second' where user_id = $1`, [B]);
    const r = await as(B, `select public.fco_penalty_shoot($1, $2, $3)`, [k === 'power' ? 0 : 1, k === 'power' ? 1 : 0, k]);
    assert.equal(r.kind, k);
    if (r.miss) { assert.equal(r.miss, k === 'power' ? 'bar' : 'post'); assert.equal(r.goal, false); assert.equal(r.saved, false); assert.equal(r.over, true); seen[r.miss]++; }
    else if (r.saved) seen.saved++; else seen.goal++;
  }
  assert.ok(seen.bar > 10 && seen.post > 5 && seen.goal > 0 && seen.saved > 0, JSON.stringify(seen));
  await db.query(`update public.fco_penalty_runs set active = true, last_shot = now() - interval '1 second' where user_id = $1`, [B]);
  assert.equal((await as(B, `select public.fco_penalty_shoot(0, 0)`)).kind, 'normal');
  console.log(`penalty kinds OK ${JSON.stringify(seen)}`);
}

// 15. Star Point (202611110007): admin cộng STP, mua gói STP nhận đủ vật phẩm, phiếu giảm thuế do máy chủ giữ và dùng một lần khi bán.
if (files.some(f => f.includes('202611110007'))) {
  await db.query(`select public.fco_wallet_lock($1)`, [B]);
  await assert.rejects(as(B, `select public.fco_stp_buy('ultimate')`), /FCO_NOT_ENOUGH_STP/);
  await assert.rejects(as(B, `select public.fco_admin_credit_stp('player_b', 200)`), /FCO_ADMIN_ONLY/);
  assert.equal((await as(A, `select public.fco_admin_credit_stp('player_b', 200, 'thử')`)).stp, 200);
  assert.equal((await as(B, `select public.fco_wallet()`)).stp, 200);
  await assert.rejects(as(B, `select public.fco_stp_buy('legend')`), /FCO_STP_PACKAGE/);
  const before = await save(B);
  r = await as(B, `select public.fco_stp_buy('ultimate')`);
  assert.equal(r.wallet.stp, 100);
  const after = r.save.data;
  assert.equal(after.balance, before.balance + 75000000);
  for (const id of ['stp-u-110', 'stp-u-117', 'stp-u-hg', 'stp-u-111', 'stp-u-jnm', 'stp-u-cum', 'stp-u-wg26', 'stp-u-ca', 'stp-u-118']) assert.equal(after.unopened[id], (before.unopened?.[id] ?? 0) + 1, id);
  assert.deepEqual(after.taxVouchers, { 30: 1 });
  assert.equal(after.history[0].type, 'gift');
  assert.equal(after.history[0].title, 'Mua Gói STP Siêu cấp');
  assert.equal(after.history[0].detail, '9 gói cầu thủ, 1 phiếu giảm thuế 30%, 75M BP · −100 STP');
  // Trình duyệt không tự thêm phiếu / STP được (phần máy chủ giữ).
  const merged = await as(B, `select public.fco_commit_save($1::jsonb, 1, true)`, [JSON.stringify({ ...after, taxVouchers: { 30: 99, 20: 5 }, stp: 9999 })]);
  assert.deepEqual(merged.data.taxVouchers, { 30: 1 }); assert.equal(merged.data.stp, undefined);
  // Bán dùng phiếu 30%: thuế 40% còn 10%, bớt phiếu; hết phiếu thì báo lỗi; mức phiếu lạ bị chặn.
  await db.query(`update public.fco_wallets set svip_until = null, premium_until = null where user_id = $1`, [B]);
  const p = catalog.players.find(x => x[3][4] !== null && x[3][4] > 100000 && !x[4]);
  const price = await one(`select public.fco_inv_price($1, 5)`, [p[0]]);
  await setSave(B, { ...(await save(B)), cards: [{ uid: 'v1', playerId: p[0], level: 5, received: 0 }, { uid: 'v2', playerId: p[0], level: 5, received: 0 }] });
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb, 25)`, [version, JSON.stringify([{ uid: 'v1', price }])]), /FCO_BAD_VOUCHER/);
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb, 20)`, [version, JSON.stringify([{ uid: 'v1', price }])]), /FCO_NO_VOUCHER/);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb, 30)`, [version, JSON.stringify([{ uid: 'v1', price }])]);
  assert.equal(r.tax, 10); assert.equal(r.fees, Math.floor(price * 10 / 100));
  assert.deepEqual(r.save.data.taxVouchers, {});
  assert.match(r.save.data.history[0].detail, /Phí 10% \(phiếu −30%\)/);
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb, 30)`, [version, JSON.stringify([{ uid: 'v2', price }])]), /FCO_NO_VOUCHER/);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 'v2', price }])]);
  assert.equal(r.tax, 40);
  // Tài khoản game chưa để máy chủ giữ kho: chỉ trừ STP, trả vật phẩm để game tự cộng.
  await as(A, `select public.fco_admin_credit_stp('player_c', 15)`);
  r = await as(C, `select public.fco_stp_buy('rookie')`);
  assert.equal(r.save, null); assert.equal(r.wallet.stp, 0);
  assert.deepEqual(r.items.find(i => i.voucher), { voucher: 10, count: 1 });
  assert.equal(await one(`select count(*)::int from public.fco_stp_ledger where user_id = $1`, [C]), 2);
  console.log('star point OK');
}

// 16. Nhiệm vụ Star Point hằng ngày (202611110012): máy chủ ghi nhận khi đập thành công / đạt chuỗi sút phạt, nhận 1 lần mỗi ngày.
if (files.some(f => f.includes('202611110012'))) {
  const messi = catalog.players.find(x => x[1] === 'L. Messi'), ronaldo = catalog.players.find(x => x[1] === 'Cristiano Ronaldo');
  const r9 = catalog.players.find(x => x[1] === 'Ronaldo');
  assert.ok(messi && ronaldo && r9, 'có Messi / Cristiano Ronaldo / Ronaldo trong bộ dữ liệu');
  assert.ok(await one(`select prosrc like '%fco_stp_mission_upgrade%' from pg_proc where proname = 'fco_inv_upgrade'`), 'đập thẻ gọi ghi nhận nhiệm vụ');
  // Các phần sút phạt phía trên có thể đã đạt chuỗi 20 bàn thật (trigger chạy đúng): kiểm tra rồi làm lại từ đầu.
  const state = async () => Object.fromEntries((await as(B, `select public.fco_stp_missions_state()`)).missions.map(m => [m.id, m]));
  const best = await one(`select coalesce(max(penalty_best), 0) from public.fco_ranks where user_id = $1`, [B]);
  if (best >= 20) assert.equal((await state()).penalty20.done, true);
  await db.query(`delete from public.fco_stp_missions where user_id = $1`, [B]);
  let s = await state();
  assert.deepEqual(Object.keys(s), ['messi8', 'ronaldo8', 'penalty20', 'messi7', 'ronaldo7']);
  assert.ok(Object.values(s).every(m => !m.done && !m.claimed));
  await assert.rejects(as(B, `select public.fco_stp_mission_claim('messi7')`), /FCO_STP_MISSION_INCOMPLETE/);
  await assert.rejects(as(B, `select public.fco_stp_mission_claim('nope')`), /FCO_STP_MISSION_UNKNOWN/);
  // Ronaldo (Brazil) không tính cho nhiệm vụ C. Ronaldo; Messi lên +7 chỉ đạt nhiệm vụ +7; Cristiano Ronaldo lên +8 đạt cả +7 và +8.
  await one(`select public.fco_stp_mission_upgrade($1, $2, 13)`, [B, r9[0]]);
  await one(`select public.fco_stp_mission_upgrade($1, $2, 7)`, [B, messi[0]]);
  await one(`select public.fco_stp_mission_upgrade($1, $2, 8)`, [B, ronaldo[0]]);
  s = await state();
  assert.deepEqual([s.messi7.done, s.messi8.done, s.ronaldo7.done, s.ronaldo8.done, s.penalty20.done], [true, false, true, true, false]);
  // Chuỗi sút phạt vượt 20 bàn.
  await db.query(`insert into public.fco_penalty_runs(user_id, streak, active) values ($1, 19, true) on conflict (user_id) do update set streak = 19, active = true`, [B]);
  await db.query(`update public.fco_penalty_runs set streak = 20 where user_id = $1`, [B]);
  assert.equal((await state()).penalty20.done, true);
  // Nhận thưởng: cộng STP, mỗi ngày một lần.
  const before = (await as(B, `select public.fco_wallet()`)).stp;
  r = await as(B, `select public.fco_stp_mission_claim('ronaldo8')`);
  assert.equal(r.wallet.stp, before + 25); assert.equal(r.reward, 25);
  assert.equal(r.state.missions.find(m => m.id === 'ronaldo8').claimed, true);
  await assert.rejects(as(B, `select public.fco_stp_mission_claim('ronaldo8')`), /FCO_STP_MISSION_CLAIMED/);
  r = await as(B, `select public.fco_stp_mission_claim('penalty20')`);
  assert.equal(r.wallet.stp, before + 45);
  assert.equal(await one(`select count(*)::int from public.fco_stp_ledger where user_id = $1 and reason = 'mission'`, [B]), 2);
  // Sang ngày mới: nhiệm vụ làm lại từ đầu.
  await db.query(`update public.fco_stp_missions set day = day - 1 where user_id = $1`, [B]);
  s = await state();
  assert.ok(Object.values(s).every(m => !m.done && !m.claimed), 'ngày mới chưa đạt nhiệm vụ nào');
  console.log('stp missions OK');
}

// 17. Premium có hạn 7 ngày + giảm 65% thuế bán, không cộng dồn (202611110013).
if (files.some(f => f.includes('202611110013'))) {
  await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [B]);
  let r = await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [B]);
  const week = 7 * 86400000;
  assert.equal(r.tier, 'premium'); assert.ok(Math.abs(r.until - Date.now() - week) < 120000, 'hạn 7 ngày');
  const first = r.until;
  r = await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [B]);
  assert.ok(Math.abs(r.until - first - week) < 5000, 'gia hạn cộng dồn thêm 7 ngày');
  let w = await as(B, `select public.fco_wallet()`);
  assert.equal(w.tier, 'premium'); assert.equal(w.tierUntil, r.until);
  // Thuế: Premium 14%, kể cả khi còn gói SVIP / Premium Shop (không cộng dồn).
  await db.query(`update public.fco_wallets set svip_until = now() + interval '1 day', premium_until = now() + interval '1 day' where user_id = $1`, [B]);
  const p = catalog.players.find(x => x[3][4] !== null && x[3][4] > 100000 && !x[4]);
  const price = await one(`select public.fco_inv_price($1, 5)`, [p[0]]);
  const cards = n => Array.from({ length: n }, (_, i) => ({ uid: 'pm' + i, playerId: p[0], level: 5, received: 0 }));
  await setSave(B, { ...(await save(B)), cards: cards(4), locked: [], taxVouchers: { 30: 1, 20: 1 } });
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 'pm0', price }])]);
  assert.equal(r.tax, 14); assert.equal(r.fees, Math.floor(price * 14 / 100));
  // Phiếu 20% (40 − 20 = 20% > 14%) không giảm thêm → báo lỗi, không mất phiếu; phiếu 30% → 10%.
  await assert.rejects(as(B, `select public.fco_inv_sell($1, $2::jsonb, 20)`, [version, JSON.stringify([{ uid: 'pm1', price }])]), /FCO_VOUCHER_USELESS/);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb, 30)`, [version, JSON.stringify([{ uid: 'pm1', price }])]);
  assert.equal(r.tax, 10); assert.deepEqual(r.save.data.taxVouchers, { 20: 1 });
  // Hết hạn → Classic: mất hiệu ứng, thuế theo gói thành viên (Premium Shop 50% → 20%).
  await db.query(`update public.fco_wallets set account_tier_until = now() - interval '1 minute' where user_id = $1`, [B]);
  w = await as(B, `select public.fco_wallet()`);
  assert.equal(w.tier, 'classic'); assert.equal(w.tierUntil, null); assert.equal(w.effect, null);
  await assert.rejects(as(B, `select public.fco_set_name_effect('gold')`), /FCO_PREMIUM_ONLY/);
  r = await as(B, `select public.fco_inv_sell($1, $2::jsonb)`, [version, JSON.stringify([{ uid: 'pm2', price }])]);
  assert.equal(r.tax, 20);
  // Hết hạn rồi đặt lại: tính 7 ngày từ bây giờ, không cộng vào hạn cũ.
  r = await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [B]);
  assert.ok(Math.abs(r.until - Date.now() - week) < 120000);
  assert.equal((await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [B])).tier, 'classic');
  await db.query(`update public.fco_wallets set svip_until = null, premium_until = null where user_id = $1`, [B]);
  console.log('premium tax OK');
}

// 18. Hạn chế clone (202611110014): heartbeat lưu thiết bị + IP; một thiết bị một tài khoản nhận quà ngày / Bi Lắc miễn phí / mỗi gift code.
if (files.some(f => f.includes('202611110014'))) {
  const D1 = '11111111-1111-4111-8111-111111111111', D2 = '22222222-2222-4222-8222-222222222222';
  const beat = async (uid, device, ip) => {
    await db.exec(`reset role; select set_config('request.headers', '${JSON.stringify({ 'x-forwarded-for': ip + ', 10.0.0.1' })}', false)`);
    await as(uid, `select public.fco_heartbeat($1)`, [device]);
  };
  await beat(B, D1, '1.2.3.4');
  await beat(C, D1, '1.2.3.4');
  assert.equal(await one(`select ip from public.fco_devices where user_id = $1 and device = $2`, [B, D1]), '1.2.3.4');
  await db.query(`update public.fco_wallets set daily = null, bilac_free_day = null where user_id in ($1, $2)`, [B, C]);
  // B nhận quà ngày trên thiết bị D1 → C (cùng D1) bị chặn.
  await as(B, `select public.fco_claim_daily()`);
  await assert.rejects(as(C, `select public.fco_claim_daily()`), /FCO_DEVICE_LIMIT/);
  assert.equal(await one(`select daily from public.fco_wallets where user_id = $1`, [C]), null, 'bị chặn thì không đổi gì');
  // Bi Lắc miễn phí cũng vậy.
  await as(B, `select public.fco_bilac_play(1, 'free')`);
  await assert.rejects(as(C, `select public.fco_bilac_play(1, 'free')`), /FCO_DEVICE_LIMIT/);
  // Gift code: một lần trên một thiết bị.
  await db.query(`insert into public.fco_gift_codes(hash, hint, rewards) values ($1, 'DV••', '[{"bp": 10}]') on conflict do nothing`, ['d'.repeat(64)]);
  await as(B, `select public.fco_redeem_gift($1)`, ['d'.repeat(64)]);
  await assert.rejects(as(C, `select public.fco_redeem_gift($1)`, ['d'.repeat(64)]), /FCO_DEVICE_LIMIT/);
  // Admin cho phép thiết bị dùng chung → C nhận được.
  await assert.rejects(as(B, `select public.fco_admin_device_allow($1, true)`, [D1]), /FCO_ADMIN_ONLY/);
  await as(A, `select public.fco_admin_device_allow($1, true)`, [D1]);
  await as(C, `select public.fco_claim_daily()`);
  // Thiết bị khác thì không ảnh hưởng nhau.
  await db.query(`update public.fco_wallets set daily = null where user_id = $1`, [A]);
  await beat(A, D2, '5.6.7.8');
  await as(A, `select public.fco_claim_daily()`);
  // Nghi clone: nhóm theo thiết bị (B, C trên D1) và đánh dấu đã cho phép.
  const groups = await as(A, `select public.fco_admin_clone_groups()`);
  const g = groups.find(x => x.kind === 'device' && x.key === D1);
  assert.ok(g); assert.equal(g.allowed, true);
  assert.deepEqual(g.accounts.map(a => a.id).sort(), [B, C].sort());
  await assert.rejects(as(B, `select public.fco_admin_clone_groups()`), /FCO_ADMIN_ONLY/);
  // Game cũ gọi heartbeat không có mã thiết bị vẫn chạy.
  await as(B, `select public.fco_heartbeat()`);
  await db.exec(`reset role; select set_config('request.headers', '', false)`);
  console.log('anti clone OK');
}

// 19. Admin đặt lại mật khẩu (202611110015): lưu bcrypt, đăng xuất mọi thiết bị, không đặt được cho admin.
if (files.some(f => f.includes('202611110015'))) {
  await db.query(`insert into auth.sessions(user_id) values ($1)`, [C]);
  await db.query(`insert into auth.refresh_tokens(user_id, token) values ($1, 'x')`, [C]);
  await assert.rejects(as(B, `select public.fco_admin_reset_password($1, 'matkhau123')`, [C]), /FCO_ADMIN_ONLY/);
  await assert.rejects(as(A, `select public.fco_admin_reset_password($1, '123')`, [C]), /FCO_BAD_PASSWORD/);
  await assert.rejects(as(A, `select public.fco_admin_reset_password($1, 'matkhau123')`, [A]), /FCO_ADMIN_PROTECTED/);
  assert.deepEqual(await as(A, `select public.fco_admin_reset_password($1, 'matkhau123')`, [C]), { login: 'player_c' });
  const hash = await one(`select encrypted_password from auth.users where id = $1`, [C]);
  assert.match(hash, /^\$2a\$10\$/);
  assert.equal(await one(`select extensions.crypt('matkhau123', $1) = $1`, [hash]), true, 'mật khẩu mới khớp');
  assert.equal(await one(`select extensions.crypt('sai', $1) = $1`, [hash]), false);
  assert.equal(await one(`select count(*)::int from auth.sessions where user_id = $1`, [C]), 0);
  assert.equal(await one(`select count(*)::int from auth.refresh_tokens where user_id = $1`, [C]), 0);
  assert.equal(await one(`select count(*)::int from public.fco_admin_password_resets where user_id = $1`, [C]), 1);
  console.log('admin reset password OK');
}

// 20. Chỉ đăng ký bằng Gmail chuẩn hoá (202611110016); tài khoản cũ vẫn dùng; tên công khai Gmail = tên HLV.
if (files.some(f => f.includes('202611110016'))) {
  assert.equal(await one(`select public.fco_gmail_normalize(' A.B.C.D.E.F+game@GoogleMail.com ')`), 'abcdef@gmail.com');
  assert.equal(await one(`select public.fco_gmail_normalize('x@yahoo.com')`), 'x@yahoo.com');
  const G = '00000000-0000-0000-0000-0000000000a1';
  for (const bad of ['newplayer@players.fco.invalid', 'someone@yahoo.com', 'a.bcdef@gmail.com', 'abcdef+1@gmail.com', 'abc@gmail.com'])
    await assert.rejects(db.query(`insert into auth.users(id, email) values ($1, $2)`, [G, bad]), /FCO_GMAIL_ONLY/, bad);
  await db.query(`insert into auth.users(id, email, raw_user_meta_data) values ($1, 'hlvfcovip9@gmail.com', '{"display_name": "Vua Đập Thẻ"}')`, [G]);
  assert.equal(await one(`select public.fco_public_name($1)`, [G]), 'Vua Đập Thẻ');
  assert.equal(await one(`select public.fco_public_name($1)`, [B]), 'player_b');
  // Tài khoản cũ: sửa thông tin khác vẫn được; liên kết Gmail phải là Gmail chuẩn hoá.
  await db.query(`update auth.users set updated_at = now() where id = $1`, [B]);
  await assert.rejects(db.query(`update auth.users set email_change = 'b.player1@gmail.com' where id = $1`, [B]), /FCO_GMAIL_ONLY/);
  await db.query(`update auth.users set email_change = 'bplayer1@gmail.com' where id = $1`, [B]);
  await db.query(`update auth.users set email = 'bplayer1@gmail.com', email_change = '' where id = $1`, [B]);
  await assert.rejects(db.query(`update auth.users set email = 'player_b@players.fco.invalid' where id = $1`, [B]), /FCO_GMAIL_ONLY/, 'không đổi ngược về tên đăng nhập');
  await db.exec(`alter table auth.users disable trigger fco_auth_email_guard`);
  await db.query(`update auth.users set email = 'player_b@players.fco.invalid' where id = $1`, [B]);
  await db.exec(`alter table auth.users enable trigger fco_auth_email_guard`);
  await db.query(`delete from auth.users where id = $1`, [G]);
  console.log('gmail accounts OK');
}

// 21. Gói Star Point mỗi gói một lần mỗi ngày (202611120001).
if (files.some(f => f.includes('202611120001'))) {
  await db.query(`delete from public.fco_stp_purchases where user_id = $1`, [B]);
  await as(A, `select public.fco_admin_credit_stp('player_b', 500)`);
  assert.deepEqual((await as(B, `select public.fco_stp_today()`)).bought, []);
  r = await as(B, `select public.fco_stp_buy('rookie')`);
  assert.deepEqual(r.bought, ['rookie']);
  const stp = r.wallet.stp;
  await assert.rejects(as(B, `select public.fco_stp_buy('rookie')`), /FCO_STP_DAILY_LIMIT/);
  assert.equal((await as(B, `select public.fco_wallet()`)).stp, stp, 'bị chặn thì không trừ STP');
  r = await as(B, `select public.fco_stp_buy('challenge')`);
  assert.deepEqual(r.bought, ['challenge', 'rookie']);
  // Sang ngày mới mua lại được.
  await db.query(`update public.fco_stp_purchases set day = day - 1 where user_id = $1`, [B]);
  assert.deepEqual((await as(B, `select public.fco_stp_today()`)).bought, []);
  await as(B, `select public.fco_stp_buy('rookie')`);
  console.log('stp daily limit OK');
}

// 22. Xếp hạng giả lập (202611120002): kiểm tra đội hình bằng kho máy chủ, chặn OVR ảo, ghép đội máy / người thật, Elo, lịch sử.
if (files.some(f => f.includes('202611120002'))) {
  const strong = catalog.players.filter(x => x[2][0] !== null).sort((a, b) => b[2][0] - a[2][0]).slice(0, 11);
  const roles = ['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  const team = (prefix, ovrBoost = 0) => ({ formation: '4-3-3', slots: strong.map((p, i) => ({ uid: `${prefix}${i}`, role: roles[i], x: 10 + i * 7, y: 20 + i * 6, ovr: p[2][0] + ovrBoost })) });
  const cards = prefix => strong.map((p, i) => ({ uid: `${prefix}${i}`, playerId: p[0], level: 1, received: 0 }));
  await setSave(B, { ...(await save(B)), cards: cards('rk') });
  await setSave(C, { ...(await save(C)), cards: cards('rc') });
  if (files.some(f => f.includes('202611120006'))) await db.query(`update public.fco_cat_players set wage = 20 where id = any($1)`, [strong.map(p => p[0])]);
  await db.query(`delete from public.fco_ranked`);
  let st = await as(B, `select public.fco_ranked_state()`);
  assert.deepEqual([st.me.points, st.me.tier, st.me.rank], [1000, 'silver', null]);
  // Thiếu cầu thủ / thẻ không có trong kho bị chặn.
  await assert.rejects(as(B, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify({ formation: '4-3-3', slots: team('rk').slots.slice(0, 10) })]), /FCO_RANKED_TEAM/);
  await assert.rejects(as(B, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('xx'))]), /FCO_RANKED_CARD/);
  // OVR khai khống bị chặn ở OVR thẻ + 17; không có người thật → đấu đội máy.
  r = await as(B, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('rk', 999))]);
  const baseAvg = Math.round(strong.reduce((s, p) => s + p[2][0] + 17, 0) / 11);
  assert.equal(r.me.ovr, baseAvg);
  assert.equal(r.opp.bot, true); assert.equal(r.opp.slots.length, 11); assert.ok(Math.abs(r.opp.ovr - r.me.ovr) <= 4);
  assert.equal(r.goals.length, r.score[0] + r.score[1]);
  for (const g of r.goals) { assert.ok(g.minute >= 1 && g.minute <= 90); assert.ok(g.scorer >= 0 && g.scorer <= 10); assert.notEqual(g.scorer, g.assist); }
  assert.deepEqual(r.goals.map(g => g.minute), [...r.goals.map(g => g.minute)].sort((a, b) => a - b));
  assert.ok(!r.goals.some(g => g.side === 'me' && r.me.slots[g.scorer].role === 'GK'), 'thủ môn không ghi bàn');
  // Đá liên tiếp quá nhanh bị chặn.
  // Đá liền trận mới khi trận vừa bắt đầu: bị chặn (quá nhanh, hoặc trận đang diễn từ 202611120005).
  await assert.rejects(as(B, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('rk'))]), /FCO_RANKED_TOO_FAST|FCO_RANKED_IN_PROGRESS/);
  if (files.some(f => f.includes('202611120005'))) {
    // Chưa tính điểm khi bắt đầu; hết trận sớm hơn 140 giây (tua / bỏ qua) bị từ chối.
    assert.equal(r.points, undefined); assert.equal(r.minSeconds, 140);
    await assert.rejects(as(B, `select public.fco_ranked_finish()`), /FCO_RANKED_EARLY/);
    await db.query(`update public.fco_ranked_pending set started_at = now() - interval '200 seconds' where user_id = $1`, [B]);
    const fin = await as(B, `select public.fco_ranked_finish()`);
    assert.deepEqual(fin.score, r.score);
    assert.equal(fin.points, 1000 + fin.delta);
    if (r.score[0] > r.score[1]) assert.ok(fin.delta >= 5); else if (r.score[0] < r.score[1]) assert.ok(fin.delta <= -5);
    // Gọi lại finish (mở ở máy khác) trả lại kết quả trận vừa tính.
    assert.deepEqual((await as(B, `select public.fco_ranked_finish()`)).delta, fin.delta);
  } else {
    assert.equal(r.points, 1000 + r.delta);
  }
  // C đá → gặp B (người thật, điểm gần): đối thủ là đội hình của B, tên công khai của B.
  r = await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('rc'))]);
  assert.equal(r.opp.bot, false); assert.equal(r.opp.name, 'player_b'); assert.equal(r.opp.slots.length, 11); assert.equal(r.opp.slots[0].uid, undefined, 'không lộ thẻ đối thủ');
  if (files.some(f => f.includes('202611120005'))) {
    // C tải lại trang giữa trận: trận vẫn chạy, mở lại thấy 'live' để xem tiếp, chưa tính điểm; không đá được trận mới.
    let cs = await as(C, `select public.fco_ranked_state()`);
    assert.ok(cs.live && cs.live.elapsed >= 0 && cs.live.elapsed < 140); assert.deepEqual(cs.live.score, r.score); assert.equal(cs.history.length, 0);
    await db.query(`update public.fco_ranked set last_match_at = null where user_id = $1`, [C]);
    await assert.rejects(as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('rc'))]), /FCO_RANKED_IN_PROGRESS/);
    // Tắt máy, quay lại sau khi trận hết giờ: kết quả thật được tính tự động (không xử thua).
    await db.query(`update public.fco_ranked_pending set started_at = now() - interval '300 seconds' where user_id = $1`, [C]);
    cs = await as(C, `select public.fco_ranked_state()`);
    assert.equal(cs.live, null); assert.equal(cs.history.length, 1); assert.deepEqual([cs.history[0].for, cs.history[0].against], r.score);
    assert.equal(cs.history[0].opponent, 'player_b');
    // Game gọi finish muộn (trận đã được tính) vẫn nhận lại đúng kết quả.
    assert.deepEqual((await as(C, `select public.fco_ranked_finish()`)).score, r.score);
    // Bấm Bỏ trận: xử thua 0 – 3.
    await db.query(`update public.fco_ranked set last_match_at = null where user_id = $1`, [C]);
    await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team('rc'))]);
    const ab = await as(C, `select public.fco_ranked_abandon()`);
    assert.deepEqual(ab.score, [0, 3]); assert.ok(ab.delta <= -5);
    cs = await as(C, `select public.fco_ranked_state()`);
    assert.equal(cs.history[0].opponent.endsWith('(bỏ trận)'), true);
    await assert.rejects(as(C, `select public.fco_ranked_abandon()`), /FCO_RANKED_NO_MATCH/);
  }
  // Lịch sử + BXH.
  st = await as(B, `select public.fco_ranked_state()`);
  assert.equal(st.history.length, 1); assert.ok(st.top.some(t => t.mine));
  // Thống kê nhiều trận: đội mạnh hơn hẳn thắng nhiều hơn thua.
  let w = 0, l = 0;
  for (let i = 0; i < 60; i++) {
    const gm = await one(`select public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(15 / 10.0))))`), go = await one(`select public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(-15 / 10.0))))`);
    if (gm > go) w++; else if (gm < go) l++;
  }
  assert.ok(w > l * 3, `mạnh hơn 15 OVR: thắng ${w}, thua ${l}`);
  assert.deepEqual([await one(`select public.fco_ranked_tier(899)`), await one(`select public.fco_ranked_tier(1900)`)], ['bronze', 'legend']);
  console.log('ranked OK');
}

// 23. Logo CLB tự chọn (202611120004): ví, BXH HLV, BXH GLXH và trận GLXH trả logo.
if (files.some(f => f.includes('202611120004'))) {
  r = await as(B, `select public.fco_set_club_logo('Real Madrid')`);
  assert.equal(r.club, 'Real Madrid');
  await assert.rejects(as(B, `select public.fco_set_club_logo('<script>')`), /FCO_BAD_CLUB/);
  const board = await as(B, `select public.fco_leaderboard()`);
  for (const list of [board.ovr, board.squad, board.penalty]) { const mine = list.find(x => x.mine); if (mine) assert.equal(mine.club, 'Real Madrid'); }
  const st = await as(B, `select public.fco_ranked_state()`);
  assert.equal(st.top.find(x => x.mine).club, 'Real Madrid');
  await db.query(`update public.fco_ranked set last_match_at = null where user_id = $1`, [C]);
  const strong = catalog.players.filter(x => x[2][0] !== null).sort((a, b) => b[2][0] - a[2][0]).slice(0, 11);
  const roles = ['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  r = await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify({ formation: '4-3-3', slots: strong.map((p, i) => ({ uid: `rc${i}`, role: roles[i], x: 50, y: 50, ovr: p[2][0] })) })]);
  if (!r.opp.bot) assert.equal(r.opp.club, 'Real Madrid');
  assert.equal(r.me.club, null);
  assert.equal((await as(B, `select public.fco_set_club_logo(null)`)).club, null);
  console.log('club logo OK');
}

// 24. Mức lương GLXH (202611120006): đồng bộ lưu lương, đội vượt 310 bị chặn, đúng 310 vẫn đá được.
if (files.some(f => f.includes('202611120006'))) {
  const sample = catalog.players.find(x => x[6] > 0);
  assert.equal(await one(`select wage from public.fco_cat_players where id = $1`, [sample[0]]), sample[6], 'Đồng bộ lưu lương cầu thủ');
  const strong = catalog.players.filter(x => x[2][0] !== null).sort((a, b) => b[2][0] - a[2][0]).slice(0, 11), ids = strong.map(p => p[0]);
  const roles = ['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  const team = { formation: '4-3-3', slots: strong.map((p, i) => ({ uid: `rc${i}`, role: roles[i], x: 50, y: 50, ovr: p[2][0] })) };
  await db.query(`delete from public.fco_ranked_pending where user_id = $1`, [C]);
  await db.query(`update public.fco_ranked set last_match_at = null where user_id = $1`, [C]);
  await db.query(`update public.fco_cat_players set wage = case when id = $2 then 31 else 29 end where id = any($1)`, [ids, ids[0]]); // 31 + 10 × 29 = 321
  await assert.rejects(as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team)]), /FCO_RANKED_WAGE/);
  assert.equal(await one(`select count(*)::integer from public.fco_ranked_pending where user_id = $1`, [C]), 0, 'bị chặn thì không tạo trận');
  await db.query(`update public.fco_cat_players set wage = case when id = $2 then 30 else 28 end where id = any($1)`, [ids, ids[0]]); // 30 + 10 × 28 = 310
  const ok = await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team)]);
  assert.equal(ok.minSeconds, 140);
  console.log('ranked wage cap OK');
}

// 25. Viền Premium trong trận GLXH (202611120007): đội của tài khoản Premium có hiệu ứng thì trận gửi kèm; Classic thì không.
if (files.some(f => f.includes('202611120007'))) {
  const strong = catalog.players.filter(x => x[2][0] !== null).sort((a, b) => b[2][0] - a[2][0]).slice(0, 11);
  const roles = ['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  const team = { formation: '4-3-3', slots: strong.map((p, i) => ({ uid: `rc${i}`, role: roles[i], x: 50, y: 50, ovr: p[2][0] })) };
  if (files.some(f => f.includes('202611120006'))) await db.query(`update public.fco_cat_players set wage = 20 where id = any($1)`, [strong.map(p => p[0])]);
  const fresh = async () => { await db.query(`delete from public.fco_ranked_pending where user_id = $1`, [C]); await db.query(`update public.fco_ranked set last_match_at = null where user_id = $1`, [C]); };
  await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [C]);
  await as(C, `select public.fco_set_name_effect('fire')`);
  await fresh();
  r = await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team)]);
  assert.equal(r.me.effect, 'fire');
  if (r.opp.bot) assert.equal(r.opp.effect, null);
  const live = await as(C, `select public.fco_ranked_state()`);
  assert.equal(live.live.me.effect, 'fire', 'xem tiếp trận vẫn có viền');
  await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [C]);
  await fresh();
  r = await as(C, `select public.fco_ranked_play($1::jsonb)`, [JSON.stringify(team)]);
  assert.equal(r.me.effect, null);
  await fresh();
  console.log('ranked premium ring OK');
}

// 26. Dòng LIVE (202611120008): mở / đập thẻ OVR > 133 và lên Top 1 BXH đăng tin chung; dưới mốc thì không.
if (files.some(f => f.includes('202611120008'))) {
  await db.query(`delete from public.fco_live_feed`);
  const lvl = p => p[2].findIndex(o => o > 133) + 1, high = catalog.players.find(p => lvl(p) > 0), low = catalog.players.find(p => p[2][0] !== null && p[2][0] <= 133);
  await db.exec(`select set_config('test.uid', '${B}', false)`);
  await one(`select public.fco_inv_best($1::jsonb)`, [JSON.stringify([{ uid: 'x1', playerId: low[0], level: 1 }])]);
  assert.equal(await one(`select count(*)::integer from public.fco_live_feed`), 0, 'thẻ dưới mốc không đăng tin');
  const best = await one(`select public.fco_inv_best($1::jsonb)`, [JSON.stringify([{ uid: 'x1', playerId: low[0], level: 1 }, { uid: 'x2', playerId: high[0], level: lvl(high) }])]);
  assert.match(best, new RegExp(`OVR ${high[2][lvl(high) - 1]}$`), 'vẫn trả thẻ tốt nhất như trước');
  await db.exec(`select set_config('test.uid', '', false)`);
  await one(`select public.fco_stp_mission_upgrade($1, $2, $3)`, [C, high[0], lvl(high)]);
  await one(`select public.fco_stp_mission_upgrade($1, $2, 1)`, [C, low[0]]);
  let feed = await as(B, `select public.fco_live_feed()`);
  assert.deepEqual(feed.map(f => f.kind), ['upgrade', 'pack']);
  assert.match(feed[1].text, /mở được/); assert.match(feed[0].text, /đập thành công/);
  // Top 1: vượt hẳn người khác thì đăng, lần 2 trong 6 giờ thì không.
  const topOvr = await one(`select coalesce(max(best_ovr), 0) from public.fco_ranks`);
  await db.query(`insert into public.fco_ranks(user_id, best_ovr, best_at) values ($1, $2, now()) on conflict (user_id) do update set best_ovr = excluded.best_ovr`, [C, topOvr + 5]);
  await db.query(`update public.fco_ranks set best_ovr = best_ovr + 1 where user_id = $1`, [C]);
  feed = await as(B, `select public.fco_live_feed()`);
  assert.equal(feed.filter(f => f.kind === 'top:ovr').length, 1);
  assert.match(feed[0].text, /Top 1 BXH Đập thẻ OVR/);
  await assert.rejects(as(B, `select public.fco_live_post($1, 'x', 'spam')`, [B]), /permission denied/);
  if (files.some(f => f.includes('202611120009'))) {
    await as(A, `select public.fco_admin_account_tier($1, 'premium')`, [C]);
    await as(C, `select public.fco_set_name_effect('neon')`);
    feed = await as(B, `select public.fco_live_feed()`);
    assert.equal(feed[0].effect, 'neon'); assert.ok(feed[0].name && feed[0].text.includes(feed[0].name), 'tên nằm trong câu để tô hiệu ứng');
    await as(A, `select public.fco_admin_account_tier($1, 'classic')`, [C]);
    feed = await as(B, `select public.fco_live_feed()`);
    assert.equal(feed[0].effect, null, 'hết Premium thì không còn hiệu ứng');
  }
  console.log('live feed OK');
}

console.log('ALL OK');
