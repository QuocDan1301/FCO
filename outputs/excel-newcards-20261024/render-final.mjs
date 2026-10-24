import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
const require=createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/loader.cjs');
const {FileBlob,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('gia-cau-thu-bp.xlsx'));
const image=await wb.render({sheetName:'Giá cầu thủ',range:'A473:N478',scale:1.5,format:'png'});
await writeFile('outputs/excel-newcards-20261024/amb-final.png',new Uint8Array(await image.arrayBuffer()));
