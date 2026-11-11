import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMATIONS } from '../src/squad.ts';
import { RANKED_TIERS, RANKED_WAGE_CAP, nextTier, tierOf } from '../src/ranked.ts';
import { MatchSim, ballAt, buildTimeline, minuteAt, statsAt } from '../src/ranked-sim.ts';
import type { Teams } from '../src/ranked-sim.ts';

const sql = readFileSync('supabase/migrations/202611120002_fco_ranked.sql', 'utf8');
const side = (formation: string) => FORMATIONS[formation].map((s, i) => ({ role: s.role, fx: s.x, fy: s.y, name: `P${i}` }));
const teams: Teams = { me: side('4-2-3-1'), opp: side('4-3-3') };

test('Bậc xếp hạng khớp máy chủ (fco_ranked_tier), bắt đầu 1000 điểm = Bạc', () => {
  for (const tier of RANKED_TIERS) {
    if (tier.min > 0) assert.match(sql, new RegExp(`p_points >= ${tier.min} then '${tier.id}'`), tier.id);
    assert.equal(tierOf(tier.min).id, tier.id);
  }
  assert.match(sql, /points integer not null default 1000/);
  assert.equal(tierOf(1000).name, 'Bạc');
  assert.deepEqual(nextTier(1000), { tier: RANKED_TIERS[2], need: 100 });
  assert.equal(nextTier(2500), null);
});

test('Diễn trận: bàn thắng đúng phút, đúng đội, đúng người ghi bàn; bóng vào lưới đúng khung thành', () => {
  const goals = [
    { minute: 3, side: 'me' as const, scorer: 0, assist: 2 },
    { minute: 4, side: 'opp' as const, scorer: 1, assist: null },
    { minute: 44, side: 'me' as const, scorer: 3, assist: null },
    { minute: 77, side: 'opp' as const, scorer: 0, assist: 4 },
    { minute: 89, side: 'me' as const, scorer: 0, assist: 1 },
  ];
  for (let seed = 1; seed <= 40; seed++) {
    const tl = buildTimeline(teams, goals, seed);
    const scored = tl.events.filter(e => e.kind === 'goal');
    assert.deepEqual(scored.map(e => [e.minute, e.side, e.scorer, e.assist]), goals.map(g => [g.minute, g.side, g.scorer, g.assist]), `seed ${seed}`);
    for (const e of scored) {
      assert.equal(minuteAt(tl, e.t), e.minute, `đồng hồ đúng phút ghi bàn (seed ${seed})`);
      const at = ballAt(tl, e.t).ball;
      assert.ok(e.side === 'me' ? at.y < 0 : at.y > 100, 'bóng vào lưới đúng khung thành');
      assert.ok(at.x > 40 && at.x < 60);
      // Ngay trước cú sút người cầm bóng là người ghi bàn.
      const before = tl.keys.filter(k => k.t < e.t && k.holder).at(-1)!;
      assert.deepEqual(before.holder, { side: e.side, i: e.scorer });
    }
    // Thời gian tăng dần, kết thúc ở phút 90, khoảng 2,5 phút diễn.
    assert.ok(tl.keys.every((k, i) => i === 0 || k.t >= tl.keys[i - 1].t));
    assert.equal(minuteAt(tl, tl.duration), 90);
    assert.ok(tl.duration > 140 && tl.duration < 200, `duration ${tl.duration}`);
    // Bóng không ra ngoài sân trừ khi vào lưới / sút trượt.
    for (const k of tl.keys) if (!['goal', 'miss'].includes(k.kind)) assert.ok(k.x >= 0 && k.x <= 100 && k.y >= 0 && k.y <= 100, `${k.kind} ${k.x},${k.y}`);
  }
});

test('Diễn trận: cùng seed giống hệt nhau; 22 cầu thủ chạy trong sân; trận 0–0 vẫn có diễn biến', () => {
  const a = buildTimeline(teams, [], 7), b = buildTimeline(teams, [], 7);
  assert.deepEqual(a, b);
  assert.ok(a.keys.length > 80, `${a.keys.length} pha bóng`);
  assert.ok(a.events.some(e => e.kind === 'half') && a.events.some(e => e.kind === 'end'));
  const sim = new MatchSim(teams, [{ minute: 60, side: 'me', scorer: 0, assist: null }], 11);
  while (!sim.done) {
    sim.step(.5);
    for (const p of [...sim.pos.me, ...sim.pos.opp]) assert.ok(p.x >= -3 && p.x <= 103 && p.y >= -3 && p.y <= 103);
  }
  assert.equal(sim.tl.events.filter(e => e.kind === 'goal').length, 1);
});

