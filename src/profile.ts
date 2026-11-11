import { dayKey } from './game';
import type { Profile } from './game';

// Phần thuần của Thông tin HLV (src/ProfileCard.tsx), dùng chung cho test.
export const GENDERS: { id: NonNullable<Profile['gender']>; label: string }[] = [
  { id: 'male', label: 'Nam' },
  { id: 'female', label: 'Nữ' },
  { id: 'other', label: 'Khác' },
];
// Số ngày tối đa của từng tháng (không có năm nên tháng 2 nhận tới 29).
export const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const isBirthday = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [day, month] = value.split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= MONTH_DAYS[month - 1];
};
export const pad = (n: number) => String(n).padStart(2, '0');
// Số ngày đã chơi tính theo lịch giờ Việt Nam, kể cả ngày bắt đầu: tạo tài khoản hôm nay = 1 ngày.
export function playedDays(joined: number, now = Date.now()) {
  const start = Date.parse(dayKey(new Date(joined))), today = Date.parse(dayKey(new Date(now)));
  return Math.max(1, Math.round((today - start) / 86_400_000) + 1);
}
// Loại tài khoản do admin đặt cho từng người chơi (fco_wallets.account_tier, migration 202611110003), không phải gói thành viên trong Shop.
export type AccountTier = 'classic' | 'premium';
export const ACCOUNT_TIERS: Record<AccountTier, string> = { classic: 'Classic', premium: 'Premium' };
export const accountTierOf = (tier: unknown): AccountTier => tier === 'premium' ? 'premium' : 'classic';
