import type { CSSProperties } from 'react';
import './tunnel.css';

export const PACK_REVEAL_TIMES = {
  rare: [1400, 2600, 3800, 5000, 6500],
  standard: [650, 1300, 1950, 2550, 3250],
} as const;

/** Cảnh 3D bằng các mặt phẳng CSS, không tải mô hình hoặc phụ thuộc WebGL. */
export default function TunnelScene({ phase, rare, reduced }: { phase: number; rare: boolean; reduced: boolean }) {
  if (reduced) return null;
  const chapters = ['Bước vào đường hầm', 'Dấu ấn quốc gia', 'Màu áo danh tiếng', 'Vị trí của ngôi sao', rare ? 'Một huyền thoại đang đến' : 'Ngôi sao sắp xuất hiện'];
  return <div className={`tunnel-scene tunnel-phase-${phase} ${rare ? 'tunnel-rare' : 'tunnel-standard'} ${phase >= 3 ? 'gate-opening' : ''} ${phase >= 5 ? 'is-revealed' : ''}`} aria-hidden="true">
    <div className="tunnel-perspective">
      <div className="tunnel-world">
        <div className="tunnel-surface tunnel-wall wall-left"><i/><i/><i/></div>
        <div className="tunnel-surface tunnel-wall wall-right"><i/><i/><i/></div>
        <div className="tunnel-surface tunnel-ceiling"><i/><i/></div>
        <div className="tunnel-surface tunnel-floor"><div className="floor-center-line"/><div className="floor-reflection"/></div>
        {Array.from({ length: 12 }, (_, i) => <div className="tunnel-rib" key={i} style={{ '--depth': `${-i * 240}px`, '--rib-delay': `${-i * .16}s` } as CSSProperties}>
          <svg viewBox="0 0 900 600" preserveAspectRatio="none"><path className="rib-metal" d="M80 8H820L892 80V520L820 592H80L8 520V80Z"/><path className="rib-led" d="M90 18H810M20 100V490M880 100V490M90 582H810"/><path className="rib-corner" d="M22 80 82 22M818 22 878 80M22 520 82 578M818 578 878 520"/></svg>
          <span className="rib-light left"/><span className="rib-light right"/>
        </div>)}
        <div className="tunnel-exit"><div className="exit-aura"/><div className="exit-stadium"><span/><span/><span/></div><div className="exit-door door-left"><i/></div><div className="exit-door door-right"><i/></div><div className="exit-seam"/></div>
      </div>
    </div>
    <div className="tunnel-depth-shade"/>
    <div className="tunnel-air">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--air-x': `${(i * 37 + 7) % 100}%`, '--air-y': `${(i * 29 + 13) % 100}%`, '--air-delay': `${-i * .21}s`, '--air-angle': `${i * 47}deg` } as CSSProperties}/>)}</div>
    <div className="tunnel-smoke smoke-left"/><div className="tunnel-smoke smoke-right"/>
    <div className="tunnel-floor-bloom"/><div className="tunnel-lens-flare"/>
    <div className="tunnel-letterbox top"/><div className="tunnel-letterbox bottom"/>
    <div className="tunnel-chapter"><i/><span>{chapters[Math.min(phase, 4)]}</span><i/></div>
    <div className="tunnel-reveal-flash"/>
  </div>;
}
