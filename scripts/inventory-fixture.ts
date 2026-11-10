// Dữ liệu mẫu cho test máy chủ kho thẻ (supabase/tests/fco-inventory.pglite.mjs): bộ dữ liệu đồng bộ, mã phiên bản và kết quả
// mà game tính (giá dao động, năng lượng phôi, tỷ lệ, khôi phục) để test so với hàm SQL.
// Chạy: npx tsx scripts/inventory-fixture.ts <file-json-ra>
import { writeFileSync } from 'node:fs';
import { MAX_LEVEL, players, upgradeInfo } from '../src/game';
import type { Card } from '../src/game';
import { PRICE_EPOCH, PRICE_PERIOD_MS, priceAt, fixedPricePlayers } from '../src/market';
import { FLAT_PRICE } from '../src/group-price';
import { evaluateRestore } from '../src/restore';
import { finalRate } from '../src/upgrade/probability';
import { seededRng } from '../src/upgrade/rng';
import { buildCatalog, catalogVersion } from '../src/inventory-catalog';
import priceData from '../src/player-prices.json';

const out = process.argv[2];
if (!out) throw new Error('Thiếu đường dẫn file ra.');
const catalog = buildCatalog();
const version = await catalogVersion();
const base: Record<string, (number | null)[]> = priceData.players;

const periods = [0, 7, Math.floor((Date.now() - PRICE_EPOCH) / PRICE_PERIOD_MS)];
const prices: [number, number, number, number, number][] = [];
for (const player of players) for (let level = 1; level <= MAX_LEVEL; level++) {
  const b = base[String(player.id)]?.[level - 1] ?? null;
  if (b === null || b === 0 || b === FLAT_PRICE || fixedPricePlayers.has(player.id)) continue;
  for (const period of periods) prices.push([player.id, level, period, b, priceAt({ playerId: player.id, level }, PRICE_EPOCH + period * PRICE_PERIOD_MS + 1)!]);
}

const rng = seededRng(20261110);
const card = (playerId: number, level: number, uid: string): Card => ({ uid, playerId, level, received: 0 });
const any = () => players[Math.floor(rng() * players.length)];
const upgrades: { target: [number, number]; materials: [number, number][]; energy: number; rate: number; restore: number; keep: number }[] = [];
for (let i = 0; i < 400; i++) {
  const t = any(), level = 1 + Math.floor(rng() * (MAX_LEVEL - 1));
  const count = 1 + Math.floor(rng() * 5);
  // Một phần phôi là bản sao (cùng cầu thủ) để thử khôi phục; phôi khác lấy gần OVR thẻ chính cho đủ các mức chênh.
  const mats: [number, number][] = Array.from({ length: count }, () => rng() < .3 ? [t.id, 1 + Math.floor(rng() * MAX_LEVEL)] : [any().id, 1 + Math.floor(rng() * MAX_LEVEL)]);
  const target = card(t.id, level, 't');
  const materials = mats.map(([p, l], k) => card(p, l, `m${k}`));
  const info = upgradeInfo(target, materials), restore = evaluateRestore(target, materials);
  upgrades.push({ target: [t.id, level], materials: mats, energy: info.energy, rate: finalRate(info.chance, 0, 0), restore: restore.chance, keep: restore.floor });
}
writeFileSync(out, JSON.stringify({ version, catalog, prices, upgrades }));
console.log(`fixture: ${prices.length} giá, ${upgrades.length} lượt đập, version ${version.slice(0, 12)}`);
