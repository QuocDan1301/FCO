import config from './pricing-config.json';
import suppliedGroups from './player-classification-groups.json';
import factsData from './player-classification-facts.json';
import { classifyPlayer } from './player-classification';
import type { ClassificationFacts } from './player-classification';
import type { Player } from './game';

export type PricingOptions = {
  group?: 1 | 2 | 3;
  plus2IncreasePercent?: number;
  metaHeatPercent?: number;
  fodderEarlyDiscountPercent?: number;
  fodderPlus5Multiple?: number;
  fodderPlus8DiscountPercent?: number;
};
export const insuranceRate = (baseOvr: number) => baseOvr <= 92 ? .95 : baseOvr <= 100 ? .8 : .6;
const range = (n: number, min: number, max: number) => {
  if (!Number.isFinite(n) || n < min || n > max) throw new Error('Cấu hình giá không hợp lệ.');
  return n;
};
export function calculatePrice(base: number | null, level: number, options: PricingOptions = {}) {
  if (!Number.isInteger(level) || level < 1 || level > 13) throw new Error('Cấp thẻ không hợp lệ.');
  const group = options.group ?? config.defaultGroup;
  if (![1, 2, 3].includes(group)) throw new Error('Nhóm giá không hợp lệ.');
  const increase = range(options.plus2IncreasePercent ?? config.plus2IncreasePercent, 0, 10000);
  const heat = range(options.metaHeatPercent ?? config.metaHeatPercent, 0, 35);
  if (heat !== 0 && heat < 15) throw new Error('Biên nhiệt phải bằng 0 hoặc từ 15 đến 35%.');
  const early = range(options.fodderEarlyDiscountPercent ?? config.fodderEarlyDiscountPercent, 15, 25) / 100;
  const five = range(options.fodderPlus5Multiple ?? config.fodderPlus5Multiple, 7, 8);
  const eight = 1 - range(options.fodderPlus8DiscountPercent ?? config.fodderPlus8DiscountPercent, 40, 50) / 100;
  const liquidityNote = group === 3 && level >= 9 ? 'Đóng băng thanh khoản' : null;
  if (base === null) return { price: null, theoreticalPrice: null, group, liquidityNote };
  if (!Number.isSafeInteger(base) || base < 0) throw new Error('Giá gốc không hợp lệ.');
  const ratios = [1, 1 + increase / 100, 1.75, 2.1, 2.3, 2.6, 3.2, 4.2, 2.4, 2.5, 2.8, 3.2, 3.8];
  let theoreticalPrice = base;
  for (let i = 1; i < level; i++) theoreticalPrice *= ratios[i];
  let factor = group === 1 && level >= 5 ? 1 + heat / 100 : 1;
  if (group === 3 && level > 1) {
    const fiveFactor = five / (ratios[1] * 1.75 * 2.1 * 2.3);
    // +6, +7 nội suy biên giảm từ mốc +5 tới +8; từ +9 giữ biên +8.
    factor = level <= 4 ? 1 - early : level >= 8 ? eight : fiveFactor + (eight - fiveFactor) * (level - 5) / 3;
  }
  const price = Math.round(theoreticalPrice * factor);
  if (!Number.isSafeInteger(price) || !Number.isSafeInteger(Math.round(theoreticalPrice))) throw new Error('Giá vượt giới hạn số nguyên an toàn.');
  return { price, theoreticalPrice, group, liquidityNote };
}

export function playerClassification(player: Pick<Player, 'id' | 'name' | 'pos' | 'club' | 'flag'>) {
  const facts = (factsData.players as Record<string, ClassificationFacts>)[String(player.id)];
  const inferred = classifyPlayer(player, facts);
  const supplied = (suppliedGroups.players as Record<string, { group: 1 | 2 | 3; reason: string; source: string; teamColorTier: number }>)[String(player.id)];
  return supplied ? { ...inferred, group: supplied.group, provisional: false, classificationSource: supplied.source, reason: supplied.reason, suppliedTeamColorTier: supplied.teamColorTier } : { ...inferred, classificationSource: 'criteria', reason: '' };
}

export function playerPricingOptions(playerId: number, player?: Pick<Player, 'id' | 'name' | 'pos' | 'club' | 'flag'>): PricingOptions {
  const override = (config.overrides as Record<string, PricingOptions>)[String(playerId)] ?? {};
  return { group: player ? playerClassification(player).group : undefined, ...override };
}
