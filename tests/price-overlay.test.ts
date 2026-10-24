import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
// @ts-expect-error Node ESM workbook reader.
import { applyUpgradePrices, readUpgradePrice } from '../scripts/price-overlay.mjs';

function fixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giá cầu thủ');
  sheet.getRow(1).values = ['ID', '+1', '+2', '+3'];
  sheet.getRow(2).values = ['ID', 'Giá BP', 'Giá BP', 'Giá BP'];
  sheet.getRow(3).values = [2, 999, 30, { formula: 'C3*2', result: 60 }];
  sheet.getRow(4).values = [1, 0, { formula: 'IF(B4=0,0,100)' }, null];
  return { sheet, prices: { 1: [7, 8, 9], 2: [10, 20, 40] } };
}

test('overlay matches reordered IDs, keeps +1, uses cached formulas and preserves zero vs blank', () => {
  const { sheet, prices } = fixture();
  assert.deepEqual(applyUpgradePrices(sheet, prices, 3), { players: 2, cells: 4, changed: 4 });
  assert.deepEqual(prices, { 1: [7, 0, null], 2: [10, 30, 60] });
});

test('missing formula cache is accepted only for a proven zero guard, including shared formulas', () => {
  const { sheet } = fixture();
  sheet.getCell('C3').value = { formula: 'IF(B3=0,0,100)' };
  assert.throws(() => readUpgradePrice(sheet.getCell('C3'), 'price'));
  sheet.getCell('B3').value = 0;
  sheet.getCell('C4').value = { sharedFormula: 'C3' };
  assert.equal(readUpgradePrice(sheet.getCell('C3'), 'price'), 0);
  assert.equal(readUpgradePrice(sheet.getCell('C4'), 'price'), 0);
  sheet.getCell('C3').value = { formula: 'B3+123' };
  assert.throws(() => readUpgradePrice(sheet.getCell('C3'), 'price'));
});

test('duplicate, missing and unknown IDs and invalid prices fail without changing existing prices', () => {
  for (const modify of [
    (sheet: ExcelJS.Worksheet) => { sheet.getCell('A4').value = 2; },
    (sheet: ExcelJS.Worksheet) => { sheet.getCell('A4').value = null; },
    (sheet: ExcelJS.Worksheet) => { sheet.getCell('A4').value = 99; },
    (sheet: ExcelJS.Worksheet) => { sheet.getCell('C4').value = -1; },
    (sheet: ExcelJS.Worksheet) => { sheet.getCell('C2').value = 'OVR'; },
  ]) {
    const { sheet, prices } = fixture();
    const original = structuredClone(prices);
    modify(sheet);
    assert.throws(() => applyUpgradePrices(sheet, prices, 3));
    assert.deepEqual(prices, original);
  }
});
