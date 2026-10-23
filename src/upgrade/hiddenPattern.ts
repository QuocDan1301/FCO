import { BRIDGE_CONFIG } from './config';
import { dropRange, endsWith, tail, uniquePatterns, type Chain } from './dropTracking';
import { pick, type Rng } from './rng';

export const HIDDEN_KINDS = ['historical', 'sum3', 'quad', 'backToBack'] as const;
export type HiddenKind = typeof HIDDEN_KINDS[number];
// Mẫu đang hoạt động của từng loại cầu ngầm có mẫu; chọn lại sau mỗi chu kỳ thành công, không đổi sau khi đã roll.
export type HiddenPatterns = { historical: number[] | null; sum3: number[] | null; quad: number[] | null };

// Mức rớt lớn nhất khi đập lên cấp mục tiêu (đập từ target - 1).
const maxDrop = (targetLevel: number) => dropRange(targetLevel - 1).max;

// Cầu lịch sử từ một dây nổ: đuôi 3 và 4 số cuối, thuận và đảo; dây dưới 3 mức rớt không dùng được.
export function historicalCandidates(chain: Chain) {
  if (chain.length < BRIDGE_CONFIG.historicalMinDrops) return [];
  const base = tail(chain);
  return uniquePatterns(BRIDGE_CONFIG.historicalLengths.filter(n => base.length >= n).flatMap(n => {
    const forward = base.slice(base.length - n);
    return [forward, [...forward].reverse()];
  }));
}

// Cầu tổng 3: A B 2 với A + B + 2 = cấp mục tiêu, mọi số nằm trong phạm vi mức rớt; không đảo.
export function sum3Candidates(targetLevel: number) {
  const max = maxDrop(targetLevel), last = BRIDGE_CONFIG.sumLast, rest = targetLevel - last;
  if (last > max) return [];
  const result: number[][] = [];
  for (let a = 1; a <= max; a++) { const b = rest - a; if (b >= 1 && b <= max) result.push([a, b, last]); }
  return result;
}

export function quadCandidates(targetLevel: number) {
  return Array.from({ length: maxDrop(targetLevel) }, (_, i) => Array<number>(BRIDGE_CONFIG.quadLength).fill(i + 1));
}

// Thứ tự gọi RNG cố định (lịch sử: dây rồi mẫu → tổng 3 → tứ quý) để seed tái hiện được.
export function choosePatterns(history: readonly Chain[], targetLevel: number, rng: Rng): HiddenPatterns {
  const eligible = history.filter(chain => historicalCandidates(chain).length);
  const historical = eligible.length ? pick(historicalCandidates(pick(eligible, rng)), rng) : null;
  const sums = sum3Candidates(targetLevel), quads = quadCandidates(targetLevel);
  return { historical, sum3: sums.length ? pick(sums, rng) : null, quad: quads.length ? pick(quads, rng) : null };
}

export function eligibleKinds(patterns: HiddenPatterns, backToBackArmed: boolean): HiddenKind[] {
  return HIDDEN_KINDS.filter(kind => kind === 'backToBack' ? backToBackArmed : patterns[kind] !== null);
}

// Mỗi lượt chọn ngẫu nhiên tối đa một loại; không khớp thì thưởng 0, không chuyển sang loại khác hay roll lại.
export function selectHidden(kinds: readonly HiddenKind[], rng: Rng) {
  return kinds.length ? pick(kinds, rng) : null;
}

export function hiddenMatches(kind: HiddenKind, patterns: HiddenPatterns, chain: Chain) {
  if (kind === 'backToBack') return true;
  const pattern = patterns[kind];
  return !!pattern && endsWith(chain, pattern);
}

export const HIDDEN_LABELS: Record<HiddenKind, string> = { historical: 'Cầu lịch sử', sum3: 'Cầu tổng 3', quad: 'Cầu tứ quý', backToBack: 'Nổ liên tiếp' };
