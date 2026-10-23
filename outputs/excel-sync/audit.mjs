import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { players } from '../../src/game.ts';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('gia-cau-thu-bp.xlsx');
const sheet = wb.getWorksheet('Giá cầu thủ');
const ids = new Set();
const counts = {};
let formulas = 0;
for (let n=3;n<=sheet.rowCount;n++) {
  const row = sheet.getRow(n);
  const id = Number(row.getCell(1).value);
  if (!id) continue;
  if(ids.has(id)) throw new Error(`Duplicate ${id}`);
  ids.add(id);
  const season=String(row.getCell(3).value);
  counts[season]=(counts[season]??0)+1;
  row.eachCell(c=>{if(c.formula) formulas++;});
}
const missing=players.filter(p=>!ids.has(p.id));
console.log(JSON.stringify({sheets:wb.worksheets.map(s=>({name:s.name,rows:s.rowCount,columns:s.columnCount})),game:players.length,excel:ids.size,counts,formulas,missing:missing.map(p=>({id:p.id,name:p.name,tier:p.tier})),lastRow:sheet.getRow(sheet.rowCount).values,sample:sheet.getRow(3).values,filter:sheet.autoFilter,conditional:sheet.conditionalFormattings,views:sheet.views},null,2));
await writeFile('outputs/excel-sync/missing.json',JSON.stringify(missing,null,2));
if (process.argv.includes('--render')) {
  const require = createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/loader.cjs');
  const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
  const artifact = await SpreadsheetFile.importXlsx(await FileBlob.load('gia-cau-thu-bp.xlsx'));
  const preview=await artifact.render({sheetName:'Giá cầu thủ',range:'A1:N8',scale:1.5,format:'png'});
  await writeFile('outputs/excel-sync/before.png',new Uint8Array(await preview.arrayBuffer()));
  console.log('Rendered baseline.');
}
