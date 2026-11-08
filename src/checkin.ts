import type { EventReward } from './game';

// Điểm danh 7 ngày (cùng nút Nhận của Quà mỗi ngày, ngoài +1.000 FC): nhận liên tiếp thì lên mốc kế, bỏ lỡ một ngày
// hoặc đủ 7 ngày thì về ngày 1. Máy chủ (supabase/migrations/202611070004_fco_checkin.sql) giữ chuỗi và cộng FC;
// trình duyệt thêm gói vào kho. Bảng quà phải giống bảng FC trong SQL mới nhất
// (supabase/migrations/202611080002_fco_checkin_v3.sql: ngày 1–6 là FC, ngày 7 là gói ITM All 122+).
export const CHECKIN_REWARDS: EventReward[] = [
  { fc: 200 },
  { fc: 350 },
  { fc: 500 },
  { fc: 650 },
  { fc: 800 },
  { fc: 1000 },
  { pack: 'the-moment', count: 1 },
];
export const checkinReward = (day: number) => CHECKIN_REWARDS[Math.min(7, Math.max(1, day)) - 1];
