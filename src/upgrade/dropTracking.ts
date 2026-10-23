import { BRIDGE_CONFIG } from './config';
import { unit, type Rng } from './rng';

// Dây rớt: các mức thẻ rớt về liên tiếp khi đập cùng một cấp, tính tới phát thành công.
export type Chain = readonly number[];

// Đập từ +N thất bại rớt về một mức trong 1 … N-1 (thấp nhất +1).
export function dropRange(currentLevel: number) {
  return { min: 1, max: Math.max(1, currentLevel - 1) };
}

export function isValidDrop(currentLevel: number, drop: number) {
  const { min, max } = dropRange(currentLevel);
  return Number.isInteger(drop) && drop >= min && drop <= max;
}

export function rollDrop(currentLevel: number, rng: Rng) {
  return 1 + Math.floor(unit(rng) * dropRange(currentLevel).max);
}

export function tail(chain: Chain, size: number = BRIDGE_CONFIG.tail) {
  return chain.slice(Math.max(0, chain.length - size));
}

// Dây hiện tại kết thúc đúng bằng mẫu (dây ngắn hơn mẫu thì không khớp).
export function endsWith(chain: Chain, pattern: Chain) {
  if (!pattern.length || chain.length < pattern.length) return false;
  const offset = chain.length - pattern.length;
  return pattern.every((value, i) => chain[offset + i] === value);
}

// Bỏ mẫu trùng (ví dụ mẫu đảo của dây đối xứng 3223 trùng chính nó).
export function uniquePatterns(patterns: readonly number[][]) {
  const seen = new Set<string>();
  return patterns.filter(pattern => { const key = pattern.join(','); if (seen.has(key)) return false; seen.add(key); return true; });
}

// Mức rớt có thể lên 2 chữ số (+12 → +13 rớt tới +11) nên khi đó tách bằng dấu gạch.
export function formatChain(chain: Chain) {
  return chain.join(chain.some(value => value > 9) ? '-' : '');
}
