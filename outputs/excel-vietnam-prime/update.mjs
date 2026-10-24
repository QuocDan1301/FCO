import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { players, seasons, MAX_LEVEL, ovr } from '../../src/game.ts';
import { syncRosterRows } from '../../scripts/excel-roster.mjs';

const dir=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'outputs/excel-vietnam-prime';
await fs.mkdir(dir,{recursive:true});
const path='gia-cau-thu-bp.xlsx';
const require=createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/loader.cjs');
const {FileBlob,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const old=new ExcelJS.Workbook();await old.xlsx.readFile(path);
const source=old.getWorksheet('Giá cầu thủ');
const last=source.rowCount;
const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
if(!process.argv.includes('--write')) {
  const image=await workbook.render({sheetName:source.name,range:`A${last-5}:N${last}`,scale:1.5,format:'png'});
  await fs.writeFile(`${dir}/before.png`,new Uint8Array(await image.arrayBuffer()));
  console.log(JSON.stringify({rows:last,game:players.length}));
} else {
  try {await fs.access('~$gia-cau-thu-bp.xlsx');throw new Error('Excel đang mở bảng giá.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.copyFile(path,`${dir}/before.xlsx`,fs.constants.COPYFILE_EXCL);
  const priceData=JSON.parse(await fs.readFile('src/player-prices.json','utf8'));
  const added=syncRosterRows(old,players,priceData.players);
  const sheet=workbook.worksheets.getItem(source.name);
  for(let n=last+1;n<=source.rowCount;n++) {
    const row=source.getRow(n),target=sheet.getRange(`A${n}:AH${n}`);
    target.copyFrom(sheet.getRange(`A${last}:AH${last}`),'all');
    target.values=[Array.from({length:34},(_,c)=>{
      const value=row.getCell(c+1).value;
      return value&&typeof value==='object'&&'formula'in value?null:value??null;
    })];
    target.format.rowHeight=28;
    sheet.getCell(n-1,1).format.wrapText=true;
    sheet.getCell(n-1,2).format.wrapText=true;
    for(let level=1;level<=MAX_LEVEL;level++) {
      const column=8+2*(level-1),cell=row.getCell(column+1);
      if(cell.formula)sheet.getCell(n-1,column).formulas=[[`=${cell.formula}`]];
      const price=sheet.getCell(n-1,column+1);
      price.format.fill=row.getCell(column+2).value===null?'#FFF2B3':level%2===0?'#EEF3F8':'#FFFFFF';
      price.format.font={name:'Arial',size:10,color:'#0000FF'};
    }
  }
  workbook.recalculate();
  const previews=new Map();
  added.forEach((id,i)=>{const tier=players.find(p=>p.id===id).tier;if(!previews.has(tier))previews.set(tier,last+i+1);});
  for(const [label,start] of previews) {
    const image=await workbook.render({sheetName:source.name,range:`A${start}:N${start+5}`,scale:1.5,format:'png'});
    await fs.writeFile(`${dir}/${label}.png`,new Uint8Array(await image.arrayBuffer()));
  }
  const output=await SpreadsheetFile.exportXlsx(workbook);await output.save(`${dir}/proposed.xlsx`);
  await fs.writeFile(`${dir}/added.json`,JSON.stringify(added));
  console.log(JSON.stringify({added:added.length,total:players.length,counts:Object.fromEntries([...new Set(players.filter(p=>added.includes(p.id)).map(p=>p.tier))].map(t=>[seasons[t],players.filter(p=>added.includes(p.id)&&p.tier===t).length]))}));
}
