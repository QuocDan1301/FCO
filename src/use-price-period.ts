import { useEffect, useState } from 'react';
import { marketNow, nextPriceChange, pricePeriod } from './market';

// Kỳ giá hiện tại; đổi đúng lúc giá đổi để giao diện vẽ lại. Kiểm tra ít nhất mỗi phút vì đồng hồ máy chủ có thể cập nhật giữa chừng.
export function usePricePeriod() {
  const [period, setPeriod] = useState(() => pricePeriod());
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => { setPeriod(pricePeriod()); arm(); }, Math.min(nextPriceChange() - marketNow() + 50, 60_000));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);
  return period;
}
