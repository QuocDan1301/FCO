import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load('gia-cau-thu-bp.xlsx'));
console.log((await wb.inspect({ kind: 'workbook,sheet', maxChars: 1800, tableMaxRows: 3, tableMaxCols: 4 })).ndjson);
console.log(wb.help('workbook.render', { include: 'index,examples,notes', maxChars: 2800 }).ndjson);
const preview = await wb.render({ sheetName: 'Giá cầu thủ', range: 'A1:I10', scale: 1.3, format: 'png' });
await fs.writeFile('outputs/price-update/before.png', new Uint8Array(await preview.arrayBuffer()));
