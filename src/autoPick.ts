import { upgradeInfo } from './game';
import type { Card } from './game';
import { marketQuote } from './market';

// Chọn tự động phôi nâng cấp: tối đa 5 thẻ đủ 5 vạch với tổng giá thấp nhất (bằng giá thì ít thẻ hơn);
// không bộ nào đủ 5 vạch thì lấy bộ nạp nhiều năng lượng nhất, rẻ hơn khi bằng nhau.
// Năng lượng từng phôi làm tròn 0,1% (như upgradeInfo) nên quy hoạch động theo (số thẻ, năng lượng × 10) cho kết quả chính xác.
const FULL = 1000;
// Thẻ chưa có giá: coi như rất đắt để chỉ dùng khi không còn cách khác.
const UNPRICED = 1e15;

export function autoPickMaterials(target: Card, candidates: Card[], max = 5): { ids: string[]; energy: number } {
  const items = candidates.map(card => ({ uid: card.uid, energy: Math.round(upgradeInfo(target, [card]).energy * 10), price: marketQuote(card).price ?? UNPRICED })).filter(item => item.energy > 0);
  // best[k][e]: tổng giá nhỏ nhất khi dùng đúng k thẻ đạt năng lượng e (chặn ở 100%), kèm chỉ số các thẻ.
  const best: ({ price: number; picks: number[] } | null)[][] = Array.from({ length: max + 1 }, () => new Array(FULL + 1).fill(null));
  best[0][0] = { price: 0, picks: [] };
  items.forEach((item, i) => {
    // Duyệt k giảm dần để mỗi thẻ chỉ được chọn một lần.
    for (let k = max - 1; k >= 0; k--) for (let e = 0; e <= FULL; e++) {
      const cell = best[k][e];
      if (!cell) continue;
      const to = Math.min(FULL, e + item.energy), price = cell.price + item.price, next = best[k + 1][to];
      if (!next || price < next.price) best[k + 1][to] = { price, picks: [...cell.picks, i] };
    }
  });
  let pick: { price: number; picks: number[] } | null = null, energy = 0;
  for (let e = FULL; e > 0 && !pick; e--) for (let k = 1; k <= max; k++) {
    const cell = best[k][e];
    if (cell && (!pick || cell.price < pick.price)) { pick = cell; energy = e; }
  }
  return { ids: pick ? pick.picks.map(i => items[i].uid) : [], energy: energy / 10 };
}
