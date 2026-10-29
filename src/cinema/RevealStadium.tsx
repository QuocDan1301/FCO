import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { asset } from '../asset';
import type { FlameTone } from './flames';
import './pack-flames.css';
import './reveal-stadium.css';

// Phông nền sân vận động của màn hiện thẻ, vẽ trong hộp 16:9 (viewBox 1600 × 900) phủ kín màn hình: trời đêm có pháo hoa hạt sáng,
// khán đài kín người (đốm sáng bokeh vàng cam / trắng) dưới mái vòm tối có dầm chéo, 6 tia sáng trắng chạy từ mép mái hội tụ sau thẻ,
// ánh lóe mềm ở hai góc trên, khán đài trống hai cánh, bụi sáng lơ lửng. Mặt cỏ, biển quảng cáo và giàn sắt bám theo màn LED nên nằm ở
// RevealGround (trong khung sân khấu). Tĩnh, vẽ một lần; chỉ pháo hoa, bụi sáng, tia sáng có hoạt cảnh (transform / opacity).
const W = 1600;
const join = (list: [number, number][]) => list.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');
// Mép trong của mái vòm: bậc hai từ (0, 250) qua điểm điều khiển (400, 110) tới (800, 84), đối xứng; x tuyến tính theo t.
const roofEdge = (x: number) => { const t = (x <= 800 ? x : W - x) / 800; return (1 - t) ** 2 * 250 + 2 * (1 - t) * t * 110 + t * t * 84; };
const ROOF_PATH = `M0 0H${W}V250Q1200 110 800 84Q400 110 0 250Z`;
const ROOF_BEAMS = join(Array.from({ length: 33 }, (_, i) => { const x = i * 50; return [x, i % 2 ? roofEdge(x) - 6 : 10] as [number, number]; }));
// Tia sáng trắng mảnh (lõi sáng + quầng mềm): từ mép trên cùng của mái chiếu chéo xuống; 2 tia trong hội tụ sau thẻ,
// tia ngoài cùng mở góc rộng hơn, cắt qua phía sau lưng hai cánh màn. Toạ độ nửa trái, nửa phải đối xứng.
const BEAMS: [[number, number], [number, number]][] = [[[170, 0], [520, 620]], [[390, 0], [760, 400]], [[560, 0], [800, 330]]];
const mirrorBeam = ([[x1, y1], [x2, y2]]: [[number, number], [number, number]]): [[number, number], [number, number]] => [[W - x1, y1], [W - x2, y2]];
const STAND_TOP: [number, number][] = [[0, 330], [620, 380]];
const AISLES = [70, 230, 390, 550];
// Ảnh pháo hoa ghi đủ đường dẫn (không ghép chuỗi) để bản mothe.html tìm thấy và nhúng. Pháo bạc thay pháo vàng khi thẻ chính từ 100M.
const FIREWORK_ART = {
  gold: [asset('/assets/rs-fw-gold-1.webp'), asset('/assets/rs-fw-gold-2.webp')],
  silver: [asset('/assets/rs-fw-silver-1.webp'), asset('/assets/rs-fw-silver-2.webp')],
  white: asset('/assets/rs-fw-white.webp'),
};
export type FireworkTone = 'gold' | 'silver';
// img: 0 / 1 = pháo màu (vàng hoặc bạc) kiểu 1 / 2, -1 = pháo trắng.
const FIREWORKS = [
  { x: 32, y: 10, s: 15, img: 0, d: 0 }, { x: 45, y: 6, s: 11, img: -1, d: 1 }, { x: 57, y: 9, s: 16, img: 1, d: 1.8 },
  { x: 68, y: 7, s: 12, img: -1, d: .5 }, { x: 39, y: 15, s: 9, img: 1, d: 2.5 }, { x: 62, y: 15, s: 10, img: 0, d: 1.3 },
  { x: 50, y: 12, s: 13, img: 0, d: 3 },
];

