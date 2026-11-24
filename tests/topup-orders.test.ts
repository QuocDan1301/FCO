import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { milestoneTrack, parseVnd, topupQuote, validTopupVnd } from '../src/topup-orders.ts';

const cfg = { vndPer1000: 5000, minVnd: 5000, maxVnd: 50_000_000, tiers: [{ vnd: 100000, bonus: 3000 }, { vnd: 50000, bonus: 1000 }, { vnd: 500000, bonus: 25000 }] };

test('Trang nạp: FC gốc theo tỉ giá + khuyến mãi của mốc cao nhất đã đạt, gợi ý mốc kế tiếp', () => {
  assert.deepEqual({ ...topupQuote(150000, cfg), tier: topupQuote(150000, cfg).tier?.vnd, next: topupQuote(150000, cfg).next?.vnd }, { valid: true, base: 30000, bonus: 3000, total: 33000, tier: 100000, next: 500000 });
  assert.equal(topupQuote(20000, cfg).bonus, 0);
  assert.equal(topupQuote(20000, cfg).next?.vnd, 50000);
  assert.equal(topupQuote(50000, cfg).bonus, 1000, 'đúng bằng mốc thì được mốc đó');
  assert.equal(topupQuote(900000, cfg).bonus, 25000);
  assert.equal(topupQuote(900000, cfg).next, null);
  assert.equal(topupQuote(NaN, cfg).valid, false);
  for (const bad of [4000, 5500, 50_001_000, -5000]) assert.equal(validTopupVnd(bad, cfg), false, String(bad));
});

test('Trang nạp: đọc số tiền gõ tay', () => {
  assert.equal(parseVnd('100.000'), 100000);
  assert.equal(parseVnd('100k'), 100000);
  assert.equal(parseVnd('1tr'), 1000000);
  assert.equal(parseVnd('1,5tr'), 1500000);
  assert.equal(parseVnd('250000đ'), 250000);
  assert.ok(Number.isNaN(parseVnd('abc')));
});

