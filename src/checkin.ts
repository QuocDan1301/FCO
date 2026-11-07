import type { EventReward } from './game';

// Điểm danh 7 ngày (cùng nút Nhận của Quà mỗi ngày, ngoài +1.000 FC): nhận liên tiếp thì lên mốc kế, bỏ lỡ một ngày
// hoặc đủ 7 ngày thì về ngày 1. Máy chủ (supabase/migrations/202611070004_fco_checkin.sql) giữ chuỗi và cộng FC;
// trình duyệt thêm gói vào kho. Bảng quà phải giống bảng trong SQL (từ 2026-11-07 cả 7 ngày là FC:
// supabase/migrations/202611070008_fco_checkin_fc.sql).
export const CHECKIN_REWARDS: EventReward[] = [
  { fc: 200 },
  { fc: 400 },
  { fc: 700 },
  { fc: 1000 },
  { fc: 1300 },
  { fc: 1600 },
  { fc: 2000 },
];
export const checkinReward = (day: number) => CHECKIN_REWARDS[Math.min(7, Math.max(1, day)) - 1];
