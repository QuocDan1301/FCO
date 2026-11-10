import type { CSSProperties } from 'react';
import { asset } from './asset';
import { PACK_LEVELS } from './game';
import type { Pack } from './game';

// Ảnh gói kèm huy hiệu cấp, cùng luật PackArt (App.tsx): gói ra +1 không gắn; gói nhiều cấp xếp chồng, cấp cao nhất ở trước,
// mỗi cấp thấp hơn lùi một bậc phía sau. Khung theo tỷ lệ ảnh gói (.663) để huy hiệu (.pack-level-badge) nằm đúng chỗ như Shop.
export function packBadgeLevels(pack: Pack) {
  const [min, max] = pack.levels ?? PACK_LEVELS;
  return max > 1 ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];
}

export default function PackImage({ pack, className = '' }: { pack: Pack; className?: string }) {
  const [min, max] = pack.levels ?? PACK_LEVELS;
  return <span className={`pack-img ${className}`}>
    {pack.back && <img className="pack-img-back" src={pack.back} alt=""/>}
    {packBadgeLevels(pack).map(level => <img key={level} className="pack-level-badge" style={{ '--behind': max - level, '--stack': max - min } as CSSProperties} src={asset(`/assets/levels/lv-${level}.webp`)} alt=""/>)}
  </span>;
}