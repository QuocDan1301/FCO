import type { CSSProperties, RefObject } from 'react';
import './pack-flames.css';

import type { FlamePlacement, FlameTone } from './flames';

const PUFFS = 16, SMOKE = 5, CYCLE = .7, SMOKE_CYCLE = 1.6;

// Hai máy phun lửa ở hai góc dưới, phun chéo lên vào giữa hầm. Cụm lửa/khói là ảnh vẽ sẵn, chỉ hoạt cảnh transform/opacity;
// gắn sẵn từ đầu lượt mở (độ trễ âm để luồng lửa đầy ngay khi bật), chỉ bật/tắt bằng opacity của khung.
export default function PackFlames({ tone, active, rootRef }: { tone: FlameTone; active: boolean; rootRef?: RefObject<HTMLDivElement | null> }) {
  return <div ref={rootRef} className={`pack-flames tone-${tone}${active ? ' is-on' : ''}`} aria-hidden="true">
    {(['left', 'right'] as const).map(side => <div key={side} className={`pf-jet ${side}`}>
      <b className="pf-glow"/><b className="pf-core"/>
      {Array.from({ length: PUFFS }, (_, i) => <i key={i} style={{ '--d': `${(-i * CYCLE / PUFFS).toFixed(3)}s`, '--s': 50 + (i * 37) % 28 } as CSSProperties}/>)}
      {Array.from({ length: SMOKE }, (_, i) => <s key={i} style={{ '--d': `${(-i * SMOKE_CYCLE / SMOKE).toFixed(2)}s` } as CSSProperties}/>)}
    </div>)}
  </div>;
}

// Cảnh (3D hoặc LightTunnel) gọi mỗi khung hình: đặt miệng phun của từng máy tại toạ độ màn hình đã chiếu từ vị trí ghim trên sàn hầm,
// phóng to/thu nhỏ theo khoảng cách (máy phải lật gương). Chỉ đổi transform/opacity của hai khung máy (lớp riêng) nên không vẽ lại.
export function placeFlames(root: HTMLElement | null | undefined, left: FlamePlacement, right: FlamePlacement) {
  if (!root) return;
  [left, right].forEach((place, i) => {
    const jet = root.children[i] as HTMLElement | undefined;
    if (!jet) return;
    if (!place) { if (jet.style.opacity !== '0') jet.style.opacity = '0'; return; }
    // Máy đã sát camera (lửa phóng to quá cỡ) thì mờ dần thay vì phủ kín màn hình lúc lướt qua.
    jet.style.opacity = Math.min(1, Math.max(0, 1 - (place.k - 2) / 1.6)).toFixed(2);
    jet.style.transform = `translate(${place.x.toFixed(1)}px,${place.y.toFixed(1)}px) scale(${(i ? -place.k : place.k).toFixed(3)},${place.k.toFixed(3)}) rotate(-50deg)`;
  });
}
