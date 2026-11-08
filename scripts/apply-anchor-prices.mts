// Cập nhật giá một mùa từ giá TTCN: giữ +1, đặt +5 / +8 / +11 theo file mốc (scripts/<mùa>-anchors.json), tính các cấp
// còn lại bằng fcoLevelPrices (src/price-curve.ts) rồi ghi vào src/player-prices.json.
//   npx tsx scripts/apply-anchor-prices.mts <tier> scripts/<mùa>-anchors.json   (stellar ts26, eternal itm, hw23 hw23)
// Mốc thiếu: +5 → giữ +5 cũ; +8 / +11 → ước tính theo tỉ lệ trung vị của các thẻ cùng mùa có đủ giá (resolveAnchors).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [tier, anchorsFile] = process.argv.slice(2);
if (!tier || !anchorsFile) throw new Error('Cần: <tier> <file mốc giá>');
const root = fileURLToPath(new URL('../', import.meta.url));
const { players } = await import(pathToFileURL(`${root}src/game.ts`).href);
const { fcoLevelPrices, resolveAnchors } = await import(pathToFileURL(`${root}src/price-curve.ts`).href);

const anchors = JSON.parse(readFileSync(new URL(anchorsFile, pathToFileURL(root + '/')), 'utf8')).prices;
const pricesPath = `${root}src/player-prices.json`;
const data = JSON.parse(readFileSync(pricesPath, 'utf8'));
const pool = players.filter((p: { tier: string }) => p.tier === tier);
if (!pool.length) throw new Error(`Không có thẻ nào thuộc mùa ${tier}`);
const byName = new Map(pool.map((p: { name: string; id: number }) => [p.name, p]));
const unknown = Object.keys(anchors).filter(name => !byName.has(name));
if (unknown.length) throw new Error(`Không có trong mùa ${tier}: ${unknown.join(', ')}`);

let updated = 0, est8 = 0, est11 = 0;
for (const [name, a] of Object.entries(anchors) as [string, [string | null, string | null, string | null]][]) {
  const id = String((byName.get(name) as { id: number }).id);
  if (a[1] === null) est8++; if (a[2] === null) est11++;
  data.players[id] = fcoLevelPrices(resolveAnchors(data.players[id], a, anchors));
  updated++;
}
data.updatedAt = new Date().toISOString().slice(0, 10);
writeFileSync(pricesPath, JSON.stringify(data, null, 2) + '\n');
const skipped = pool.filter((p: { name: string }) => !(p.name in anchors)).map((p: { name: string }) => p.name);
console.log(`Đã cập nhật ${updated}/${pool.length} thẻ ${tier}${est8 ? `; ${est8} thẻ ước tính +8` : ''}${est11 ? `; ${est11} thẻ ước tính +11` : ''}.${skipped.length ? ` Chưa có giá mới: ${skipped.join(', ')}.` : ''}`);
