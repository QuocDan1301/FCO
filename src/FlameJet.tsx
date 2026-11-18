import { useEffect, useRef } from 'react';

// Trụ lửa sân khấu (người dùng 2026-11-17, sửa lần 2: bỏ dáng "que bông"): cột lửa MẢNH, cao (rộng : cao ≈ 1 : 4,5),
// nhọn lởm chởm sát sàn, thân lắc ngang, đỉnh tách thành 2–4 cụm lửa vừa phải rồi mòn dần — không phình thành quả cầu.
// - Cụm lửa: sprite mây vẽ sẵn (thuỳ lệch + hốc tối bên trong), độ đục thấp (.16–.32) để hoà cộng vẫn thấy vân, chỉ sống lưng
//   (nhiều hạt lõi nhỏ chồng nhau) mới trắng hẳn.
// - Bán kính theo độ cao: nhọn ở đáy → 1,3× ở 60 % → mòn về 0,8× ở 95 %; bề ngang đỉnh ≤ 1,6× thân.
// - Đỉnh 40 %: chỉ một phần cụm được bay quá 60 % theo nhịp 0,5 + 0,5·sin(14t)·cos(9t) → đỉnh rời thành cụm; lắc ngang ±12–22px.
// - Tàn lửa li ti (1,5–4px) xanh / trắng bám mép cột, không kéo dài. Không còn vòi kim loại xám, không tia chữ V.
// Hạt dùng pool cố định; sprite tạo một lần.
export type FlamePreset = 'blue_plasma' | 'orange_gold' | 'bronze' | 'silver' | 'gold' | 'platinum';
type Stop = [number, string];
const PALETTES: Record<FlamePreset, Stop[]> = {
  blue_plasma: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(225,250,255,.95)'], [.6, 'rgba(110,235,255,.85)'], [.8, 'rgba(0,170,255,.5)'], [1, 'rgba(0,80,180,0)']],
  orange_gold: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,245,180,.95)'], [.62, 'rgba(255,150,30,.8)'], [.82, 'rgba(255,100,20,.45)'], [1, 'rgba(180,40,0,0)']],
  // Màu mức thẻ (người dùng 2026-11-17: lửa lấy màu thẻ) — cùng bộ --sheen-* ở upgrade-confirm.css: đồng / bạc / vàng / bạch kim.
  bronze: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,222,190,.95)'], [.62, 'rgba(240,150,90,.82)'], [.82, 'rgba(200,100,45,.45)'], [1, 'rgba(122,60,24,0)']],
  silver: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(240,245,255,.95)'], [.62, 'rgba(195,210,232,.8)'], [.82, 'rgba(130,150,180,.45)'], [1, 'rgba(70,85,110,0)']],
  gold: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,244,190,.95)'], [.62, 'rgba(250,200,60,.82)'], [.82, 'rgba(220,150,20,.45)'], [1, 'rgba(138,100,8,0)']],
  platinum: [[0, 'rgba(255,255,255,1)'], [.4, 'rgba(240,233,255,.95)'], [.62, 'rgba(180,155,255,.82)'], [.82, 'rgba(120,90,240,.45)'], [1, 'rgba(74,50,168,0)']],
};
const EMBER: Record<FlamePreset, [string, string]> = { blue_plasma: ['rgba(235,252,255,1)', 'rgba(80,220,255,0)'], orange_gold: ['rgba(255,248,215,1)', 'rgba(255,150,40,0)'],
  bronze: ['rgba(255,236,215,1)', 'rgba(230,130,70,0)'], silver: ['rgba(255,255,255,1)', 'rgba(185,200,225,0)'],
  gold: ['rgba(255,250,220,1)', 'rgba(245,190,60,0)'], platinum: ['rgba(248,244,255,1)', 'rgba(165,140,255,0)'] };
const SPRITES = 4, SPRITE_PX = 128, MAX_PUFFS = 56, MAX_SPINE = 34, MAX_EMBERS = 40;

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

