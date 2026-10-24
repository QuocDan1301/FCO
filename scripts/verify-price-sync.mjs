import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { applyUpgradePrices } from './price-overlay.mjs';
import { readNumber } from './excel-values.mjs';
import { marketQuote } from '../src/market.ts';
import { players, ovr, baseOvr } from '../src/game.ts';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('gia-cau-thu-bp.xlsx');
const sheet = workbook.getWorksheet('Giá cầu thủ');
const expected = {};
for (let row = 3; row <= sheet.rowCount; row++) {
  const id = Number(sheet.getCell(row, 1).value);
  expected[id] = Array.from({ length: 13 }, (_, index) => readNumber(sheet.getCell(row, 10 + index * 2), `ID ${id}`, 0, Number.MAX_SAFE_INTEGER));
}
const upgradeWorkbook = new ExcelJS.Workbook();
await upgradeWorkbook.xlsx.readFile('gia-cau-thu-bp2.xlsx');
applyUpgradePrices(upgradeWorkbook.getWorksheet('Giá cầu thủ'), expected);
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
    const excelPrice = expected[id][level - 1];
    assert.equal(excelPrice, table[id][level - 1], `Excel vs JSON ID ${id} +${level}`);
    assert.equal(quote.price, excelPrice, `Excel vs game ID ${id} +${level}`);
    assert.equal(ovr(card), value(row.getCell(8 + 2 * level - 1)) ?? baseOvr(card));
    if (quote.group === 3 && level >= 9) assert.equal(quote.liquidityNote, 'Đóng băng thanh khoản');
    prices++; ovrs++;
  }
}
assert.deepEqual([...seen].sort((a, b) => a - b), players.map(p => p.id).sort((a, b) => a - b), 'Excel phải có đủ mọi thẻ trong game');
const summary = { players: seen.size, prices, ovrs, counts, provisional, roundingDifferences, status: 'PASS: full roster, original OVR and +1 prices; +2 to +13 exactly match bp2' };
await writeFile('outputs/classification/verification.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
