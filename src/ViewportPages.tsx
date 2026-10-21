import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

export function usePageCapacity(ref: RefObject<HTMLDivElement | null>, itemWidth = 10000, itemHeight = 80, gap = 0) {
  const [size, setSize] = useState({ columns: 1, rows: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const style = getComputedStyle(element);
      const width = parseFloat(style.getPropertyValue('--page-item-width')) || itemWidth;
      const height = parseFloat(style.getPropertyValue('--page-item-height')) || itemHeight;
      const columns = Math.max(1, Math.floor((element.clientWidth + gap) / (width + gap)));
      const rows = Math.max(1, Math.floor((element.clientHeight + gap) / (height + gap)));
      setSize(previous => previous.columns === columns && previous.rows === rows ? previous : { columns, rows });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  });
  return { ...size, capacity: size.columns * size.rows };
}

export default function ViewportPages({ children, className = '', itemWidth = 10000, itemHeight = 80, gap = 0, resetKey = '' }: {
  children: ReactNode; className?: string; itemWidth?: number; itemHeight?: number; gap?: number; resetKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { columns, rows, capacity } = usePageCapacity(ref, itemWidth, itemHeight, gap);
  const items = Children.toArray(children);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const current = Math.min(page, pages - 1);
  return <div className={`viewport-pages ${className}`}>
    <div ref={ref} className="viewport-page-items" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gap }}>
      {items.slice(current * capacity, (current + 1) * capacity)}
    </div>
    <nav className="viewport-pagination" aria-label="Phân trang">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>Trước</button>
      <span role="status">Trang {current + 1} / {pages}</span>
      <button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Sau</button>
    </nav>
  </div>;
}
