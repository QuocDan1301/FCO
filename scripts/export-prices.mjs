import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { players, MAX_LEVEL, ovr } from '../src/game.ts';
import { marketQuote } from '../src/market.ts';

// Run with: npm run prices:export
// Xuất gia-cau-thu-bp.xlsx từ bảng giá và OVR game đang dùng. Sửa xong lưu file là nạp lại
// được bằng npm run prices:import (npm run dev tự nạp khi file đổi).
const root = fileURLToPath(new URL('../', import.meta.url));
const workbookPath = `${root}gia-cau-thu-bp.xlsx`;
const force = process.argv.includes('--force');
const exists = file => access(file).then(() => true, () => false);
// Xuất lại là ghi đè cả file: không làm khi Excel đang mở file, hoặc file có ô OVR / Giá BP khác game (sửa mà chưa nạp).
if (!force && await exists(`${root}~$gia-cau-thu-bp.xlsx`)) {
  console.error('gia-cau-thu-bp.xlsx đang mở trong Excel. Lưu và đóng file rồi xuất lại (hoặc thêm --force để ghi đè).');
  process.exit(1);
}
const { ovrs: ovrOverrides } = JSON.parse(await readFile(`${root}src/excel-overrides.json`, 'utf8'));
const season = { prime: 'INFINITE PRIME', eternal: 'ICON TM', stellar: '26TS', origin: 'NO.7', vietnam: 'VIETNAM', prm: 'PRIME', mdl: 'MEDALIST', amb: 'FC AMBASSADOR', uc: 'UC', wg: 'WG', ut: 'UT', cu: 'CU', gru: 'GRU', rtn: 'RTN', dc: 'DC', cc: 'CC', bld: 'BLD', wb: 'WB', spt: 'SPT', bdo: 'BDO', hw23: '23HW', ep24: '24EP', ptg: 'PTG' }, order = { prime: 0, eternal: 1, stellar: 2, origin: 3, vietnam: 4, prm: 5, mdl: 6, amb: 7, uc: 8, wg: 9, ut: 10, cu: 11, gru: 12, rtn: 13, dc: 14, cc: 15, bld: 16, wb: 17, spt: 18, bdo: 19, hw23: 20, ep24: 21, ptg: 22 };
const list = [...players].sort((a, b) => order[a.tier] - order[b.tier] || b.ovr - a.ovr || a.name.localeCompare(b.name));

const font = (extra = {}) => ({ name: 'Arial', size: 10, ...extra });
const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } });
const border = { top: { style: 'thin', color: { argb: 'FFD0D7DE' } }, left: { style: 'thin', color: { argb: 'FFD0D7DE' } }, bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } }, right: { style: 'thin', color: { argb: 'FFD0D7DE' } } };
const center = { horizontal: 'center', vertical: 'middle' };
// Số thật, hiển thị gọn: ≥ 1 tỷ → "7,43 tỷ", ≥ 1 triệu → "689,0 tr".
const SHORT = '[>=1000000000]0.0#,,," tỷ";[>=1000000]0.0#,," tr";#,##0';
const COLORS = { head: '1F3B57', sub: '2E5577', band: 'EEF3F8', missing: 'FFF2B3', manual: 'E6DAFF', price: '0000FF', manualText: '6B21A8' };

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Giá cầu thủ', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
const info = ['ID', 'Tên', 'Mùa thẻ', 'Vị trí', 'OVR gốc', 'Quốc tịch', 'CLB', 'Lương'];
const column = (level, k) => info.length + 2 * (level - 1) + 1 + k; // k = 0: OVR, 1: Giá BP
const header = (cell, value, color = COLORS.head) => { cell.value = value; cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); cell.fill = fill(color); cell.alignment = center; cell.border = border; };
info.forEach((name, i) => { sheet.mergeCells(1, i + 1, 2, i + 1); header(sheet.getCell(1, i + 1), name); });
for (let level = 1; level <= MAX_LEVEL; level++) {
  sheet.mergeCells(1, column(level, 0), 1, column(level, 1));
  header(sheet.getCell(1, column(level, 0)), `+${level}`);
  header(sheet.getCell(2, column(level, 0)), 'OVR', COLORS.sub);
  header(sheet.getCell(2, column(level, 1)), 'Giá BP', COLORS.sub);
}

