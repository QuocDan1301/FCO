import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVnd, topupQuote, validTopupVnd } from '../src/topup-orders.ts';

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
  assert.match(app, /className="wallet-plus" href=\{`\$\{import\.meta\.env\.BASE_URL\}nap\.html`\}/);
  const vite = readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /nap: "nap\.html"/); assert.match(vite, /quanLyNap: "quan-ly-nap\.html"/);
});
