import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import fs from 'node:fs/promises';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load('gia-cau-thu-bp.xlsx'));
console.log((await wb.inspect({ kind: 'workbook,sheet,table', maxChars: 3500, tableMaxRows: 3, tableMaxCols: 5 })).ndjson);
const image = await wb.render({ sheetName: 'Giá cầu thủ', range: 'A1:N8', scale: 1.5, format: 'png' });
await fs.writeFile('outputs/classification/before.png', new Uint8Array(await image.arrayBuffer()));
