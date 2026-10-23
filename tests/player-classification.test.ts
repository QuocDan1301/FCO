import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlayer } from '../src/player-classification';
const p = { name: 'Ví dụ', pos: 'ST', club: 'Madrid', flag: 'FR' };
test('Hai chân 5-5 và Tier 1 vào Nhóm 1; 5-4 cần đủ ba điểm cộng', () => {
  assert.equal(classifyPlayer(p, { weakFoot: 5 }).group, 1);
  assert.equal(classifyPlayer(p, { weakFoot: 4 }).group, 2);
  assert.equal(classifyPlayer(p, { weakFoot: 4, physical: 'good' }).group, 1);
});
test('Chân yếu có ngoại lệ CB/GK và sút má ngoài; hai điểm trừ vào Nhóm 3', () => {
  assert.equal(classifyPlayer(p, { weakFoot: 2, outsideFootShot: false, physical: 'bad' }).group, 3);
  assert.equal(classifyPlayer({ ...p, pos: 'CB' }, { weakFoot: 2, outsideFootShot: false, physical: 'bad' }).group, 2);
  assert.equal(classifyPlayer(p, { weakFoot: 2, outsideFootShot: true, physical: 'bad' }).group, 2);
});
test('Không coi thiếu dữ liệu hoặc CLB nhỏ hiện tại là điểm trừ', () => {
  const result = classifyPlayer({ ...p, name: 'Chưa biết', club: 'LAFC', flag: 'KR' });
  assert.equal(result.group, 2);
  assert.equal(result.negatives, 0);
  assert.equal(result.provisional, true);
  assert.equal(classifyPlayer(p, { weakFoot: 2, outsideFootShot: false, teamColorTier: 3 }).group, 3);
});
test('Thủ môn: cao ít nhất 192 là điểm cộng; dưới 188 là điểm trừ', () => {
  const keeper = { ...p, pos: 'GK', name: 'T. Courtois' };
  assert.equal(classifyPlayer(keeper, { heightCm: 192 }).group, 1);
  assert.equal(classifyPlayer(keeper, { heightCm: 188 }).positives, 2);
  assert.equal(classifyPlayer(keeper, { heightCm: 187 }).negatives, 1);
});
test('Tên quốc dân do người dùng cung cấp là một tiêu chí, không tự đủ Nhóm 1', () => {
  const result = classifyPlayer({ ...p, name: 'Cristiano Ronaldo' });
  assert.equal(result.positives, 2);
  assert.equal(result.group, 2);
  assert.equal(classifyPlayer({ ...p, name: 'Cristiano Ronaldo' }, { physical: 'good' }).group, 1);
});
