import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateClassification } from '../scripts/import-classification.mjs';
test('CSV: BOM, ô có dấu phẩy, nháy kép, xuống dòng; nội dung ô chỉ là dữ liệu', () => {
  assert.deepEqual(parseCsv('\uFEFFID,Lý do\r\n1,"a, b ""c""\nx"\r\n'), [{ ID: '1', 'Lý do': 'a, b "c"\nx' }]);
  assert.throws(() => parseCsv('A,B\n1'), /số cột/);
  assert.throws(() => parseCsv('A\n"x'), /dấu nháy/);
});
test('Chặn dữ liệu sai ID, mùa, nhóm, thiếu dòng hoặc trùng cầu thủ', () => {
  const player = { id: 1, name: 'Ronaldo', tier: 'eternal', pos: 'ST', ovr: 126 };
  const row = { ID: '1', 'Tên cầu thủ': 'Ronaldo', 'Mùa thẻ': 'ICON TM', 'Vị trí': 'ST', 'OVR gốc (+1)': '126', 'Mã Nhóm': 'Nhóm 1', 'Hạng Team Color': 'Tier 1 (Phổ biến)', 'Hệ số Giá +1 / Giá sàn OVR': '30.3', 'Hệ số Giá +5 / Giá sàn OVR': '27.01' };
  const validate = rows => validateClassification(rows, [player], { eternal: 'ICON TM' });
  assert.equal(validate([row])[1].group, 1);
  assert.throws(() => validate([row, row]), /trùng/);
  assert.throws(() => validate([{ ...row, 'Mùa thẻ': '26TS' }]), /không khớp/);
  assert.throws(() => validate([{ ...row, 'Mã Nhóm': 'Nhóm 4' }]), /không hợp lệ/);
  assert.throws(() => validate([]), /Thiếu/);
});
