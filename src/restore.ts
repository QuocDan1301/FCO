import { MAX_LEVEL, RESTORE_MIN_LEVEL } from './game';
import type { Card } from './game';

// Khôi phục cấp khi đập xịt (thẻ chính từ +5). Từ 2026-11-07 chỉ phôi BẢN SAO (cùng cầu thủ, cùng mùa) mới có cơ hội:
// - phôi bằng / cao hơn cấp thẻ chính 100%, thấp hơn 1 cấp 85% (đều giữ nguyên cấp);
// - phôi +3 trở lên 50%, +1 / +2 20% (giữ tối thiểu +5).
// Phôi khác cầu thủ hoặc khác mùa (kể cả cùng cầu thủ ở mùa khác): 0%.
// Cơ hội cộng dồn các phôi, tối đa 100%; khôi phục thì thẻ không rớt dưới mức giữ cao nhất trong các phôi có đóng góp.
export type FodderTier = 'clone' | 'normal';

// Cùng cầu thủ, cùng mùa = cùng mã cầu thủ (mỗi mã là một thẻ của một mùa).
export const fodderTier = (target: Pick<Card, 'playerId'>, fodder: Pick<Card, 'playerId'>): FodderTier => fodder.playerId === target.playerId ? 'clone' : 'normal';

export const restoreApplies = (card: Pick<Card, 'level'>) => card.level >= RESTORE_MIN_LEVEL && card.level < MAX_LEVEL;

// Đóng góp của một phôi: power 1 = 100% cơ hội; floor = cấp tối thiểu được giữ (chỉ tính khi power > 0).
export function fodderRestore(target: Card, fodder: Card): { tier: FodderTier; power: number; floor: number } {
  if (fodderTier(target, fodder) !== 'clone') return { tier: 'normal', power: 0, floor: 1 };
  if (fodder.level >= target.level) return { tier: 'clone', power: 1, floor: target.level };
  if (fodder.level === target.level - 1) return { tier: 'clone', power: .85, floor: target.level };
  return { tier: 'clone', power: fodder.level >= 3 ? .5 : .2, floor: RESTORE_MIN_LEVEL };
}

// chance: % cơ hội (làm tròn 1%), floor: cấp giữ khi khôi phục, tier: 'clone' nếu có bản sao đóng góp.
export function evaluateRestore(target: Card, materials: Card[]): { chance: number; floor: number; tier: FodderTier } {
  let power = 0, floor = 1, tier: FodderTier = 'normal';
  if (!restoreApplies(target)) return { chance: 0, floor, tier };
  for (const material of materials) {
    const part = fodderRestore(target, material);
    power += part.power;
    if (part.power > 0) { floor = Math.max(floor, part.floor); tier = 'clone'; }
  }
  return { chance: Math.min(100, Math.round(power * 100)), floor, tier };
}
