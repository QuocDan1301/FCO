import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { syncRosterRows } from './excel-roster.mjs';
import { readNumber } from './excel-values.mjs';
import { applyUpgradePrices } from './price-overlay.mjs';

// Run with: npm run prices:import
// +1 và OVR lấy từ gia-cau-thu-bp.xlsx; giá +2…+13 ưu tiên gia-cau-thu-bp2.xlsx khi có file.
// Ô "OVR" khác OVR game tự tính (OVR gốc + phần tăng theo cấp) được ghi vào src/excel-overrides.json.
const root = fileURLToPath(new URL('../', import.meta.url));
const workbookPath = `${root}gia-cau-thu-bp.xlsx`;
const pricesPath = `${root}src/player-prices.json`, overridesPath = `${root}src/excel-overrides.json`;

try { await access(workbookPath); } catch {
  console.log('Không có gia-cau-thu-bp.xlsx, bỏ qua bước nạp từ Excel.');
  process.exit(0);
}
const { baseOvr, players, MAX_LEVEL } = await import('../src/game.ts');
const priceData = JSON.parse(await readFile(pricesPath, 'utf8'));

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(workbookPath);
const sheet = workbook.getWorksheet('Giá cầu thủ');
if (!sheet) throw new Error('Không thấy trang "Giá cầu thủ" trong file Excel.');
const added = syncRosterRows(workbook, players, priceData.players);
if (added.length) {
  try {
    await access(`${root}~$gia-cau-thu-bp.xlsx`);
    throw new Error('Excel đang mở bảng giá. Lưu và đóng file để bổ sung thẻ mới.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await workbook.xlsx.writeFile(workbookPath);
  console.log(`Đã bổ sung ${added.length} thẻ mới vào Excel.`);
}

// Dòng 1 có "+1" … "+13" (ô gộp), dòng 2 có "OVR" / "Giá BP": dò theo tiêu đề thay vì cố định số cột.
const columns = { OVR: new Map(), 'Giá BP': new Map() };
let level = null;
for (let column = 1; column <= sheet.columnCount; column++) {
  const top = String(sheet.getRow(1).getCell(column).value ?? '').trim();
  if (/^\+\d+$/.test(top)) level = Number(top.slice(1));
  const sub = String(sheet.getRow(2).getCell(column).value ?? '').trim();
  if (level && columns[sub]) columns[sub].set(level, column);
}
for (const [name, map] of Object.entries(columns)) if (map.size !== MAX_LEVEL) throw new Error(`Cần đủ ${MAX_LEVEL} cột "${name}" dưới tiêu đề +1 … +${MAX_LEVEL}, chỉ thấy ${map.size}.`);

const known = new Set(players.map(player => player.id));
// Mọi cầu thủ đã có dòng trong Excel; thẻ mới được bổ sung phía trên, giữ giá đã có hoặc để trống.
const prices = Object.fromEntries(players.map(player => [player.id, priceData.players[player.id] ?? Array(MAX_LEVEL).fill(null)]));
const ovrs = {}, warnings = [];
for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
  const row = sheet.getRow(rowNumber);
  const id = Number(row.getCell(1).value);
  if (!known.has(id)) continue;
  const name = row.getCell(2).value;
  const rowPrices = [], rowOvrs = [];
  for (let grade = 1; grade <= MAX_LEVEL; grade++) {
    rowPrices.push(readNumber(row.getCell(columns['Giá BP'].get(grade)), `${name} Giá BP +${grade} (dòng ${rowNumber})`, 0, Number.MAX_SAFE_INTEGER));
    const auto = baseOvr({ playerId: id, level: grade });
    const value = readNumber(row.getCell(columns.OVR.get(grade)), `${name} OVR +${grade} (dòng ${rowNumber})`, 1, 250);
    if (value !== null && value !== auto) (ovrs[id] ??= {})[grade] = value;
    rowOvrs.push(value ?? auto);
  }
  prices[id] = rowPrices;
  // Chỉ cảnh báo (không chặn) khi cấp cao không đắt hơn cấp thấp hoặc OVR giảm khi lên cấp: giá trị trong Excel vẫn được nạp.
  let previous = null;
  rowPrices.forEach((price, index) => {
    if (price === null) return;
    if (previous && price <= previous.price && (price !== 0 || previous.price !== 0)) warnings.push(`${name}: Giá BP +${index + 1} (${price.toLocaleString('vi-VN')}) không đắt hơn +${previous.grade} (${previous.price.toLocaleString('vi-VN')})`);
    previous = { grade: index + 1, price };
  });
  rowOvrs.forEach((value, index) => { if (index && value < rowOvrs[index - 1]) warnings.push(`${name}: OVR +${index + 1} (${value}) thấp hơn +${index} (${rowOvrs[index - 1]})`); });
}
if (warnings.length) console.warn(`Lưu ý: ${warnings.length} chỗ cấp cao không cao hơn cấp thấp (vẫn nạp theo Excel).\n- ${warnings.join('\n- ')}`);

let upgradePricesLoaded = false;
try { await access(`${root}gia-cau-thu-bp2.xlsx`); upgradePricesLoaded = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (upgradePricesLoaded) {
  const upgradeWorkbook = new ExcelJS.Workbook();
  await upgradeWorkbook.xlsx.readFile(`${root}gia-cau-thu-bp2.xlsx`);
  const result = applyUpgradePrices(upgradeWorkbook.getWorksheet('Giá cầu thủ'), prices, MAX_LEVEL);
  console.log(`Bảng giá bp2: ${result.players} cầu thủ, ${result.cells} ô giá +2…+${MAX_LEVEL}.`);
}

const save = async (path, data) => {
  const output = JSON.stringify(data, null, 2) + '\n';
  if (await readFile(path, 'utf8').catch(() => '') === output) return false;
  await writeFile(path, output); return true;
};
const pricesChanged = JSON.stringify(prices) !== JSON.stringify(priceData.players);
const wrotePrices = await save(pricesPath, { note: upgradePricesLoaded ? 'Giá +1 từ gia-cau-thu-bp.xlsx; +2…+13 từ gia-cau-thu-bp2.xlsx (npm run prices:import), theo id cầu thủ; null là chưa có giá.' : 'Bảng giá BP từ gia-cau-thu-bp.xlsx (npm run prices:import), theo id cầu thủ: giá +1 … +13, null là chưa có giá.', updatedAt: pricesChanged ? new Date().toISOString().slice(0, 10) : priceData.updatedAt, players: prices });
const wroteOvrs = await save(overridesPath, { note: 'OVR sửa tay từ gia-cau-thu-bp.xlsx (npm run prices:import), theo id cầu thủ rồi cấp thẻ; ưu tiên hơn OVR tự tính.', ovrs });
const filled = Object.values(prices).flat().filter(price => price !== null).length;
const summary = `${filled} ô có giá, ${Object.values(ovrs).reduce((total, levels) => total + Object.keys(levels).length, 0)} ô OVR sửa tay`;
console.log(wrotePrices || wroteOvrs ? `Đã nạp từ Excel: ${summary}.` : `Excel không đổi (${summary}).`);