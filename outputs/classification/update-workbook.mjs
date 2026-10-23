import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const path = 'gia-cau-thu-bp.xlsx';
const data = JSON.parse(await fs.readFile('outputs/classification/game-prices.json', 'utf8'));
const config = JSON.parse(await fs.readFile('src/pricing-config.json', 'utf8'));
const groups = JSON.parse(await fs.readFile('src/player-classification-groups.json', 'utf8')).players;
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const sheet = wb.worksheets.getItem('Giá cầu thủ');
const prior = sheet.getRange('A3:AH312').values;
const col = n => { let s = ''; while(n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
const bonuses = [0,1,2,4,6,8,11,15,17,19,21,24,27];
const ratios = [1, 1 + config.plus2IncreasePercent / 100, 1.75, 2.1, 2.3, 2.6, 3.2, 4.2, 2.4, 2.5, 2.8, 3.2, 3.8];
let checked = 0;
for (let index = 0; index < prior.length; index++) {
  const row = index + 3, old = prior[index], record = data.find(item => item.id === old[0]);
  assert.ok(record, `Không thấy ID ${old[0]}`);
  assert.equal(old[1], record.name);
  assert.equal(old[2], record.season);
  assert.equal(old[9], record.values[0].price, `Giá +1 ${record.name}`);
  let cumulative = 1;
  for (let level = 2; level <= 13; level++) {
    cumulative *= ratios[level - 1];
    let factor = record.group === 1 && level >= 5 ? 1 + config.metaHeatPercent / 100 : 1;
    if (record.group === 3) {
      const start = config.fodderPlus5Multiple / (ratios[1] * 1.75 * 2.1 * 2.3), end = 1 - config.fodderPlus8DiscountPercent / 100;
      factor = level <= 4 ? 1 - config.fodderEarlyDiscountPercent / 100 : level >= 8 ? end : start + (end - start) * (level - 5) / 3;
    }
    const ovrCell = `${col(8 + 2 * level - 1)}${row}`, priceCell = `${col(8 + 2 * level)}${row}`;
    sheet.getRange(ovrCell).formulas = [[`=$E${row}+${bonuses[level - 1]}`]];
    sheet.getRange(priceCell).formulas = [[`=ROUND($J${row}*${ratios.slice(1, level).join('*')}*${factor},0)`]];
    sheet.getRange(priceCell).format.fill = level % 2 === 0 ? '#EEF3F8' : '#FFFFFF';
    sheet.getRange(priceCell).format.font = { name: 'Arial', size: 10, color: '#000000' };
  }
  checked++;
}
// Thông tin phân nhóm và giả định nằm trong tab hướng dẫn có sẵn; không đổi cấu trúc bảng giá.
const guide = wb.worksheets.getItem('Hướng dẫn');
const notes = [
  'Bảng OVR và giá BP +1 đến +13 — mô hình nâng cấp theo phân nhóm CSV',
  'Nguồn nhóm: phan_loai_cau_thu_fco.csv (người dùng cung cấp, 23/10/2026). 83 Nhóm 1, 96 Nhóm 2, 131 Nhóm 3.',
  'Giữ nguyên giá +1 ở cột J. Giá +2…+13 là công thức ROUND(giá +1 × hệ số tích lũy × điều chỉnh nhóm,0).',
  'Hệ số từng bước: 1.637; 1.75; 2.1; 2.3; 2.6; 3.2; 4.2; 2.4; 2.5; 2.8; 3.2; 3.8. Chỉ làm tròn ở giá cuối.',
  'Nhóm 1: biên nhiệt 25% từ +5 trở lên, giữ biên qua +8, không nhân chồng. Nhóm 2: giữ 100% giá chuẩn.',
  'Nhóm 3: +2…+4 giảm 20%; +5 = 7.5× giá +1; +6/+7 nội suy biên giảm; +8…+13 giảm 45% so với chuẩn.',
  'Nhóm 3 từ +9: Đóng băng thanh khoản (ghi chú mô phỏng, không khóa giao dịch). CSV không cung cấp số BP sàn OVR.',
  'Bảo hiểm từ +8 đến +12: 95% nếu OVR gốc ≤92; 80% nếu 93…100; 60% nếu ≥101. Không cộng phí vào giá thẻ.',
  'OVR cộng thêm: 0,1,2,4,6,8,11,15,17,19,21,24,27. Không tự triển khai Team Color hoặc chọn chỉ số ẩn.',
  'Sửa giá +1 rồi lưu và chạy npm run build để cập nhật game. Nhóm chỉnh bằng CSV rồi chạy script nhập nhóm. Giá cấp cao trong game luôn được tính từ +1.',
  'Không đổi ID hoặc tiêu đề. Cột OVR +2…+13 là công thức liên kết OVR gốc E. Lưu Excel để tính lại trước khi import.',
];
guide.getRange(`A1:A${notes.length}`).values = notes.map(text => [text]);
guide.getRange('C1:E1').values = [['ID', 'Nhóm CSV', 'Ghi chú +9…+13']];
guide.getRange('C2:E311').values = data.map(record => [record.id, record.group, record.group === 3 ? 'Đóng băng thanh khoản' : '']);
guide.getRange('C1:E1').format = { fill: '#1F3B57', font: { name: 'Arial', bold: true, color: '#FFFFFF' } };
guide.getRange('C2:E311').format.font = { name: 'Arial', size: 10 };
wb.recalculate();
for (let index = 0; index < prior.length; index++) {
  const row = index + 3, record = data.find(item => item.id === prior[index][0]);
  const result = sheet.getRange(`I${row}:AH${row}`).values[0];
  record.values.forEach((value, i) => {
    assert.equal(result[i * 2], value.ovr, `OVR ID ${record.id} +${i + 1}`);
    assert.equal(result[i * 2 + 1], value.price, `Giá ID ${record.id} +${i + 1}`);
  });
}
console.log(JSON.stringify({ checked, verified: checked * 26, plus1Preserved: true }));
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save('outputs/classification/gia-cau-thu-bp.xlsx');
await fs.copyFile('outputs/classification/gia-cau-thu-bp.xlsx', path);
const preview = await wb.render({ sheetName: 'Giá cầu thủ', range: 'I1:P10', scale: 1.5, format: 'png' });
await fs.writeFile('outputs/classification/after.png', new Uint8Array(await preview.arrayBuffer()));
