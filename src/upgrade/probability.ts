import { BRIDGE_CONFIG } from './config';
import { unit, type Rng } from './rng';

const assertBonus = (value: number) => { if (!Number.isFinite(value) || value < 0) throw new Error('Thưởng xác suất không hợp lệ.'); };

// Công khai và ngầm không cộng dồn: lấy mức lớn hơn, chặn ở giới hạn thưởng.
export function appliedBonus(publicBonus: number, hiddenBonus: number) {
  assertBonus(publicBonus); assertBonus(hiddenBonus);
  return Math.min(BRIDGE_CONFIG.bonusCap, Math.max(publicBonus, hiddenBonus));
}

// finalRate = min(100, baseRate + max(publicBonus, hiddenBonus)); làm tròn để tránh sai số dấu phẩy động (7 + 22,5).
export function finalRate(baseRate: number, publicBonus: number, hiddenBonus: number) {
  if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > 100) throw new Error('Tỷ lệ cơ bản phải từ 0 đến 100%.');
  return Math.min(100, Math.round((baseRate + appliedBonus(publicBonus, hiddenBonus)) * 1000) / 1000);
}

// Luôn đọc đúng một số từ RNG, kể cả khi tỷ lệ 100%, để chuỗi roll không bị lệch.
export function rollSuccess(rate: number, rng: Rng) {
  return unit(rng) * 100 < rate;
}
