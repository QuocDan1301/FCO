// Hiệu ứng click chuột "điện tử" (người dùng yêu cầu 2026-11-12): mỗi lần bấm / chạm bật ra vòng neon, vài tia sét ngắn toả ra
// và hạt điện, ~0,5 giây rồi tự gỡ. Màu mặc định xanh điện; Premium / Luxury đang bật con trỏ hiệu ứng thì theo màu hiệu ứng.
// Tắt khi bật "Giảm chuyển động" (cài đặt game) hoặc máy đặt prefers-reduced-motion. Chỉ dùng DOM + CSS (click-fx.css), không vẽ lại React.
// CSS: click-fx.css (App.tsx import, để test Node không phải đọc CSS).

export type ClickColors = [string, string, string];
export const ELECTRIC: ClickColors = ['#f2feff', '#3de0ff', '#2f6bff'];
const MAX_ACTIVE = 6;
const LIFE_MS = 560;
const NS = 'http://www.w3.org/2000/svg';

// Tia sét: đường gấp khúc từ gần tâm ra ngoài theo một góc, lệch ngang ngẫu nhiên ở mỗi đoạn.
export function boltPoints(angle: number, rand: () => number, from = 9, to = 34, steps = 4) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const r = from + (to - from) * i / steps, jitter = i === 0 || i === steps ? 0 : (rand() - .5) * 9;
    const a = angle + jitter / Math.max(r, 1);
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function burst(x: number, y: number, colors: ClickColors, layer: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'click-fx';
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.style.setProperty('--c1', colors[0]); el.style.setProperty('--c2', colors[1]); el.style.setProperty('--c3', colors[2]);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
  const start = Math.random() * Math.PI * 2, count = 5;
  for (let i = 0; i < count; i++) {
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', boltPoints(start + i * Math.PI * 2 / count + (Math.random() - .5) * .5, Math.random));
    line.setAttribute('class', 'click-fx-bolt');
    line.style.animationDelay = `${i * 18}ms`;
    svg.appendChild(line);
  }
  el.appendChild(svg);
  for (const cls of ['click-fx-ring', 'click-fx-ring is-outer', 'click-fx-core']) { const s = document.createElement('i'); s.className = cls; el.appendChild(s); }
  for (let i = 0; i < 6; i++) {
    const p = document.createElement('b');
    const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 20;
    p.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`); p.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`);
    el.appendChild(p);
  }
  layer.appendChild(el);
  window.setTimeout(() => el.remove(), LIFE_MS);
}

// Gắn hiệu ứng cho toàn trang; trả hàm gỡ. colors / enabled đọc lại mỗi lần bấm (đổi hiệu ứng, bật giảm chuyển động có tác dụng ngay).
export function installClickFx(colors: () => ClickColors, enabled: () => boolean) {
  if (typeof document === 'undefined') return () => {};
  const layer = document.createElement('div');
  layer.className = 'click-fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0 || !enabled() || reduce?.matches) return;
    if (layer.childElementCount >= MAX_ACTIVE) layer.firstElementChild?.remove();
    burst(e.clientX, e.clientY, colors(), layer);
  };
  document.addEventListener('pointerdown', down, { capture: true, passive: true });
  return () => { document.removeEventListener('pointerdown', down, { capture: true }); layer.remove(); };
}
