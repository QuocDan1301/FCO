import { BRIDGE_CONFIG } from './config';
import { unit, type Rng } from './rng';

// Dây rớt: các mức thẻ rớt về liên tiếp khi đập cùng một cấp, tính tới phát thành công.
export type Chain = readonly number[];

// Phạm vi mức rớt hợp lệ khi đập từ +N: 1 … N-1 (thấp nhất +1); dùng để kiểm tra bản lưu và nhập tay.
export function dropRange(currentLevel: number) {
  return { min: 1, max: Math.max(1, currentLevel - 1) };
}

// Bảng trọng số rớt của cấp đang đập; mức thật sự có thể rớt tới là mức lớn nhất trong bảng.
export function dropWeights(currentLevel: number) {
  return BRIDGE_CONFIG.dropWeights[currentLevel] ?? [[1, 100]] as const;
}
export function dropReach(currentLevel: number) {
  return Math.max(...dropWeights(currentLevel).map(([level]) => level));
}

export function isValidDrop(currentLevel: number, drop: number) {
  const { min, max } = dropRange(currentLevel);
  return Number.isInteger(drop) && drop >= min && drop <= max;
}

// Luôn đọc đúng một số từ RNG rồi chọn theo trọng số.
export function rollDrop(currentLevel: number, rng: Rng) {
  const weights = dropWeights(currentLevel);
  let left = unit(rng) * weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [level, weight] of weights) { if (left < weight) return level; left -= weight; }
  return weights[weights.length - 1][0];
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
