// Append the supplied HG prices without replacing any existing roster rows.
// Run once with: node --import tsx scripts/import-hg-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { players, baseOvr, defaultPacks } from '../src/game.ts';
import { syncRosterRows } from './excel-roster.mjs';

const root = new URL('../', import.meta.url);
const lines = (await readFile(new URL('scripts/data/hg.csv', root), 'utf8')).trim().split(/\r?\n/);
const headers = lines.shift().split('|');
const source = lines.map(line => Object.fromEntries(line.split('|').map((v, i) => [headers[i], v])));
const roster = players.filter(p => p.tier === 'hg');
assert.equal(roster.length, 116);
const file = new URL('src/player-prices.json', root);
const data = JSON.parse(await readFile(file, 'utf8'));
const workbook = new ExcelJS.Workbook();
const workbookPath = fileURLToPath(new URL('gia-cau-thu-bp2.xlsx', root));
await workbook.xlsx.readFile(workbookPath);
const sheet = workbook.getWorksheet('Giá cầu thủ');
let template;
sheet.eachRow(row => { if (row.getCell(3).value === 'SPT') template = row; });
assert.ok(template, 'Missing existing SPT price formula family');
const formulas = Array.from({ length: 12 }, (_, i) => template.getCell(12 + i * 2).formula);
const preserved = new Map();
sheet.eachRow((row, n) => { if (n > 2) preserved.set(row.getCell(1).value, JSON.stringify(row.values)); });
for (const [i, player] of roster.entries()) {
  assert.equal(player.name, source[i].name);
  const price = Number(source[i].price);
  const higher = formulas.map(formula => {
    // Evaluate the known numeric family only; do not execute arbitrary workbook formulas.
    const m = formula.match(/^IF\(\$J\d+=0,0,ROUND\(MAX\(\$J\d+\*([\d.*]+),([\d.]+)\*\(([\d.]+)\^\(MIN\(\$E\d+,123\)-117\)\)\)\*1,0\)\)$/);
    assert.ok(m, `Unexpected template: ${formula}`);
    const multiplier = m[1].split('*').reduce((a, n) => a * Number(n), 1);
    return Math.round(Math.max(price * multiplier, Number(m[2]) * Number(m[3]) ** (Math.min(player.ovr, 123) - 117)));
  });
  data.players[player.id] ??= [price, ...higher];
}
const added = syncRosterRows(workbook, roster, data.players);
sheet.eachRow(row => {
  const id = row.getCell(1).value;
  if (!added.includes(id)) return;
  const p = roster.find(p => p.id === id);
  for (let level = 2; level <= 13; level++) {
    const rating = baseOvr({ playerId: id, level });
    row.getCell(7 + level * 2).value = { formula: `$E${row.number}+${rating - p.ovr}`, result: rating };
    row.getCell(8 + level * 2).value = {
      formula: formulas[level - 2].replace(/(\$[JE])\d+/g, `$1${row.number}`), result: data.players[id][level - 1],
    };
  }
  row.getCell(10).note = 'Giá +1: ảnh danh sách HG do người dùng cung cấp ngày 28/10/2026. +2…+13 theo công thức bp2 (117, ×1).';
});
sheet.eachRow((row, n) => {
  if (n > 2 && preserved.has(row.getCell(1).value)) assert.equal(JSON.stringify(row.values), preserved.get(row.getCell(1).value));
});
if (added.length) await workbook.xlsx.writeFile(workbookPath);
data.updatedAt = '2026-10-28';
await writeFile(file, JSON.stringify(data, null, 2) + '\n');
const packFile = new URL('src/packs.json', root);
const packs = JSON.parse(await readFile(packFile, 'utf8'));
if (!packs.packs.some(p => p.id === 'hg')) {
  const base = defaultPacks.find(p => p.id === 'hg');
  packs.packs.push({ id: base.id, name: base.name, short: base.short, title: 'HOME GROWN', seasons: ['hg'], minOvr: null, levels: [1, 1], price: base.price, description: base.description, range: base.range, back: null, published: true });
  await writeFile(packFile, JSON.stringify(packs, null, 2) + '\n');
}
console.log(`HG: ${added.length} rows appended; ${roster.length} prices registered. Existing rows preserved.`);
