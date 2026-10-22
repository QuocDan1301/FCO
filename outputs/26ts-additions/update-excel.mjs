import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const work = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(work, '../..');
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(root, 'gia-cau-thu-bp.xlsx')));
const sheet = workbook.worksheets.getItemAt(0);
if (process.argv.includes('--preview')) {
  const previewSheet = workbook.worksheets.add('Preview');
  previewSheet.getRange('A1:N2').copyFrom(sheet.getRange('A1:N2'), 'all');
  previewSheet.getRange('A3:N19').copyFrom(sheet.getRange('A252:N268'), 'all');
  const widths = [5, 20, 9, 7, 8, 13, 15, 7, 5.5, 10.5, 5.5, 10.5, 5.5, 10.5];
  widths.forEach((width, column) => { previewSheet.getRangeByIndexes(0, column, 19, 1).format.columnWidth = width; });
  previewSheet.getRange('A1:N19').format.rowHeight = 19;
  const preview = await workbook.render({ sheetName: 'Preview', autoCrop: 'all', scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(work, 'excel-after.png'), new Uint8Array(await preview.arrayBuffer()));
  console.log('Rendered the new rows with matching styles in a temporary preview.');
} else if (process.argv.includes('--inspect')) {
  console.log((await workbook.inspect({ kind: 'table', sheetId: sheet.name, range: 'A247:N251', tableMaxRows: 5, tableMaxCols: 14, maxChars: 1800 })).ndjson);
  const preview = await workbook.render({ sheetName: sheet.name, range: 'A247:N251', scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(work, 'excel-before.png'), new Uint8Array(await preview.arrayBuffer()));
} else {
  const data = JSON.parse(await fs.readFile(path.join(work, 'cards.json'), 'utf8'));
  const used = sheet.getRange('A3:AH251').values;
  const ids = new Set(used.map(row => row[0]));
  const added = data.filter(player => !ids.has(player.id));
  if (added.length !== 17) throw new Error('Expected 17 missing players; workbook changed.');
  const bonuses = [0, 1, 2, 4, 6, 8, 11, 15, 17, 19, 21, 24, 27];
  added.forEach((player, index) => {
    const row = 252 + index;
    sheet.getRange(`A${row}:AH${row}`).copyFrom(sheet.getRange('A251:AH251'), 'all');
    sheet.getRange(`A${row}:AH${row}`).values = [[player.id, player.name, '26TS', player.pos, player.ovr, player.nation, player.club, player.wage, ...bonuses.flatMap(bonus => [player.ovr + bonus, null])]];
    for (let level = 0; level < 13; level++) {
      sheet.getRangeByIndexes(row - 1, 8 + level * 2, 1, 1).format.font = { name: 'Arial', size: 10, color: '#000000', bold: false };
      sheet.getRangeByIndexes(row - 1, 9 + level * 2, 1, 1).format.fill = '#FFF2B3';
      sheet.getRangeByIndexes(row - 1, 9 + level * 2, 1, 1).format.font = { name: 'Arial', size: 10, color: '#0000FF', bold: false };
    }
  });
  workbook.recalculate();
  console.log((await workbook.inspect({ kind: 'table', sheetId: sheet.name, range: 'A252:N268', tableMaxRows: 3, tableMaxCols: 14, maxChars: 1600 })).ndjson);
  const preview = await workbook.render({ sheetName: sheet.name, range: 'A252:N268', scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(work, 'excel-after.png'), new Uint8Array(await preview.arrayBuffer()));
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(path.join(work, 'excel-authored.xlsx'));
  console.log('Authored 17 new rows with Artifact Tool.');
}
