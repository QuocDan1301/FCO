import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { marketQuote } from '../src/market.ts';
import { players, ovr } from '../src/game.ts';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('gia-cau-thu-bp.xlsx');
const sheet = workbook.getWorksheet('Giá cầu thủ');
const table = JSON.parse(await readFile('src/player-prices.json', 'utf8')).players;
const groups = JSON.parse(await readFile('src/player-classification-groups.json', 'utf8')).players;
let prices = 0, ovrs = 0, provisional = 0, roundingDifferences = 0;
const seen = new Set(), counts = {};
const value = cell => cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
for (let n = 3; n <= sheet.rowCount; n++) {
  const row = sheet.getRow(n), id = Number(row.getCell(1).value);
  assert.ok(players.some(p => p.id === id));
  assert.ok(!seen.has(id), `Trùng ID ${id} trong Excel`);
  seen.add(id);
  const first = marketQuote({ playerId: id, level: 1 });
  counts[first.group] = (counts[first.group] ?? 0) + 1;
  if (first.classification.provisional) provisional++;
  for (let level = 1; level <= 13; level++) {
    const card = { playerId: id, level }, quote = marketQuote(card);
    if (groups[id]) {
      assert.equal(quote.group, groups[id].group);
      assert.equal(quote.classification.provisional, false);
    }
    const excelPrice = value(row.getCell(8 + 2 * level));
    assert.equal(excelPrice, table[id][level - 1], `Excel vs JSON ID ${id} +${level}`);
    if (level === 1 || excelPrice === null || quote.price === null) {
      assert.equal(quote.price, excelPrice, `Excel vs game ID ${id} +${level}`);
    } else if (quote.price !== excelPrice) {
      // Existing large formula caches can differ by a few BP after floating-point rounding.
      const tolerance = Math.max(1, 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(excelPrice))) - 14));
      assert.ok(Math.abs(quote.price - excelPrice) <= tolerance, `Excel vs game ID ${id} +${level}`);
      roundingDifferences++;
    }
    assert.equal(ovr(card), value(row.getCell(8 + 2 * level - 1)));
    if (quote.group === 3 && level >= 9) assert.equal(quote.liquidityNote, 'Đóng băng thanh khoản');
    prices++; ovrs++;
  }
}
assert.deepEqual([...seen].sort((a, b) => a - b), players.map(p => p.id).sort((a, b) => a - b), 'Excel phải có đủ mọi thẻ trong game');
const summary = { players: seen.size, prices, ovrs, counts, provisional, roundingDifferences, status: 'PASS: full roster, OVR and base prices; upgrade prices within floating-point rounding' };
await writeFile('outputs/classification/verification.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
