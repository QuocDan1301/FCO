import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PVP_RULES, fromSvg, roundLabel, secondsLeft, toSvg } from '../src/pvp.ts';

// Penalty đối kháng (202611240006_fco_penalty_pvp.sql); máy chủ chạy thật ở supabase/tests/fco-pvp.pglite.mjs.
const sql = readFileSync('supabase/migrations/202611240006_fco_penalty_pvp.sql', 'utf8');

test('Luật đối kháng khớp máy chủ: 5 lượt, tối đa 15, 20 giây/lượt, mất kết nối 45 giây, Elo K=24 từ 1.000', () => {
  const m = /fco_pvp_rules\(\)[\s\S]*?select '(\{[^']+\})'::jsonb/.exec(sql);
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
  assert.equal(roundLabel(3), 'Lượt 3/5');
  assert.equal(roundLabel(6), 'Luân lưu · lượt 6');
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