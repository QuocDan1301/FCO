import { BRIDGE_CONFIG } from './config';
import { endsWith, tail, uniquePatterns, type Chain } from './dropTracking';

// Cầu công khai lấy từ dây nổ gần nhất của cùng cấp: chỉ các đuôi liên tiếp (tối đa 4 số) và bản đảo của từng đuôi.
export type PublicPattern = { length: number; forward: number[]; reverse: number[] };

export function publicPatterns(source: Chain | null): PublicPattern[] {
  if (!source) return [];
  const base = tail(source);
  return base.map((_, i) => {
    const forward = base.slice(base.length - i - 1);
    return { length: i + 1, forward, reverse: [...forward].reverse() };
  });
}

export function publicPatternList(source: Chain | null) {
  return uniquePatterns(publicPatterns(source).flatMap(p => [p.forward, p.reverse]));
}

export const publicBonus = (length: number) => length * BRIDGE_CONFIG.publicBonusPerDigit;

// Chỉ thưởng theo mẫu dài nhất khớp với đuôi dây hiện tại.
export function matchPublic(source: Chain | null, chain: Chain) {
  for (const p of publicPatterns(source).reverse()) {
    const pattern = endsWith(chain, p.forward) ? p.forward : endsWith(chain, p.reverse) ? p.reverse : null;
    if (pattern) return { length: p.length, bonus: publicBonus(p.length), pattern };
  }
  return { length: 0, bonus: 0, pattern: null };
}
