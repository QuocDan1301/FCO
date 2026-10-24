import { readNumber } from './excel-values.mjs';

// Read cached Excel values; only resolve the explicit IF(cell=0,0,...) guard
// when its cached zero is absent. Never execute arbitrary workbook formulas.
export function readUpgradePrice(cell, where) {
  const value = cell.value;
  if (value && typeof value === 'object' && !('result' in value) && (value.formula || value.sharedFormula)) {
    const guard = /^IF\((\$?[A-Z]+\$?\d+)=0,0,/i.exec(cell.formula.replace(/\s/g, ''));
    if (guard && readNumber(cell.worksheet.getCell(guard[1].replace(/\$/g, '')), where, 0, Number.MAX_SAFE_INTEGER) === 0) return 0;
  }
  return readNumber(cell, where, 0, Number.MAX_SAFE_INTEGER);
}

export function applyUpgradePrices(sheet, prices, maxLevel = 13) {
  if (!sheet) throw new Error('Không thấy trang Giá cầu thủ trong gia-cau-thu-bp2.xlsx.');
  const columns = new Map();
  let level = null;
  for (let column = 1; column <= sheet.columnCount; column++) {
    const top = String(sheet.getCell(1, column).value ?? '').trim();
    if (/^\+\d+$/.test(top)) level = Number(top.slice(1));
    if (level >= 2 && level <= maxLevel && String(sheet.getCell(2, column).value ?? '').trim() === 'Giá BP') {
      if (columns.has(level)) throw new Error(`Trùng cột Giá BP +${level}.`);
      columns.set(level, column);
    }
  }
  if (columns.size !== maxLevel - 1) throw new Error(`Cần đủ cột Giá BP +2 đến +${maxLevel}.`);
  const updates = new Map();
  let cells = 0, changed = 0;
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.getCell(1).value === null) continue;
    const id = Number(row.getCell(1).value);
    if (!Object.hasOwn(prices, id)) throw new Error(`ID ${id} không có trong game (dòng ${rowNumber}).`);
    if (updates.has(id)) throw new Error(`Trùng ID ${id} trong bảng giá mới.`);
    const values = [...prices[id]];
    for (let grade = 2; grade <= maxLevel; grade++) {
      const price = readUpgradePrice(row.getCell(columns.get(grade)), `ID ${id} Giá BP +${grade} (dòng ${rowNumber})`);
      if (price !== values[grade - 1]) changed++;
      values[grade - 1] = price;
      cells++;
    }
    updates.set(id, values);
  }
  const missing = Object.keys(prices).filter(id => !updates.has(Number(id)));
  if (missing.length) throw new Error(`Bảng giá mới thiếu ID: ${missing.join(', ')}.`);
  for (const [id, values] of updates) prices[id] = values;
  return { players: updates.size, cells, changed };
}
