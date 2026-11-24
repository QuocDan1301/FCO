import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PVP_RULES, fromSvg, kickLabel, kicksOf, roundLabel, secondsLeft, shooterOf, toSvg } from '../src/pvp.ts';

// Penalty đối kháng (202611240006_fco_penalty_pvp.sql); máy chủ chạy thật ở supabase/tests/fco-pvp.pglite.mjs.
const sql = readFileSync('supabase/migrations/202611240006_fco_penalty_pvp.sql', 'utf8');

test('Luật đối kháng khớp máy chủ (bản luân phiên 202611240009): mỗi người 5 quả, tối đa 30 quả, 20 giây/quả, mất kết nối 45 giây, Elo K=24 từ 1.000', () => {
  const alt = readFileSync('supabase/migrations/202611240009_fco_pvp_alternate.sql', 'utf8');
  const m = /fco_pvp_rules\(\)[\s\S]*?select '(\{[^']+\})'::jsonb/.exec(alt);
  assert.ok(m, 'có fco_pvp_rules');
  assert.deepEqual(JSON.parse(m![1]), { ...PVP_RULES });
  // Kết quả mỗi quả dùng chung bảng tỉ lệ của Penalty thường.
  assert.match(sql, /public\.fco_penalty_miss_chance\(sx, sy, kind\)/);
  assert.match(sql, /public\.fco_penalty_keep_chance\(\(p_dive->>'x'\)::double precision, \(p_dive->>'y'\)::double precision, sx, sy, 0\)/);
  // Chỉ trận ghép ngẫu nhiên tính BXH; acc phụ không chơi.
  assert.match(sql, /if m\.mode = 'random' and not public\.fco_is_sub\(m\.p1\) and not public\.fco_is_sub\(m\.p2\) then/);
  assert.match(sql, /raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'pvp'/);
});

test('Toạ độ khung thành: đổi qua lại SVG ↔ điểm sút giữ nguyên, kẹp trong khung', () => {
  for (const p of [{ x: -1, y: 0 }, { x: 0, y: .5 }, { x: .73, y: .91 }, { x: 1, y: 1 }]) {
    const s = toSvg(p); assert.deepEqual(fromSvg(s.cx, s.cy), p);
  }
  assert.deepEqual(fromSvg(-50, 200), { x: -1, y: 0 }, 'bấm ra ngoài khung thì kẹp về mép');
});

test('Nhãn lượt, đồng hồ lượt theo giờ máy chủ, trang được gắn vào App', () => {
  assert.equal(roundLabel(1), 'Lượt 1/5'); assert.equal(roundLabel(2), 'Lượt 1/5'); assert.equal(roundLabel(10), 'Lượt 5/5');
  assert.equal(roundLabel(11), 'Luân lưu · lượt 6');
  assert.equal(secondsLeft(10_000, 0, 0), 10);
  assert.equal(secondsLeft(10_000, 2_000, 0), 8, 'máy chủ chạy nhanh hơn 2 giây');
  assert.equal(secondsLeft(null, 0), 0);
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /\{view === 'pvp' && <PenaltyPvp online=\{online\} onBack=\{\(\) => switchView\('penalty'\)\}\/>\}/);
  assert.match(app, /onPvp=\{pvpAllowed \? \(\) => switchView\('pvp'\) : undefined\}/, 'chỉ hiện lối vào khi được chơi');
});
test('Chế độ thử nghiệm (202611240008): mặc định đóng, chỉ admin + acc phụ; mở thì mọi người trừ acc phụ; admin bật / tắt', () => {
  const t8 = readFileSync('supabase/migrations/202611240008_fco_pvp_test_mode.sql', 'utf8');
  assert.match(t8, /open boolean not null default false/);
  assert.match(t8, /case when public\.fco_pvp_is_open\(\) then not public\.fco_is_sub\(p_uid\)\s*else exists \(select 1 from public\.fco_admins a where a\.user_id = p_uid\) or public\.fco_is_sub\(p_uid\) end/);
  assert.equal((t8.match(/perform public\.fco_pvp_require_access\(uid\);/g) ?? []).length, 3, 'ghép / tạo phòng / vào phòng đều kiểm tra quyền');
  assert.match(t8, /create or replace function public\.fco_admin_pvp_open\(p_open boolean\)[\s\S]*?perform public\.fco_require_admin\(\);/);
});
test('Luân phiên: người sút đổi mỗi quả, khớp công thức máy chủ; nhãn kết quả theo góc nhìn người chơi', () => {
  const alt = readFileSync('supabase/migrations/202611240009_fco_pvp_alternate.sql', 'utf8');
  assert.match(alt, /select case when \(p_id % 2 = 0\) = \(p_n % 2 = 1\) then 1 else 2 end/);
  for (const id of [4, 7]) for (let n = 1; n <= 12; n++) {
    assert.equal(shooterOf(id, n), (id % 2 === 0) === (n % 2 === 1) ? 1 : 2);
    assert.notEqual(shooterOf(id, n), shooterOf(id, n + 1), 'quả kế tiếp đổi người sút');
  }
  assert.equal(kickLabel({ shooter: 'me', o: 'goal' }), 'VÀO!');
  assert.equal(kickLabel({ shooter: 'opp', o: 'save' }), 'Bạn cản phá!');
  assert.equal(kickLabel({ shooter: 'opp', o: 'goal' }), 'Thủng lưới');
  const rounds = [{ r: 1, shooter: 'me', o: 'goal' }, { r: 2, shooter: 'opp', o: 'save' }, { r: 3, shooter: 'me', o: 'miss' }] as never;
  assert.deepEqual(kicksOf(rounds, 'me'), ['goal', 'miss']); assert.deepEqual(kicksOf(rounds, 'opp'), ['save']);
  // Người sút chỉ gửi điểm sút, thủ môn chỉ gửi hướng bay người.
  const page = readFileSync('src/PenaltyPvp.tsx', 'utf8');
  assert.match(page, /api\.pick\(match\.id, match\.round, shooting \? \{ \.\.\.shot!, kind \} : null, shooting \? null : dive\)/);
});