test('Đơn nạp trên máy chủ (202611200002): FC tính ở máy chủ, gốc là "admin", khuyến mãi "topup_bonus", người chơi không tự duyệt', () => {
  const sql = readFileSync('supabase/migrations/202611200002_fco_topup_orders.sql', 'utf8');
  assert.match(sql, /floor\(p_vnd \* 1000\.0 \/ rate\)::bigint/);
  assert.match(sql, /fco_apply_fc\(o\.user_id, o\.base_fc, 'admin'/);
  assert.match(sql, /fco_apply_fc\(o\.user_id, o\.bonus_fc, 'topup_bonus'/);
  assert.match(sql, /create or replace function public\.fco_admin_topup_decide[\s\S]*?public\.fco_require_admin\(\)/);
  assert.match(sql, /revoke all on public\.fco_topup_orders from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.fco_topup_rate_now\(\), public\.fco_topup_tiers_json\(\), public\.fco_topup_order_json\(public\.fco_topup_orders\) from public, anon, authenticated;/);
  const app = readFileSync('src/App.tsx', 'utf8');
  // Trang nạp tách khỏi game (2026-11-20): nút + cạnh ô FC chỉ báo liên hệ admin, game không liên kết sang nap.html.
  // 2026-11-23: người dùng bỏ nút + cạnh số FC trên thanh trên cùng.
  assert.doesNotMatch(app, /className="wallet-plus"/);
  assert.doesNotMatch(app, /nap\.html/);
  const vite = readFileSync('vite.config.ts', 'utf8');
  // Trang nạp build riêng cho Cloudflare Pages (mode nap), không nằm trong bản GitHub Pages của game.
  assert.match(vite, /input: \{ nap: 'nap\.html', quanLyNap: 'quan-ly-nap\.html' \}/);
  assert.doesNotMatch(vite.slice(vite.indexOf("} : {")), /nap\.html/);
  assert.match(readFileSync('package.json', 'utf8'), /"build:nap": "vite build --mode nap"/);
});

test('Thanh mốc nạp tích luỹ: mốc cách đều, tô trong đoạn, "Cần X FC" như ảnh mẫu (1.224 / 0-500-1.000-2.000 → cần 776)', () => {
  const t = milestoneTrack(1224, [2000, 500, 1000]);
  assert.deepEqual(t.nodes.map(n => [n.fc, Math.round(n.pos), n.reached]), [[0, 0, true], [500, 33, true], [1000, 67, true], [2000, 100, false]]);
  assert.equal(t.next, 2000); assert.equal(t.need, 776);
  assert.ok(Math.abs(t.fill - (2 + 224 / 1000) / 3 * 100) < 1e-9);
  assert.equal(milestoneTrack(0, [500]).fill, 0);
  const done = milestoneTrack(5000, [500, 1000]);
  assert.equal(done.fill, 100); assert.equal(done.next, null); assert.equal(done.need, 0);
});

test('KM theo tổng nạp cộng dồn (202611200004): tổng theo lý do "admin" quy VND, nhận 1 lần mỗi mốc, đơn mới không KM riêng', () => {
  const sql = readFileSync('supabase/migrations/202611200004_fco_topup_cumulative.sql', 'utf8');
  assert.match(sql, /sum\(public\.fco_topup_vnd\(l\.delta, l\.created_at\)\)/);
  assert.match(sql, /l\.reason = 'admin'/);
  assert.match(sql, /values \(new_code, uid, p_vnd, floor\(p_vnd \* 1000\.0 \/ rate\)::bigint, 0, null\)/);
  assert.match(sql, /insert into public\.fco_topup_tier_claims \(user_id, min_vnd, bonus_fc\) values \(uid, t\.min_vnd, t\.bonus_fc\) on conflict do nothing;\s+if not found then raise exception 'FCO_MILESTONE_CLAIMED'/);
  assert.match(sql, /'topup_bonus'/);
  assert.match(sql, /where o\.status = 'approved' and o\.bonus_fc > 0/, 'mốc đã được KM theo đơn coi như đã nhận');
});

test('Thanh KM tích luỹ: nhãn mốc gọn, mốc mà một đơn mở khoá', async () => {
  const { shortVnd, tiersUnlockedBy } = await import('../src/topup-orders.ts');
  assert.deepEqual([20000, 150000, 1000000, 1500000].map(shortVnd), ['20k', '150k', '1tr', '1,5tr']);
  const state = { event: null, totalVnd: 25000, tiers: [{ vnd: 20000, bonus: 4000, claimed: false }, { vnd: 30000, bonus: 6000, claimed: false }, { vnd: 40000, bonus: 8000, claimed: true }, { vnd: 100000, bonus: 15000, claimed: false }] };
  assert.deepEqual(tiersUnlockedBy(state, 20000).map(t => t.vnd), [30000], 'mốc 20k đã qua, 40k đã nhận');
  assert.deepEqual(tiersUnlockedBy(state, 80000).map(t => t.vnd), [30000, 100000]);
});

test('VietQR động: giữ ngân hàng / tài khoản của mã tĩnh, thêm số tiền + mã đơn, CRC đúng', async () => {
  const { crc16, dynamicVietQr, parseTlv, cleanInfo } = await import('../src/vietqr-payload.ts');
  const { TOPUP_VIETQR } = await import('../src/config.ts');
  assert.equal(crc16(TOPUP_VIETQR.slice(0, -4)), TOPUP_VIETQR.slice(-4), 'mã tĩnh trong config đúng CRC');
  const dyn = dynamicVietQr(TOPUP_VIETQR, 150000, 'FCOM3XH8T');
  const f = new Map(parseTlv(dyn).map(x => [x.tag, x.value]));
  assert.equal(f.get('01'), '12'); assert.equal(f.get('54'), '150000');
  assert.equal(f.get('38'), new Map(parseTlv(TOPUP_VIETQR).map(x => [x.tag, x.value])).get('38'));
  assert.ok(parseTlv(f.get('62')!).some(x => x.tag === '08' && x.value === 'FCOM3XH8T'));
  assert.equal(crc16(dyn.slice(0, -4)), dyn.slice(-4));
  assert.equal(cleanInfo('Nạp đơn fco-12'), 'NAP DON FCO12');
  assert.throws(() => dynamicVietQr(TOPUP_VIETQR, 0, 'x'));
});

test('Sự kiện nạp tích luỹ có thời gian (202611200005): ngoài đợt không có KM, đơn tạo trong đợt vẫn tính, 3 ngày nhận quà, mỗi đợt tính lại', async () => {
  const sql = readFileSync('supabase/migrations/202611200005_fco_topup_event.sql', 'utf8');
  assert.match(sql, /if e\.id is null then return jsonb_build_object\('event', null/);
  assert.match(sql, /coalesce\(o\.created_at, l\.created_at\) >= p_event\.starts_at and coalesce\(o\.created_at, l\.created_at\) < p_event\.ends_at/);
  assert.match(sql, /select 3 \$\$/);
  assert.match(sql, /primary key \(user_id, event_id, min_vnd\)/);
  assert.match(sql, /raise exception 'FCO_TOPUP_EVENT_OVERLAP'/);
  const { leftText } = await import('../src/topup-orders.ts');
  assert.equal(leftText((2 * 86400 + 5 * 3600 + 12 * 60 + 33) * 1000), '2 ngày 05:12:33');
  assert.equal(leftText(-5), '00:00:00');
});

test('KM tích luỹ tự cộng (202611200006): trigger sau mỗi lần ghi FC nạp, chỉ lý do "admin" dương, khoá với người chơi', () => {
  const sql = readFileSync('supabase/migrations/202611200006_fco_topup_auto_award.sql', 'utf8');
  assert.match(sql, /create trigger fco_topup_ledger_award after insert on public\.fco_fc_ledger\s+for each row when \(new\.reason = 'admin' and new\.delta > 0\)/);
  assert.match(sql, /on conflict do nothing;\s+if found then/);
  assert.match(sql, /revoke all on function public\.fco_topup_auto_award\(uuid\), public\.fco_topup_ledger_award\(\) from public, anon, authenticated;/);
});


test('Hết sự kiện không bấm Nhận KM được (202611200007), trang nạp ẩn thanh ngay khi hết giờ', () => {
  const sql = readFileSync('supabase/migrations/202611200007_fco_topup_claim_running.sql', 'utf8');
  assert.match(sql, /if e\.id is null or now\(\) >= e\.ends_at then raise exception 'FCO_TOPUP_NO_EVENT'/);
  const ui = readFileSync('src/TopUp.tsx', 'utf8');
  // Giao diện 2 cột (2026-11-24): điều kiện gom vào eventOn, thanh mốc (TierTrack) chỉ dựng khi eventOn.
  assert.match(ui, /const eventOn = !!\(tiers\?\.event && tiers\.tiers\.length > 0 && Date\.now\(\) < tiers\.event\.endsAt\);/);
  assert.match(ui, /\{eventOn && <aside className="tp-side">[\s\S]*?<TierTrack/);
});

test('Sự kiện nạp tích luỹ hết giờ là tắt hẳn (202611200008): không còn hạn nhận', () => {
  const sql = readFileSync('supabase/migrations/202611200008_fco_topup_event_no_grace.sql', 'utf8');
  assert.match(sql, /fco_topup_claim_days\(\) returns integer language sql immutable set search_path = '' as \$\$ select 0 \$\$;/);
});
