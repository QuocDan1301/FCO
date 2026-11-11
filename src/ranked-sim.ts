// Diễn lại trận xếp hạng (không quyết định kết quả): từ kịch bản máy chủ (tỉ số, phút ghi bàn, người ghi / kiến tạo, seed) dựng
// diễn biến bóng (chuyền, dắt, sút, cướp bóng) CÙNG LÚC với chuyển động 22 cầu thủ, để mọi pha bóng dựa trên vị trí thật trên sân:
//   · cướp bóng chỉ khi cầu thủ đối phương đã áp sát người cầm bóng; cắt bóng khi đứng chắn đường chuyền;
//   · chuyền cho đồng đội trống, đường chuyền thoáng, ưu tiên lên phía trước, chuyền đón đầu theo hướng người nhận đang chạy;
//   · chỉ sút khi đã vào khu vực trước khung thành; pha ghi bàn có người chạy chỗ vào vòng cấm.
// Vị trí cầu thủ được ghi lại theo bước 0,05 giây; MatchSim chỉ nội suy để vẽ. Cùng seed → cùng diễn biến. Không dùng DOM để test được.
//
// Toạ độ sân: x 0 → 100 trái → phải; y 0 = khung thành đối thủ (trên), 100 = khung thành nhà (dưới). Đội mình đá lên.
// Toạ độ sơ đồ (squad.ts FORMATIONS): fx trái → phải, fy 0 = phía tấn công, 100 = khung thành nhà.
import type { RankedGoal } from './ranked';

export type Side = 'me' | 'opp';
export type SimSlot = { role: string; fx: number; fy: number; name?: string };
export type PlayerRef = { side: Side; i: number };
export type Point = { x: number; y: number };
// Gợi ý chạy chỗ: trong đoạn bắt đầu ở khoá này, cầu thủ (side, i) băng tới điểm (x, y).
type Run = PlayerRef & Point;
// foul: đoạn dừng bóng sau pha phạm lỗi (trọng tài chạy tới chỗ phạm lỗi).
type Key = Point & { t: number; holder: PlayerRef | null; kind: 'hold' | 'run' | 'pass' | 'shot' | 'goal' | 'save' | 'miss' | 'reset' | 'win' | 'foul'; run?: Run };
// foul: trọng tài thổi phạt (side = đội phạm lỗi); offside: việt vị (side = đội tấn công bị bắt việt vị).
export type SimEvent = { t: number; minute: number; kind: 'goal' | 'save' | 'miss' | 'half' | 'end' | 'foul' | 'offside'; side?: Side; scorer?: number; assist?: number | null };

export const MATCH_SECONDS = 150; // 90 phút diễn trong khoảng 2,5 phút
const STEP = .05; // bước mô phỏng cầu thủ (giây)
const SIDES: readonly Side[] = ['me', 'opp'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) => p1 + .5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
export function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const isGK = (role: string) => role === 'GK';
const other = (s: Side): Side => s === 'me' ? 'opp' : 'me';
// Đổi điểm giữa toạ độ sân và khung nhìn của một đội (đội đó đá lên trên).
const toFrame = (side: Side, p: Point): Point => side === 'me' ? p : { x: 100 - p.x, y: 100 - p.y };
const fromFrame = toFrame;

// Vị trí cầu thủ nên đứng khi bóng ở `ball` và `possession` đang cầm bóng.
export function teamTarget(side: Side, slot: SimSlot, ball: Point, possession: Side): Point {
  const b = toFrame(side, ball);
  if (isGK(slot.role)) return fromFrame(side, { x: 50 + (b.x - 50) * .18, y: 95.5 });
  const def = 55 + slot.fy * .4, att = 12 + slot.fy * .72, attacking = possession === side;
  const progress = clamp((100 - b.y) / 100, 0, 1);
  // Phòng ngự: bóng càng xa khung thành nhà thì hàng thủ càng dâng cao (đội hình gọn, có bẫy việt vị); bóng tới gần thì lùi về.
  const a = attacking ? .3 + .7 * progress : .12 + .5 * progress;
  let x = slot.fx + (b.x - 50) * .3;
  if (!attacking) x = 50 + (x - 50) * .8;
  return fromFrame(side, { x: clamp(x, 3, 97), y: clamp(lerp(def, att, a), 4, 97) });
}

export type Teams = { me: SimSlot[]; opp: SimSlot[] };
// frames / faces: vị trí và hướng của 22 cầu thủ + trọng tài mỗi bước STEP (me trước, opp sau, trọng tài cuối; mỗi người 2 số x, y).
export type Timeline = { keys: Key[]; events: SimEvent[]; anchors: [number, number][]; duration: number; frames: Float32Array; faces: Float32Array; count: number };
type BallState = { ball: Point; holder: PlayerRef | null; receiver: PlayerRef | null; dest: Point; kind: Key['kind']; run: Run | null };

