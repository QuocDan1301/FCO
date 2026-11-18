import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMATIONS } from '../src/squad.ts';
import { RANKED_TIERS, RANKED_WAGE_CAP, nextTier, tierOf } from '../src/ranked.ts';
import { GOAL_GAP, MatchSim, TRAITS, ballAt, buildTimeline, minuteAt, spreadGoals, statsAt } from '../src/ranked-sim.ts';
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
    // Phút hiển thị = phút máy chủ sau khi giãn các bàn sát nhau (spreadGoals); đội, người ghi bàn, kiến tạo giữ nguyên.
    assert.deepEqual(scored.map(e => [e.minute, e.side, e.scorer, e.assist]), spreadGoals(goals).map(g => [g.minute, g.side, g.scorer, g.assist]), `seed ${seed}`);
    for (const e of scored) {
      assert.equal(minuteAt(tl, e.t), e.minute, `đồng hồ đúng phút ghi bàn (seed ${seed})`);
      const at = ballAt(tl, e.t).ball;
      assert.ok(e.side === 'me' ? at.y < 0 : at.y > 100, 'bóng vào lưới đúng khung thành');
      assert.ok(at.x > 40 && at.x < 60);
      // Ngay trước cú sút người cầm bóng là người ghi bàn.
      const before = tl.keys.filter(k => k.t < e.t && k.holder).at(-1)!;
      assert.deepEqual(before.holder, { side: e.side, i: e.scorer });
    }
    // Thời gian tăng dần, kết thúc ở phút 90, khoảng 3,5 phút diễn (máy chủ nhận kết quả từ 200 giây).
    assert.ok(tl.keys.every((k, i) => i === 0 || k.t >= tl.keys[i - 1].t));
    assert.equal(minuteAt(tl, tl.duration), 90);
    assert.ok(tl.duration > 200 && tl.duration < 270, `duration ${tl.duration}`);
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
      const st = sim.state(), h = st.kind === 'foul' || st.kind === 'setpiece' || (st.holder && sim.teams[st.holder.side][st.holder.i].role === 'GK') ? null : st.holder;
      if (h) { const p = sim.pos[h.side][h.i], q = prev[h.side][h.i]; total++; if (Math.hypot(p.x - q.x, p.y - q.y) / dt < 1.5) still++; }
      for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => { prev[side][i] = { ...p }; });
    }
  }
  // Chỉ còn đứng khi giao bóng / thủ môn bắt bóng / lấy đà trước cú sút / xoay người khi đích sau lưng (vật lý 2026-11-16).
  assert.ok(still / total < .14, `người cầm bóng đứng yên ${(still / total * 100).toFixed(0)}% thời gian`);
});
test('Mức lương GLXH khớp máy chủ (350 từ 202611180016; danh mục gửi kèm lương từ 202611120006)', () => {
  const wageSql = readFileSync('supabase/migrations/202611120006_fco_ranked_wage_cap.sql', 'utf8');
  assert.match(wageSql, /insert into public\.fco_cat_players_next\(id, name, ovrs, prices, fixed, insurance, wage\)/);
  const cap = readFileSync('supabase/migrations/202611180016_fco_ranked_wage_350.sql', 'utf8');
  assert.match(cap, new RegExp(`wage_total > ${RANKED_WAGE_CAP} then raise exception 'FCO_RANKED_WAGE'`));
  assert.match(cap, /'gx'/); assert.match(cap, /'faces'/);
  assert.equal(RANKED_WAGE_CAP, 350);
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
      // Chỉ tính cướp bóng trực tiếp khi thủ môn đang cầm (đoạn ngay trước có người giữ); cắt đường phát bóng của thủ môn là hợp lệ.
      const k = j - 1; if (!keys[k].holder) continue;
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

test('Thủ môn không bao giờ dắt bóng / rời vòng cấm khi kiến tạo; hậu vệ chạy chậm hơn tiền vệ, tiền đạo', () => {
  const gk = teams.me.findIndex(s => s.role === 'GK'), cb = teams.me.findIndex(s => s.role === 'CB');
  let defMax = 0, attMax = 0, gkOut = 0;
  for (const seed of [2, 4, 9]) {
    const sim = new MatchSim(teams, [{ minute: 20, side: 'me', scorer: 0, assist: gk }, { minute: 50, side: 'me', scorer: 1, assist: cb }, { minute: 75, side: 'opp', scorer: 1, assist: null }], seed);
    for (const k of sim.tl.keys) if (k.holder && k.kind === 'run') assert.notEqual(sim.teams[k.holder.side][k.holder.i].role, 'GK', `thủ môn dắt bóng lúc ${k.t.toFixed(1)}s`);
    assert.equal(sim.tl.events.filter(e => e.kind === 'goal').length, 3);
    const dt = 1 / 30, prev = { me: sim.pos.me.map(p => ({ ...p })), opp: sim.pos.opp.map(p => ({ ...p })) };
    while (!sim.done) {
      sim.step(dt);
      const st = sim.state();
      for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => {
        const role = sim.teams[side][i].role, v = Math.hypot(p.x - prev[side][i].x, p.y - prev[side][i].y) / dt; prev[side][i] = { ...p };
        const busy = (st.holder?.side === side && st.holder.i === i) || (st.receiver?.side === side && st.receiver.i === i);
        if (role === 'GK') { if ((side === 'me' ? p.y : 100 - p.y) < 78) gkOut++; return; }
        if (busy) return;
        if (['CB', 'LB', 'RB'].includes(role)) defMax = Math.max(defMax, v); else attMax = Math.max(attMax, v);
      });
    }
  }
  assert.equal(gkOut, 0, 'thủ môn rời vòng cấm');
  assert.ok(defMax <= 17 && defMax < attMax, `hậu vệ ${defMax.toFixed(1)} / tiền vệ, tiền đạo ${attMax.toFixed(1)}`);
});

test('Phạt góc và đá phạt: có trong trận; dàn quân đúng (vòng cấm đông người, hàng rào 9,15 m); bàn thắng đủ', () => {
  let corners = 0, freekicks = 0, boxOk = 0, boxChecks = 0, wallOk = 0, wallChecks = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const goals = [{ minute: 15, side: 'me' as const, scorer: 0, assist: 2 }, { minute: 40, side: 'opp' as const, scorer: 1, assist: null }, { minute: 70, side: 'me' as const, scorer: 1, assist: 3 }, { minute: 85, side: 'opp' as const, scorer: 0, assist: null }];
    const sim = new MatchSim(teams, goals, seed), tl = sim.tl;
    assert.equal(tl.events.filter(e => e.kind === 'goal').length, 4, `seed ${seed}`);
    corners += tl.events.filter(e => e.kind === 'corner').length; freekicks += tl.events.filter(e => e.kind === 'freekick').length;
    // Cuối đoạn dàn quân: kiểm tra vị trí.
    for (const k of tl.keys) {
      if (k.kind !== 'setpiece') continue;
      const s = ballAt(tl, k.t - .01); if (!s.sp) continue;
      sim.t = 0; sim.step(k.t - .02);
      const att = s.sp.side, def = att === 'me' ? 'opp' : 'me', fy = (p: { x: number; y: number }) => att === 'me' ? p.y : 100 - p.y, fx = (p: { x: number; y: number }) => att === 'me' ? p.x : 100 - p.x;
      const inBox = (side: 'me' | 'opp') => sim.pos[side].filter((p, i) => sim.teams[side][i].role !== 'GK' && fy(p) < 17 && fx(p) > 20 && fx(p) < 80).length;
      if (s.sp.type === 'corner') { boxChecks++; if (inBox(att) >= 4 && inBox(def) >= 5) boxOk++; }
      else if (s.sp.type === 'freekick') {
        wallChecks++;
        const b = { x: fx(s.ball), y: fy(s.ball) };
        const wall = sim.pos[def].filter((p, i) => sim.teams[def][i].role !== 'GK' && Math.abs(Math.hypot((fx(p) - b.x) * .68, (fy(p) - b.y) * 1.05) - 9.15) < 1.5).length;
        if (wall >= 3) wallOk++;
      }
    }
  }
  assert.ok(corners >= 16, `phạt góc ${corners} / 8 trận`);
  assert.ok(freekicks >= 4, `đá phạt trực tiếp ${freekicks} / 8 trận`);
  assert.ok(boxChecks > 0 && boxOk / boxChecks > .8, `dàn quân phạt góc ${boxOk}/${boxChecks}`);
  assert.ok(wallChecks > 0 && wallOk / wallChecks > .8, `hàng rào ${wallOk}/${wallChecks}`);
});

