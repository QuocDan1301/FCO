import { asset } from './asset';

// Gói thành viên theo tuần: giảm thuế bán cầu thủ. Giá và hạn do máy chủ giữ (giá hiện tại ở supabase/migrations/202611090005_fco_membership_prices.sql);
// đổi giá thì đổi cả hai nơi, tests/membership.test.ts kiểm tra hai bên khớp nhau.
export type MembershipId = 'svip' | 'premium';
// Hạn của từng gói (mili giây), null = chưa mua. Hai gói chạy song song, gói giảm nhiều hơn được áp dụng.
export type Membership = Partial<Record<MembershipId, number | null>>;

export const MEMBERSHIP_DAYS = 7;
export const MEMBERSHIPS: { id: MembershipId; name: string; price: number; discount: number; image: string }[] = [
  { id: 'svip', name: 'SVIP Class', price: 1000, discount: 30, image: asset('/assets/membership-svip.webp') },
  { id: 'premium', name: 'Premium', price: 1500, discount: 50, image: asset('/assets/membership-premium.webp') },
];

export function bestMembership(membership: Membership | undefined, at: number) {
  return MEMBERSHIPS.filter(item => (membership?.[item.id] ?? 0) > at).sort((a, b) => b.discount - a.discount)[0] ?? null;
}

// Thời gian còn lại để hiện trong Shop; null = không còn hạn.
export function membershipLeft(until: number | null | undefined, at: number) {
  if (!until || until <= at) return null;
  const hours = Math.ceil((until - at) / 3_600_000);
  return hours > 24 ? `Còn ${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `Còn ${hours} giờ`;
}