let missing = 0, manual = 0;
list.forEach((player, index) => {
  const row = sheet.getRow(index + 3);
  [player.id, player.name, season[player.tier], player.pos, player.ovr, player.nation, player.club, player.wage ?? null].forEach((value, i) => {
    const cell = row.getCell(i + 1); cell.value = value; cell.font = font(); cell.border = border;
  });
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const band = level % 2 === 0 ? fill(COLORS.band) : undefined;
    const ovrCell = row.getCell(column(level, 0));
    const ovrManual = ovrOverrides[player.id]?.[level] !== undefined;
    ovrCell.value = ovr({ playerId: player.id, level }); ovrCell.font = font(ovrManual ? { color: { argb: 'FF' + COLORS.manualText }, bold: true } : {}); ovrCell.border = border; ovrCell.alignment = { horizontal: 'center' };
    if (ovrManual) { ovrCell.fill = fill(COLORS.manual); manual++; } else if (band) ovrCell.fill = band;
    const price = marketQuote({ playerId: player.id, level }).price;
    const cell = row.getCell(column(level, 1));
    cell.value = price; cell.numFmt = SHORT; cell.border = border; cell.alignment = { horizontal: 'right' };
    cell.font = font({ color: { argb: 'FF' + COLORS.price } });
    if (price === null) { cell.fill = fill(COLORS.missing); missing++; }
    else if (band) cell.fill = band;
  }
});
[5, 20, 9, 7, 8, 13, 15, 7].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
for (let level = 1; level <= MAX_LEVEL; level++) { sheet.getColumn(column(level, 0)).width = 5.5; sheet.getColumn(column(level, 1)).width = 10.5; }
sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: list.length + 2, column: column(MAX_LEVEL, 1) } };

const guide = workbook.addWorksheet('Hướng dẫn');
guide.getCell('A1').value = `Bảng OVR và giá BP cầu thủ từ +1 tới +${MAX_LEVEL}`; guide.getCell('A1').font = font({ size: 12, bold: true });
[
  `Mỗi cấp (+1 … +${MAX_LEVEL}) có 2 cột: OVR là OVR game tính ở cấp đó (OVR gốc + phần tăng thêm khi nâng cấp), Giá BP là giá của thẻ ở cấp đó.`,
  'Sửa giá hoặc OVR: gõ số vào cột Giá BP (số đầy đủ, vd. 7430000000) hoặc cột OVR, lưu file rồi chạy npm run prices:import. Đang chạy npm run dev thì chỉ cần lưu file, game tự nạp và tải lại; mothe.html cần npm run build lại.',
  'Nếu cấp cao rẻ hơn hoặc OVR thấp hơn cấp dưới, bước nạp chỉ in cảnh báo để kiểm tra lại; giá trị trong Excel vẫn được nạp.',
  'Chỉ cột Giá BP và OVR từng cấp được nạp vào game. Sửa OVR gốc, tên, lương… trong file này không làm thay đổi game.',
  'File này là bảng giá BP duy nhất của game: ô Giá BP ghi gì thì game dùng đúng như vậy. Ô OVR chữ tím đậm, nền tím nhạt là OVR sửa tay (khác OVR game tự tính).',
  `Ô nền vàng nhạt: mức thẻ chưa có giá (${missing} ô), chưa mua bán được trên thị trường. Xóa trắng một ô OVR thì cấp đó quay về OVR tự tính.`,
  'Giá hiển thị gọn theo tỷ / triệu nhưng ô vẫn là số đầy đủ.',
  'Không đổi cột ID và các dòng tiêu đề: ID dùng để khớp từng dòng với cầu thủ khi nạp lại.',
].forEach((text, i) => { const cell = guide.getCell(i + 3, 1); cell.value = '• ' + text; cell.font = font(); });
guide.getColumn(1).width = 130;

if (!force && await exists(workbookPath)) {
  const saved = new ExcelJS.Workbook(); await saved.xlsx.readFile(workbookPath);
  const before = saved.getWorksheet('Giá cầu thủ'), after = workbook.getWorksheet('Giá cầu thủ'), changed = [];
  const plain = value => value && typeof value === 'object' && 'result' in value ? value.result : value ?? null;
  // So theo mã cầu thủ (cột ID), không theo số dòng: thêm cầu thủ mới làm các dòng xếp lại nhưng không phải là sửa.
  const savedRows = new Map();
  if (before) for (let row = 3; row <= before.rowCount; row++) savedRows.set(Number(before.getRow(row).getCell(1).value), before.getRow(row));
  for (let row = 3; row <= after.rowCount; row++) {
    const fresh = after.getRow(row), saved = savedRows.get(Number(fresh.getCell(1).value));
    if (!saved) continue;
    for (let col = info.length + 1; col <= column(MAX_LEVEL, 1); col++) if (plain(saved.getCell(col).value) !== plain(fresh.getCell(col).value)) changed.push(`${fresh.getCell(2).value} ${after.getRow(2).getCell(col).value} +${Math.ceil((col - info.length) / 2)} (dòng ${saved.number})`);
  }
  if (before && changed.length) {
    console.error(`Không xuất: gia-cau-thu-bp.xlsx có ${changed.length} ô khác game (sửa mà chưa nạp), xuất lại sẽ xóa mất. Chạy npm run prices:import trước, hoặc thêm --force để bỏ các chỗ sửa đó.\n- ${changed.slice(0, 10).join('\n- ')}`);
    process.exit(1);
  }
}
await workbook.xlsx.writeFile(workbookPath);
console.log(`Đã xuất gia-cau-thu-bp.xlsx: ${list.length} cầu thủ, ${manual} ô sửa tay, ${missing} ô chưa có giá.`);