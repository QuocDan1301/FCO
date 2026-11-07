import type { EventReward } from './game';

// Phần thuần của gift code (chỉ nạp kiểu từ game.ts): chuẩn hoá, băm, kiểm tra; dùng chung cho game và bảng admin.
// Máy chủ (bảng fco_gift_codes) chỉ lưu mã băm SHA-256 của code đã chuẩn hoá.
// expires = ngày cuối còn dùng được (giờ Việt Nam), null = không hết hạn.
export type GiftCode = { hash: string; hint: string; rewards: EventReward[]; expires: string | null; created: string };
export const GIFT_CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

export const normalizeGiftCode = (input: string) => input.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
// Gợi ý để nhận ra code trong trang quản trị mà không lưu nguyên văn: 2 ký tự đầu, phần còn lại che đi.
export const giftCodeHint = (code: string) => `${code.slice(0, 2)}${'•'.repeat(Math.max(0, code.length - 2))}`;

export async function hashGiftCode(code: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fco-gift:${code}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const isReward = (r: EventReward) => 'bp' in r ? Number.isSafeInteger(r.bp) && r.bp > 0
  : 'fc' in r ? Number.isSafeInteger(r.fc) && r.fc > 0
  : typeof r.pack === 'string' && Number.isSafeInteger(r.count) && r.count > 0 && r.count <= 1000;

// Kiểm tra một mục code (dùng chung cho trang quản trị và máy chủ dev); trả về lỗi hoặc null.
export function giftCodeError(code: GiftCode, packIds?: string[]): string | null {
  if (!/^[0-9a-f]{64}$/.test(code?.hash ?? '')) return 'Thiếu mã băm của code.';
  if (typeof code.hint !== 'string' || !code.hint) return 'Thiếu gợi ý code.';
  if (!Array.isArray(code.rewards) || !code.rewards.length || code.rewards.length > 10) return 'Mỗi code cần 1–10 phần quà.';
  if (!code.rewards.every(isReward)) return 'Phần quà phải là số nguyên dương (gói tối đa 1000).';
  if (packIds) for (const r of code.rewards) if ('pack' in r && !packIds.includes(r.pack)) return `Gói ${r.pack} không có trong Shop.`;
  if (code.expires !== null && !/^\d{4}-\d{2}-\d{2}$/.test(code.expires ?? '')) return 'Ngày hết hạn không hợp lệ.';
  return null;
}