function ballOn(keys: Key[], t: number): BallState {
  let lo = 0, hi = keys.length - 1;
  if (t <= keys[0].t) return { ball: keys[0], holder: keys[0].holder, receiver: null, dest: keys[0], kind: keys[0].kind, run: null };
  if (t >= keys[hi].t) return { ball: keys[hi], holder: keys[hi].holder, receiver: null, dest: keys[hi], kind: keys[hi].kind, run: null };
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid].t <= t) lo = mid; else hi = mid; }
  const a = keys[lo], b = keys[hi], p = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  // Bóng bay chậm dần nhưng chưa dừng hẳn khi tới chân người nhận (nối tiếp bằng chạm bóng đầu).
  const flying = !a.holder, e = flying ? p * (1.45 - .45 * p) : p;
  return { ball: { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) }, holder: a.holder, receiver: flying ? b.holder : null, dest: b, kind: b.kind, run: a.run ?? null };
}
// Bóng và người đang giữ / người nhận tại thời điểm t.
export function ballAt(tl: Timeline, t: number) { return ballOn(tl.keys, t); }

// Chuyển động cầu thủ: lái theo vận tốc (tăng / giảm tốc dần, không giật).
class Engine {
  readonly pos: Record<Side, Point[]>;
  readonly vel: Record<Side, Point[]>;
  readonly face: Record<Side, Point[]>;
  private readonly phase: Record<Side, number[]>;
  // Trọng tài: chạy theo pha bóng theo đường chéo, cách bóng vừa phải; phạm lỗi thì chạy tới chỗ phạm lỗi.
  readonly ref: Point = { x: 62, y: 56 };
  readonly refVel: Point = { x: 0, y: 0 };
  readonly refFace: Point = { x: 0, y: -1 };
  constructor(readonly teams: Teams, seed: number) {
    const start = { x: 50, y: 50 };
    this.pos = { me: teams.me.map(s => teamTarget('me', s, start, 'me')), opp: teams.opp.map(s => teamTarget('opp', s, start, 'me')) };
    this.vel = { me: teams.me.map(() => ({ x: 0, y: 0 })), opp: teams.opp.map(() => ({ x: 0, y: 0 })) };
    this.face = { me: teams.me.map(() => ({ x: 0, y: -1 })), opp: teams.opp.map(() => ({ x: 0, y: 1 })) };
    const r = rng(seed ^ 0x9e3779b9);
    this.phase = { me: teams.me.map(() => r() * Math.PI * 2), opp: teams.opp.map(() => r() * Math.PI * 2) };
  }
  advance(t: number, dt: number, s: BallState) {
    const possession: Side = (s.holder ?? s.receiver ?? { side: 'me' as Side }).side;
    const presser = (side: Side) => {
      let best = -1, bd = Infinity;
      this.pos[side].forEach((p, i) => { if (isGK(this.teams[side][i].role)) return; const d = dist(p, s.ball); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    // Thủ môn đang cầm bóng hoặc bóng đang về tay thủ môn (cản phá, phát bóng lên, chuyền về): đối phương không tranh, lùi ra xa.
    const keeperHas = (side: Side) => { const h = s.holder ?? s.receiver; return !!h && h.side === side && isGK(this.teams[side][h.i].role); };
    // Việt vị: cầu thủ đội tấn công đứng trước vạch = min(giữa sân, bóng, cầu thủ đối phương thứ hai từ khung thành) là việt vị.
    // Người không cầm / không đang nhận bóng của đội tấn công giữ ngang hàng đó (chờ chọc khe rồi mới băng xuống).
    const lineOf = (side: Side) => { const ys = this.pos[other(side)].map(p => toFrame(side, p).y).sort((a, b) => a - b); return Math.min(50, toFrame(side, s.ball).y, ys[1] ?? 50); };
    const line = { me: lineOf('me'), opp: lineOf('opp') };
    const onsideTarget = (side: Side, tg: Point) => { const f = toFrame(side, tg); return f.y >= line[side] + 1 ? tg : fromFrame(side, { x: f.x, y: line[side] + 1 }); };
    for (const side of SIDES) {
      const keeperBall = keeperHas(other(side));
      const press = side !== possession && !keeperBall ? presser(side) : -1;
      this.teams[side].forEach((slot, i) => {
        const p = this.pos[side][i];
        const isHolder = s.holder?.side === side && s.holder.i === i, isReceiver = s.receiver?.side === side && s.receiver.i === i;
        const isRunner = s.run?.side === side && s.run.i === i;
        let target: Point, speed = 22, gain = 3.2, accel = 6;
        if (isHolder) {
          // Bóng đã ở chân: bám sát bóng; bóng còn cách xa (vừa nhận / vừa giành) thì chạy nước rút tới bóng.
          const far = dist(p, s.ball) > 3;
          target = s.ball; speed = far ? 30 : 70; gain = far ? 5 : 14; accel = far ? 9 : 30;
        }
        else if (isReceiver) { target = { x: s.dest.x + (s.ball.x - s.dest.x) * .18, y: s.dest.y + (s.ball.y - s.dest.y) * .18 }; speed = 30; gain = 4; accel = 8; }
        else if (isRunner) { target = side === possession ? onsideTarget(side, s.run!) : s.run!; speed = 30; gain = 4; accel = 8; }
        else if (i === press) { const d = dist(p, s.ball) || 1; target = d > 2 ? s.ball : p; speed = 24; gain = 3.2; accel = 7; }
        else {
          // Không cầm bóng: về vị trí đội hình + chạy chỗ. Đội có bóng: tiền đạo / tiền vệ băng lên, dạt ra theo nhịp; đội không bóng:
          // nhích theo người đối phương gần nhất (kèm người). Ai cũng nhúc nhích nhẹ quanh vị trí → không đứng đơ.
          const base = teamTarget(side, slot, s.ball, possession), ph = this.phase[side][i], gk = isGK(slot.role);
          const fwd = side === 'me' ? -1 : 1, wave = Math.sin(t * .55 + ph), sway = Math.cos(t * .4 + ph * 1.7);
          let tx = base.x + sway * (gk ? 1 : 3.5), ty = base.y + Math.sin(t * .33 + ph * .6) * (gk ? .5 : 2.5);
          if (!gk && side === possession && slot.fy < 60) { ty += fwd * (2.5 + 3.5 * Math.max(0, wave)); tx += wave * 4 * (slot.fx < 50 ? -1 : 1); }
          if (!gk && side !== possession) {
            let near: Point | null = null, nd = Infinity;
            for (const o of this.pos[other(side)]) { const d = dist(o, base); if (d < nd) { nd = d; near = o; } }
            if (near && nd < 18) { tx += (near.x - tx) * .35; ty += (near.y - ty) * .35; }
          }
          if (keeperBall && !gk) { const d = Math.hypot(tx - s.ball.x, ty - s.ball.y) || 1; if (d < 14) { tx = s.ball.x + (tx - s.ball.x) / d * 14; ty = s.ball.y + (ty - s.ball.y) / d * 14; } }
          target = { x: clamp(tx, 2, 98), y: clamp(ty, 2, 98) };
          // Tiền đạo đội tấn công đứng sát vai hậu vệ cuối (ngang hàng việt vị); thỉnh thoảng băng lên sớm một nhịp → đứng việt vị.
          const early = slot.fy < 30 && wave > .7;
          if (!gk && side === possession && slot.fy < 30) {
            const f = toFrame(side, target), want = early ? line[side] - 2.5 : line[side] + 1.5;
            if (f.y > want) target = fromFrame(side, { x: f.x, y: want });
          }
          if (!gk && side === possession && !early) target = onsideTarget(side, target);
        }
        steer(p, this.vel[side][i], this.face[side][i], target, speed, gain, accel, dt, s.ball);
      });
    }
    // Trọng tài: đứng chéo so với bóng (bóng cánh trái thì đứng lệch phải; ngược lại), luôn lệch vào phía giữa sân (không đứng ở vạch cuối cạnh thủ môn), lắc nhẹ; phạm lỗi → tới sát chỗ phạm lỗi.
    const b = s.ball, lean = b.x < 50 ? 1 : -1, foul = s.kind === 'foul';
    const rt = foul ? { x: b.x + lean * 4, y: b.y + 3 } : { x: b.x + lean * 13 + Math.sin(t * .3) * 1.5, y: b.y + clamp((50 - b.y) * .3, -10, 10) + lean * 3 + Math.cos(t * .25) * 1.5 };
    steer(this.ref, this.refVel, this.refFace, { x: clamp(rt.x, 4, 96), y: clamp(rt.y, 4, 96) }, foul ? 26 : 20, 2.5, 5, dt, b);
  }
}
// Lái theo vận tốc: muốn chạy về đích với tốc độ tỉ lệ khoảng cách (chậm dần khi tới nơi), vận tốc đổi dần theo gia tốc → không giật.
// Hướng: theo hướng chạy khi đang chạy, đứng yên thì nhìn về phía bóng; xoay dần cho mượt.
function steer(p: Point, v: Point, f: Point, target: Point, speed: number, gain: number, accel: number, dt: number, ball: Point) {
  let wx = (target.x - p.x) * gain, wy = (target.y - p.y) * gain;
  const w = Math.hypot(wx, wy);
  if (w > speed) { wx = wx / w * speed; wy = wy / w * speed; }
  const k = Math.min(1, accel * dt);
  v.x += (wx - v.x) * k; v.y += (wy - v.y) * k;
  p.x += v.x * dt; p.y += v.y * dt;
  const sp = Math.hypot(v.x, v.y);
  let hx = v.x, hy = v.y;
  if (sp < 2.5) { hx = ball.x - p.x; hy = ball.y - p.y; }
  const hl = Math.hypot(hx, hy);
  if (hl > .01) {
    const turn = Math.min(1, dt * 8);
    f.x += (hx / hl - f.x) * turn; f.y += (hy / hl - f.y) * turn;
    const fl = Math.hypot(f.x, f.y) || 1; f.x /= fl; f.y /= fl;
  }
}

// Dựng diễn biến trận. goals đã sắp theo phút.
export function buildTimeline(teams: Teams, goals: RankedGoal[], seed: number, duration = MATCH_SECONDS): Timeline {
  const r = rng(seed);
  const keys: Key[] = [], events: SimEvent[] = [], anchors: [number, number][] = [[0, 0]];
  let t = 0, ball: Point = { x: 50, y: 50 }, holder: PlayerRef = { side: 'me', i: 0 };
  const slot = (p: PlayerRef) => teams[p.side][p.i];
  const all = (side: Side) => teams[side].map((_, i) => ({ side, i }));
  const outfield = (side: Side) => all(side).filter(p => !isGK(slot(p).role));
  const gkOf = (side: Side) => { const i = teams[side].findIndex(s => isGK(s.role)); return { side, i: i < 0 ? teams[side].length - 1 : i }; };
  const frontOf = (side: Side) => outfield(side).sort((a, b) => slot(a).fy - slot(b).fy);

  // ---- Mô phỏng cầu thủ chạy song song với diễn biến bóng, ghi lại mỗi bước. ----
  const eng = new Engine(teams, seed);
  const per = (teams.me.length + teams.opp.length + 1) * 2;
  let frames = new Float32Array(per * 3200), faces = new Float32Array(per * 3200), count = 0;
  const record = () => {
    if ((count + 1) * per > frames.length) {
      const grow = (a: Float32Array) => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
      frames = grow(frames); faces = grow(faces);
    }
    let o = count * per;
    for (const side of SIDES) for (let i = 0; i < teams[side].length; i++) {
      frames[o] = eng.pos[side][i].x; frames[o + 1] = eng.pos[side][i].y; faces[o] = eng.face[side][i].x; faces[o + 1] = eng.face[side][i].y; o += 2;
    }
    frames[o] = eng.ref.x; frames[o + 1] = eng.ref.y; faces[o] = eng.refFace.x; faces[o + 1] = eng.refFace.y;
    count++;
  };
  record();
  // Cho cầu thủ chạy tới thời điểm t (diễn biến bóng tới t đã biết).
  // Mỗi khung chia 4 bước nhỏ để tăng / giảm tốc mượt (nhất là thủ môn bay người, người đón bóng).
  const SUB = 4;
  const sync = () => { while (count * STEP <= t + 1e-9) { for (let j = SUB - 1; j >= 0; j--) { const at = count * STEP - j * STEP / SUB; eng.advance(at, STEP / SUB, ballOn(keys, at)); } record(); } };
  const P = (p: PlayerRef) => eng.pos[p.side][p.i];

  const push = (kind: Key['kind'], h: PlayerRef | null) => { keys.push({ t, x: ball.x, y: ball.y, holder: h, kind }); sync(); };
  // Bắt đầu một đoạn: ai cầm bóng trong đoạn từ bây giờ (null = bóng đang bay). Đổi người thì thêm khoá mới cùng thời điểm
  // (không sửa khoá cũ để đoạn trước vẫn đúng người nhận).
  const begin = (h: PlayerRef | null, kind: Key['kind']) => {
    const last = keys[keys.length - 1];
    if (last && last.t === t && last.holder?.side === h?.side && last.holder?.i === h?.i) last.kind = kind; else push(kind, h);
  };
  const move = (to: Point, dur: number, endHolder: PlayerRef | null, kind: Key['kind']) => { t += dur; ball = { x: to.x, y: to.y }; if (endHolder) holder = endHolder; push(kind, endHolder); };

  // Cầu thủ gần điểm `at` nhất (theo vị trí thật) của một đội.
  const nearestTo = (side: Side, at: Point) => {
    let best = outfield(side)[0], bd = Infinity;
    for (const p of outfield(side)) { const d = dist(P(p), at); if (d < bd) { bd = d; best = p; } }
    return { p: best, d: bd };
  };
  // Cầu thủ đội `def` chắn đường bóng from → to gần nhất (bỏ qua 3 đơn vị đầu: người chuyền vừa đá).
  const lane = (from: Point, to: Point, def: Side) => {
    const dx = to.x - from.x, dy = to.y - from.y, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
    let best: { d: number; p: PlayerRef | null; at: Point } = { d: Infinity, p: null, at: to };
    for (const p of all(def)) {
      const q = P(p), u = clamp(((q.x - from.x) * dx + (q.y - from.y) * dy) / L2, 0, 1);
      if (u * L < 3) continue;
      const at = { x: from.x + dx * u, y: from.y + dy * u }, d = dist(q, at);
      if (d < best.d) best = { d, p, at };
    }
    return best;
  };

  // Không việt vị lúc bóng được chuyền: ở phần sân nhà, hoặc không đứng trước bóng, hoặc không vượt cầu thủ đối phương thứ hai từ khung thành.
  const onside = (p: PlayerRef) => {
    const ys = all(other(p.side)).map(o => toFrame(p.side, P(o)).y).sort((a, b) => a - b);
    return toFrame(p.side, P(p)).y >= Math.min(50, toFrame(p.side, ball).y, ys[1] ?? 50) - .3;
  };
  const kickoff = (side: Side) => {
    ball = { x: 50, y: 50 }; holder = frontOf(side)[0] ?? { side, i: 0 };
    push('reset', holder); t += .8; push('hold', holder);
  };
  // Chạm bóng đầu sau khi nhận / giành bóng: người nhận còn xa thì bóng nằm chờ anh ta chạy tới, rồi đẩy bóng lên phía trước.
  const touch = (dur: number) => {
    const gap = dist(P(holder), ball);
    if (gap > 2.5) { t += Math.min(1.2, gap / 24); push('hold', holder); }
    const f = toFrame(holder.side, ball);
    const end = fromFrame(holder.side, { x: clamp(f.x + (r() - .5) * 4, 5, 95), y: clamp(f.y - (1.8 + r() * 2.2), 6, 94) });
    move(end, dur, holder, 'run');
  };
  // Dắt bóng: lên phía trước, đối phương áp sát thì lách sang bên; run = đồng đội chạy chỗ trong lúc dắt.
  const carry = (len: number, toward?: Point, run?: Run) => {
    const f = toFrame(holder.side, ball);
    let aim = toward ? toFrame(holder.side, toward) : { x: clamp(f.x + (r() - .5) * 14, 8, 92), y: f.y - len };
    if (!toward) {
      const n = nearestTo(other(holder.side), ball);
      if (n.d < 9) { const q = toFrame(holder.side, P(n.p)); aim = { x: clamp(aim.x + (f.x >= q.x ? 9 : -9), 6, 94), y: aim.y }; }
    }
    const dx = aim.x - f.x, dy = aim.y - f.y, d = Math.hypot(dx, dy) || 1, step = Math.min(len, d);
    const end = fromFrame(holder.side, { x: clamp(f.x + dx / d * step, 5, 95), y: clamp(f.y + dy / d * step, 6, 94) });
    begin(holder, 'run');
    if (run) keys[keys.length - 1].run = run;
    move(end, Math.max(.5, step / 13), holder, 'run');
  };
  // Giành bóng: người áp sát chọc bóng, bóng bật ra giữa hai người rồi về chân người giành.
  const tackle = (by: PlayerRef) => {
    const q = P(by), at = { x: clamp((ball.x + q.x) / 2 + (r() - .5) * 2, 4, 96), y: clamp((ball.y + q.y) / 2, 5, 95) };
    begin(null, 'win');
    move(at, .25, by, 'win');
    touch(.3);
  };
  // Phạm lỗi: trọng tài thổi phạt, bóng dừng một lúc rồi đội bị phạm lỗi đá tiếp (giữ bóng).
  const foul = (by: PlayerRef) => {
    events.push({ t, minute: -1, kind: 'foul', side: by.side });
    t += 1.6; push('foul', holder);
    t += .4; push('hold', holder);
  };
  // Đội `side` đuổi theo người cầm bóng tới khi áp sát rồi giành bóng.
  const chaseWin = (side: Side) => {
    for (let k = 0; k < 10 && holder.side !== side; k++) {
      if (isGK(slot(holder).role)) { play(); continue; } // không tranh bóng trong tay thủ môn: chờ phát bóng
      const n = nearestTo(side, ball); if (n.d < 3.2) return tackle(n.p);
      carry(3 + r() * 3);
    }
    if (holder.side !== side) tackle(nearestTo(side, ball).p);
  };
  // Bóng tới chân đồng đội đang việt vị (tính lúc bóng được chuyền đi): trọng tài thổi việt vị khi người đó nhận bóng, đội kia đá phạt tại chỗ.
  const offsidePass = (to: PlayerRef, end: Point) => {
    begin(null, 'pass');
    move(end, .25 + dist(ball, end) / 52, to, 'hold');
    events.push({ t, minute: -1, kind: 'offside', side: to.side });
    t += 1.4; push('foul', to);
    holder = nearestTo(other(to.side), ball).p;
    t += .2; push('hold', holder);
    touch(.3);
  };
  // Chuyền: đón đầu theo hướng người nhận đang chạy. Không an toàn (safe = false): đối phương đứng chắn đường chuyền có thể cắt;
  // chuyền dài có thể hỏng, bóng rơi vào người gần điểm rơi nhất (đồng đội hoặc đối phương).
  const passTo = (to: PlayerRef, dest?: Point, safe = false) => {
    let end = dest;
    if (!end) {
      const q = P(to), v = eng.vel[to.side][to.i], fl = .25 + dist(ball, q) / 52;
      end = { x: clamp(q.x + v.x * fl * .6, 4, 96), y: clamp(q.y + v.y * fl * .6, 5, 95) };
    }
    if (!safe) {
      const block = lane(ball, end, other(holder.side));
      if (block.p && block.d < 2.2 && r() < .65) {
        begin(null, 'pass');
        move(block.at, .2 + dist(ball, block.at) / 52, block.p, 'win');
        return touch(.3);
      }
      if (dist(ball, end) > 36 && r() < .2) {
        const land = { x: clamp(end.x + (r() - .5) * 14, 4, 96), y: clamp(end.y + (r() - .5) * 10, 5, 95) };
        const a = nearestTo(holder.side, land), b = nearestTo(other(holder.side), land), w = a.d <= b.d ? a.p : b.p;
        if (w.side === holder.side && !onside(w)) return offsidePass(w, land);
        begin(null, 'pass');
        move(land, .25 + dist(ball, land) / 52, w, w.side === holder.side ? 'pass' : 'win');
        return touch(.3);
      }
    }
    // Chuyền cho người đang việt vị: trọng tài thổi việt vị khi người đó nhận bóng, đội kia đá phạt tại chỗ.
    if (!safe && !onside(to)) return offsidePass(to, end);
    begin(null, 'pass');
    move(end, .25 + dist(ball, end) / 52, to, 'pass');
    touch(.3 + r() * .3);
  };
  const goalMouth = (side: Side, inside: boolean): Point => {
    const x = inside ? 44 + r() * 12 : (r() < .5 ? 34 + r() * 7 : 59 + r() * 7);
    return fromFrame(side, { x, y: inside ? -2.5 : -4 });
  };
  // Chọn đường chuyền như cầu thủ thật: chấm điểm từng đồng đội theo vị trí thật rồi gần như luôn chọn phương án tốt nhất.
  //   + đường chuyền thoáng (không ai đứng chắn), người nhận trống, tiến lên phía trước, đưa bóng vào khu vực dứt điểm;
  //   − cự ly quá ngắn / quá dài (lý tưởng ~18), chuyền về thủ môn; bị áp sát thì ưu tiên an toàn hơn tiến lên.
  const pickPass = () => {
    const side = holder.side, f = toFrame(side, ball), keeper = isGK(slot(holder).role);
    const pressure = nearestTo(other(side), ball).d;
    const scored = all(side).filter(p => p.i !== holder.i).map(p => {
      const q = P(p), g = toFrame(side, q), d = dist(q, ball), prog = f.y - g.y;
      let open = Infinity; for (const o of all(other(side))) open = Math.min(open, dist(P(o), q));
      const ln = lane(ball, q, other(side)).d;
      let s = clamp(prog, -30, 40) * (pressure < 5 ? .035 : .075) + clamp(open, 0, 14) * .13 + clamp(ln, 0, 8) * .22 - Math.abs(d - 18) * .035;
      if (g.y < 31 && Math.abs(g.x - 50) < 28) s += 1.1;
      if (ln < 2.2) s -= 2.5;
      if (!onside(p)) s -= .9; // thường tránh chuyền cho người đang việt vị, đôi khi vẫn chọc khe (bị thổi)
      if (d < 5) s -= 3;
      if (d > 55) s -= 2;
      if (isGK(slot(p).role)) s -= pressure < 4 && f.y > 75 ? .5 : 4;
      if (keeper && g.y > 60) s += .8; // thủ môn phát bóng: ưu tiên hậu vệ / tiền vệ lùi đón bóng
      return { p, score: s };
    });
    // Chọn theo softmax nhiệt độ thấp: phương án tốt nhất được chọn phần lớn thời gian, đôi khi phương án gần tốt nhất.
    const top = Math.max(...scored.map(o => o.score)), weights = scored.map(o => Math.exp((o.score - top) / .3));
    let x = r() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < scored.length; k++) { if ((x -= weights[k]) < 0) return scored[k]; }
    return scored[0];
  };
  // Phía trước người cầm bóng còn trống (không đối phương trong khoảng 9 đơn vị phía trước).
  const clearAhead = () => {
    const side = holder.side, f = toFrame(side, ball);
    return all(other(side)).every(o => { const q = toFrame(side, P(o)); return !(q.y < f.y && q.y > f.y - 9 && Math.abs(q.x - f.x) < 7); });
  };
  const shoot = () => {
    const side = holder.side;
    begin(null, 'shot');
    if (r() < .5) {
      const keeper = gkOf(other(side)), at = fromFrame(side, { x: 44 + r() * 12, y: 3 });
      move(at, .35, keeper, 'save');
      events.push({ t, minute: -1, kind: 'save', side });
      t += .8; push('hold', holder);
    } else {
      move(goalMouth(side, false), .4, null, 'miss');
      events.push({ t, minute: -1, kind: 'miss', side });
      t += 1; const keeper = gkOf(other(side)); ball = teamTarget(keeper.side, slot(keeper), ball, keeper.side); holder = keeper; push('reset', holder); t += .7; push('hold', holder);
    }
  };
  // Một pha bóng thường (không bàn thắng): sút khi đã vào khu vực trước khung thành, bị áp sát thì có thể mất bóng,
  // phía trước trống thì dắt lên, còn lại chuyền.
  const play = () => {
    const side = holder.side, f = toFrame(side, ball), x = r();
    // Thủ môn cầm bóng: không ai được tranh (đối phương đã lùi ra); giữ bóng một nhịp rồi phát bóng cho đồng đội, không dắt.
    if (isGK(slot(holder).role)) { t += .5 + r() * .7; push('hold', holder); return passTo(pickPass().p); }
    const inZone = f.y < 31 && Math.abs(f.x - 50) < 28;
    if (inZone && (x < .45 || (f.y < 19 && x < .75))) return shoot();
    const opp = nearestTo(other(side), ball);
    if (opp.d < 3.2 && r() < .42) return r() < .11 ? foul(opp.p) : tackle(opp.p);
    // Không có đường chuyền tốt mà phía trước trống thì dắt lên; đôi khi dắt dù có đường chuyền.
    const best = pickPass();
    // 1/3 sân cuối: phía trước trống thì hay dắt thẳng vào vòng cấm.
    if (f.y < 45 && clearAhead() && r() < .45) return carry(6 + r() * 6, fromFrame(side, { x: clamp(f.x + (50 - f.x) * .5, 20, 80), y: 18 }));
    if (clearAhead() && (best.score < .4 || r() < .28)) return carry(5 + r() * 6);
    return passTo(best.p);
  };
  const fillUntil = (until: number) => { let guard = 0; while (t < until && guard++ < 800) play(); };
  // Pha ghi bàn: giành lại bóng nếu cần, lên bóng, người ghi bàn chạy chỗ vào vòng cấm, kiến tạo, dứt điểm vào lưới.
  const scoreGoal = (g: RankedGoal) => {
    const side = g.side, scorer = { side, i: g.scorer }, assist = g.assist === null ? null : { side, i: g.assist };
    const same = (a: PlayerRef | null) => !!a && holder.side === a.side && holder.i === a.i;
    if (holder.side !== side) chaseWin(side);
    let guard = 0;
    while (toFrame(side, ball).y > 50 && guard++ < 5) {
      const mids = outfield(side).filter(p => p.i !== holder.i && p.i !== scorer.i && p.i !== assist?.i && onside(p));
      if (r() < .45 || !mids.length) carry(8 + r() * 6);
      else { mids.sort((a, b) => toFrame(side, P(a)).y - toFrame(side, P(b)).y); passTo(mids[Math.floor(r() * Math.min(3, mids.length))], undefined, true); }
    }
    const goalDest = fromFrame(side, { x: 38 + r() * 24, y: 12 + r() * 7 });
    if (assist) {
      if (!same(assist)) passTo(assist, undefined, true);
      // Người ghi bàn chạy chỗ nhưng giữ ngang hàng hậu vệ (máy giữ hàng), đồng đội dắt bóng chờ; đủ gần thì chọc khe, người ghi bàn mới băng xuống.
      const run: Run = { ...scorer, ...goalDest };
      carry(10, fromFrame(side, { x: clamp(toFrame(side, ball).x, 15, 85), y: 27 }), run);
      for (let k = 0; k < 5 && (!onside(scorer) || dist(P(scorer), goalDest) > 16); k++) carry(3, undefined, run);
      if (onside(scorer)) passTo(scorer, goalDest, true);
      else { passTo(scorer, P(scorer), true); carry(12, goalDest); }
    } else {
      if (!same(scorer)) {
        const run: Run = { ...scorer, ...P(scorer) };
        for (let k = 0; k < 8 && !onside(scorer); k++) carry(3, undefined, run);
        passTo(scorer, undefined, true);
      }
      carry(22, fromFrame(side, { x: 40 + r() * 20, y: 17 }));
    }
    begin(null, 'shot');
    move(goalMouth(side, true), .35, null, 'goal');
    events.push({ t, minute: g.minute, kind: 'goal', side, scorer: g.scorer, assist: g.assist });
    anchors.push([t, g.minute]);
    t += 2.6; push('goal', null); // bóng nằm trong lưới lúc ăn mừng
    t += 1.2; // bóng được đưa về giữa sân (bay mượt, không nhảy)
    kickoff(other(side));
  };

  kickoff('me');
  const plan: ({ kind: 'goal'; g: RankedGoal } | { kind: 'half' })[] = [...goals.filter(g => g.minute <= 45).map(g => ({ kind: 'goal' as const, g })), { kind: 'half' as const }, ...goals.filter(g => g.minute > 45).map(g => ({ kind: 'goal' as const, g }))];
  for (const step of plan) {
    if (step.kind === 'half') {
      fillUntil(duration / 2);
      events.push({ t, minute: 45, kind: 'half' }); anchors.push([t, 45]);
      begin(null, 'pass'); t += 1.5; kickoff('opp');
    } else {
      fillUntil(step.g.minute / 90 * duration - 7);
      scoreGoal(step.g);
    }
  }
  fillUntil(duration);
  begin(holder, 'hold');
  t += STEP * 2; push('hold', holder); // thêm một chút để có đủ khung hình cuối
  events.push({ t, minute: 90, kind: 'end' }); anchors.push([t, 90]);
  // Mốc phút phải tăng dần (bàn thắng dồn sát nhau có thể bị đẩy muộn hơn).
  for (let k = 1; k < anchors.length; k++) if (anchors[k][0] < anchors[k - 1][0]) anchors[k][0] = anchors[k - 1][0];
  // Ghi thêm vài khung sau giờ kết thúc để nội suy tới khoảnh khắc cuối vẫn mượt.
  const end = t; t += STEP * 4; sync(); t = end;
  return { keys, events, anchors, duration: t, frames, faces, count };
}

// Phút hiển thị tại thời điểm t (nội suy giữa các mốc).
export function minuteAt(tl: Timeline, t: number) {
  const a = tl.anchors;
  for (let k = 1; k < a.length; k++) {
    if (t <= a[k][0]) {
      const [t0, m0] = a[k - 1], [t1, m1] = a[k];
      return Math.floor(t1 > t0 ? lerp(m0, m1, clamp((t - t0) / (t1 - t0), 0, 1)) : m1);
    }
  }
  return 90;
}

// Trạng thái để vẽ: vị trí / hướng 22 cầu thủ nội suy từ khung hình đã ghi tại thời điểm t.
export class MatchSim {
  t = 0;
  readonly tl: Timeline;
  readonly pos: Record<Side, Point[]>;
  readonly face: Record<Side, Point[]>;
  readonly ref: Point = { x: 62, y: 56 };
  readonly refFace: Point = { x: 0, y: -1 };
  constructor(readonly teams: Teams, goals: RankedGoal[], seed: number) {
    this.tl = buildTimeline(teams, goals, seed);
    this.pos = { me: teams.me.map(() => ({ x: 50, y: 50 })), opp: teams.opp.map(() => ({ x: 50, y: 50 })) };
    this.face = { me: teams.me.map(() => ({ x: 0, y: -1 })), opp: teams.opp.map(() => ({ x: 0, y: 1 })) };
    this.sample();
  }
  get done() { return this.t >= this.tl.duration; }
  state() { return ballAt(this.tl, this.t); }
  step(dt: number) {
    this.t = Math.min(this.tl.duration, this.t + Math.max(0, dt));
    this.sample();
  }
  private sample() {
    const { frames, faces, count } = this.tl, per = (this.teams.me.length + this.teams.opp.length + 1) * 2;
    const f = this.t / STEP, k = Math.max(0, Math.min(count - 2, Math.floor(f))), u = clamp(f - k, 0, 1);
    let o = 0;
    for (const side of SIDES) this.pos[side].forEach((p, i) => {
      const a = k * per + o, b = a + per;
      // Nội suy Catmull-Rom qua 4 khung (k-1 … k+2): vận tốc đổi liên tục, không giật ở ranh giới khung.
      const a0 = Math.max(0, k - 1) * per + o, b1 = Math.min(count - 1, k + 2) * per + o;
      p.x = cr(frames[a0], frames[a], frames[b], frames[b1], u); p.y = cr(frames[a0 + 1], frames[a + 1], frames[b + 1], frames[b1 + 1], u);
      const hx = lerp(faces[a], faces[b], u), hy = lerp(faces[a + 1], faces[b + 1], u), l = Math.hypot(hx, hy), fc = this.face[side][i];
      if (l > 1e-6) { fc.x = hx / l; fc.y = hy / l; } else { fc.x = 0; fc.y = side === 'me' ? -1 : 1; }
      o += 2;
    });
    const a = k * per + o, b = a + per, a0 = Math.max(0, k - 1) * per + o, b1 = Math.min(count - 1, k + 2) * per + o;
    this.ref.x = cr(frames[a0], frames[a], frames[b], frames[b1], u); this.ref.y = cr(frames[a0 + 1], frames[a + 1], frames[b + 1], frames[b1 + 1], u);
    const hx = lerp(faces[a], faces[b], u), hy = lerp(faces[a + 1], faces[b + 1], u), l = Math.hypot(hx, hy);
    if (l > 1e-6) { this.refFace.x = hx / l; this.refFace.y = hy / l; }
  }
}

// Thống kê trận tới thời điểm t (theo dòng thời gian bóng): kiểm soát bóng (% thời gian cầm bóng), sút, trúng đích, chuyền thành công, cướp bóng.
// Chỉ số [đội mình, đối thủ].
export type SimStats = { possession: [number, number]; shots: [number, number]; onTarget: [number, number]; passes: [number, number]; tackles: [number, number]; offsides: [number, number] };
export function statsAt(tl: Timeline, t: number): SimStats {
  const at = (s?: Side) => s === 'opp' ? 1 : 0;
  const hold = [0, 0], shots: [number, number] = [0, 0], onTarget: [number, number] = [0, 0], passes: [number, number] = [0, 0], tackles: [number, number] = [0, 0], offsides: [number, number] = [0, 0];
  const k = tl.keys;
  for (let j = 0; j + 1 < k.length && k[j].t < t; j++) {
    const a = k[j], b = k[j + 1], who = a.holder ?? b.holder;
    if (who) hold[at(who.side)] += Math.min(t, b.t) - a.t;
    if (b.t <= t && b.holder) { if (b.kind === 'pass') passes[at(b.holder.side)]++; else if (b.kind === 'win') tackles[at(b.holder.side)]++; }
  }
  for (const e of tl.events) {
    if (e.t <= t && e.kind === 'offside') offsides[at(e.side)]++;
    if (e.t > t || (e.kind !== 'goal' && e.kind !== 'save' && e.kind !== 'miss')) continue;
    shots[at(e.side)]++; if (e.kind !== 'miss') onTarget[at(e.side)]++;
  }
  const total = hold[0] + hold[1], mine = total > 0 ? Math.round(hold[0] / total * 100) : 50;
  return { possession: [mine, 100 - mine], shots, onTarget, passes, tackles, offsides };
}