test('Diễn trận mượt: cầu thủ tăng / giảm tốc dần (không giật), bóng không nhảy cóc giữa các khung hình', () => {
  const goals = [{ minute: 20, side: 'me' as const, scorer: 0, assist: 1 }, { minute: 46, side: 'opp' as const, scorer: 1, assist: null }, { minute: 80, side: 'me' as const, scorer: 2, assist: 3 }];
  const sim = new MatchSim(teams, goals, 99), dt = 1 / 60;
  const prev = { me: sim.pos.me.map(p => ({ ...p })), opp: sim.pos.opp.map(p => ({ ...p })) };
  const speed: Record<string, number> = {};
  let ball = ballAt(sim.tl, 0).ball, maxJerk = 0, maxBall = 0;
  while (!sim.done) {
    sim.step(dt);
    for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => {
      const v = Math.hypot(p.x - prev[side][i].x, p.y - prev[side][i].y) / dt, key = `${side}${i}`;
      const isHolder = sim.state().holder?.side === side && sim.state().holder?.i === i;
      if (key in speed && !isHolder) maxJerk = Math.max(maxJerk, Math.abs(v - speed[key]));
      speed[key] = v; prev[side][i] = { ...p };
    });
    const b = sim.state().ball; maxBall = Math.max(maxBall, Math.hypot(b.x - ball.x, b.y - ball.y)); ball = b;
  }
  // Mỗi khung (1/60 giây) tốc độ cầu thủ đổi không quá ~1/2 tốc độ chạy tối đa; bóng đi tối đa vài đơn vị sân mỗi khung.
  assert.ok(maxJerk < 15, `tốc độ đổi đột ngột ${maxJerk.toFixed(1)}`);
  assert.ok(maxBall < 4, `bóng nhảy ${maxBall.toFixed(2)} đơn vị trong một khung`);
});

test('Cầu thủ không đứng đơ: phần lớn thời gian đều đang di chuyển; có hướng (mũi tên) là vectơ đơn vị', () => {
  const sim = new MatchSim(teams, [{ minute: 50, side: 'me', scorer: 0, assist: 1 }], 5), dt = 1 / 30;
  const prev = { me: sim.pos.me.map(p => ({ ...p })), opp: sim.pos.opp.map(p => ({ ...p })) };
  let still = 0, total = 0;
  while (!sim.done) {
    sim.step(dt);
    for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => {
      if (sim.teams[side][i].role === 'GK') return;
      const v = Math.hypot(p.x - prev[side][i].x, p.y - prev[side][i].y) / dt;
      total++; if (v < .6) still++;
      prev[side][i] = { ...p };
      const f = sim.face[side][i]; assert.ok(Math.abs(Math.hypot(f.x, f.y) - 1) < 1e-6);
    });
  }
  assert.ok(still / total < .25, `đứng yên ${(still / total * 100).toFixed(0)}% thời gian`);
});

test('Nhận bóng không khựng: người cầm bóng hầu như luôn đang chạy (chạm bóng đầu đẩy bóng đi tiếp)', () => {
  let still = 0, total = 0;
  for (const seed of [1, 7, 42]) {
    const sim = new MatchSim(teams, [{ minute: 30, side: 'me', scorer: 0, assist: 1 }], seed), dt = 1 / 30;
    const prev = { me: sim.pos.me.map(p => ({ ...p })), opp: sim.pos.opp.map(p => ({ ...p })) };
    while (!sim.done) {
      sim.step(dt);
      // Không tính lúc trọng tài dừng trận (phạm lỗi) và lúc thủ môn giữ bóng chờ phát — đứng yên khi đó là đúng.
      const st = sim.state(), h = st.kind === 'foul' || (st.holder && sim.teams[st.holder.side][st.holder.i].role === 'GK') ? null : st.holder;
      if (h) { const p = sim.pos[h.side][h.i], q = prev[h.side][h.i]; total++; if (Math.hypot(p.x - q.x, p.y - q.y) / dt < 1.5) still++; }
      for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => { prev[side][i] = { ...p }; });
    }
  }
  // Chỉ còn đứng khi giao bóng / thủ môn bắt bóng.
  assert.ok(still / total < .12, `người cầm bóng đứng yên ${(still / total * 100).toFixed(0)}% thời gian`);
});
test('Mức lương GLXH khớp máy chủ (202611120006) và danh mục gửi kèm lương', () => {
  const wageSql = readFileSync('supabase/migrations/202611120006_fco_ranked_wage_cap.sql', 'utf8');
  assert.match(wageSql, new RegExp(`wage_total > ${RANKED_WAGE_CAP} then raise exception 'FCO_RANKED_WAGE'`));
  assert.match(wageSql, /insert into public\.fco_cat_players_next\(id, name, ovrs, prices, fixed, insurance, wage\)/);
  assert.equal(RANKED_WAGE_CAP, 310);
});

