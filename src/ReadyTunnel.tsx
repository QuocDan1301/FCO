import { useLayoutEffect, useRef } from 'react';
import { asset } from './asset';

type Point = [number, number];
// Bố cục đường hầm theo phần trăm khung (SVG viewBox 0–100 kéo giãn theo khung). Khung vòm loe nhẹ từ trên xuống (góc máy rộng):
// OPEN là lòng khung (mép trong viền đen = mép ngoài dải băng màn LED); hai màn LED chạy thẳng từ lòng khung vào đúng 4 góc khung cửa xa.
const OPEN: Point[] = [[9.5, 13], [90.5, 13], [92.5, 84], [7.5, 84]];
const BEZEL = 3.2;
const DOOR = { x0: 39, x1: 61, y0: 36, y1: 68 }, INNER = { x0: 41.4, x1: 58.6, y0: 38.5, y1: 68 };
const join = (list: Point[]) => list.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' ');
const mirror = ([x, y]: Point): Point => [100 - x, y];
const CEILING: Point[] = [OPEN[0], OPEN[1], [DOOR.x1, DOOR.y0], [DOOR.x0, DOOR.y0]];
// Đường chân màn LED (nối góc dưới khung cửa với góc dưới mép ngoài màn) kéo dài ra mép khung: vạch neon sàn nằm đúng trên đường này.
const baseAt = (x: number): number => DOOR.y1 + (OPEN[3][1] - DOOR.y1) * (DOOR.x0 - x) / (DOOR.x0 - OPEN[3][0]);
const BASE_EDGE: Point = [0, baseAt(0)];
const FLOOR: Point[] = [OPEN[3], [DOOR.x0, DOOR.y1], [DOOR.x1, DOOR.y1], OPEN[2], mirror(BASE_EDGE), [100, 100], [0, 100], BASE_EDGE];
// Viền đen dày hình chữ U ngược: bao mép trên và hai mép ngoài màn LED, chân cột cắt chéo ngay tại góc dưới màn.
const BEZEL_SHAPE: Point[] = [[OPEN[3][0] - BEZEL - .8, OPEN[3][1] + 2.4], [OPEN[0][0] - BEZEL, OPEN[0][1] - BEZEL - .3], [OPEN[1][0] + BEZEL, OPEN[1][1] - BEZEL - .3], [OPEN[2][0] + BEZEL + .8, OPEN[2][1] + 2.4], OPEN[2], OPEN[1], OPEN[0], OPEN[3]];

// Lưới trần theo phối cảnh: đường dọc nối mép trước với mép khung cửa, đường ngang dày dần về phía sâu.
const CEIL_LONG = Array.from({ length: 11 }, (_, i) => i / 10).map(u => join([[OPEN[0][0] + (OPEN[1][0] - OPEN[0][0]) * u, OPEN[0][1]], [DOOR.x0 + (DOOR.x1 - DOOR.x0) * u, DOOR.y0]]));
const CEIL_CROSS = [.26, .45, .6, .71, .8, .87, .92, .96].map(f => {
  const y = OPEN[0][1] + (DOOR.y0 - OPEN[0][1]) * f, x = OPEN[0][0] + (DOOR.x0 - OPEN[0][0]) * f;
  return join([[x, y], [100 - x, y]]);
});
// Lòng hầm sau gói thẻ: vách trong ánh vàng hổ phách hội tụ về khung xa, các khung dầm tối thu nhỏ dần.
const FAR = { x0: 46.6, x1: 53.4, y0: 46.5, y1: 57.5 };
const INNER_WALL_L: Point[] = [[INNER.x0, INNER.y0], [FAR.x0, FAR.y0], [FAR.x0, FAR.y1], [INNER.x0, INNER.y1]];
const DEPTH_FRAMES = [.72, .45].map(t => ({ t, x0: INNER.x0 + (FAR.x0 - INNER.x0) * t, x1: INNER.x1 + (FAR.x1 - INNER.x1) * t, y0: INNER.y0 + (FAR.y0 - INNER.y0) * t, y1: INNER.y1 + (FAR.y1 - INNER.y1) * t }));

