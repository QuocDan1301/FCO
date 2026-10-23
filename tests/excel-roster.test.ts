import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { players, MAX_LEVEL, ovr } from '../src/game';
// @ts-expect-error The workbook synchronizer is a Node ESM script.
import { syncRosterRows } from '../scripts/excel-roster.mjs';
// @ts-expect-error The spreadsheet value reader is a Node ESM script.
import { readNumber } from '../scripts/excel-values.mjs';

test('Excel accepts numeric/text/formula zero as a price, keeps blanks null and rejects negative prices', () => {
  for (const value of [0, '0', { formula: '0*2', result: 0 }]) {
    assert.equal(readNumber({ value }, 'Giá BP', 0, Number.MAX_SAFE_INTEGER), 0);
  }
  for (const value of [null, undefined, '']) assert.equal(readNumber({ value }, 'Giá BP', 0, Number.MAX_SAFE_INTEGER), null);
  for (const value of [-1, '-1', 0.5, NaN, Infinity]) assert.throws(() => readNumber({ value }, 'Giá BP', 0, Number.MAX_SAFE_INTEGER));
  assert.throws(() => readNumber({ value: 0 }, 'OVR', 1, 250));
});

function fixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giá cầu thủ');
  const headers = ['ID', 'Tên', 'Mùa thẻ', 'Vị trí', 'OVR gốc', 'Quốc tịch', 'CLB', 'Lương'];
  sheet.getRow(1).values = headers;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const column = 8 + 2 * level - 1;
    sheet.getCell(1, column).value = `+${level}`;
    sheet.getCell(2, column).value = 'OVR';
    sheet.getCell(2, column + 1).value = 'Giá BP';
  }
  const old = players.find(p => p.tier === 'eternal')!;
  sheet.getRow(3).values = [old.id, old.name, 'ICON TM', old.pos, old.ovr, old.nation, old.club, old.wage];
  sheet.getCell('J3').value = 987654321;
  sheet.getCell('L3').value = { formula: 'ROUND($J3*2,0)', result: 1975308642 };
  sheet.getCell('K3').value = 149;
  sheet.getCell('K3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6DAFF' } };
  sheet.autoFilter = 'A2:AH3';
  workbook.addWorksheet('Hướng dẫn').getCell('A1').value = 'Giữ nguyên ghi chú';
  return { workbook, sheet, old };
}

test('append missing cards, retain old prices/formulas/OVR, and remain idempotent', async () => {
  const { workbook, sheet, old } = fixture();
  const prime = players.filter(p => p.tier === 'prime');
  const before = structuredClone(sheet.getRow(3).values);
  const style = structuredClone(sheet.getCell('K3').style);
  assert.deepEqual(syncRosterRows(workbook, [old, ...prime]), prime.map(p => p.id));
  assert.deepEqual(sheet.getRow(3).values, before);
  assert.deepEqual(sheet.getCell('K3').style, style);
  assert.equal(workbook.getWorksheet('Hướng dẫn')!.getCell('A1').value, 'Giữ nguyên ghi chú');
  assert.equal(sheet.rowCount, 63);
  assert.notEqual(sheet.getCell('K4').fill.fgColor?.argb, 'FFE6DAFF', 'New cards do not inherit a manual OVR highlight');
  for (let n = 0; n < prime.length; n++) {
    const row = sheet.getRow(n + 4), player = prime[n];
    assert.equal(row.getCell(3).value, 'INFINITE PRIME');
    for (let level = 1; level <= MAX_LEVEL; level++) {
      assert.equal(row.getCell(8 + 2 * level - 1).result, ovr({ playerId: player.id, level }));
      assert.equal(row.getCell(8 + 2 * level).value, null);
    }
  }
  assert.deepEqual(syncRosterRows(workbook, [old, ...prime]), []);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(reopened.getWorksheet('Giá cầu thủ')!.getRow(3).values, before);
  assert.equal(reopened.getWorksheet('Giá cầu thủ')!.getCell('K4').result, ovr({ playerId: prime[0].id, level: 2 }));
});

test('reject duplicate Excel IDs before appending rows', () => {
  const { workbook, sheet, old } = fixture();
  sheet.getRow(4).values = [...sheet.getRow(3).values as unknown[]].slice(1);
  assert.throws(() => syncRosterRows(workbook, [old]), /Trùng ID/);
  assert.equal(sheet.rowCount, 4);
});

test('keep known prices when a new game card is appended to Excel', () => {
  const { workbook, sheet, old } = fixture();
  const player = players.find(p => p.tier === 'prime')!;
  syncRosterRows(workbook, [old, player], { [player.id]: [123456789] });
  assert.equal(sheet.getCell('J4').value, 123456789);
  assert.equal(sheet.getCell('L4').value, null);
});
