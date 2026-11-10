// Kho thẻ trên máy chủ (supabase/migrations/202611100013_fco_inventory_server.sql) chạy trên PGlite.
// Chuẩn bị: npx tsx scripts/inventory-fixture.ts <fixture.json>   (bộ dữ liệu + kết quả game tính để so)
// Chạy:     node fco-inventory.pglite.mjs <thư mục dự án> <fixture.json> <các migration theo thứ tự…>
// (cần @electric-sql/pglite: đặt file này cạnh node_modules có PGlite, ví dụ D:\FCOvv-tmp\pg).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root, fixturePath, ...files] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const { catalog, version } = fixture;
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

console.log('ALL OK');
