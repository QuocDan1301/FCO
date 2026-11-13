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
// pace: tốc độ hơn / kém OVR của ô (chỉ số cầu thủ); cầu thủ nhanh chạy nhanh hơn tối đa ~9%.
export type SimSlot = { role: string; fx: number; fy: number; name?: string; pace?: number };
export type PlayerRef = { side: Side; i: number };
export type Point = { x: number; y: number };
// Gợi ý chạy chỗ: trong đoạn bắt đầu ở khoá này, cầu thủ (side, i) băng tới điểm (x, y).
type Run = PlayerRef & Point;
// Tình huống cố định: phạt góc / đá phạt trực tiếp của đội side, người đá taker. Gắn vào khoá bắt đầu đoạn dàn quân và đoạn bóng bay.
export type SetPiece = { type: 'corner' | 'freekick'; side: Side; taker: PlayerRef };
// foul: đoạn dừng bóng sau pha phạm lỗi (trọng tài chạy tới chỗ phạm lỗi); setpiece: đoạn dàn quân trước phạt góc / đá phạt.
type Key = Point & { t: number; holder: PlayerRef | null; kind: 'hold' | 'run' | 'pass' | 'shot' | 'goal' | 'save' | 'miss' | 'reset' | 'win' | 'foul' | 'setpiece'; run?: Run; sp?: SetPiece };
// foul: trọng tài thổi phạt (side = đội phạm lỗi); offside: việt vị (side = đội tấn công bị bắt việt vị);
// corner / freekick: phạt góc / đá phạt trực tiếp (side = đội được hưởng).
export type SimEvent = { t: number; minute: number; kind: 'goal' | 'save' | 'miss' | 'half' | 'end' | 'foul' | 'offside' | 'corner' | 'freekick'; side?: Side; scorer?: number; assist?: number | null };

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
// Hậu vệ (cả nhãn vị trí như LCB / RCB): chạy chậm hơn, ít tự dắt bóng, không dắt bóng lên kiến tạo.
const isDefender = (role: string) => /^(L|R)?CB$|^(L|R)B$|^(L|R)WB$|^SW$/.test(role);
const isDeep = (role: string) => isGK(role) || isDefender(role);
const other = (s: Side): Side => s === 'me' ? 'opp' : 'me';
// Đổi điểm giữa toạ độ sân và khung nhìn của một đội (đội đó đá lên trên).
const toFrame = (side: Side, p: Point): Point => side === 'me' ? p : { x: 100 - p.x, y: 100 - p.y };
const fromFrame = toFrame;
// Tâm hàng rào đá phạt (khung của đội đá phạt, khung thành đối phương ở y = 0): trên đường bóng → giữa khung thành, cách bóng 9,15 m.
// Sân 68 × 105 m ↔ 100 × 100 đơn vị. Trả về tâm và hướng vuông góc (đơn vị toạ độ) để xếp người.
export function wallLine(ball: Point) {
  const bx = ball.x * .68, by = ball.y * 1.05, dx = 34 - bx, dy = -by, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const c = { x: (bx + ux * 9.15) / .68, y: (by + uy * 9.15) / 1.05 };
  return { center: c, at: (k: number) => ({ x: (bx + ux * 9.15 - uy * k * .75) / .68, y: (by + uy * 9.15 + ux * k * .75) / 1.05 }) };
}

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
type BallState = { ball: Point; holder: PlayerRef | null; receiver: PlayerRef | null; dest: Point; kind: Key['kind']; run: Run | null; sp: SetPiece | null };

function ballOn(keys: Key[], t: number): BallState {
  let lo = 0, hi = keys.length - 1;
  if (t <= keys[0].t) return { ball: keys[0], holder: keys[0].holder, receiver: null, dest: keys[0], kind: keys[0].kind, run: null, sp: null };
  if (t >= keys[hi].t) return { ball: keys[hi], holder: keys[hi].holder, receiver: null, dest: keys[hi], kind: keys[hi].kind, run: null, sp: null };
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid].t <= t) lo = mid; else hi = mid; }
  const a = keys[lo], b = keys[hi], p = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  // Bóng bay chậm dần nhưng chưa dừng hẳn khi tới chân người nhận (nối tiếp bằng chạm bóng đầu).
  const flying = !a.holder, e = flying ? p * (1.45 - .45 * p) : p;
  return { ball: { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) }, holder: a.holder, receiver: flying ? b.holder : null, dest: b, kind: b.kind, run: a.run ?? null, sp: a.sp ?? null };
}
// Bóng và người đang giữ / người nhận tại thời điểm t.
export function ballAt(tl: Timeline, t: number) { return ballOn(tl.keys, t); }

