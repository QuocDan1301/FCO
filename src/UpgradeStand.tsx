// Khán đài phía trên sân khấu đập thẻ (người dùng 2026-11-17): hai tầng ghế xanh có bậc, lối đi, lan can và mái tối;
// vẽ SVG tĩnh (mỗi hàng ghế là một pattern nên chỉ vài chục phần tử). Nằm trong .uc-crowd, sau tường và vạch đỏ.
const W = 2600, H = 1000;
type Row = { y: number; h: number; seat: number };
// Hàng ghế xa (trên) nhỏ, gần (dưới) to dần như phối cảnh.
function rows(top: number, bottom: number, count: number, h0: number, h1: number): Row[] {
  const out: Row[] = []; let y = top;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0, h = h0 + (h1 - h0) * t;
    out.push({ y, h, seat: h * 1.15 }); y += h;
    if (y > bottom) break;
  }
  return out;
}
const upper = rows(110, 430, 11, 20, 34);
const lower = rows(482, 900, 10, 34, 50);
const all = [...upper, ...lower];
// Lối đi bậc thang: dải tối hơi nghiêng về giữa (phối cảnh), cắt ngang các hàng ghế.
const aisles = [-0.82, -0.55, -0.28, 0, 0.28, 0.55, 0.82].map(k => W / 2 + k * W / 2);

export const UPGRADE_STAND = <svg className="uc-stand" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
  <defs>
    {all.map((r, i) => <pattern key={i} id={`ucs-${i}`} width={r.seat} height={r.h} patternUnits="userSpaceOnUse" y={r.y}>
      <rect width={r.seat} height={r.h} fill="#06140c"/>
      {/* lưng ghế + mặt ghế */}
      <rect x={r.seat * .1} y={r.h * .12} width={r.seat * .8} height={r.h * .5} rx={r.h * .12} fill="#1c6a3c"/>
      <rect x={r.seat * .1} y={r.h * .12} width={r.seat * .8} height={r.h * .12} rx={r.h * .06} fill="#3fa266"/>
      <rect x={r.seat * .06} y={r.h * .6} width={r.seat * .88} height={r.h * .22} rx={r.h * .06} fill="#145030"/>
    </pattern>)}
    <linearGradient id="ucs-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#020407" stopOpacity=".85"/><stop offset=".25" stopColor="#020407" stopOpacity=".5"/>
      <stop offset=".7" stopColor="#020407" stopOpacity=".2"/><stop offset="1" stopColor="#020407" stopOpacity=".35"/>
    </linearGradient>
    <radialGradient id="ucs-spot" cx=".5" cy=".55" r=".45"><stop offset="0" stopColor="#9fe0b8" stopOpacity=".18"/><stop offset="1" stopColor="#9fe0b8" stopOpacity="0"/></radialGradient>
  </defs>
  {/* mái + kết cấu */}
  <rect width={W} height="110" fill="#05080d"/>
  {Array.from({ length: 27 }, (_, i) => <path key={i} d={`M${i * 100} 0 L${i * 100 + 30} 110`} stroke="#121a24" strokeWidth="6"/>)}
  <rect y="96" width={W} height="14" fill="#10161e"/>
  {/* hàng ghế */}
  {all.map((r, i) => <rect key={i} y={r.y} width={W} height={r.h} fill={`url(#ucs-${i})`}/>)}
  {/* hành lang giữa hai tầng + lan can */}
  <rect y="430" width={W} height="52" fill="#0b1015"/>
  <rect y="430" width={W} height="6" fill="#2b333c"/>
  <rect y="474" width={W} height="8" fill="#3a4450"/>
  {Array.from({ length: 52 }, (_, i) => <rect key={i} x={i * 50 + 10} y="436" width="5" height="38" fill="#1d252e"/>)}
  {/* lối đi bậc thang */}
  {aisles.map((x, i) => <g key={i}>
    <path d={`M${x - 16} 110 L${x + 16} 110 L${x + 28 + (x - W / 2) * .05} 430 L${x - 28 + (x - W / 2) * .05} 430 Z`} fill="#0d1318"/>
    <path d={`M${x - 30 + (x - W / 2) * .06} 482 L${x + 30 + (x - W / 2) * .06} 482 L${x + 52 + (x - W / 2) * .14} 900 L${x - 52 + (x - W / 2) * .14} 900 Z`} fill="#0d1318"/>
  </g>)}
  {/* lan can trước + bóng tối phối cảnh */}
  <rect y="900" width={W} height="10" fill="#4a5560"/><rect y="910" width={W} height="16" fill="#7a1c22"/>
  <rect y="926" width={W} height={H - 926} fill="#05080c"/>
  <rect width={W} height={H} fill="url(#ucs-spot)"/>
  <rect width={W} height={H} fill="url(#ucs-shade)"/>
</svg>;
