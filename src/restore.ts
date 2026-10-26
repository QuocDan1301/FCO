import { getPlayer, MAX_LEVEL, ovr, RESTORE_MIN_LEVEL } from './game';
import type { Card } from './game';

// Khôi phục cấp khi đập xịt (thẻ chính từ +5), theo bậc của từng phôi so với thẻ chính:
// - Bản sao (cùng cầu thủ, cùng mùa): phôi bằng / cao hơn cấp thẻ chính 100%, thấp hơn 1 cấp 85% (đều giữ nguyên cấp);
//   phôi +3 trở lên 50%, +1 / +2 20% (giữ tối thiểu +5).
// - Cùng mùa, khác cầu thủ: phôi từ +5 có OVR không thấp hơn quá 3 → 100%, thấp hơn nữa giảm dần (tối thiểu 35%),
//   giữ tối thiểu cấp của phôi (không quá cấp thẻ chính); phôi +4 có OVR không thấp hơn → 40%, giữ +5.
// - Cùng cầu thủ, khác mùa: phôi từ +5 có OVR không thấp hơn quá 2 → 65%, giữ +5.
// - Phôi thường: 0%.
// Cơ hội cộng dồn các phôi, tối đa 100%; khôi phục thì thẻ không rớt dưới mức giữ cao nhất trong các phôi có đóng góp.
export type FodderTier = 'clone' | 'season' | 'player' | 'normal';

// Cùng cầu thủ khác mùa: cùng quốc tịch và cùng tên sau khi bỏ dấu, dấu chấm; chữ viết tắt đầu chỉ được bỏ khi một bên không có
// (E. Butragueño = Butragueño, nhưng G. Müller ≠ T. Müller).
const nameParts = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\./g, ' ').split(/\s+/).filter(Boolean);
const hasInitial = (parts: string[]) => parts.length > 1 && parts[0].length === 1;
const withoutInitials = (parts: string[]) => { const rest = [...parts]; while (hasInitial(rest)) rest.shift(); return rest.join(' '); };
function samePerson(a: Pick<Card, 'playerId'>, b: Pick<Card, 'playerId'>) {
  const pa = getPlayer(a), pb = getPlayer(b);
  if (pa.nation !== pb.nation) return false;
  const x = nameParts(pa.name), y = nameParts(pb.name);
  return x.join(' ') === y.join(' ') || (hasInitial(x) !== hasInitial(y) && withoutInitials(x) === withoutInitials(y));
}

export function fodderTier(target: Pick<Card, 'playerId'>, fodder: Pick<Card, 'playerId'>): FodderTier {
  if (fodder.playerId === target.playerId) return 'clone';
  if (getPlayer(fodder).tier === getPlayer(target).tier) return 'season';
  return samePerson(target, fodder) ? 'player' : 'normal';
}

export const restoreApplies = (card: Pick<Card, 'level'>) => card.level >= RESTORE_MIN_LEVEL && card.level < MAX_LEVEL;

// Đóng góp của một phôi: power 1 = 100% cơ hội; floor = cấp tối thiểu được giữ (chỉ tính khi power > 0).
export function fodderRestore(target: Card, fodder: Card): { tier: FodderTier; power: number; floor: number } {
  const tier = fodderTier(target, fodder), diff = ovr(fodder) - ovr(target);
  if (tier === 'clone') {
    if (fodder.level >= target.level) return { tier, power: 1, floor: target.level };
    if (fodder.level === target.level - 1) return { tier, power: .85, floor: target.level };
    return { tier, power: fodder.level >= 3 ? .5 : .2, floor: RESTORE_MIN_LEVEL };
  }
  if (tier === 'season' && fodder.level >= 5) return { tier, power: diff >= -3 ? 1 : Math.max(.35, Math.pow(.82, -diff - 2)), floor: Math.min(target.level, fodder.level) };
  if (tier === 'season' && fodder.level === 4 && diff >= 0) return { tier, power: .4, floor: RESTORE_MIN_LEVEL };
  if (tier === 'player' && fodder.level >= 5 && diff >= -2) return { tier, power: .65, floor: RESTORE_MIN_LEVEL };
  return { tier, power: 0, floor: 1 };
}

const TIER_RANK: Record<FodderTier, number> = { clone: 3, season: 2, player: 1, normal: 0 };
// chance: % cơ hội (làm tròn 1%), floor: cấp giữ khi khôi phục, tier: bậc phôi cao nhất đang dùng.
export function evaluateRestore(target: Card, materials: Card[]): { chance: number; floor: number; tier: FodderTier } {
  let power = 0, floor = 1, tier: FodderTier = 'normal';
  if (!restoreApplies(target)) return { chance: 0, floor, tier };
  for (const material of materials) {
    const part = fodderRestore(target, material);
    power += part.power;
    if (part.power > 0) floor = Math.max(floor, part.floor);
    if (TIER_RANK[part.tier] > TIER_RANK[tier]) tier = part.tier;
  }
  return { chance: Math.min(100, Math.round(power * 100)), floor, tier };
}
