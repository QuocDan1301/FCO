import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimableGrind, type GrindState } from '../src/grind-missions.ts';

const sql = readFileSync('supabase/migrations/202611150006_fco_grind_missions.sql', 'utf8');
const rawPacks = readFileSync('src/packs.json', 'utf8');
const { packs } = JSON.parse(rawPacks.charCodeAt(0) === 0xfeff ? rawPacks.slice(1) : rawPacks) as { packs: { id: string; published: boolean }[] };

test('202611150006: nhiệm vụ cày chay ngày + tuần, quà là gói có thật trong game', () => {
  const rows = [...sql.matchAll(/\('(\w+)',\s+'(day|week)',\s+'(\w+)',\s+(\d+),\s+'(\[[^']+\])'/g)].map(m => ({ id: m[1], period: m[2], kind: m[3], goal: +m[4], rewards: JSON.parse(m[5]) as { pack: string }[] }));
  assert.equal(rows.filter(r => r.period === 'day').length, 4);
  assert.equal(rows.filter(r => r.period === 'week').length, 4);
  for (const r of rows) for (const reward of r.rewards) assert.ok(packs.some(p => p.id === reward.pack && p.published), `${r.id}: thiếu gói ${reward.pack}`);
  // Chỉ đếm những gì máy chủ tự ghi nhận; không có nhiệm vụ "đá N trận" (bỏ trận ngay để cày).
  assert.deepEqual([...new Set(rows.map(r => r.kind))].sort(), ['daily_claim', 'penalty_hit', 'ranked_unbeaten', 'ranked_win', 'upgrade_ok']);
  assert.match(sql, /perform public\.fco_grind_bump\(p_uid, 'upgrade_ok', 1\);/);
  assert.match(sql, /perform public\.fco_rank_round_tick\(\);/, 'giữ nguyên phần BXH Đập 8 của fco_stp_mission_upgrade');
  assert.match(sql, /grant execute on function public\.fco_grind_state\(\), public\.fco_grind_claim\(text\) to authenticated/);
  assert.match(sql, /function public\.fco_grind_state\(\) returns jsonb\nlanguage plpgsql stable/, 'bảng nhiệm vụ chỉ đọc');
});

test('Đếm phần thưởng nhiệm vụ cày đang chờ nhận', () => {
  const m = (id: string, period: 'day' | 'week', progress: number, goal: number, claimed = false) => ({ id, period, kind: 'x', goal, progress, claimed, rewards: [], title: id, hint: '' });
  const s: GrindState = { day: '2026-11-15', week: '2026-11-09', missions: [m('a', 'day', 3, 3), m('b', 'day', 2, 3), m('c', 'week', 20, 20, true), m('d', 'week', 60, 60)] };
  assert.equal(claimableGrind(s), 2); assert.equal(claimableGrind(s, 'day'), 1); assert.equal(claimableGrind(s, 'week'), 1); assert.equal(claimableGrind(null), 0);
});