test('Thống kê trận: kiểm soát bóng cộng 100%, số cú sút không ít hơn bàn thắng, có chuyền bóng', () => {
  const sim = new MatchSim(teams, [{ minute: 20, side: 'me', scorer: 0, assist: 1 }, { minute: 60, side: 'opp', scorer: 1, assist: null }], 9);
  const start = statsAt(sim.tl, 0);
  assert.deepEqual([start.shots, start.passes], [[0, 0], [0, 0]]);
  const end = statsAt(sim.tl, sim.tl.duration);
  assert.equal(end.possession[0] + end.possession[1], 100);
  assert.ok(end.onTarget[0] >= 1 && end.onTarget[1] >= 1 && end.shots[0] >= end.onTarget[0] && end.shots[1] >= end.onTarget[1]);
  assert.ok(end.passes[0] + end.passes[1] > 20, `chuyền ${end.passes}`);
});

test('Logic đá bóng: cướp bóng khi đã áp sát, người nhận có mặt khi bóng tới, chỉ sút trong khu vực dứt điểm, ít chuyền về', () => {
  let wins = 0, passes = 0, back = 0, shots = 0;
  for (const seed of [3, 11, 27]) {
    const tl = buildTimeline(teams, [{ minute: 30, side: 'me', scorer: 0, assist: 1 }, { minute: 75, side: 'opp', scorer: 1, assist: null }], seed);
    const per = (teams.me.length + teams.opp.length + 1) * 2;
    const posAt = (t: number, side: 'me' | 'opp', i: number) => { const o = Math.min(tl.count - 1, Math.round(t / .05)) * per + (side === 'me' ? 0 : teams.me.length * 2) + i * 2; return { x: tl.frames[o], y: tl.frames[o + 1] }; };
    for (let j = 1; j < tl.keys.length; j++) {
      const a = tl.keys[j - 1], k = tl.keys[j];
      if ((k.kind === 'save' || k.kind === 'miss') && !a.holder && j >= 2) {
        // Điểm sút = vị trí bóng lúc bắt đầu cú sút, theo hướng tấn công của đội sút.
        const ev = tl.events.find(e => Math.abs(e.t - k.t) < 1e-9);
        const fy = ev?.side === 'opp' ? 100 - a.y : a.y;
        assert.ok(fy < 32, `sút từ quá xa (y ${fy.toFixed(1)})`); shots++;
      }
      if (!k.holder || (k.kind !== 'win' && k.kind !== 'pass')) continue;
      const p = posAt(k.t, k.holder.side, k.holder.i), d = Math.hypot(p.x - k.x, p.y - k.y);
      assert.ok(d < 5, `${k.kind}: người nhận / người giành còn cách bóng ${d.toFixed(1)}`);
      if (k.kind === 'win') wins++;
      else { passes++; if ((k.holder.side === 'me' ? a.y - k.y : k.y - a.y) < -10) back++; }
    }
  }
  assert.ok(wins > 30 && passes > 120 && shots > 10, `giành ${wins}, chuyền ${passes}, sút ${shots}`);
  assert.ok(back / passes < .32, `chuyền về ${(back / passes * 100).toFixed(0)}%`);
});
test('Trọng tài: chạy theo pha bóng (không đứng yên, không xa bóng), có thổi phạt; phạm lỗi không làm đổi đội cầm bóng', () => {
  const sim = new MatchSim(teams, [{ minute: 40, side: 'me', scorer: 0, assist: 1 }], 21), dt = 1 / 30;
  let far = 0, frames = 0, moved = 0, last = { ...sim.ref };
  while (!sim.done) {
    sim.step(dt); frames++;
    const b = sim.state().ball; if (Math.hypot(sim.ref.x - b.x, sim.ref.y - b.y) > 35) far++;
    if (Math.hypot(sim.ref.x - last.x, sim.ref.y - last.y) > .01) moved++; last = { ...sim.ref };
    assert.ok(sim.ref.x >= 0 && sim.ref.x <= 100 && sim.ref.y >= 0 && sim.ref.y <= 100);
  }
  assert.ok(far / frames < .08, `trọng tài xa bóng ${(far / frames * 100).toFixed(0)}%`);
  assert.ok(moved / frames > .8);
  const fouls = sim.tl.events.filter(e => e.kind === 'foul');
  assert.ok(fouls.length >= 1, 'có pha phạm lỗi');
  for (const e of fouls) { const before = ballAt(sim.tl, e.t - .01).holder, after = ballAt(sim.tl, e.t + 1).holder; assert.equal(after?.side, before?.side); assert.notEqual(e.side, before?.side); }
});

