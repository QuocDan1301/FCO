import { MAX_LEVEL, PROTECT_MIN_LEVEL, random, upgrade } from './game';
import type { Card, Save } from './game';
import { marketQuote } from './market';
import type { UpgradeRole } from './upgrade/engine';
import type { Rng } from './upgrade/rng';

// Bảo vệ nâng cấp: chọn 0–100% (nấc 10%). Phí = phí bảo hiểm của thẻ × mức %;
// phí bảo hiểm = giá thẻ × 95% / 80% / 60% theo OVR gốc (market.ts), nên mức 100% tốn tối đa khoảng 95% giá trị thẻ.
export const PROTECT_STEP = 10;
export const protectionApplies = (card: Pick<Card, 'level'>) => card.level >= PROTECT_MIN_LEVEL && card.level < MAX_LEVEL;

export function protectionCost(card: Card, pct: number): number | null {
  if (!protectionApplies(card)) return null;
  const fee = marketQuote(card).insuranceFee;
  return fee === null ? null : Math.round(fee * pct / 100);
}

export function setProtection(state: Save, pct: number, fixed: boolean): Save {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100 || pct % PROTECT_STEP) throw new Error('Mức bảo vệ phải từ 0% đến 100%, mỗi nấc 10%.');
  return { ...state, protection: { pct, fixed } };
}

// Mức đang áp dụng cho thẻ chính: 0 nếu thẻ dưới +8 hoặc chưa chọn.
export const activeProtection = (state: Pick<Save, 'protection'>, card: Pick<Card, 'level'> | undefined) => card && protectionApplies(card) ? state.protection?.pct ?? 0 : 0;

// Nâng cấp kèm bảo vệ: tính phí từ giá thị trường rồi gọi game.upgrade; chưa "cố định chi phí" thì mức tự về 0% sau lượt đập.
export function upgradeWithProtection(state: Save, targetId: string, materialIds: string[], rng: Rng = random, free = false, options: { role?: UpgradeRole; patternRng?: Rng; pct?: number } = {}) {
  const target = state.cards.find(c => c.uid === targetId);
  const pct = options.pct ?? 0;
  let protection: { pct: number; cost: number } | undefined;
  if (pct > 0 && target) {
    const cost = protectionCost(target, pct);
    if (cost === null) throw new Error(protectionApplies(target) ? 'Thẻ chưa có giá nên không dùng được bảo vệ nâng cấp.' : `Bảo vệ nâng cấp chỉ áp dụng cho thẻ từ +${PROTECT_MIN_LEVEL}.`);
    protection = { pct, cost };
  }
  const result = upgrade(state, targetId, materialIds, rng, free, { role: options.role, patternRng: options.patternRng, protection });
  if (protection && !state.protection?.fixed) result.state = { ...result.state, protection: { pct: 0, fixed: false } };
  return result;
}
