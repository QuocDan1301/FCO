import { players, seasons, MAX_LEVEL, baseOvr, ovr } from '../src/game.ts';

// Append only: existing prices, formulas, manual OVRs and worksheet order stay intact.
export function syncRosterRows(workbook, roster = players, priceTable = {}) {
  const sheet = workbook.getWorksheet('Giá cầu thủ');
  if (!sheet) throw new Error('Không thấy trang "Giá cầu thủ" trong file Excel.');
  const columns = { OVR: new Map(), 'Giá BP': new Map() };
  let level = null;
  for (let column = 1; column <= sheet.columnCount; column++) {
    const top = String(sheet.getRow(1).getCell(column).value ?? '').trim();
    if (/^\+\d+$/.test(top)) level = Number(top.slice(1));
    const sub = String(sheet.getRow(2).getCell(column).value ?? '').trim();
    if (level && columns[sub]) columns[sub].set(level, column);
  }
  for (const [name, map] of Object.entries(columns)) {
    if (map.size !== MAX_LEVEL) throw new Error(`Cần đủ ${MAX_LEVEL} cột "${name}" để bổ sung thẻ vào Excel.`);
  }
  const ids = new Set();
  let template;
  for (let n = 3; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n), id = Number(row.getCell(1).value);
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Trùng ID ${id} trong Excel; cần kiểm tra trước khi đồng bộ.`);
    ids.add(id);
    template = row;
  }
  const added = [];
  for (const player of roster) {
    if (ids.has(player.id)) continue;
    const row = sheet.getRow(sheet.rowCount + 1);
    if (template) {
      row.height = Math.max(template.height ?? 15, 28);
      for (let column = 1; column <= sheet.columnCount; column++) {
        row.getCell(column).style = structuredClone(template.getCell(column).style);
      }
    }
    row.values = [player.id, player.name, seasons[player.tier], player.pos, player.ovr, player.nation, player.club, player.wage ?? null];
    row.getCell(3).alignment = { ...row.getCell(3).alignment, wrapText: true };
    for (let grade = 1; grade <= MAX_LEVEL; grade++) {
      const card = { playerId: player.id, level: grade };
      const value = ovr(card);
      const cell = row.getCell(columns.OVR.get(grade));
      const bonus = baseOvr(card) - player.ovr;
      cell.value = value === player.ovr + bonus ? { formula: `$E${row.number}+${bonus}`, result: value } : value;
      const manual = value !== baseOvr(card);
      cell.font = { name: 'Arial', size: 10, ...(manual ? { bold: true, color: { argb: 'FF6B21A8' } } : {}) };
      cell.fill = manual ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6DAFF' } }
        : grade % 2 === 0 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F8' } } : { type: 'pattern', pattern: 'none' };
      const price = row.getCell(columns['Giá BP'].get(grade));
      // Preserve supplied prices; unknown prices stay blank rather than becoming zero.
      price.value = priceTable[player.id]?.[grade - 1] ?? null;
      price.fill = price.value === null ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2B3' } }
        : grade % 2 === 0 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F8' } } : { type: 'pattern', pattern: 'none' };
      price.font = { name: 'Arial', size: 10, color: { argb: 'FF0000FF' } };
    }
    ids.add(player.id);
    added.push(player.id);
  }
  if (added.length && sheet.autoFilter) {
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  }
  return added;
}