test('Thủ môn cầm bóng: không ai giành bóng từ tay thủ môn, đối phương lùi ra xa', () => {
  for (const seed of [5, 8, 13]) {
    const sim = new MatchSim(teams, [{ minute: 20, side: 'me', scorer: 0, assist: 1 }, { minute: 60, side: 'opp', scorer: 1, assist: 2 }], seed);
    const keys = sim.tl.keys;
    for (let j = 1; j < keys.length; j++) {
      if (keys[j].kind !== 'win') continue;
      let k = j - 1; while (k > 0 && !keys[k].holder) k--;
      const before = keys[k].holder!;
      assert.notEqual(sim.teams[before.side][before.i].role, 'GK', `giành bóng từ tay thủ môn lúc ${keys[j].t.toFixed(1)}s`);
    }
    let close = 0, held = 0;
    while (!sim.done) {
      sim.step(1 / 20);
      const s = sim.state(), h = s.holder;
      if (!h || sim.teams[h.side][h.i].role !== 'GK') continue;
      held++;
      const other = h.side === 'me' ? 'opp' : 'me';
      if (sim.pos[other].some((p, i) => sim.teams[other][i].role !== 'GK' && Math.hypot(p.x - s.ball.x, p.y - s.ball.y) < 6)) close++;
    }
    assert.ok(held > 0 && close / held < .15, `đối phương áp sát thủ môn ${(close / Math.max(1, held) * 100).toFixed(0)}% thời gian`);
  }
});

test('Việt vị: bàn thắng không việt vị; mọi đường chuyền cho người việt vị đều bị thổi, bóng sang đội kia', () => {
  const per = (teams.me.length + teams.opp.length + 1) * 2, n = teams.me.length;
  let calls = 0, passes = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const tl = buildTimeline(teams, [{ minute: 25, side: 'me', scorer: 0, assist: 1 }, { minute: 70, side: 'opp', scorer: 1, assist: 2 }, { minute: 80, side: 'me', scorer: 2, assist: null }], seed);
    // Vị trí đúng khung trận dùng lúc quyết định chuyền (khung cuối không vượt quá thời điểm t).
    const at = (t: number, s: 'me' | 'opp', i: number) => { const o = Math.min(tl.count - 1, Math.floor(t / .05 + 1e-9)) * per + (s === 'me' ? 0 : n * 2) + i * 2; return { x: tl.frames[o], y: tl.frames[o + 1] }; };
    const fy = (s: 'me' | 'opp', y: number) => s === 'me' ? y : 100 - y;
    const offside = (t: number, s: 'me' | 'opp', i: number, ballY: number) => { const o = s === 'me' ? 'opp' : 'me'; const ys = Array.from({ length: n }, (_, k) => fy(s, at(t, o, k).y)).sort((a, b) => a - b); return fy(s, at(t, s, i).y) < Math.min(50, fy(s, ballY), ys[1]) - .6; };
    for (let j = 1; j + 1 < tl.keys.length; j++) {
      const k = tl.keys[j], nx = tl.keys[j + 1];
      if (k.holder || k.kind !== 'pass' || !nx.holder || nx.kind === 'reset' || nx.kind === 'win') continue;
      let b = j - 1; while (b > 0 && !tl.keys[b].holder) b--;
      if (tl.keys[b].holder!.side !== nx.holder.side) continue;
      passes++;
      const called = tl.events.some(e => e.kind === 'offside' && Math.abs(e.t - nx.t) < 1e-9);
      if (called) calls++;
      else assert.ok(!offside(k.t, nx.holder.side, nx.holder.i, k.y), `chuyền cho người việt vị mà không thổi lúc ${k.t.toFixed(1)}s`);
    }
    for (const e of tl.events.filter(e => e.kind === 'offside')) {
      const after = ballAt(tl, e.t + 1.7).holder;
      assert.notEqual(after?.side, e.side, 'việt vị thì đội kia được đá phạt');
    }
    assert.equal(tl.events.filter(e => e.kind === 'goal').length, 3);
  }
  assert.ok(calls / passes < .06, `việt vị quá nhiều: ${calls}/${passes}`);
});