// Chuyển động cầu thủ: lái theo vận tốc (tăng / giảm tốc dần, không giật).
class Engine {
  readonly pos: Record<Side, Point[]>;
  readonly vel: Record<Side, Point[]>;
  readonly face: Record<Side, Point[]>;
  private readonly phase: Record<Side, number[]>;
  // Thứ tự vào vị trí khi dàn quân: đội tấn công lấy người dâng cao trước, đội phòng ngự lấy người đá thấp (trung vệ) trước.
  private readonly attOrder: Record<Side, number[]>;
  private readonly defOrder: Record<Side, number[]>;
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
    const outfieldIdx = (side: Side) => teams[side].map((s, i) => ({ s, i })).filter(o => !isGK(o.s.role));
    this.attOrder = { me: outfieldIdx('me').sort((a, b) => a.s.fy - b.s.fy).map(o => o.i), opp: outfieldIdx('opp').sort((a, b) => a.s.fy - b.s.fy).map(o => o.i) };
    this.defOrder = { me: outfieldIdx('me').sort((a, b) => b.s.fy - a.s.fy).map(o => o.i), opp: outfieldIdx('opp').sort((a, b) => b.s.fy - a.s.fy).map(o => o.i) };
  }
  // Vị trí khi dàn quân phạt góc / đá phạt (toạ độ tính trong khung của đội được hưởng, khung thành đối phương ở y = 0).
  private setPieceTarget(side: Side, i: number, slot: SimSlot, s: BallState, t: number): Point {
    const sp = s.sp!, att = side === sp.side, ph = this.phase[side][i];
    const jit = (k: number) => Math.sin(t * .8 + ph) * k;
    const F = (p: Point) => fromFrame(sp.side, p);
    const ball = toFrame(sp.side, s.ball);
    if (isGK(slot.role)) return att ? teamTarget(side, slot, s.ball, side) : F({ x: 50 + clamp((ball.x - 50) * .1, -3, 3), y: 1.5 });
    const order = (att ? this.attOrder : this.defOrder)[side].filter(k => !(sp.taker.side === side && sp.taker.i === k));
    const rank = order.indexOf(i);
    if (sp.type === 'corner') {
      // Đội tấn công: 5 người vào vòng cấm, 2 người chờ bóng bật ra ở rìa vòng cấm; đội phòng ngự: 6 người kèm khu vực, 2 người ở rìa.
      const spots = att ? [[44, 8], [56, 7], [50, 11], [39, 13], [61, 13]] : [[46, 3.5], [54, 3.5], [42, 8], [58, 8], [50, 12], [50, 6]];
      const edge = att ? [[34, 22], [66, 22]] : [[38, 20], [62, 20]];
      if (rank >= 0 && rank < spots.length) return F({ x: spots[rank][0] + jit(1.2), y: spots[rank][1] + jit(.8) });
      if (rank >= 0 && rank < spots.length + edge.length) { const e = edge[rank - spots.length]; return F({ x: e[0] + jit(1), y: e[1] }); }
      return teamTarget(side, slot, s.ball, sp.side);
    }
    if (!att) {
      // Hàng rào 4 người cách bóng 9,15 m, 3 người kèm trong vòng cấm.
      if (rank >= 0 && rank < 4) return F(wallLine(ball).at(rank - 1.5));
      if (rank >= 0 && rank < 7) return F({ x: 40 + (rank - 4) * 10 + jit(1), y: 6 + jit(.6) });
      return teamTarget(side, slot, s.ball, sp.side);
    }
    const spots = [[42, 12], [58, 11], [50, 16], [35, 18]];
    if (rank >= 0 && rank < spots.length) return F({ x: spots[rank][0] + jit(1.5), y: spots[rank][1] + jit(1) });
    return teamTarget(side, slot, s.ball, sp.side);
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
    const onsideTarget = (side: Side, tg: Point) => { const f = toFrame(side, tg); return f.y >= line[side] + 1 ? tg : fromFrame(side, { x: f.x, y: clamp(line[side] + 1, 3, 97) }); };
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
        else if (isReceiver) { target = { x: s.dest.x + (s.ball.x - s.dest.x) * .18, y: s.dest.y + (s.ball.y - s.dest.y) * .18 }; speed = isDeep(slot.role) ? 20 : 30; gain = 4; accel = 8; }
        else if (isRunner) { target = side === possession ? onsideTarget(side, s.run!) : s.run!; speed = 30; gain = 4; accel = 8; }
        else if (s.sp) { target = this.setPieceTarget(side, i, slot, s, t); speed = isDeep(slot.role) ? 16 : 20; gain = 3; accel = 6; }
        else if (i === press) { const d = dist(p, s.ball) || 1; target = d > 2 ? s.ball : p; speed = isDefender(slot.role) ? 16 : 24; gain = 3.2; accel = 7; }
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
            if (f.y > want) target = fromFrame(side, { x: f.x, y: clamp(want, 3, 97) });
          }
          if (!gk && side === possession && !early) target = onsideTarget(side, target);
          // Hậu vệ di chuyển chậm (dâng lên tối đa 13 đơn vị / giây), thủ môn chậm nữa: cả hàng thủ không ào lên cùng lúc khi đội giành bóng.
          if (gk) { speed = 13; gain = 2.4; accel = 4.5; }
          else if (isDefender(slot.role)) {
            const ahead = (toFrame(side, p).y - toFrame(side, target).y) > 0;
            speed = ahead ? 13 : 16; gain = 2.4; accel = 4.5;
          }
        }
        if (!isDeep(slot.role) && slot.pace) speed *= 1 + Math.max(-15, Math.min(15, slot.pace)) * .006;
        // Cầu thủ luôn ở trong sân (người áp sát không đuổi theo bóng vào lưới sau cú sút).
        steer(p, this.vel[side][i], this.face[side][i], { x: clamp(target.x, 1, 99), y: clamp(target.y, 1, 99) }, speed, gain, accel, dt, s.ball);
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
    if (isGK(slot(holder).role)) { t += .4; push('hold', holder); return; }
    const f = toFrame(holder.side, ball);
    const end = fromFrame(holder.side, { x: clamp(f.x + (r() - .5) * 4, 5, 95), y: clamp(f.y - (1.8 + r() * 2.2), 6, 94) });
    move(end, dur, holder, 'run');
  };
  // Dắt bóng: lên phía trước, đối phương áp sát thì lách sang bên; run = đồng đội chạy chỗ trong lúc dắt.
  const carry = (len: number, toward?: Point, run?: Run) => {
    if (isGK(slot(holder).role)) { t += .5 + r() * .4; push('hold', holder); return passTo(pickPass().p); }
    if (isDefender(slot(holder).role) && !toward) len = Math.min(len, 5);
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
  // Phạm lỗi: trọng tài thổi phạt, bóng dừng một lúc rồi đội bị phạm lỗi đá tiếp (giữ bóng). Gần khung thành đối phương
  // (khu vực sút được) thì thành đá phạt trực tiếp: hàng rào, rồi sút.
  const foul = (by: PlayerRef, goal?: RankedGoal) => {
    events.push({ t, minute: -1, kind: 'foul', side: by.side });
    t += 1.6; push('foul', holder);
    const f = toFrame(holder.side, ball);
    if (goal || (f.y < 30 && Math.abs(f.x - 50) < 28)) return freeKick(holder.side, goal);
    t += .4; push('hold', holder);
  };
  // Dàn quân: người đá đứng ở bóng, hai đội vào vị trí trong dur giây.
  const setup = (sp: SetPiece, dur: number) => { keys[keys.length - 1].sp = sp; t += dur; push('setpiece', holder); };
  // Người đá phạt góc: cầu thủ chạy cánh / tiền vệ gần góc cờ nhất (không lấy trung vệ).
  const cornerTaker = (side: Side, right: boolean) => outfield(side).filter(p => !isDefender(slot(p).role))
    .sort((a, b) => Math.abs(slot(a).fx - (right ? 100 : 0)) + slot(a).fy * .3 - (Math.abs(slot(b).fx - (right ? 100 : 0)) + slot(b).fy * .3))[0] ?? outfield(side)[0];
  // Phát bóng lên sau khi bóng ra ngoài đường biên ngang (sút chệch / đánh đầu chệch).
  const goalKick = (side: Side) => {
    t += 1; const keeper = gkOf(other(side)); ball = teamTarget(keeper.side, slot(keeper), ball, keeper.side); holder = keeper; push('reset', holder); t += .7; push('hold', holder);
  };
  // Bàn thắng: bóng vào lưới, ăn mừng, giao bóng lại.
  const netGoal = (g: RankedGoal, dur: number, mouth = goalMouth(g.side, true)) => {
    begin(null, 'shot');
    move(mouth, dur, null, 'goal');
    events.push({ t, minute: g.minute, kind: 'goal', side: g.side, scorer: g.scorer, assist: g.assist });
    anchors.push([t, g.minute]);
    t += 2.6; push('goal', null); // bóng nằm trong lưới lúc ăn mừng
    t += 1.2; // bóng được đưa về giữa sân (bay mượt, không nhảy)
    kickoff(other(g.side));
  };
  // Phạt góc cho đội side: bóng ra cờ góc, dàn quân, treo bóng vào vòng cấm. goal = bàn thắng đánh đầu (taker = người kiến tạo, target = người ghi bàn).
  const cornerKick = (side: Side, opts: { taker?: PlayerRef; target?: PlayerRef; goal?: RankedGoal } = {}) => {
    const right = r() < .5, spot = fromFrame(side, { x: right ? 98.5 : 1.5, y: 1.2 });
    const taker = opts.taker ?? cornerTaker(side, right);
    events.push({ t, minute: -1, kind: 'corner', side });
    begin(null, 'reset'); t += 1.1; ball = spot; holder = taker; push('reset', taker);
    const sp: SetPiece = { type: 'corner', side, taker };
    setup(sp, 2.6);
    const boxed = outfield(side).filter(p => p.i !== taker.i).sort((a, b) => toFrame(side, P(a)).y - toFrame(side, P(b)).y).slice(0, 5);
    const target = opts.target ?? boxed[Math.floor(r() * boxed.length)] ?? taker;
    const dest = { x: clamp(P(target).x, 4, 96), y: clamp(P(target).y, 3, 97) }, flight = .55 + dist(ball, dest) / 60;
    begin(null, 'pass'); keys[keys.length - 1].sp = sp;
    const x = r();
    if (!opts.goal && x < .42) {
      // Hậu vệ phá bóng: người gần điểm rơi nhất của đội phòng ngự đánh đầu giải nguy.
      const def = nearestTo(other(side), dest).p;
      move(dest, flight, def, 'win');
      return touch(.3);
    }
    move(dest, flight, target, 'pass');
    if (opts.goal) return netGoal(opts.goal, .3);
    begin(null, 'shot');
    if (x < .72) { move(goalMouth(side, false), .35, null, 'miss'); events.push({ t, minute: -1, kind: 'miss', side }); return goalKick(side); }
    const keeper = gkOf(other(side));
    move(fromFrame(side, { x: 44 + r() * 12, y: 3 }), .3, keeper, 'save');
    events.push({ t, minute: -1, kind: 'save', side });
    t += .8; push('hold', holder);
  };
  // Đá phạt trực tiếp cho đội side tại chỗ bóng: hàng rào, rồi người đá sút (chặn hàng rào / chệch / cản phá, hoặc vào lưới nếu goal).
  const freeKick = (side: Side, goal?: RankedGoal) => {
    const taker = goal ? { side, i: goal.scorer } : isDeep(slot(holder).role) ? frontOf(side)[0] : holder;
    events.push({ t, minute: -1, kind: 'freekick', side });
    holder = taker; push('reset', taker);
    const sp: SetPiece = { type: 'freekick', side, taker };
    setup(sp, 2.4);
    begin(null, 'shot');
    if (goal) { const left = r() < .5; return netGoal(goal, .55, fromFrame(side, { x: left ? 42 + r() * 2 : 56 + r() * 2, y: -2.5 })); }
    const x = r();
    if (x < .3) {
      // Trúng hàng rào: bóng bật ra, người trong hàng rào gần nhất giữ bóng.
      const wall = fromFrame(side, wallLine(toFrame(side, ball)).center), def = nearestTo(other(side), wall).p;
      move({ x: P(def).x, y: P(def).y }, .2, def, 'win');
      return touch(.3);
    }
    if (x < .65) { move(goalMouth(side, false), .55, null, 'miss'); events.push({ t, minute: -1, kind: 'miss', side }); return goalKick(side); }
    const keeper = gkOf(other(side));
    move(fromFrame(side, { x: 42 + r() * 16, y: 3 }), .5, keeper, 'save');
    events.push({ t, minute: -1, kind: 'save', side });
    if (r() < .35) return cornerKick(side);
    t += .8; push('hold', holder);
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
      // Thủ môn đẩy bóng ra ngoài đường biên ngang → phạt góc.
      if (r() < .45) return cornerKick(side);
      t += .8; push('hold', holder);
    } else {
      move(goalMouth(side, false), .4, null, 'miss');
      events.push({ t, minute: -1, kind: 'miss', side });
      goalKick(side);
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
    if (opp.d < 3.2 && r() < .42) {
      if (r() < .11) return foul(opp.p);
      // Hậu vệ cản phá ra ngoài đường biên ngang (gần khung thành nhà) → phạt góc cho đội tấn công.
      if (f.y < 26 && r() < .35) { begin(null, 'win'); return cornerKick(side); }
      return tackle(opp.p);
    }
    // Không có đường chuyền tốt mà phía trước trống thì dắt lên; đôi khi dắt dù có đường chuyền.
    const best = pickPass();
    // 1/3 sân cuối: phía trước trống thì hay dắt thẳng vào vòng cấm.
    if (f.y < 45 && clearAhead() && !isDeep(slot(holder).role) && r() < .45) return carry(6 + r() * 6, fromFrame(side, { x: clamp(f.x + (50 - f.x) * .5, 20, 80), y: 18 }));
    if (clearAhead() && (best.score < .4 || r() < (isDefender(slot(holder).role) ? .1 : .28))) return carry(5 + r() * 6);
    return passTo(best.p);
  };
  const fillUntil = (until: number) => { let guard = 0; while (t < until && guard++ < 800) play(); };
  // Pha ghi bàn: giành lại bóng nếu cần, lên bóng, người ghi bàn chạy chỗ vào vòng cấm, kiến tạo, dứt điểm vào lưới.
  const scoreGoal = (g: RankedGoal) => {
    const side = g.side, scorer = { side, i: g.scorer }, assist = g.assist === null ? null : { side, i: g.assist };
    const same = (a: PlayerRef | null) => !!a && holder.side === a.side && holder.i === a.i;
    if (holder.side !== side) chaseWin(side);
    // Đôi khi bàn thắng đến từ tình huống cố định: đánh đầu từ phạt góc (người kiến tạo đá phạt góc), sút phạt trực tiếp (bàn không kiến tạo).
    const setPiece = r();
    if (!isGK(slot(scorer).role) && ((assist && !isGK(slot(assist).role) && setPiece < .2) || (!assist && setPiece < .25))) {
      for (let k = 0; k < 6 && toFrame(side, ball).y > 50; k++) {
        const mids = outfield(side).filter(p => p.i !== holder.i && !isDeep(slot(p).role) && onside(p));
        if (isDeep(slot(holder).role) && mids.length) passTo(mids[Math.floor(r() * mids.length)], undefined, true); else carry(8 + r() * 6);
      }
      if (holder.side === side && isGK(slot(holder).role)) passTo(frontOf(side)[0], undefined, true);
      const f = toFrame(side, ball);
      carry(Math.max(4, f.y - 28), fromFrame(side, { x: clamp(f.x, 30, 70), y: 28 }));
      if (assist) {
        begin(null, 'shot');
        move(fromFrame(side, { x: 44 + r() * 12, y: 3 }), .35, gkOf(other(side)), 'save');
        events.push({ t, minute: -1, kind: 'save', side });
        return cornerKick(side, { taker: assist, target: scorer, goal: g });
      }
      ball = fromFrame(side, { x: clamp(toFrame(side, ball).x, 32, 68), y: clamp(toFrame(side, ball).y, 22, 29) });
      return foul(nearestTo(other(side), ball).p, g);
    }
    const deepAssist = !!assist && isDeep(slot(assist).role);
    let guard = 0;
    while (!deepAssist && toFrame(side, ball).y > 50 && guard++ < 5) {
      const mids = outfield(side).filter(p => p.i !== holder.i && p.i !== scorer.i && p.i !== assist?.i && onside(p));
      if ((r() < .45 && !isDeep(slot(holder).role)) || !mids.length) carry(8 + r() * 6);
      else { mids.sort((a, b) => toFrame(side, P(a)).y - toFrame(side, P(b)).y); passTo(mids[Math.floor(r() * Math.min(3, mids.length))], undefined, true); }
    }
    const goalDest = fromFrame(side, { x: 38 + r() * 24, y: 12 + r() * 7 });
    if (assist && deepAssist) {
      // Thủ môn / hậu vệ kiến tạo: bóng về chân người đó, phát bóng dài vượt tuyến cho người ghi bàn đang băng lên, người ghi bàn đột phá dứt điểm.
      if (!same(assist)) passTo(assist, undefined, true);
      t += .5; push('hold', holder);
      for (let k = 0; k < 8 && !onside(scorer); k++) { t += .4; push('hold', holder); }
      const s = toFrame(side, P(scorer));
      passTo(scorer, fromFrame(side, { x: clamp(s.x, 22, 78), y: clamp(s.y - 5, 24, 45) }), true);
      carry(30, fromFrame(side, { x: 40 + r() * 20, y: 15 }));
    } else if (assist) {
      if (!same(assist)) {
        // Người kiến tạo đang đứng việt vị thì người cầm bóng dắt chậm chờ người đó lùi về đúng hàng rồi mới chuyền.
        for (let k = 0; k < 8 && !onside(assist); k++) carry(2);
        passTo(assist, undefined, true);
      }
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
    netGoal(g, .35);
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
export type SimStats = { possession: [number, number]; shots: [number, number]; onTarget: [number, number]; passes: [number, number]; tackles: [number, number]; offsides: [number, number]; corners: [number, number] };
export function statsAt(tl: Timeline, t: number): SimStats {
  const at = (s?: Side) => s === 'opp' ? 1 : 0;
  const hold = [0, 0], shots: [number, number] = [0, 0], onTarget: [number, number] = [0, 0], passes: [number, number] = [0, 0], tackles: [number, number] = [0, 0], offsides: [number, number] = [0, 0], corners: [number, number] = [0, 0];
  const k = tl.keys;
  for (let j = 0; j + 1 < k.length && k[j].t < t; j++) {
    const a = k[j], b = k[j + 1], who = a.holder ?? b.holder;
    if (who) hold[at(who.side)] += Math.min(t, b.t) - a.t;
    if (b.t <= t && b.holder) { if (b.kind === 'pass') passes[at(b.holder.side)]++; else if (b.kind === 'win') tackles[at(b.holder.side)]++; }
  }
  for (const e of tl.events) {
    if (e.t <= t && e.kind === 'offside') offsides[at(e.side)]++;
    if (e.t <= t && e.kind === 'corner') corners[at(e.side)]++;
    if (e.t > t || (e.kind !== 'goal' && e.kind !== 'save' && e.kind !== 'miss')) continue;
    shots[at(e.side)]++; if (e.kind !== 'miss') onTarget[at(e.side)]++;
  }
  const total = hold[0] + hold[1], mine = total > 0 ? Math.round(hold[0] / total * 100) : 50;
  return { possession: [mine, 100 - mine], shots, onTarget, passes, tackles, offsides, corners };
}
