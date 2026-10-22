import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const work = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(work, '../..');
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(root, 'gia-cau-thu-bp.xlsx')));
const sheet = wb.worksheets.getItemAt(0);
const data = JSON.parse(await fs.readFile(path.join(work, 'cards.json'), 'utf8'));
const values = sheet.getUsedRange().values;
const lastRow = values.length;
const ids = new Set(values.slice(2).map(row => row[0]));
const added = data.filter(player => !ids.has(player.id));
async function preview(rows, name) {
  const qa = wb.worksheets.add('Preview');
  qa.getRange('A1:N2').copyFrom(sheet.getRange('A1:N2'), 'all');
  rows.forEach((row, i) => qa.getRange(`A${i + 3}:N${i + 3}`).copyFrom(sheet.getRange(`A${row}:N${row}`), 'all'));
  [5, 20, 9, 7, 8, 13, 22, 7, 5.5, 10.5, 5.5, 10.5, 5.5, 10.5].forEach((width, col) => { qa.getRangeByIndexes(0, col, rows.length + 2, 1).format.columnWidth = width; });
  qa.getRange(`A1:N${rows.length + 2}`).format.rowHeight = 19;
  const image = await wb.render({ sheetName: 'Preview', autoCrop: 'all', scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(work, name), new Uint8Array(await image.arrayBuffer()));
}
if (process.argv.includes('--inspect')) {
  await preview([lastRow - 2, lastRow - 1, lastRow], 'excel-before.png');
  console.log(JSON.stringify({ lastRow, missing: added.length }));
} else if (process.argv.includes('--preview')) {
  const rows = data.map(player => values.findIndex(row => row[0] === player.id) + 1);
  await preview(rows, 'excel-after.png');
  console.log('Rendered all 17 requested players, including existing Pablo Fornals.');
} else {
  if (lastRow !== 268 || added.length !== 16) throw new Error('Workbook contents changed; expected 266 existing players and 16 missing.');
  const bonuses = [0, 1, 2, 4, 6, 8, 11, 15, 17, 19, 21, 24, 27];
  for (let i = 0; i < added.length; i++) {
    const player = added[i], row = lastRow + i + 1;
    sheet.getRange(`A${row}:AH${row}`).copyFrom(sheet.getRange(`A${lastRow}:AH${lastRow}`), 'all');
    sheet.getRange(`A${row}:AH${row}`).values = [[player.id, player.name, '26TS', player.pos, player.ovr, player.nation, player.club, player.wage, ...bonuses.flatMap(bonus => [player.ovr + bonus, null])]];
  }
  wb.recalculate();
  const file = await SpreadsheetFile.exportXlsx(wb);
  await file.save(path.join(work, 'excel-authored.xlsx'));
  console.log('Authored 16 new rows; existing players left intact.');
}
