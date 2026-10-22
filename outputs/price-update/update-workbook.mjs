import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const source = 'gia-cau-thu-bp.xlsx';
const output = 'outputs/price-update/gia-cau-thu-bp.xlsx';
const initialBytes = await fs.readFile(source);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const data = JSON.parse(await fs.readFile('src/player-prices.json', 'utf8'));
const missing = JSON.parse(await fs.readFile('data/datacenter/unavailable-prices.json', 'utf8'));
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = wb.worksheets.getItem('Giá cầu thủ');
if (process.argv.includes('--compact')) {
  const compactFormat = '[>=1000000000]0.##,,,"B";[>=1000000]0.##,,"M";#,##0';
  const priceRange = sheet.getRange('I2:U224');
  priceRange.setNumberFormat(compactFormat);
  priceRange.conditionalFormats.addCustom('AND(ISNUMBER(I2),I2>=1000000000,MOD(ROUND(I2/1000000000,2),1)=0)', { numberFormat: '0,,,"B"' });
  priceRange.conditionalFormats.addCustom('AND(ISNUMBER(I2),I2>=1000000,I2<1000000000,MOD(ROUND(I2/1000000,2),1)=0)', { numberFormat: '0,,"M"' });
  const guide = wb.worksheets.getItem('Hướng dẫn');
  guide.getRange('A11').values = [['Cách hiển thị: B = tỷ BP, M = triệu BP; tối đa 2 chữ số thập phân. Ví dụ 15.800.000.000 = 15.8B; 448.000.000 = 448M. Giá trị số gốc vẫn giữ nguyên.']];
  guide.getRange('A11').format.wrapText = true;
  guide.getRange('A11').format.rowHeight = 38;
  await wb.recalculate();
  const exported = await SpreadsheetFile.exportXlsx(wb);
  await exported.save(output);
  const preview = await wb.render({ sheetName: 'Giá cầu thủ', range: 'I1:O10', scale: 1.4, format: 'png' });
  await fs.writeFile('outputs/price-update/compact-prices.png', new Uint8Array(await preview.arrayBuffer()));
  if (hash(await fs.readFile(source)) !== hash(initialBytes)) throw new Error('Original workbook changed during formatting; prepared copy was kept.');
  await fs.writeFile('outputs/price-update/before-compact.xlsx', initialBytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  if (!process.argv.includes('--prepare-only')) await fs.copyFile(output, source);
  console.log('Prepared B/M workbook; numeric values preserved.');
  process.exit(0);
}
const rows = sheet.getRange('A2:H224').values;
if (rows.length !== data.summary.players || new Set(rows.map(row => row[0])).size !== 223) throw new Error('Workbook roster mismatch.');
const missingById = new Map(missing.players.map(player => [player.id, player]));
const levelsText = levels => {
  const groups = [];
  for (let i = 0; i < levels.length; i++) {
    let last = levels[i];
    const first = last;
    while (levels[i + 1] === last + 1) last = levels[++i];
    groups.push(first === last ? `+${first}` : `+${first}–+${last}`);
  }
  return groups.join(', ');
};
for (let column = 9; column <= 21; column++) {
  const name = String.fromCharCode(64 + column);
  if (column !== 9) sheet.getRange(`${name}1:${name}224`).copyFrom(sheet.getRange('I1:I224'), 'all');
  sheet.getRange(`${name}1`).values = [[`Giá BP +${column - 8}`]];
}
sheet.getRange('I2:U224').values = rows.map(row => {
  const entry = data.players[String(row[0])];
  if (!entry) throw new Error(`Unknown workbook ID ${row[0]}`);
  return entry.prices;
});
sheet.getRange('I2:U224').format.fill = '#FFFFFF';
sheet.getRange('I2:U224').setNumberFormat('#,##0');
sheet.getRange('I1:U224').format.columnWidth = 20;
sheet.getRange('I2:U224').conditionalFormats.add('containsBlanks', { format: { fill: '#FFF2CC' } });
for (const column of ['V', 'W']) sheet.getRange(`${column}1`).copyFrom(sheet.getRange('I1'), 'all');
sheet.getRange('V1:W1').values = [['Chưa có giá ở mức', 'Ngày dữ liệu']];
sheet.getRange('V2:W224').values = rows.map(row => [levelsText(missingById.get(row[0])?.missingLevels || []), new Date(`${data.asOfDate}T00:00:00Z`)]);
sheet.getRange('V1:V224').format.columnWidth = 36;
sheet.getRange('W1:W224').format.columnWidth = 16;
sheet.getRange('W2:W224').setNumberFormat('yyyy-mm-dd');
sheet.getRange('V2:V224').format.font = { color: '#9C6500', size: 11 };
sheet.getRange('V2:W224').format.verticalAlignment = 'center';

const guide = wb.worksheets.getItem('Hướng dẫn');
guide.getRange('A1').values = [['Bảng giá BP cầu thủ từ Garena Data Center · +1 đến +13']];
guide.getRange('A2:A10').values = [
  [`Ngày dữ liệu: ${data.asOfDate}. Đã cập nhật ${data.summary.totalPrices.toLocaleString('vi-VN')} mức giá cho 223 cầu thủ; ${data.summary.missingPrices.toLocaleString('vi-VN')} mức thẻ chưa có dữ liệu.`],
  ['Giá là lastPrice: giá giao dịch được Data Center ghi nhận trong cửa sổ 30 ngày, theo đúng mùa thẻ và cấp cộng.'],
  ['Ô giá trống nền vàng = chưa cập nhật được; không phải giá 0 và không suy ra từ giá cấp khác.'],
  ['Cột “Chưa có giá ở mức” liệt kê đầy đủ các cấp cộng còn thiếu cho từng cầu thủ.'],
  ['Ở mức +1 chưa cập nhật được: D. Drogba, Dunga và Xabi Alonso (đều mùa ICON TM).'],
  ['Toàn bộ cầu thủ hiện chưa có giá ở mức +10, +11, +12 và +13 trong dữ liệu nguồn đã kiểm tra.'],
  ['Không đổi cột ID: dùng để khớp chính xác từng dòng với cầu thủ trong game.'],
  [`Nguồn: ${data.endpoint}?window=30d&seasonId=100&limit=50&offset=0 (phân trang và lọc tương tự cho 26TOTS, NO.7).`],
  ['Đây là bản dữ liệu tại ngày ghi trong bảng; giá không tự thay đổi theo TTCN trong game.'],
];
guide.getRange('A1:A10').format.columnWidth = 130;
guide.getRange('A2:A10').format.wrapText = true;
guide.getRange('A2:A10').format.rowHeight = 38;
await wb.recalculate();
console.log((await wb.inspect({ kind: 'region', sheetId: 'Giá cầu thủ', range: 'I1:M5', maxChars: 1500, tableMaxRows: 5, tableMaxCols: 5 })).ndjson);
const exported = await SpreadsheetFile.exportXlsx(wb);
await exported.save(output);
for (const [name, sheetName, range] of [
  ['updated-prices', 'Giá cầu thủ', 'A1:J10'],
  ['missing-prices', 'Giá cầu thủ', 'R1:W10'],
  ['guide', 'Hướng dẫn', 'A1:A10'],
]) {
  const preview = await wb.render({ sheetName, range, scale: 1.2, format: 'png' });
  await fs.writeFile(`outputs/price-update/${name}.png`, new Uint8Array(await preview.arrayBuffer()));
}
if (hash(await fs.readFile(source)) !== hash(initialBytes)) throw new Error('Original workbook changed during update. Updated copy is ready; original was not overwritten.');
await fs.writeFile('outputs/price-update/original-backup.xlsx', initialBytes, { flag: 'wx' });
await fs.copyFile(output, source);
console.log('Updated existing workbook: ' + source);