// Màn LED vẽ bằng HTML trong hệ toạ độ riêng SCREEN_W × SCREEN_H rồi chiếu phối cảnh (matrix3d) lên đúng tứ giác mặt vách,
// nên nền, lưới, logo, chữ đều nằm phẳng trên vách (vòng tròn thành elip đứng, chữ co dần vào sâu). SCREEN_W lớn = vách sâu, co hẹp mạnh.
// Toạ độ x của mỗi màn: trái = mép ngoài → cửa; phải = cửa → mép ngoài (chữ không bị lật gương).
const SCREEN_W = 2600, SCREEN_H = 900;
const SCREEN_QUADS: Point[][] = [
  [OPEN[0], [DOOR.x0, DOOR.y0], [DOOR.x0, DOOR.y1], OPEN[3]],
  [[DOOR.x1, DOOR.y0], OPEN[1], OPEN[2], [DOOR.x1, DOOR.y1]],
];
// Phép chiếu biến hình chữ nhật w × h thành tứ giác q (thứ tự: trên-trái, trên-phải, dưới-phải, dưới-trái), theo Heckbert.
function quadTransform(w: number, h: number, q: Point[]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`;
}
// Họa tiết màn: 3 vệt sáng mũi tên lớn ở vùng sáng mép ngoài; một đường mũi tên mảnh sát mép trên / dưới hướng vào hầm; hai tam giác nhỏ.
const ARROW_Y = [.075, .925], CHEVRONS = [.42, .6];
function ScreenMarks({ side }: { side: 'left' | 'right' }) {
  const X = (u: number) => side === 'left' ? u * SCREEN_W : (1 - u) * SCREEN_W, dir = side === 'left' ? 1 : -1, Y = (v: number) => v * SCREEN_H;
  return <svg className="rt-screen-marks" viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`} aria-hidden="true">
    {[.05, .12, .19].map(u => <polyline key={u} className="rt-band-light" points={`${X(u)},${Y(-.08)} ${X(u + .09)},${Y(.5)} ${X(u)},${Y(1.08)}`}/>)}
    {ARROW_Y.map(v => <g key={v}>
      <polyline points={`${X(.06)},${Y(v)} ${X(.96)},${Y(v)}`}/>
      {CHEVRONS.map(u => <polyline key={u} className="rt-chevron" points={`${X(u) - dir * 30},${Y(v) - 26} ${X(u)},${Y(v)} ${X(u) - dir * 30},${Y(v) + 26}`}/>)}
    </g>)}
    {[[.3, .25], [.66, .74]].map(([u, v]) => <polygon key={u} points={`${X(u)},${Y(v) - 13} ${X(u) + dir * 22},${Y(v)} ${X(u)},${Y(v) + 13}`}/>)}
  </svg>;
}
const BAND_PHRASE = [0, 1, 2];

