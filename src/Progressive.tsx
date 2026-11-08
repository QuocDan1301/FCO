import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Danh sách dài (kho 150 thẻ): khung hình đầu chỉ dựng `first` dòng (đủ phủ màn hình) để bấm chuyển trang hiện ngay,
// các dòng còn lại thêm dần mỗi khung hình sau. Số dòng đã dựng chỉ tăng, nên lọc/sắp xếp lại không dựng lại từ đầu.
export default function Progressive({ items, first = 24, step = 48 }: { items: ReactNode[]; first?: number; step?: number }) {
  const [count, setCount] = useState(first);
  const total = items.length;
  useEffect(() => {
    if (count >= total) return;
    const frame = requestAnimationFrame(() => setCount(c => c + step));
    return () => cancelAnimationFrame(frame);
  }, [count, total, step]);
  return <>{count >= total ? items : items.slice(0, count)}</>;
}