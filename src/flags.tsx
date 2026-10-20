import type { ReactNode } from 'react';

// Cờ vẽ bằng SVG theo khung 30×20; đơn giản hóa quốc huy nhưng giữ đúng màu và bố cục.
const stripes = (colors: string[], vertical = false, weights = colors.map(() => 1)) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return colors.map((fill, i) => {
    const size = (vertical ? 30 : 20) * weights[i] / total;
    const rect = vertical ? <rect key={i} x={at} y={0} width={size + .05} height={20} fill={fill}/> : <rect key={i} x={0} y={at} width={30} height={size + .05} fill={fill}/>;
    at += size;
    return rect;
  });
};
const nordic = (bg: string, cross: string, inner?: string) => <>
  <rect width="30" height="20" fill={bg}/>
  <rect x="8" width="5" height="20" fill={cross}/><rect y="7.5" width="30" height="5" fill={cross}/>
  {inner && <><rect x="9.5" width="2" height="20" fill={inner}/><rect y="9" width="30" height="2" fill={inner}/></>}
</>;
const star = (cx: number, cy: number, r: number, fill: string) => {
  const points = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; const d = i % 2 ? r * .4 : r; return `${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`; }).join(' ');
  return <polygon points={points} fill={fill}/>;
};

const flags: Record<string, ReactNode> = {
  FR: stripes(['#002654', '#fff', '#ED2939'], true),
  IT: stripes(['#009246', '#fff', '#CE2B37'], true),
  BE: stripes(['#000', '#FDDA24', '#EF3340'], true),
  RO: stripes(['#002B7F', '#FCD116', '#CE1126'], true),
  IE: stripes(['#169B62', '#fff', '#FF883E'], true),
  CI: stripes(['#F77F00', '#fff', '#009E60'], true),
  DE: stripes(['#000', '#DD0000', '#FFCE00']),
  NL: stripes(['#AE1C28', '#fff', '#21468B']),
  HU: stripes(['#CE2939', '#fff', '#477050']),
  RU: stripes(['#fff', '#0039A6', '#D52B1E']),
  BG: stripes(['#fff', '#00966E', '#D62612']),
  UA: stripes(['#0057B7', '#FFD700']),
  RS: <>{stripes(['#C6363C', '#0C4076', '#fff'])}<path d="M7 4.5h4v5.5q0 3-2 4-2-1-2-4Z" fill="#C6363C" stroke="#EDB92E" strokeWidth=".5"/><path d="M8 7.5h2M9 6v4" stroke="#fff" strokeWidth=".7"/></>,
  HR: <>{stripes(['#FF0000', '#fff', '#171796'])}<path d="M12.5 5.5h5v5q0 3.2-2.5 4.3-2.5-1.1-2.5-4.3Z" fill="#fff" stroke="#171796" strokeWidth=".3"/>{Array.from({ length: 12 }, (_, i) => (Math.floor(i / 3) + i % 3) % 2 ? null : <rect key={i} x={12.5 + (i % 3) * 5 / 3} y={5.5 + Math.floor(i / 3) * 5 / 3 * .95} width={5 / 3} height={1.6} fill="#FF0000"/>)}</>,
  ES: <>{stripes(['#AA151B', '#F1BF00', '#AA151B'], false, [1, 2, 1])}<rect x="6.5" y="7.2" width="3.2" height="5.6" rx=".6" fill="#AA151B" stroke="#C8A53B" strokeWidth=".35"/></>,
  PT: <><rect width="30" height="20" fill="#FF0000"/><rect width="12" height="20" fill="#006600"/><circle cx="12" cy="10" r="4" fill="#FFE000"/><path d="M10 8h4v3.5q0 1.6-2 2.2-2-.6-2-2.2Z" fill="#fff" stroke="#FF0000" strokeWidth=".6"/></>,
  AR: <>{stripes(['#74ACDF', '#fff', '#74ACDF'])}<circle cx="15" cy="10" r="2" fill="#F6B40E"/><circle cx="15" cy="10" r="2.7" fill="none" stroke="#F6B40E" strokeWidth=".5" strokeDasharray=".6 .5"/></>,
  BR: <><rect width="30" height="20" fill="#009C3B"/><path d="M15 2.2 27.3 10 15 17.8 2.7 10Z" fill="#FFDF00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.2q4.6-1.6 8.8 1.5" stroke="#fff" strokeWidth=".7" fill="none"/></>,
  MX: <>{stripes(['#006847', '#fff', '#CE1126'], true)}<circle cx="15" cy="10" r="2.6" fill="#8C5A2B"/><path d="M12.8 12.2q2.2 1.3 4.4 0" stroke="#3E8E41" strokeWidth=".6" fill="none"/></>,
  CM: <>{stripes(['#007A5E', '#CE1126', '#FCD116'], true)}{star(15, 10, 3, '#FCD116')}</>,
  EG: <>{stripes(['#CE1126', '#fff', '#000'])}<path d="M15 7.6l1.6 1.2-.6 2.6h-2l-.6-2.6Z" fill="#C09300"/></>,
  VN: <><rect width="30" height="20" fill="#DA251D"/>{star(15, 10.3, 6, '#FFFF00')}</>,
  JP: <><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/></>,
  KR: <><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#0047A0"/><path d="M10.7 7.4a5 5 0 0 1 8.6 5.2 2.5 2.5 0 0 0-4.3-2.6 2.5 2.5 0 0 1-4.3-2.6Z" fill="#CD2E3A"/>
    <g stroke="#000" strokeWidth=".75">{[[5.3, 4.2, 35], [24.7, 15.8, 35], [24.7, 4.2, -35], [5.3, 15.8, -35]].map(([x, y, a], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}><path d="M-1.8-1.3h3.6M-1.8 0h3.6M-1.8 1.3h3.6"/></g>)}</g></>,
  SE: nordic('#006AA7', '#FECC00'),
  DK: nordic('#C8102E', '#fff'),
  NO: nordic('#BA0C2F', '#fff', '#00205B'),
  CZ: <><rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#D7141A"/><path d="M0 0 15 10 0 20Z" fill="#11457E"/></>,
  EN: <><rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#CE1124"/><rect y="8" width="30" height="4" fill="#CE1124"/></>,
  NI: <><rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#CE1124"/><rect y="8" width="30" height="4" fill="#CE1124"/>{star(15, 10, 3.2, '#fff')}<path d="M14.2 8.8h1.6v2.6h-1.6Z" fill="#CE1124"/></>,
  SC: <><rect width="30" height="20" fill="#005EB8"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="3.4"/></>,
  WL: <><rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#00AD36"/>
    <path d="M7 12.5q2-3.2 5-3l1.6-2.4 1 1.4 2-.6-.6 1.8q3.2.4 4.6 2.2l2.4-.6-1.2 1.6q1.2.8 1.4 2.4l-1.8-.6-1.6 1.6-.4-1.6-3 .2.6 1.8-2-.8-1.2 1.2-.6-1.8q-2.4-.2-3.6-1.6l-2 .4.8-1.6Z" fill="#D30731"/></>,
  GB: <><rect width="30" height="20" fill="#012169"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4"/><path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.4"/><path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6"/><path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.4"/></>,
};

export function Flag({ code, large = false }: { code: string; large?: boolean }) {
  return <svg className={`flag ${large ? 'large' : ''}`} viewBox="0 0 30 20" role="img" aria-label={code} preserveAspectRatio="none">
    {flags[code] ?? <rect width="30" height="20" fill="#53657b"/>}
  </svg>;
}