test('GLXH tự đá (Auto): đếm ngược 5 giây rồi đá trận tiếp', async () => {
  const { autoLeft, RANKED_AUTO_DELAY } = await import('../src/ranked.ts');
  assert.equal(RANKED_AUTO_DELAY, 5);
  assert.equal(autoLeft(1_000, 1_000), 5);
  assert.equal(autoLeft(1_000, 1_999), 5);
  assert.equal(autoLeft(1_000, 3_500), 3);
  assert.equal(autoLeft(1_000, 6_000), 0);
  assert.equal(autoLeft(1_000, 60_000), 0, 'không âm');
});

test('GLXH chậm lại: trận diễn lâu hơn mốc máy chủ nhận kết quả (202611150007), nhịp 0,78', async () => {
  const { MATCH_SECONDS, PACE } = await import('../src/ranked-sim.ts');
  const sql = readFileSync('supabase/migrations/202611150007_fco_ranked_slower.sql', 'utf8');
  const min = Number(/interval '(\d+) seconds'/.exec(sql)![1]);
  assert.equal(min, 200);
  assert.ok(MATCH_SECONDS >= min + 5, 'game diễn xong sau khi máy chủ đã nhận được kết quả');
  assert.equal(PACE, .78);
  assert.doesNotMatch(sql, /140 seconds/);
});
test('CSA vàng trong GLXH: 11 hiệu ứng kích hoạt, hồi chiêu 4–6 s mỗi cầu thủ, trận vẫn đúng luật', () => {
  const T = TRAITS;
  // Gán CSA theo vị trí: thủ môn bắt sút xa, tiền đạo 1 chạm / chạy chỗ, cánh băng cắt / ảo thuật, tiền vệ nhạc trưởng / chặn đà / không phổi, hậu vệ tắc bóng / đánh chặn / đeo bám.
  const pick: Record<string, string[]> = {
    GK: [T.GK_LONG_SHOT_SAVER], ST: [T.FIRST_TIME_SHOT, T.LINE_BREAKER], CF: [T.LINE_BREAKER], LW: [T.CROSS_POACHER], RW: [T.MAGICIAN],
    LM: [T.CROSS_POACHER], RM: [T.MAGICIAN], CAM: [T.MAESTRO], CM: [T.MAESTRO, T.IRON_LUNGS], CDM: [T.STOP_ATTACK, T.IRON_LUNGS],
    CB: [T.WILD_TACKLER, T.SUPER_INTERCEPTOR], LB: [T.CHASER], RB: [T.IRON_LUNGS], LWB: [T.CHASER], RWB: [T.IRON_LUNGS],
  };
  const gold = (s: ReturnType<typeof side>, off: number) => { const used: Record<string, number> = {}; return s.map(p => { const list = pick[p.role] ?? []; const k = (used[p.role] = (used[p.role] ?? -1) + 1) + off; return { ...p, trait: list[k % Math.max(1, list.length)] }; }); };
  const tt: Teams = { me: gold(side('4-2-3-1'), 1), opp: gold(side('4-3-3'), 0) };
  const goals = [{ minute: 12, side: 'me' as const, scorer: 0, assist: 1 }, { minute: 50, side: 'opp' as const, scorer: 1, assist: null }, { minute: 83, side: 'me' as const, scorer: 2, assist: 3 }];
  const seen = new Set<string>();
  for (const seed of [2, 5, 13, 21, 34]) {
    const tl = buildTimeline(tt, goals, seed);
    assert.deepEqual(tl.events.filter(e => e.kind === 'goal').map(e => [e.minute, e.side, e.scorer]), goals.map(g => [g.minute, g.side, g.scorer]));
    assert.ok(tl.traits.length > 10, `seed ${seed}: chỉ ${tl.traits.length} lần kích hoạt`);
    const last: Record<string, number> = {};
    for (const e of tl.traits) {
      assert.equal(tt[e.side][e.i].trait, e.trait, 'chỉ cầu thủ có CSA đó mới kích hoạt');
      const k = e.side + e.i;
      if (k in last) assert.ok(e.t - last[k] >= 4 - 1e-9, `hồi chiêu ${(e.t - last[k]).toFixed(2)} s`);
      last[k] = e.t; seen.add(e.trait);
    }
    assert.deepEqual(tl.traits.map(e => e.t), [...tl.traits.map(e => e.t)].sort((a, b) => a - b));
    // Vẫn chỉ sút trong khu vực dứt điểm; người nhận / người giành có mặt khi bóng tới.
    const per = (tt.me.length + tt.opp.length + 1) * 2;
    const posAt = (t: number, s: 'me' | 'opp', i: number) => { const o = Math.min(tl.count - 1, Math.round(t / .05)) * per + (s === 'me' ? 0 : tt.me.length * 2) + i * 2; return { x: tl.frames[o], y: tl.frames[o + 1] }; };
    for (let j = 2; j < tl.keys.length; j++) {
      const a = tl.keys[j - 1], k = tl.keys[j];
      if ((k.kind === 'save' || k.kind === 'miss') && !a.holder) {
        const ev = tl.events.find(e => Math.abs(e.t - k.t) < 1e-9);
        assert.ok((ev?.side === 'opp' ? 100 - a.y : a.y) < 32, 'sút từ quá xa');
      }
      if (!k.holder || (k.kind !== 'win' && k.kind !== 'pass')) continue;
      const p = posAt(k.t, k.holder.side, k.holder.i);
      assert.ok(Math.hypot(p.x - k.x, p.y - k.y) < 5, `${k.kind}: người nhận còn xa bóng`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.values(T).sort(), `thiếu: ${Object.values(T).filter(x => !seen.has(x)).join(',')}`);
  // Mượt: bóng không nhảy cóc, cầu thủ trong sân.
  const sim = new MatchSim(tt, goals, 8), dt = 1 / 60;
  let ball = ballAt(sim.tl, 0).ball, maxBall = 0;
  while (!sim.done) {
    sim.step(dt);
    const b = sim.state().ball; maxBall = Math.max(maxBall, Math.hypot(b.x - ball.x, b.y - ball.y)); ball = b;
    for (const p of [...sim.pos.me, ...sim.pos.opp]) assert.ok(p.x >= -3 && p.x <= 103 && p.y >= -3 && p.y <= 103);
  }
  assert.ok(maxBall < 4, `bóng nhảy ${maxBall.toFixed(2)}`);
  // Đội không có CSA: không có lần kích hoạt nào.
  assert.equal(buildTimeline(teams, goals, 2).traits.length, 0);
});
test('Đồng hồ GLXH không đứng / lặp khi bàn thắng dồn sát nhau (giãn phút ghi bàn, giữ đúng hiệp)', () => {
  const g = (minute: number, side: 'me' | 'opp' = 'me') => ({ minute, side, scorer: 0, assist: null });
  // Trùng phút, sát giờ nghỉ, phút 1, phút 90: giãn ≥ GOAL_GAP phút, hiệp 1 trong 4–42, hiệp 2 trong 49–87, giữ thứ tự / đội.
  const sp = spreadGoals([g(44), g(1, 'opp'), g(44), g(45, 'opp'), g(46), g(90, 'opp'), g(90)]);
  assert.deepEqual(sp.map(x => x.side), ['opp', 'me', 'me', 'opp', 'me', 'opp', 'me']);
  assert.ok(sp.slice(0, 4).every(x => x.minute >= 4 && x.minute <= 42) && sp.slice(4).every(x => x.minute >= 49 && x.minute <= 87), sp.map(x => x.minute).join(','));
  for (let k = 1; k < sp.length; k++) assert.ok(sp[k].minute - sp[k - 1].minute >= (k === 4 ? 1 : GOAL_GAP), sp.map(x => x.minute).join(','));
  // Hiệp quá đông bàn: khoảng cách nhỏ lại nhưng không trùng phút, vẫn trong hiệp.
  const crowded = spreadGoals(Array.from({ length: 12 }, () => g(30)));
  assert.equal(new Set(crowded.map(x => x.minute)).size, 12);
  assert.ok(crowded.every(x => x.minute >= 4 && x.minute <= 42));
  assert.deepEqual(spreadGoals([g(20), g(70)]).map(x => x.minute), [20, 70], 'bàn cách xa: giữ nguyên phút máy chủ');
  // Đồng hồ: không lùi, không đứng một phút quá 7 giây, hết trận đúng 90'.
  for (const [seed, goals] of [[3, [g(44), g(44), g(44), g(45), g(46)]], [8, [g(1), g(1), g(2)]], [21, [g(89), g(90), g(90), g(90)]]] as const) {
    const tl = buildTimeline(teams, [...goals], seed);
    let prev = 0, since = 0, worst = 0;
    for (let t = 0; t <= tl.duration; t += .1) {
      const m = minuteAt(tl, t);
      assert.ok(m >= prev, `đồng hồ lùi ${prev} → ${m}`);
      since = m === prev ? since + .1 : 0; worst = Math.max(worst, since); prev = m;
    }
    assert.ok(worst < 7, `seed ${seed}: đồng hồ đứng ${worst.toFixed(1)} giây`);
    assert.equal(minuteAt(tl, tl.duration), 90);
  }
});
test('GLXH màn chờ vào trận: trận mới xem từ đầu; mở lại trận dở thì trừ thời gian màn chờ (máy chủ tính giờ từ lúc bấm Tìm trận)', async () => {
  const { RANKED_INTRO_SECONDS, RANKED_INTRO_PREVIEW, rankedPlayed } = await import('../src/ranked.ts');
  assert.equal(rankedPlayed(0), 0);
  assert.equal(rankedPlayed(undefined), 0);
  assert.equal(rankedPlayed(RANKED_INTRO_SECONDS - 1), 0, 'mở lại trong lúc màn chờ: xem từ đầu');
  assert.ok(Math.abs(rankedPlayed(RANKED_INTRO_SECONDS + 60) - 60) < 1e-9);
  assert.equal(RANKED_INTRO_PREVIEW, 5, 'sơ đồ hai đội ~5 giây');
  // Trận diễn xong (sau màn chờ) vẫn muộn hơn mốc máy chủ nhận kết quả (202611150007: 200 giây).
  const tl = buildTimeline(teams, [], 4);
  assert.ok(RANKED_INTRO_SECONDS + tl.duration > 200 && tl.duration > 200);
});
test('Giao bóng: đầu trận, đầu hiệp 2, sau bàn thắng — hai đội ở phần sân nhà, đối phương ngoài vòng tròn 9,15 m, có còi rồi mới chuyền', () => {
  const goals = [{ minute: 30, side: 'me' as const, scorer: 0, assist: 1 }, { minute: 70, side: 'opp' as const, scorer: 1, assist: null }];
  for (const seed of [2, 6, 11]) {
    const tl = buildTimeline(teams, goals, seed), sim = new MatchSim(teams, goals, seed);
    // Khung đầu tiên: đã đứng sẵn vị trí giao bóng (không chạy về), bóng ở chấm giữa sân.
    const ownHalf = (side: 'me' | 'opp', p: { y: number }) => side === 'me' ? p.y >= 49 : p.y <= 51;
    for (const side of ['me', 'opp'] as const) assert.ok(sim.pos[side].every(p => ownHalf(side, p)), `đầu trận ${side} chưa ở phần sân nhà`);
    const kicks = tl.keys.map((k, j) => ({ k, j })).filter(({ k, j }) => k.kind === 'setpiece' && tl.keys[j - 1]?.sp?.type === 'kickoff');
    assert.equal(kicks.length, 2 + goals.length, `seed ${seed}: số lần giao bóng`);
    for (const { k, j } of kicks) {
      sim.t = 0; sim.step(k.t - .02);
      const sp = tl.keys[j - 1].sp!, def = sp.side === 'me' ? 'opp' : 'me';
      assert.deepEqual([k.x, k.y], [50, 50], 'bóng ở chấm giữa sân');
      for (const side of ['me', 'opp'] as const) sim.pos[side].forEach((p, i) => assert.ok(ownHalf(side, p) || (side === sp.side && i === sp.taker.i), `${side}${i} chưa về phần sân nhà lúc giao bóng`));
      const inCircle = sim.pos[def].filter(p => Math.hypot((p.x - 50) * .68, (p.y - 50) * 1.05) < 8.6).length;
      assert.equal(inCircle, 0, 'đội không giao bóng phải đứng ngoài vòng tròn giữa sân');
      const taker = sim.pos[sp.side][sp.taker.i];
      assert.ok(Math.hypot(taker.x - 50, taker.y - 50) < 2.5, 'người giao bóng đứng ở bóng');
      // Sau còi: chuyền cho đồng đội.
      const nx = tl.keys.slice(j + 1).find(x => x.holder);
      assert.equal(nx?.holder?.side, sp.side, 'giao bóng chuyền cho đồng đội');
    }
  }
});