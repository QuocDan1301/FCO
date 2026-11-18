import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_BULK_SELL, SELL_BAND_PERCENT, SYSTEM_BUY_LEVEL, SYSTEM_SALE_FEE_PERCENT, SYSTEM_TAKEOVER_MIN, saleTaxPercent, taxFor } from '../src/market.ts';

// Chợ giữa người chơi (2026-11-17): luật trên máy chủ (migration) phải khớp hằng số game hiển thị cho người chơi.
const sql = readFileSync(new URL('../supabase/migrations/202611170002_fco_player_market.sql', import.meta.url), 'utf8');

test('Chợ người chơi: lệnh mua 24 giờ, khung ±10%, hệ thống chỉ bán +1 (luật treo bán / bán cho hệ thống: 202611170012)', () => {
  assert.equal(SYSTEM_BUY_LEVEL, 1);
  assert.match(sql, /'buyTtlHours', 24\b/);
  assert.equal(SELL_BAND_PERCENT, 10, 'Khung giá lệnh dùng sellBand của bộ dữ liệu (±10%)');
  assert.match(sql, /if p_level <> 1 then raise exception 'FCO_SYSTEM_PLUS1'/, 'Hệ thống chỉ bán +1');
});

test('Chợ người chơi: không tự khớp lệnh của chính mình, giá trong khung, hàm nội bộ không mở cho người chơi', () => {
  assert.equal((sql.match(/user_id <> uid/g) ?? []).length, 2, 'Cả treo bán lẫn đặt mua đều bỏ lệnh của chính mình');
  assert.equal((sql.match(/fco_mkt_check_price\(/g) ?? []).length >= 3, true, 'Treo bán và đặt mua đều kiểm khung giá');
  assert.match(sql, /revoke all on function public\.fco_mkt_rules\(\)[\s\S]*?public\.fco_mkt_settle\(\), public\.fco_mkt_apply\(uuid, jsonb\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.fco_mkt_sell[\s\S]*?to authenticated/);
  assert.match(sql, /revoke all on public\.fco_mkt_orders, public\.fco_mkt_deliveries from public, anon, authenticated/);
});
test('Chợ người chơi: hệ thống bán +1 không giới hạn ngay trên chợ, lệnh người chơi rẻ hơn được ưu tiên', () => {
  const seller = readFileSync(new URL('../supabase/migrations/202611170003_fco_market_system_seller.sql', import.meta.url), 'utf8');
  assert.match(seller, /sys := case when p_level = 1 then public\.fco_inv_price\(p_player, 1\) end;/);
  assert.match(seller, /p_price >= sys and \(s\.id is null or s\.price > sys\)/, 'Chỉ mua của hệ thống khi không có người chơi bán rẻ hơn hoặc bằng');
  assert.doesNotMatch(seller, /limit 50|daily|fco_mkt_quota/i, 'Không giới hạn lượt mua của hệ thống');
});
test('Hàng phôi (nhóm 1): bộ dữ liệu gửi nhóm giá, hệ thống treo bán 100–150 thẻ +1 mỗi phút, cấp càng cao càng ít', async () => {
  const { catalogPlayers } = await import('../src/inventory-catalog.ts');
  const rows = catalogPlayers();
  assert.ok(rows.every(r => [1, 2, 3].includes(r[12])), 'Mọi cầu thủ có nhóm giá 1 / 2 / 3');
  assert.ok(rows.some(r => r[12] === 1), 'Có cầu thủ nhóm 1');
  const fix = readFileSync(new URL('../supabase/migrations/202611170006_fco_market_supply_group1.sql', import.meta.url), 'utf8');
  assert.match(fix, /if coalesce\(g, 0\) = 1 then/, 'Hàng phôi là nhóm 1 (nhóm 3 là nhóm đắt nhất)');
  const supply = readFileSync(new URL('../supabase/migrations/202611170004_fco_market_group3_supply.sql', import.meta.url), 'utf8');
  assert.match(supply, /greatest\(1, floor\(\(125 \+ 25 \* public\.fco_inv_swing\(p_player, p_level, p_minute \+ 900000000\)\) \* power\(0\.68, p_level - 1\)\)\)/);
  // 202611170007: +1 mỗi phút 400…500, × 0,68 mỗi cấp, +13 còn 3…4.
  const more = readFileSync(new URL('../supabase/migrations/202611170007_fco_market_supply_more.sql', import.meta.url), 'utf8');
  assert.match(more, /greatest\(1, floor\(\(450 \+ 50 \* public\.fco_inv_swing\(p_player, p_level, p_minute \+ 900000000\)\) \* power\(0\.68, p_level - 1\)\)\)/);
  const qty = (swing: number, level: number) => Math.max(1, Math.floor((450 + 50 * swing) * 0.68 ** (level - 1)));
  assert.deepEqual([qty(-1, 1), qty(1, 1)], [400, 500]);
  assert.deepEqual([qty(-1, 13), qty(1, 13)], [3, 4]);
  assert.match(supply, /do update set sold = public\.fco_mkt_sys_sold\.sold \+ 1 where public\.fco_mkt_sys_sold\.sold < q/, 'Không bán quá lượng của phút khi nhiều người mua cùng lúc');
});
test('Mua hàng loạt qua chợ: tối đa 10 thẻ, nguồn rẻ nhất không vượt giá tối đa, ưu tiên người chơi khi rẻ hơn / bằng', () => {
  const bulk = readFileSync(new URL('../supabase/migrations/202611170008_fco_market_bulk_buy.sql', import.meta.url), 'utf8');
  assert.match(bulk, /p_count > 10/);
  assert.match(bulk, /price <= p_max and user_id <> uid order by price, created_at/);
  assert.match(bulk, /s\.price <= sys then sys := null/);
  assert.match(bulk, /raise exception 'FCO_NO_SELLER'/);
  assert.match(bulk, /grant execute on function public\.fco_mkt_bulk_buy\(text, integer, integer, integer, bigint\) to authenticated/);
});
test('Nhận hàng chợ bằng tay: thẻ mua được / BP bán được chờ nhận, BP trả lại tự cộng (202611170011)', () => {
  const sql = readFileSync('supabase/migrations/202611170011_fco_market_claim_manual.sql', 'utf8');
  // Phần cuối lượt của các hàm chợ chỉ tự cộng BP trả lại.
  assert.match(sql, /function public\.fco_mkt_apply\(p_uid uuid, p_data jsonb\)[\s\S]*?array\['refund'\]/);
  // Khớp lệnh: người mua chờ thẻ (buy), người bán chờ BP (sell), BP giữ dư là refund.
  assert.match(sql, /'buy', p_buy\.id/);
  assert.match(sql, /'sell', p_sell\.id/);
  assert.match(sql, /p_buy\.price - p_at, 'refund'/);
  // Hệ thống bán / hệ thống nhận cũng chờ nhận; lệnh mua hết hạn trả BP tự cộng.
  assert.match(sql, /function public\.fco_mkt_system_sale[\s\S]*?'buy', oid/);
  assert.match(sql, /r\.price - fee, 'sell', r\.id/);
  assert.match(sql, /r\.price, 'refund', r\.id/);
  assert.doesNotMatch(sql.slice(sql.indexOf('function public.fco_mkt_buy(')), /fco_inv_new_card/);
  // Nút nhận: chỉ 'buy' / 'sell', chỉ người đăng nhập.
  assert.match(sql, /p_kind not in \('buy', 'sell'\)/);
  assert.match(sql, /grant execute on function public\.fco_mkt_take\(text\) to authenticated/);
  assert.match(sql, /revoke execute on function public\.fco_mkt_take\(text\) from public, anon/);
});

test('Hai cách bán: hệ thống mua ngay theo giá tham chiếu, bán cho người chơi treo 24 giờ rồi thẻ về kho (202611170012)', () => {
  const sql = readFileSync('supabase/migrations/202611170012_fco_market_sell_choice.sql', 'utf8');
  assert.match(sql, /'sellTtlHours', 24\b/);
  assert.match(sql, /'buyTtlHours', 24\b/);
  assert.doesNotMatch(sql, /'systemAfterSec'/);
  // Hết hạn treo bán: thẻ trả về (refund, tự cộng), không còn hệ thống nhận.
  assert.match(sql, /values \(r\.user_id, r\.card, 0, 'refund', r\.id/);
  assert.doesNotMatch(sql, /status = 'system'/);
  // Bán cho hệ thống: giá tham chiếu, không dùng giá gửi lên; BP vào số dư luôn.
  const sys = sql.slice(sql.indexOf('function public.fco_inv_sell('));
  assert.match(sys, /price := public\.fco_inv_price/);
  assert.doesNotMatch(sys, /item->>'price'/);
  assert.match(sys, /'balance', coalesce\(\(d->>'balance'\)::bigint, 0\) \+ total - fees/);
});

test('Bán cho hệ thống: thuế gốc 50% trước khi giảm, khớp máy chủ (202611170013)', () => {
  const sql = readFileSync('supabase/migrations/202611170013_fco_system_sale_fee.sql', 'utf8');
  assert.equal(SYSTEM_SALE_FEE_PERCENT, 50);
  assert.match(sql, new RegExp(`fco_inv_check\\(p_catalog\\) \\|\\| jsonb_build_object\\('marketFee', ${SYSTEM_SALE_FEE_PERCENT}\\)`));
  const plain = {} as Parameters<typeof saleTaxPercent>[0];
  assert.equal(saleTaxPercent(plain, undefined, SYSTEM_SALE_FEE_PERCENT), 50);
  assert.equal(taxFor(plain, 20, undefined, SYSTEM_SALE_FEE_PERCENT), 30, 'phiếu 20% trừ thẳng điểm %');
  assert.equal(saleTaxPercent(plain), 40, 'bán cho người chơi vẫn 40%');
});

test('Lệnh đặt mua không hết hạn, lệnh bán cho người chơi vẫn 24 giờ (202611170014)', () => {
  const sql = readFileSync('supabase/migrations/202611170014_fco_market_buy_no_expiry.sql', 'utf8');
  assert.doesNotMatch(sql, /buyTtlHours/);
  assert.match(sql, /'sellTtlHours', 24\b/);
  const settle = sql.slice(sql.indexOf('function public.fco_mkt_settle()'), sql.indexOf('function public.fco_mkt_buy('));
  assert.doesNotMatch(settle, /side = 'buy'/, 'không còn vòng hết hạn lệnh mua');
  assert.match(sql, /Không hết hạn, huỷ ở TTCN thì trả lại BP/);
});

test('Mua ở màn đập thẻ vào thẳng kho; hệ thống bán nhóm 2 như nhóm 1 (2/3 lượng), +1 mọi nhóm không giới hạn (202611170015)', () => {
  const sql = readFileSync('supabase/migrations/202611170015_fco_market_direct_group2.sql', 'utf8');
  assert.match(sql, /fco_mkt_buy\(p_catalog text, p_player integer, p_level integer, p_price bigint, p_direct boolean default false\)/);
  assert.match(sql, /p_max bigint, p_direct boolean default false\)/);
  assert.match(sql, /if p_direct then d := public\.fco_mkt_apply_orders\(uid, d, ids\)/);
  assert.match(sql, /grant execute on function public\.fco_mkt_buy\(text, integer, integer, bigint, boolean\) to authenticated/);
  assert.match(sql, /grant execute on function public\.fco_mkt_bulk_buy\(text, integer, integer, integer, bigint, boolean\) to authenticated/);
  assert.match(sql, /revoke all on function public\.fco_mkt_apply_orders\(uuid, jsonb, bigint\[\]\) from public, anon, authenticated/);
  // +1 mọi nhóm không giới hạn; cấp ≥ 2 chỉ nhóm 1 / 2, nhóm 2 nhân 2/3.
  assert.match(sql, /if p_level = 1 then return jsonb_build_object\('price', price, 'left', null\)/);
  assert.match(sql, /coalesce\(g, 0\) in \(1, 2\)/);
  assert.match(sql, /= 2 then 2\.0 \/ 3 else 1 end/);
});

test('Giá khớp luôn kẹp vào khung ±10% hiện tại, lệnh cũ không vượt khung (202611170017)', () => {
  const sql = readFileSync('supabase/migrations/202611170017_fco_market_band_clamp.sql', 'utf8');
  assert.match(sql, /function public\.fco_mkt_clamp\(p_player integer, p_level integer, p_price bigint\)/);
  assert.match(sql, /revoke all on function public\.fco_mkt_clamp\(integer, integer, bigint\) from public, anon, authenticated/);
  const fill = sql.slice(sql.indexOf('function public.fco_mkt_fill('), sql.indexOf('function public.fco_mkt_buy('));
  assert.match(fill, /at bigint := public\.fco_mkt_clamp\(p_sell\.player_id, p_sell\.level, p_at\)/);
  assert.doesNotMatch(fill.slice(fill.indexOf('begin')), /\bp_at\b/, 'sau khi kẹp không dùng lại giá chưa kẹp');
  assert.match(sql, /price <= least\(p_max, hi\)/, 'Mua hàng loạt bỏ qua lệnh bán cao hơn khung');
});

test('Hệ thống treo bán nhóm 3 từ +2 như nhóm 2 nhưng 2/3 lượng (4/9 nhóm 1); EL / TSUBASA không bán (202611180002)', () => {
  const sql = readFileSync('supabase/migrations/202611180002_fco_market_supply_group3.sql', 'utf8');
  assert.match(sql, /when 2 then 2\.0 \/ 3 when 3 then 4\.0 \/ 9 else 1 end/);
  assert.match(sql, /coalesce\(g, 0\) in \(1, 2, 3\)/);
  assert.match(sql, /fco_trade_locked\(p_player\) or public\.fco_mkt_no_system\(p_player\) then return null/);
  assert.match(sql, /if p_level = 1 then return jsonb_build_object\('price', price, 'left', null\)/);
});

test('Lượng hệ thống treo bán: nhóm 1 ×2, nhóm 2 ×4/3 (gấp đôi), nhóm 3 giữ ×4/9 (202611180003)', () => {
  const sql = readFileSync('supabase/migrations/202611180003_fco_market_supply_double.sql', 'utf8');
  assert.match(sql, /when 1 then 2 when 2 then 4\.0 \/ 3 when 3 then 4\.0 \/ 9 else 1 end/);
});

test('Bỏ bán cho hệ thống; treo bán quá 3 phút hệ thống tự mua; mỗi lần bán tối đa 150 thẻ (202611180004)', () => {
  const sql = readFileSync('supabase/migrations/202611180004_fco_market_takeover_3min.sql', 'utf8');
  assert.match(sql, /'systemAfterSec', 180, 'maxOpenSell', (\d+)/);
  assert.ok(+/'maxOpenSell', (\d+)/.exec(sql)![1] >= 150, 'đủ chỗ treo 150 thẻ một lần (luật lúc đó)');
  const settle = sql.slice(sql.indexOf('function public.fco_mkt_settle()'), sql.indexOf('function public.fco_mkt_sell('));
  assert.match(settle, /status = 'system', closed_at = now\(\), fill_price = r\.price/);
  assert.match(settle, /r\.price - fee, 'sell', r\.id/, 'BP chờ nhận ở Lịch sử chuyển nhượng');
  assert.doesNotMatch(settle, /side = 'buy'/, 'lệnh mua vẫn không hết hạn');
  assert.doesNotMatch(sql, /sellTtlHours/);
  assert.match(sql.slice(sql.indexOf('function public.fco_inv_sell(')), /raise exception 'FCO_SELL_VIA_MARKET'/);
});

test('Bán cầu thủ là xong ngay, không treo (202611180010): khớp lệnh mua của người chơi, không thì hệ thống mua ngay; BP chờ nhận', () => {
  const sql = readFileSync('supabase/migrations/202611180010_fco_market_sell_instant.sql', 'utf8');
  assert.equal(SYSTEM_TAKEOVER_MIN, 0);
  assert.match(sql, /'systemAfterSec', 0, 'maxOpenSell', 300/);
  const sell = sql.slice(sql.indexOf('function public.fco_mkt_sell('));
  assert.match(sell, /if found then perform public\.fco_mkt_fill\(o, b, b\.price\); matched := matched \+ 1;\s+else perform public\.fco_mkt_system_take\(o\); took := took \+ 1; end if;/);
  assert.match(sell, /perform public\.fco_mkt_check_price/, 'giá bán vẫn trong biên');
  const take = sql.slice(sql.indexOf('function public.fco_mkt_system_take('), sql.indexOf('function public.fco_mkt_settle('));
  assert.match(take, /status = 'system'.*where id = r\.id and status = 'open'/s, 'không mua hai lần');
  assert.match(take, /r\.price - fee, 'sell', r\.id/, 'BP chờ nhận ở Lịch sử chuyển nhượng');
  assert.doesNotMatch(sql.slice(sql.indexOf('function public.fco_mkt_settle('), sql.indexOf('function public.fco_mkt_sell(')), /side = 'buy'/, 'lệnh mua vẫn không hết hạn');
});

test('Mỗi lần bán tối đa 500 cầu thủ (202611180011): bộ dữ liệu maxBulkSell 500, máy chủ đủ chỗ (maxOpenSell ≥ 500)', () => {
  const sql = readFileSync('supabase/migrations/202611180011_fco_market_sell_500.sql', 'utf8');
  assert.equal(MAX_BULK_SELL, 500);
  assert.match(sql, /'systemAfterSec', 0, 'maxOpenSell', (\d+)/, 'giữ bán ngay');
  assert.ok(+/'maxOpenSell', (\d+)/.exec(sql)![1] >= MAX_BULK_SELL);
});

test('Nhận tất cả ở TTCN gom cả loạt một lần (202611180020): không lặp chép bản lưu theo từng dòng chờ', () => {
  const sql = readFileSync('supabase/migrations/202611180020_fco_market_take_batch.sql', 'utf8');
  const body = sql.slice(sql.indexOf('create or replace function public.fco_mkt_apply_kinds'), sql.indexOf('create or replace function public.fco_mkt_take'));
  assert.doesNotMatch(body, /for r in select/, 'không còn vòng lặp từng dòng');
  assert.doesNotMatch(body, /fco_inv_history\(/, 'không dựng lại lịch sử theo từng dòng');
  assert.match(body, /update public\.fco_mkt_deliveries set claimed_at = now\(\) where id = any\(ids\);/);
  assert.match(body, /if n <= 30 then/);
  assert.match(sql, /'gotBp', applied->'bp', 'gotCards', applied->'cards', 'count', applied->'count'/);
  assert.match(sql, /revoke all on function public\.fco_mkt_apply_kinds\(uuid, jsonb, text\[\]\) from public, anon, authenticated;/);
});
