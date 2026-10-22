import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const work = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(work, '../..');
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(root, 'gia-cau-thu-bp.xlsx')));
const sheet = wb.worksheets.getItemAt(0);
const cards = JSON.parse(await fs.readFile(path.join(work, 'cards.json'), 'utf8'));
const values = sheet.getUsedRange().values;
if (values.length !== 284 || cards.some(p => values.slice(2).some(row => row[0] === p.id))) throw new Error('Unexpected workbook content');
const bonuses = [0, 1, 2, 4, 6, 8, 11, 15, 17, 19, 21, 24, 27];
for (let i = 0; i < cards.length; i++) {
  const p = cards[i], row = 285 + i;
  sheet.getRange(`A${row}:AH${row}`).copyFrom(sheet.getRange('A284:AH284'), 'all');
  sheet.getRange(`A${row}:AH${row}`).values = [[p.id, p.name, '26TS', p.pos, p.ovr, p.nation, p.club, p.wage, ...bonuses.flatMap(b => [p.ovr + b, null])]];
}
wb.recalculate();
const file = await SpreadsheetFile.exportXlsx(wb);
await file.save(path.join(work, 'excel-authored.xlsx'));
const qa = wb.worksheets.add('Preview');
qa.getRange('A1:N2').copyFrom(sheet.getRange('A1:N2'), 'all');
qa.getRange('A3:N12').copyFrom(sheet.getRange('A285:N294'), 'all');
[5, 20, 9, 7, 8, 13, 22, 7, 5.5, 10.5, 5.5, 10.5, 5.5, 10.5].forEach((width, col) => { qa.getRangeByIndexes(0, col, 12, 1).format.columnWidth = width; });
qa.getRange('A1:N12').format.rowHeight = 20;
const image = await wb.render({ sheetName: 'Preview', autoCrop: 'all', scale: 1.5, format: 'png' });
await fs.writeFile(path.join(work, 'excel-after.png'), new Uint8Array(await image.arrayBuffer()));
console.log('Authored 10 new rows and rendered preview.');
