import { readFileSync, writeFileSync } from 'node:fs';
import { players, ovr, MAX_LEVEL } from '../src/game.ts';
import { groupPrice } from '../src/group-price.ts';
import type { PriceGroup } from '../src/group-price.ts';

// Chạy: npx tsx scripts/apply-group-prices.mts
// Ghi giá chuẩn của mọi thẻ vào src/player-prices.json. Thêm cầu thủ mới thì thêm tên vào src/player-groups.json trước.
const pricesPath = new URL('../src/player-prices.json', import.meta.url);
const { groups } = JSON.parse(readFileSync(new URL('../src/player-groups.json', import.meta.url), 'utf8')) as { groups: Record<string, PriceGroup> };
const missing = [...new Set(players.filter(p => !groups[p.name]).map(p => p.name))];
if (missing.length) throw new Error(`Chưa có nhóm giá: ${missing.join(', ')}`);

const data = JSON.parse(readFileSync(pricesPath, 'utf8'));
const table = Object.fromEntries(players.map(p => [p.id, Array.from({ length: MAX_LEVEL }, (_, i) => groupPrice(groups[p.name], ovr({ playerId: p.id, level: i + 1 })))]));
writeFileSync(pricesPath, JSON.stringify({
  note: 'Giá chuẩn theo nhóm (src/player-groups.json) và OVR (src/group-price.ts), theo id cầu thủ: +1 … +13. Giá thật trong game dao động ±10% quanh giá này, đổi mỗi 5 giờ (src/market.ts). Tính lại: npx tsx scripts/apply-group-prices.mts.',
  updatedAt: new Date().toISOString().slice(0, 10),
  players: table,
}, null, 2) + '\n');
console.log(`Đã ghi giá chuẩn cho ${players.length} thẻ.`);