// Không gian đường hầm của màn chuẩn bị mở gói: mặt ngoài bê tông xám tối (nền .ready-tunnel), khung vòm đen dày, trần đen lưới phối cảnh,
// sàn xám xanh có vệt phản chiếu, lòng hầm sâu ánh hổ phách sau gói thẻ, neon xanh lá phát sáng và hai màn LED dọc vách.
export default function ReadyTunnel({ gateLight }: { gateLight: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const screens = [...el.querySelectorAll<HTMLElement>('.rt-screen')];
    const place = () => {
      const w = el.clientWidth, h = el.clientHeight;
      screens.forEach((screen, i) => { screen.style.transform = quadTransform(SCREEN_W, SCREEN_H, SCREEN_QUADS[i].map(([x, y]) => [x / 100 * w, y / 100 * h])); });
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const concrete = asset('/assets/rt-concrete.webp'), logo = asset('/assets/fco-vip-opening-logo.png');
  return <div className="ready-tunnel" ref={root} aria-hidden="true">
    <svg className="rt-shell" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rtCeil" x1="0" y1={OPEN[0][1]} x2="0" y2={DOOR.y0} gradientUnits="userSpaceOnUse"><stop stopColor="#0b2f29"/><stop offset=".45" stopColor="#06120f"/><stop offset="1" stopColor="#020304"/></linearGradient>
        <linearGradient id="rtSpillL" x1={OPEN[0][0]} x2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#00e5a3" stopOpacity=".3"/><stop offset="1" stopColor="#00e5a3" stopOpacity="0"/></linearGradient>
        <linearGradient id="rtSpillR" x1={OPEN[1][0]} x2="68" gradientUnits="userSpaceOnUse"><stop stopColor="#00e5a3" stopOpacity=".3"/><stop offset="1" stopColor="#00e5a3" stopOpacity="0"/></linearGradient>
        {/* Sàn xám xanh lạnh: sáng ở giữa lối đi, tối dần ra rìa; vệt phản chiếu trắng xanh mờ dọc lối đi. */}
        <linearGradient id="rtFloorEdge" x1="0" x2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#12161b"/><stop offset=".3" stopColor="#1f262e"/><stop offset=".5" stopColor="#2b333e"/><stop offset=".7" stopColor="#1f262e"/><stop offset="1" stopColor="#12161b"/></linearGradient>
        <linearGradient id="rtFloorDepth" x1="0" y1={DOOR.y1} x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#0b0e11" stopOpacity=".65"/><stop offset=".5" stopColor="#0b0e11" stopOpacity=".15"/><stop offset="1" stopColor="#0b0e11" stopOpacity=".35"/></linearGradient>
        <radialGradient id="rtSpecular" cx="50" cy="82" r="1" gradientTransform="translate(50 82) scale(13 13) translate(-50 -82)" gradientUnits="userSpaceOnUse"><stop stopColor="#e3f1ff" stopOpacity=".2"/><stop offset=".55" stopColor="#b9d3ea" stopOpacity=".07"/><stop offset="1" stopColor="#b9d3ea" stopOpacity="0"/></radialGradient>
        <linearGradient id="rtDoor" x2="0" y2="1"><stop stopColor="#0a0b0c"/><stop offset=".55" stopColor="#121314"/><stop offset="1" stopColor="#1e1f20"/></linearGradient>
        <linearGradient id="rtAmberL" x1={INNER.x0} x2={FAR.x0} gradientUnits="userSpaceOnUse"><stop stopColor="#c08a52" stopOpacity=".28"/><stop offset=".6" stopColor="#7d6046" stopOpacity=".12"/><stop offset="1" stopColor="#3a2a1a" stopOpacity=".05"/></linearGradient>
        <linearGradient id="rtAmberR" x1={INNER.x1} x2={FAR.x1} gradientUnits="userSpaceOnUse"><stop stopColor="#c08a52" stopOpacity=".28"/><stop offset=".6" stopColor="#7d6046" stopOpacity=".12"/><stop offset="1" stopColor="#3a2a1a" stopOpacity=".05"/></linearGradient>
        <linearGradient id="rtBezel" x2="0" y2="1"><stop stopColor="#141619"/><stop offset=".5" stopColor="#0b0c0e"/><stop offset="1" stopColor="#070809"/></linearGradient>
        <linearGradient id="rtWash" x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#dfe6ee" stopOpacity=".2"/><stop offset=".45" stopColor="#dfe6ee" stopOpacity=".07"/><stop offset="1" stopColor="#dfe6ee" stopOpacity="0"/></linearGradient>
        <pattern id="rtFloorTex" patternUnits="userSpaceOnUse" width="14" height="14"><image href={concrete} width="14" height="14" preserveAspectRatio="none"/></pattern>
      </defs>
      {/* Ánh sáng hắt dọc tự nhiên trên mảng tường bê tông hai bên khung vòm. */}
      <polygon points={join([[0, 0], [BEZEL_SHAPE[1][0], 0], BEZEL_SHAPE[0], BASE_EDGE])} fill="url(#rtWash)"/>
      <polygon points={join([[100, 0], [BEZEL_SHAPE[2][0], 0], BEZEL_SHAPE[3], mirror(BASE_EDGE)])} fill="url(#rtWash)"/>
      {/* Trần: đen, lưới hội tụ, hơi xanh ở mép ngoài; ánh xanh hắt từ mép trên hai màn LED. */}
      <polygon points={join(CEILING)} fill="url(#rtCeil)"/>
      <g className="rt-ceil-grid">{CEIL_LONG.map(p => <polyline key={p} points={p}/>)}{CEIL_CROSS.map(p => <polyline key={p} points={p}/>)}</g>
      <g opacity=".6"><polygon points={join(CEILING)} fill="url(#rtSpillL)"/><polygon points={join(CEILING)} fill="url(#rtSpillR)"/></g>
      {/* Sàn xám xanh bê tông. */}
      <polygon points={join(FLOOR)} fill="url(#rtFloorEdge)"/>
      <polygon points={join(FLOOR)} fill="url(#rtFloorTex)" opacity=".22"/>
      <polygon points={join(FLOOR)} fill="url(#rtFloorDepth)"/>
      <polygon points={join(FLOOR)} fill="url(#rtSpecular)"/>
      {/* Chân đế đèn sân khấu (khối hộp thấp) sát mép dưới hai góc. */}
      {[[.6, 7.4], [92.6, 99.4]].map(([x0, x1]) => <g key={x0} className="rt-stand">
        <polygon className="rt-stand-top" points={join([[x0 + .5, 93.6], [x1 - .5, 93.6], [x1, 95.2], [x0, 95.2]])}/>
        <polygon points={join([[x0, 95.2], [x1, 95.2], [x1, 100], [x0, 100]])}/>
      </g>)}
      {/* Khung cửa xa và lòng hầm sâu sau gói thẻ (vách trong ánh hổ phách, khung dầm tối thu nhỏ dần). */}
      <rect x={DOOR.x0} y={DOOR.y0} width={DOOR.x1 - DOOR.x0} height={DOOR.y1 - DOOR.y0} fill="#090a0b"/>
      <rect x={INNER.x0} y={INNER.y0} width={INNER.x1 - INNER.x0} height={INNER.y1 - INNER.y0} fill="url(#rtDoor)"/>
      <polygon points={join(INNER_WALL_L)} fill="url(#rtAmberL)"/>
      <polygon points={join(INNER_WALL_L.map(mirror))} fill="url(#rtAmberR)"/>
      <rect x={FAR.x0} y={FAR.y0} width={FAR.x1 - FAR.x0} height={FAR.y1 - FAR.y0} fill="#2a2620" opacity=".7"/>
      <g className="rt-depth">
        {DEPTH_FRAMES.map(f => <g key={f.t}>
          <rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} style={{ strokeWidth: `${(1.5 + 4 * (1 - f.t)).toFixed(1)}px` }}/>
          <polyline className="rt-depth-light" points={join([[50 - (f.x1 - f.x0) * .2, f.y0 + .6], [50 + (f.x1 - f.x0) * .2, f.y0 + .6]])}/>
        </g>)}
      </g>
      {/* Khung vòm đen dày hình chữ U ngược. */}
      <polygon className="rt-bezel" points={join(BEZEL_SHAPE)} fill="url(#rtBezel)"/>
    </svg>
    {(['left', 'right'] as const).map(side => <div key={side} className={`rt-screen rt-screen-${side}`}>
      <ScreenMarks side={side}/>
      <div className="rt-screen-logo"><span className="rt-led-mark"><img src={logo} alt=""/></span><b>FCO VIP</b></div>
      <div className="rt-band"><span>{BAND_PHRASE.map(i => <i key={i}>The Club is Yours<em>▸</em><img src={logo} alt=""/>FCO VIP</i>)}</span></div>
    </div>)}
    {/* Neon xanh lá phát sáng (lớp trên cùng để không bị màn LED che): mép ngoài dải băng + thanh ngang trên trần, khung cửa xa, hai vạch dọc chân màn LED. */}
    <svg className="rt-shell rt-neon-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
      <g className="rt-neon">
        <polyline points={join([OPEN[3], OPEN[0], OPEN[1], OPEN[2]])}/>
        <rect x={DOOR.x0} y={DOOR.y0} width={DOOR.x1 - DOOR.x0} height={DOOR.y1 - DOOR.y0}/>
        <polyline points={join([[DOOR.x0, DOOR.y1], BASE_EDGE])}/><polyline points={join([[DOOR.x1, DOOR.y1], mirror(BASE_EDGE)])}/>
      </g>
    </svg>
    {gateLight && <span className="rt-gate-light"/>}
  </div>;
}