export default function RevealStadium({ fireworks = 'gold' }: { fireworks?: FireworkTone }) {
  return <div className="reveal-stadium" aria-hidden="true">
    <div className="rs-world">
      <svg className="rs-art" viewBox={`0 0 ${W} 900`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="rsSky" x2="0" y2="1"><stop stopColor="#020309"/><stop offset=".5" stopColor="#0a1222"/><stop offset="1" stopColor="#0d1626"/></linearGradient>
          <pattern id="rsSeats" width="12" height="13" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="#13253d"/><rect y="8" width="12" height="5" fill="#0a1626"/><rect x="11" width="1" height="8" fill="#0a1626"/></pattern>
          <radialGradient id="rsFlare"><stop stopColor="#ffffff" stopOpacity=".95"/><stop offset=".12" stopColor="#fff6dc" stopOpacity=".55"/><stop offset=".45" stopColor="#ffe8b0" stopOpacity=".12"/><stop offset="1" stopColor="#ffe8b0" stopOpacity="0"/></radialGradient>
          <radialGradient id="rsFlareDisc"><stop stopColor="#cfe6ff" stopOpacity="0"/><stop offset=".7" stopColor="#cfe6ff" stopOpacity=".1"/><stop offset="1" stopColor="#cfe6ff" stopOpacity="0"/></radialGradient>
          {BEAMS.flatMap((b, i) => [[b, `l${i}`], [mirrorBeam(b), `r${i}`]] as const).map(([[[x1, y1], [x2, y2]], id]) => <linearGradient key={id} id={`rsBeam${id}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}><stop stopColor="#fff" stopOpacity=".95"/><stop offset=".55" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>)}
          <filter id="rsBeamGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
          <linearGradient id="rsSpotL" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="560" y2="620"><stop stopColor="#fff" stopOpacity=".34"/><stop offset=".5" stopColor="#fff" stopOpacity=".1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
          <linearGradient id="rsSpotR" gradientUnits="userSpaceOnUse" x1={W} y1="0" x2={W - 560} y2="620"><stop stopColor="#fff" stopOpacity=".34"/><stop offset=".5" stopColor="#fff" stopOpacity=".1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        </defs>
        <rect width={W} height="900" fill="url(#rsSky)"/>
        {/* Khán đài kín người dưới mái vòm: đốm sáng bokeh vàng cam / trắng (ảnh vẽ sẵn). */}
        <image href={asset('/assets/rs-crowd.webp')} x="0" y="96" width={W} height="300" preserveAspectRatio="none"/>
        {/* Khán đài trống hai cánh (dưới dải khán giả, kéo tới đáy; phần dưới đường chân trời bị mặt cỏ che). */}
        {[1, -1].map(dir => { const X = (x: number) => dir > 0 ? x : W - x; return <g key={dir}>
          <polygon points={join([[X(0), STAND_TOP[0][1]], [X(STAND_TOP[1][0]), STAND_TOP[1][1]], [X(STAND_TOP[1][0]), 900], [X(0), 900]])} fill="url(#rsSeats)"/>
          {AISLES.map(x => { const top = STAND_TOP[0][1] + (STAND_TOP[1][1] - STAND_TOP[0][1]) * x / STAND_TOP[1][0]; return <polygon key={x} points={join([[X(x), top], [X(x + 12), top], [X(x + 60), 900], [X(x + 46), 900]])} fill="#d8cd99" opacity=".8"/>; })}
          <polygon points={join([[X(0), STAND_TOP[0][1] - 8], [X(STAND_TOP[1][0]), STAND_TOP[1][1] - 8], [X(STAND_TOP[1][0]), STAND_TOP[1][1]], [X(0), STAND_TOP[0][1]]])} fill="#1d2738"/>
        </g>; })}
        {/* Mái vòm tối và dầm chéo. */}
        <path d={ROOF_PATH} fill="#05080d"/>
        <polyline points={ROOF_BEAMS} fill="none" stroke="#18202d" strokeWidth="4"/>
        <path d={`M0 250Q400 110 800 84Q1200 110 ${W} 250`} fill="none" stroke="#232d40" strokeWidth="5"/>
        <path d={`M0 12H${W}`} stroke="#18202d" strokeWidth="5"/>
        {/* 2 luồng đèn pha trắng rọi từ hai góc trên; 6 tia sáng mảnh (quầng mờ + lõi sáng) từ mép mái chiếu xuống sau thẻ / sau hai cánh màn. */}
        <g className="rs-beams">
          <polygon points={join([[0, 0], [70, 0], [640, 640], [330, 640]])} fill="url(#rsSpotL)"/>
          <polygon points={join([[W, 0], [W - 70, 0], [W - 640, 640], [W - 330, 640]])} fill="url(#rsSpotR)"/>
          {BEAMS.flatMap((b, i) => [[b, `l${i}`], [mirrorBeam(b), `r${i}`]] as const).map(([[[x1, y1], [x2, y2]], id]) => <g key={id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#rsBeam${id})`} strokeWidth="26" opacity=".45" filter="url(#rsBeamGlow)"/>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#rsBeam${id})`} strokeWidth="7" strokeLinecap="round"/>
          </g>)}
        </g>
        {/* Ánh lóe mềm sát hai góc trên (đèn pha), gọn trong góc để chữ "Số gói sở hữu" vẫn nằm trên nền mái tối. */}
        {[30, W - 30].map(cx => <g key={cx}>
          <ellipse cx={cx} cy="26" rx="190" ry="130" fill="url(#rsFlare)"/>
          <circle cx={cx + (cx < 800 ? 150 : -150)} cy="120" r="34" fill="url(#rsFlareDisc)"/>
          <circle cx={cx + (cx < 800 ? 230 : -230)} cy="176" r="18" fill="url(#rsFlareDisc)"/>
        </g>)}
      </svg>
      {/* Bụi sáng lơ lửng trôi chậm lên. */}
      <i className="rs-sparkles"/>
      {/* Pháo hoa hạt sáng vàng đồng (bạc khi thẻ chính từ 100M) / trắng. */}
      {FIREWORKS.map((f, i) => <i key={i} className="rs-firework" style={{ left: `${f.x}%`, top: `${f.y}%`, '--s': `${f.s}%`, '--d': `${f.d}s`, backgroundImage: `url("${f.img < 0 ? FIREWORK_ART.white : FIREWORK_ART[fireworks][f.img]}")` } as CSSProperties}/>)}
    </div>
  </div>;
}

// Mặt sân bám theo khung sân khấu (đường chân trời = đáy màn LED): biển quảng cáo sát mặt cỏ, thảm cỏ có vân hạt và vệt cắt theo phối cảnh,
// ánh sân khấu hắt xuống trước bục, tối dần ra các góc; giàn sắt đen chạy thẳng lên mái với đế vuông và đèn pha nhỏ sát đất.
// Vệt cắt cỏ: dải hội tụ về điểm tụ phía trên chân trời (hệ toạ độ 1600 × 900 của mặt sân, kéo giãn theo khung).
const TURF_BANDS = Array.from({ length: 18 }, (_, i) => {
  const vp = [800, -700] as const, top = (bx: number) => vp[0] + (bx - vp[0]) * (0 - vp[1]) / (900 - vp[1]);
  const b0 = -1900 + i * 300, b1 = b0 + 300;
  return join([[top(b0), 0], [top(b1), 0], [b1, 900], [b0, 900]]);
}).filter((_, i) => i % 2 === 0);

export function RevealGround() {
  return <div className="reveal-ground" aria-hidden="true" style={{ '--turf': `url("${asset('/assets/rs-turf.webp')}")` } as CSSProperties}>
    <i className="rg-turf"><svg viewBox="0 0 1600 900" preserveAspectRatio="none">{TURF_BANDS.map(p => <polygon key={p} points={p}/>)}</svg></i>
    <div className="rg-boards">{Array.from({ length: 9 }, (_, i) => <span key={i}>The Club is Yours</span>)}</div>
    {['l1', 'l2', 'r1', 'r2'].map(k => <i key={k} className={`rg-truss rg-truss-${k}`}><b/><s/><s/></i>)}
  </div>;
}

// Máy phun hai bên màn LED (thẻ chính từ 1M lửa thường, từ 100M lửa bạc, từ 1B lửa tím): phía ngoài là máy phun lửa (luồng lửa như trong hầm, phun thẳng lên),
// phía trong là máy phun tia (như lúc đập thẻ thành công). Nằm trong khung màn LED nên cỡ theo chiều cao màn (cqh); chỉ hoạt cảnh transform / opacity.
// Hoạt cảnh chạy bằng Web Animations API, không dùng @keyframes CSS: CSS animation phát sự kiện animationiteration mỗi vòng lặp
// (React nghe ở gốc), hơn trăm tia chu kỳ ngắn khiến luồng chính phải dựng khung và tính lại style gần như mỗi khung hình.
const FLAME_CYCLE = 700, SMOKE_CYCLE = 1600;
const PUFFS = Array.from({ length: 26 }, (_, i) => ({ s: 40 + (i * 37) % 30, delay: -i * FLAME_CYCLE / 26, alt: i % 3 === 1 }));
const SMOKES = Array.from({ length: 4 }, (_, i) => ({ delay: -i * SMOKE_CYCLE / 4 }));
const SPARKS = Array.from({ length: 40 }, (_, i) => ({ a: -8 + (i * 29) % 11, h: 40 + (i * 41) % 60, t: 800 + (i * 17) % 7 * 100, delay: -(i * 47) % 1400, s: 14 + (i * 23) % 26 }));
// Cột lửa đứng: cụm lửa bay gần đều (chỉ chậm dần nhẹ) để chân cột dày như ngọn, không đứt khúc giữa lõi sáng và đám lửa.
const PUFF_EASE = 'cubic-bezier(.3,.4,.5,1)', SPARK_EASE = 'cubic-bezier(.2,.6,.5,1)';

function startJets(root: HTMLElement) {
  const loop = (el: Element | null | undefined, keyframes: Keyframe[], duration: number, delay = 0, alternate = false, easing = 'linear') =>
    el?.animate(keyframes, { duration, delay, easing, iterations: Infinity, direction: alternate ? 'alternate' : 'normal' });
  const running: (Animation | undefined)[] = [];
  root.querySelectorAll('.rj-flame').forEach(jet => {
    running.push(loop(jet.querySelector('.pf-glow'), [{ opacity: .72 }, { opacity: 1 }], 120, 0, true, 'ease-in-out'));
    running.push(loop(jet.querySelector('.pf-core'), [{ transform: 'scaleX(.88) scaleY(.9)', opacity: .6 }, { transform: 'scaleX(1.06) scaleY(1.08)', opacity: .78 }], 90, 0, true, 'ease-in-out'));
    // Cụm lửa bay dọc trục phun một đoạn bằng 0,8 chiều dài khung; tính theo % cỡ chính cụm lửa để không phụ thuộc kích thước màn.
    jet.querySelectorAll('i').forEach((puff, i) => {
      const { s, delay, alt } = PUFFS[i], dist = 152 / s * 100;
      running.push(loop(puff, [
        { offset: 0, opacity: .85, transform: 'translate(0,0) scale(.32) rotate(0deg)', easing: PUFF_EASE },
        { offset: .1, opacity: 1, easing: PUFF_EASE }, { offset: .5, opacity: .9, easing: PUFF_EASE }, { offset: .82, opacity: .35, easing: PUFF_EASE },
        { offset: 1, opacity: 0, transform: alt ? `translate(${dist}%,${-dist * .12}%) scale(.95) rotate(-40deg)` : `translate(${dist}%,${-dist * .08}%) scale(.85) rotate(45deg)` },
      ], FLAME_CYCLE, delay));
    });
    jet.querySelectorAll('s').forEach((smoke, i) => running.push(loop(smoke, [
      { offset: 0, opacity: 0, transform: 'translate(0,0) scale(.5)' }, { offset: .25, opacity: .2 }, { offset: 1, opacity: 0, transform: 'translate(30%,-75%) scale(1.6)' },
    ], SMOKE_CYCLE, SMOKES[i].delay, false, 'ease-out')));
  });
  root.querySelectorAll('.rj-spark').forEach(fountain => {
    running.push(loop(fountain.querySelector('b'), [{ transform: 'scaleY(.9)', opacity: .8 }, { transform: 'scaleY(1.06)', opacity: 1 }], 140, 0, true, 'ease-in-out'));
    // Mỗi tia là một khung cao đúng quãng bay (vệt sáng vẽ ở đáy khung): bay lên -100% chiều cao chính nó.
    fountain.querySelectorAll('i').forEach((spark, i) => {
      const { a, t, delay } = SPARKS[i];
      running.push(loop(spark, [
        { offset: 0, opacity: 1, transform: `rotate(${a}deg) translateY(0%)`, easing: SPARK_EASE }, { offset: .7, opacity: .9, easing: SPARK_EASE },
        { offset: 1, opacity: 0, transform: `rotate(${a}deg) translateY(-100%)` },
      ], t, delay));
    });
  });
  return () => running.forEach(animation => animation?.cancel());
}

export function RevealJets({ tone }: { tone: FlameTone }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current && !matchMedia('(prefers-reduced-motion: reduce)').matches ? startJets(root.current) : undefined, []);
  return <div ref={root} className={`reveal-jets pack-flames is-on tone-${tone}`} aria-hidden="true">
    {(['left', 'right'] as const).map(side => <div key={`flame-${side}`} className={`pf-jet rj-flame ${side}`}>
      <b className="pf-glow"/><b className="pf-core"/>
      {PUFFS.map((puff, i) => <i key={i} style={{ '--s': puff.s } as CSSProperties}/>)}
      {SMOKES.map((_, i) => <s key={i}/>)}
    </div>)}
    {(['left', 'right'] as const).map(side => <div key={`spark-${side}`} className={`rj-spark ${side}`}><b/>
      {SPARKS.map((spark, i) => <i key={i} style={{ '--h': `${spark.h}cqh`, '--s': `${spark.s}px` } as CSSProperties}/>)}
    </div>)}
  </div>;
}
