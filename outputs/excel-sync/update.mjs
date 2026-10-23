import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import ExcelJS from 'exceljs';
import { players, seasons, MAX_LEVEL, baseOvr } from '../../src/game.ts';

const path = 'gia-cau-thu-bp.xlsx';
try { await fs.access('~$gia-cau-thu-bp.xlsx'); throw new Error('Excel đang mở file, chưa thể cập nhật.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await fs.copyFile(path, 'outputs/excel-sync/before.xlsx', fs.constants.COPYFILE_EXCL); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const source = new ExcelJS.Workbook();
await source.xlsx.readFile(path);
const original = source.getWorksheet('Giá cầu thủ');
const ids = new Set();
for (let r=3;r<=original.rowCount;r++) ids.add(Number(original.getRow(r).getCell(1).value));
const missing=players.filter(p=>!ids.has(p.id));
const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const sheet=workbook.worksheets.getItem('Giá cầu thủ');
for(let i=0;i<missing.length;i++) {
  const player=missing[i], row=original.rowCount+i+1;
  const target=sheet.getRange(`A${row}:AH${row}`);
  target.copyFrom(sheet.getRange(`A${original.rowCount}:AH${original.rowCount}`),'all');
  const values=[player.id,player.name,seasons[player.tier],player.pos,player.ovr,player.nation,player.club,player.wage??null];
  for(let level=1;level<=MAX_LEVEL;level++) values.push(null,null);
  target.values=[values];
  target.format.rowHeight=28;
  sheet.getCell(row-1,2).format.wrapText=true;
  for(let level=1;level<=MAX_LEVEL;level++) {
    const col=8+2*(level-1);
    const bonus=baseOvr({playerId:player.id,level})-player.ovr;
    sheet.getCell(row-1,col).formulas=[[`=$E${row}+${bonus}`]];
    sheet.getCell(row-1,col+1).format.fill='#FFF2B3';
    sheet.getCell(row-1,col+1).format.font={name:'Arial',size:10,color:'#0000FF'};
  }
}
workbook.recalculate();
const preview=await workbook.render({sheetName:'Giá cầu thủ',range:`A${original.rowCount+1}:N${original.rowCount+7}`,scale:1.5,format:'png'});
await fs.writeFile('outputs/excel-sync/after.png',new Uint8Array(await preview.arrayBuffer()));
const output=await SpreadsheetFile.exportXlsx(workbook);
await output.save('outputs/excel-sync/proposed.xlsx');
console.log(`Prepared ${missing.length} new rows; preserved source at outputs/excel-sync/before.xlsx.`);