type Sprites = { clouds: HTMLCanvasElement[]; core: HTMLCanvasElement; ember: HTMLCanvasElement };
const spriteCache = new Map<FlamePreset, Sprites>();
function makeSprites(preset: FlamePreset): Sprites {
  const hit = spriteCache.get(preset); if (hit) return hit;
  const r = rng(7 + preset.length), c = SPRITE_PX / 2;
  const canvas = () => { const cv = document.createElement('canvas'); cv.width = cv.height = SPRITE_PX; return cv; };
  const blob = (g: CanvasRenderingContext2D, x: number, y: number, rad: number, stops: Stop[], alpha: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad); for (const [o, col] of stops) grad.addColorStop(o, col);
    g.globalAlpha = alpha; g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  const hole = (g: CanvasRenderingContext2D, x: number, y: number, rad: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad); grad.addColorStop(0, `rgba(0,0,0,${a})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 1; g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  const clouds: HTMLCanvasElement[] = [];
  for (let k = 0; k < SPRITES; k++) {
    const cv = canvas(), g = cv.getContext('2d')!; g.globalCompositeOperation = 'lighter';
    const lobes = 5 + Math.floor(r() * 4);
    for (let i = 0; i < lobes; i++) { const a = r() * Math.PI * 2, d = r() * SPRITE_PX * .22; blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, SPRITE_PX * (.14 + r() * .16), PALETTES[preset], .35 + r() * .35); }
    g.globalCompositeOperation = 'destination-out';
    // Hốc tối bên trong (vân hở) + mép lởm chởm.
    for (let i = 0; i < 5; i++) { const a = r() * Math.PI * 2, d = r() * SPRITE_PX * .22; hole(g, c + Math.cos(a) * d, c + Math.sin(a) * d, SPRITE_PX * (.05 + r() * .07), .5 + r() * .3); }
    for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = SPRITE_PX * (.3 + r() * .14); hole(g, c + Math.cos(a) * d, c + Math.sin(a) * d, SPRITE_PX * (.06 + r() * .08), .7); }
    clouds.push(cv);
  }
  const core = canvas(), cg = core.getContext('2d')!;
  blob(cg, c, c, SPRITE_PX * .45, [[0, 'rgba(255,255,255,1)'], [.5, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']], 1);
  const ember = canvas(), eg = ember.getContext('2d')!;
  blob(eg, c, c, SPRITE_PX * .48, [[0, EMBER[preset][0]], [.3, EMBER[preset][0]], [1, EMBER[preset][1]]], 1);
  const out = { clouds, core, ember }; spriteCache.set(preset, out); return out;
}

type Puff = { on: boolean; age: number; life: number; cap: number; seed: number; size: number; alpha: number; angle: number; av: number; sprite: number };
type Spine = { on: boolean; age: number; life: number; seed: number; size: number };
type Ember = { on: boolean; age: number; life: number; x: number; y: number; vx: number; vy: number; r: number };
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// paused: canvas đã dựng (cấp sẵn kích thước) nhưng chưa chạy — kết quả đập thẻ dựng sẵn khi còn ẩn (người dùng 2026-11-17: khựng).
export default function FlameJet({ className = '', preset = 'blue_plasma', reduced = false, paused = false }: { className?: string; preset?: FlamePreset; reduced?: boolean; paused?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvas.current, ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const sp = makeSprites(preset), rand = rng(Math.floor(Math.random() * 1e9));
    const puffs: Puff[] = Array.from({ length: MAX_PUFFS }, () => ({ on: false, age: 0, life: 1, cap: 1, seed: 0, size: 1, alpha: .2, angle: 0, av: 0, sprite: 0 }));
    const spine: Spine[] = Array.from({ length: MAX_SPINE }, () => ({ on: false, age: 0, life: 1, seed: 0, size: 1 }));
    const embers: Ember[] = Array.from({ length: MAX_EMBERS }, () => ({ on: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, r: 2 }));
    let W = 0, H = 0, dpr = 1;
    const resize = () => { dpr = Math.min(1.5, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    let t = 0, puffAcc = 0, spineAcc = 0, last = performance.now(), frame = 0;
    // Hình học cột: cao Hf, bề ngang lớn nhất ≈ Hf / 4,5 (ở 60 %), bán kính gốc rb (= 1× ở thân).
    const geo = () => { const Hf = H * .9, rb = Math.min(W * .32, Hf / 4.5 / 2); return { baseY: H - 3, Hf, rb, cx: W / 2, px: Math.max(.6, Hf / 400) }; };
    // Bán kính tương đối theo tiến trình: nhọn ở đáy → 1,3× ở 60 % → 0,8× ở 95 %.
    const radiusK = (pr: number) => pr < .1 ? .22 + pr / .1 * .55 : pr < .6 ? .77 + (pr - .1) / .5 * .53 : 1.3 - Math.min(1, (pr - .6) / .35) * .5;
    // Lắc ngang theo độ cao: gần như thẳng ở chân, ±12–22px ở đỉnh (theo tỉ lệ cột).
    const sway = (pr: number, age: number, seed: number, px: number) => {
      const amp = (pr < .3 ? 1.5 + pr * 10 : pr < .6 ? 4.5 + (pr - .3) * 25 : 12 + (pr - .6) * 25) * px;
      return amp * (Math.sin(age * 6.3 + seed) * .6 + Math.sin(t * 4.1 + seed * 2.3 + pr * 5) * .4);
    };
    const spawnPuff = () => {
      const p = puffs.find(q => !q.on); if (!p) return;
      // Chỉ một phần cụm được bay lên đỉnh, theo nhịp đợt → đỉnh tách cụm có khe hở.
      const m = .5 + .5 * Math.sin(t * 14) * Math.cos(t * 9);
      p.on = true; p.age = 0; p.life = .9 + rand() * .35; p.cap = rand() < m ? 1 : .55 + rand() * .08; p.seed = rand() * 100;
      p.size = .8 + rand() * .35; p.alpha = .16 + rand() * .16; p.angle = rand() * Math.PI * 2; p.av = (rand() - .5) * 2.4; p.sprite = Math.floor(rand() * SPRITES);
    };
    const spawnSpine = () => { const s = spine.find(q => !q.on); if (!s) return; s.on = true; s.age = 0; s.life = .55 + rand() * .3; s.seed = rand() * 100; s.size = .8 + rand() * .4; };
    const spawnEmber = (x: number, y: number, dir: number) => {
      const e = embers.find(q => !q.on); if (!e) return;
      e.on = true; e.age = 0; e.life = .3 + rand() * .45; e.x = x; e.y = y; e.vx = dir * (8 + rand() * 26); e.vy = -(30 + rand() * 70); e.r = 1.5 + rand() * 2.5;
    };
    const step = (dt: number) => {
      t += dt;
      puffAcc += 52 * dt; while (puffAcc >= 1) { spawnPuff(); puffAcc -= 1; }
      spineAcc += 40 * dt; while (spineAcc >= 1) { spawnSpine(); spineAcc -= 1; }
      const { baseY, Hf, rb, cx, px } = geo();
      for (const p of puffs) {
        if (!p.on) continue; p.age += dt; const pr = p.age / p.life;
        if (pr >= p.cap || pr >= 1) { p.on = false; continue; }
        p.angle += p.av * dt;
        if (pr > .35 && rand() < dt * 2.2) {
          const y = baseY - Hf * pr, x = cx + sway(pr, p.age, p.seed, px), side = rand() < .5 ? -1 : 1;
          spawnEmber(x + side * rb * radiusK(pr) * p.size * .8, y, side);
        }
      }
      for (const s of spine) { if (!s.on) continue; s.age += dt; if (s.age >= s.life) s.on = false; }
      for (const e of embers) { if (!e.on) continue; e.age += dt; if (e.age >= e.life) { e.on = false; continue; } e.x += e.vx * dt; e.y += e.vy * dt; e.vx += Math.sin(t * 7 + e.r * 9) * 40 * dt; }
    };
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const { baseY, Hf, rb, cx, px } = geo();
      // Thân: cụm mây độ đục thấp.
      for (const p of puffs) {
        if (!p.on) continue;
        const pr = p.age / p.life, y = baseY - Hf * pr, x = cx + sway(pr, p.age, p.seed, px), r = rb * radiusK(pr) * p.size;
        const fadeIn = smooth(0, .05, pr), fadeOut = 1 - smooth(Math.min(.9, p.cap - .1), p.cap, pr);
        ctx.globalAlpha = p.alpha * fadeIn * fadeOut;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle * (pr < .3 ? .2 : 1));
        if (pr < .15) ctx.scale(.7, 1.5);         // mũi nhọn sát sàn kéo dài dọc
        ctx.drawImage(sp.clouds[p.sprite], -r, -r, r * 2, r * 2); ctx.restore();
      }
      // Sống lưng trắng: hạt lõi nhỏ dày ở giữa, tới ~70 % chiều cao, nhấp nháy.
      for (const s of spine) {
        if (!s.on) continue;
        const pr = s.age / s.life, y = baseY - Hf * .7 * pr, x = cx + sway(pr * .7, s.age, s.seed, px) * .6;
        const r = rb * (pr < .12 ? .12 + pr / .12 * .2 : .32 + pr * .12) * s.size;
        ctx.globalAlpha = .38 * smooth(0, .08, pr) * (1 - smooth(.6, 1, pr)) * (.8 + .2 * Math.sin(t * 40 + s.seed));
        ctx.save(); ctx.translate(x, y); ctx.scale(.75, 1.4); ctx.drawImage(sp.core, -r, -r, r * 2, r * 2); ctx.restore();
      }
      // Tàn lửa li ti (không kéo dài).
      for (const e of embers) {
        if (!e.on) continue;
        ctx.globalAlpha = (1 - e.age / e.life) * .9;
        const r = e.r * 1.8; ctx.drawImage(sp.ember, e.x - r, e.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    };
    if (paused) return () => { ro.disconnect(); };
    if (reduced) { for (let i = 0; i < 90; i++) step(1 / 60); draw(); }
    else {
      const tick = (now: number) => { const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [preset, reduced, paused]);
  return <div className={className} aria-hidden="true"><canvas ref={canvas} className="uc-flame-canvas"/><i className="uc-flame-nozzle"/></div>;
}
