import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { copyFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { players, MAX_LEVEL, ovr } from '../../src/game.ts';
const before=new ExcelJS.Workbook(), after=new ExcelJS.Workbook();
await before.xlsx.readFile('outputs/excel-sync/before.xlsx');
await after.xlsx.readFile('outputs/excel-sync/proposed.xlsx');
const differences=[], styles=[];
let formulas=0;
for(const original of before.worksheets) {
  const updated=after.getWorksheet(original.name);
  assert.ok(updated);
  assert.deepEqual(updated.views, original.views, 'Preserve worksheet panes and view settings');
  assert.deepEqual(updated.model.merges, original.model.merges, 'Preserve merged headers');
  for(let row=1;row<=original.rowCount;row++) for(let col=1;col<=original.columnCount;col++) {
    const a=original.getCell(row,col),b=updated.getCell(row,col);
    if(!isDeepStrictEqual(a.value,b.value)) differences.push({sheet:original.name,cell:a.address,before:a.value,after:b.value});
    if(a.formula) formulas++;
    if(!isDeepStrictEqual(a.style,b.style)) styles.push({sheet:original.name,cell:a.address,before:a.style,after:b.style});
  }
}
console.log(JSON.stringify({valueDifferences:differences.length,valueExamples:differences.slice(0,5),styleDifferences:styles.length,styleExamples:styles.slice(0,2),preservedFormulas:formulas},null,2));
assert.equal(differences.length,0,'Existing cell values and formulas must be preserved');
const sheet=after.getWorksheet('Giá cầu thủ');
const seen=new Set();
for(let n=3;n<=sheet.rowCount;n++) {
  const row=sheet.getRow(n),id=Number(row.getCell(1).value),p=players.find(p=>p.id===id);
  assert.ok(p);assert.ok(!seen.has(id));seen.add(id);
  if(p.tier==='prime') for(let level=1;level<=MAX_LEVEL;level++) {
    assert.equal(row.getCell(8+2*level-1).result,ovr({playerId:id,level}));
    assert.equal(row.getCell(8+2*level).value,null);
  }
}
assert.equal(seen.size,players.length);
assert.equal(after.worksheets.length,before.worksheets.length);
console.log(`PASS: ${seen.size} players, all 60 PRIME rows, ${formulas} original formulas and all original values preserved.`);
if(process.argv.includes('--apply')) await copyFile('outputs/excel-sync/proposed.xlsx','gia-cau-thu-bp.xlsx');
