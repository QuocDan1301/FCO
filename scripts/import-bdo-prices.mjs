// One-time BDO registration. Append only; preserve existing workbook rows and prices.
// +1: supplied screenshots. +2…+13: existing bp2 formula family (117, ×1).
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { players, baseOvr } from '../src/game.ts';
import { syncRosterRows } from './excel-roster.mjs';

const root = new URL('../', import.meta.url);
const rows = (await readFile(new URL('scripts/data/bdo.csv', root), 'utf8')).trim().split(/\r?\n/).slice(1).map(line => line.split('|'));
const roster = players.filter(p => p.tier === 'bdo');
assert.equal(roster.length, 108);
const file = new URL('src/player-prices.json', root);
const prices = JSON.parse(await readFile(file, 'utf8'));
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(fileURLToPath(new URL('gia-cau-thu-bp2.xlsx', root)));
const sheet = workbook.getWorksheet('Giá cầu thủ');
let template;
sheet.eachRow(row => { if (row.getCell(3).value === 'SPT') template = row; });
assert.ok(template, 'Missing SPT formula template');
const formulas = Array.from({ length: 12 }, (_, i) => template.getCell(12 + i * 2).formula);
const preserved = new Map();
for (let n = 3; n <= sheet.rowCount; n++) preserved.set(Number(sheet.getCell(n, 1).value), JSON.stringify(sheet.getRow(n).values));
for (const [i, p] of roster.entries()) {
  assert.equal(p.name, rows[i][0]);
  const price = Number(rows[i][5]);
  // Evaluate only this known numeric formula family, never arbitrary Excel contents.
  const computed = formulas.map(formula => {
    const m = formula.match(/^IF\(\$J\d+=0,0,ROUND\(MAX\(\$J\d+\*([\d.*]+),([\d.]+)\*\(([\d.]+)\^\(MIN\(\$E\d+,123\)-117\)\)\)\*1,0\)\)$/);
    assert.ok(m, `Unexpected formula: ${formula}`);
    const multiple = m[1].split('*').reduce((a, x) => a * Number(x), 1);
    return Math.round(Math.max(price * multiple, Number(m[2]) * Number(m[3]) ** (Math.min(p.ovr, 123) - 117)));
  });
  prices.players[p.id] ??= [price, ...computed];
}
const added = syncRosterRows(workbook, roster, prices.players);
for (const id of added) {
  const p = roster.find(p => p.id === id);
  let row;
  sheet.eachRow(r => { if (r.getCell(1).value === id) row = r; });
  for (let grade = 2; grade <= 13; grade++) {
    row.getCell(7 + grade * 2).value = { formula: `$E${row.number}+${baseOvr({ playerId: id, level: grade }) - p.ovr}`, result: baseOvr({ playerId: id, level: grade }) };
    row.getCell(8 + grade * 2).value = {
      formula: formulas[grade - 2].replace(/(\$[JE])\d+/g, `$1${row.number}`),
      result: prices.players[id][grade - 1],
    };
  }
  row.getCell(10).note = 'Giá +1: ảnh danh sách BDO do người dùng cung cấp ngày 28/10/2026. Giá +2…+13 theo công thức bp2 (117, ×1).';
}
for (let n = 3; n <= sheet.rowCount; n++) {
  const id = Number(sheet.getCell(n, 1).value);
  if (preserved.has(id)) assert.equal(JSON.stringify(sheet.getRow(n).values), preserved.get(id), `Existing row ${id} changed`);
}
if (added.length) await workbook.xlsx.writeFile(fileURLToPath(new URL('gia-cau-thu-bp2.xlsx', root)));
prices.updatedAt = '2026-10-28';
await writeFile(file, JSON.stringify(prices, null, 2) + '\n');
const packFile = new URL('src/packs.json', root);
const packs = JSON.parse(await readFile(packFile, 'utf8'));
if (!packs.packs.some(p => p.id === 'bdo')) {
  packs.packs.push({ id: 'bdo', name: 'BDO (ALL)', short: 'BDO', title: 'BALLON D’OR', seasons: ['bdo'], minOvr: null, levels: [1, 1], price: 14300, description: 'BALLON D’OR · những huyền thoại Quả bóng vàng.', range: '102–118', back: null, published: true });
  await writeFile(packFile, JSON.stringify(packs, null, 2) + '\n');
}
console.log(`BDO: ${added.length} rows appended; ${roster.length} prices registered. Existing workbook rows preserved.`);
