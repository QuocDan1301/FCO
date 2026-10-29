import { defaultPacks, seasons, TIERS } from './game';
import type { Tier } from './game';

// Badge dùng chung kiểu FC Online: vị trí (màu theo tuyến), mùa thẻ (khung viền màu mùa), cấp cộng (+1 → +13, màu kim loại).
// Dùng ở TTCN (danh sách mua / bán, panel chi tiết, tâm điểm); màu ở badges.css, màu mùa dùng chung lớp season-tag-* (squad.css).

// Tuyến của vị trí: tiền đạo / tiền vệ / hậu vệ / thủ môn.
export const posGroup = (pos: string) => pos === 'GK' ? 'gk' : ['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].includes(pos) ? 'def' : ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(pos) ? 'att' : 'mid';
// Nhãn mùa ngắn (26TS, PRM, MDL…) lấy từ gói ra 100% mùa đó.
export const seasonShort = (tier: Tier) => defaultPacks.find(p => p.weights[TIERS.indexOf(tier)] === 100)?.short ?? seasons[tier];
// Bậc màu của cấp cộng: +1 xám, +2–+4 đồng, +5–+7 bạc, +8–+10 vàng, +11–+13 huyền thoại (tím đỏ).
export const gradeTier = (level: number) => level <= 1 ? 'base' : level <= 4 ? 'bronze' : level <= 7 ? 'silver' : level <= 10 ? 'gold' : 'legend';

export function PositionBadge({ pos }: { pos: string }) {
  return <span className={`pos-badge pos-badge-${posGroup(pos)}`}>{pos}</span>;
}

export function SeasonBadge({ tier }: { tier: Tier }) {
  return <span className={`season-badge season-tag-${tier}`} title={seasons[tier]}>{seasonShort(tier)}</span>;
}

export function GradeBadge({ level }: { level: number }) {
  return <span className={`grade-badge grade-${gradeTier(level)}`} aria-label={`Cấp +${level}`}>+{level}</span>;
}
