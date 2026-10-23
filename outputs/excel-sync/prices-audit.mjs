import ExcelJS from 'exceljs';
import { marketQuote } from '../../src/market.ts';
const workbook=new ExcelJS.Workbook();
await workbook.xlsx.readFile('outputs/excel-sync/before.xlsx');
const sheet=workbook.getWorksheet('Giá cầu thủ');
const differences=[];
for(let n=3;n<=sheet.rowCount;n++) {
  const row=sheet.getRow(n),id=Number(row.getCell(1).value);
  for(let level=1;level<=13;level++) {
    const cell=row.getCell(8+2*level),saved=cell.value?.result??cell.value;
    const game=marketQuote({playerId:id,level}).price;
    if(saved!==game) differences.push({id,level,saved,game,difference:game-saved,relative:Math.abs(game-saved)/Math.max(1,game)});
  }
}
differences.sort((a,b)=>b.relative-a.relative);
console.log(JSON.stringify({count:differences.length,largest:differences.slice(0,5),largestAbsolute:[...differences].sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference)).slice(0,8)},null,2));
