import type { EventReward } from './game';

// Điểm danh 7 ngày (cùng nút Nhận của Quà mỗi ngày, ngoài +1.000 FC): nhận liên tiếp thì lên mốc kế, bỏ lỡ một ngày
// hoặc đủ 7 ngày thì về ngày 1. Máy chủ (supabase/migrations/202611070004_fco_checkin.sql) giữ chuỗi và cộng FC;
// trình duyệt thêm gói vào kho. Bảng quà phải giống bảng trong file SQL.
export const CHECKIN_REWARDS: EventReward[] = [
  { fc: 300 },
  { fc: 500 },
  { pack: 'eternal', count: 1 },
  { fc: 700 },
  { fc: 900 },
  { pack: 'prime-2', count: 1 },
  { pack: 'infinite-prime', count: 1 },
];
export const checkinReward = (day: number) => CHECKIN_REWARDS[Math.min(7, Math.max(1, day)) - 1];
