import assert from 'node:assert/strict';
import {copyFile,readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import ExcelJS from 'exceljs';
import {players,seasons,MAX_LEVEL,ovr} from '../../src/game.ts';
import {syncRosterRows} from '../../scripts/excel-roster.mjs';
const dir=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'outputs/excel-vietnam-prime';
const before=new ExcelJS.Workbook(),after=new ExcelJS.Workbook();
await before.xlsx.readFile(`${dir}/before.xlsx`);await after.xlsx.readFile(`${dir}/proposed.xlsx`);
assert.deepEqual(after.worksheets.map(s=>s.name),before.worksheets.map(s=>s.name));
let formulas=0,cells=0;
for(const sheet of before.worksheets) {
  const updated=after.getWorksheet(sheet.name);
  assert.deepEqual(updated.views,sheet.views);
  assert.deepEqual(updated.model.merges,sheet.model.merges);
  for(let n=1;n<=sheet.rowCount;n++)for(let c=1;c<=sheet.columnCount;c++) {
    const a=sheet.getCell(n,c),b=updated.getCell(n,c);
    assert.deepEqual(b.value,a.value,`${sheet.name}!${a.address} value`);
    assert.deepEqual(b.style,a.style,`${sheet.name}!${a.address} style`);
    if(a.formula)formulas++;
    cells++;
  }
}
const priceData=JSON.parse(await readFile('src/player-prices.json','utf8'));
const added=syncRosterRows(before,players,priceData.players);
const expected=before.getWorksheet('Giá cầu thủ'),sheet=after.getWorksheet('Giá cầu thủ');
assert.equal(sheet.rowCount,players.length+2);
const seen=new Set(),counts={};
for(let n=3;n<=sheet.rowCount;n++) {
  const row=sheet.getRow(n),id=Number(row.getCell(1).value),player=players.find(p=>p.id===id);
  assert.ok(player);assert.ok(!seen.has(id));seen.add(id);
  counts[seasons[player.tier]]=(counts[seasons[player.tier]]??0)+1;
  if(added.includes(id)) {
    assert.deepEqual(row.values,expected.getRow(n).values,`New row ${n}`);
    for(let level=1;level<=MAX_LEVEL;level++)assert.equal(row.getCell(8+level*2-1).result,ovr({playerId:id,level}));
  }
  row.eachCell(cell=>assert.ok(!cell.value?.error,`${cell.address} formula error`));
}
assert.equal(seen.size,players.length);
assert.deepEqual(syncRosterRows(after,players,priceData.players),[],'No duplicate rows on rerun');
const summary={total:seen.size,added:added.length,counts,preservedFormulas:formulas,preservedCells:cells,status:'PASS'};
await writeFile(`${dir}/verification.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
if(process.argv.includes('--apply'))await copyFile(`${dir}/proposed.xlsx`,'gia-cau-thu-bp.xlsx');
