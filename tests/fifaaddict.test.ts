import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFifaAddictEvidence } from '../scripts/import-fifaaddict.mjs';
const evidence = `Ronaldo ICONTM - FC Online (https://vn.fifaaddict.com/fo4db/pidawaklrry)
L13: 34 183cm 78kg TB
L43: Tốc độ 0
L80: [Input]C.Số ẩn[Input]INFO[Input]PRICE
L101: 【18†Sút xoáy】
L104: Chiều cao 183 cm. Trong game, Ronaldo có chỉ số OVR 126, chân không thuận 5. Các chỉ số chính: Thăng bằng 135, Tăng tốc 133, Khéo léo 133.
`;
test('Nhập đúng mùa, số liệu thật và URL nguồn; bỏ qua số 0 chưa tải', () => {
  const facts = parseFifaAddictEvidence(evidence, { name: 'Ronaldo', tier: 'eternal' });
  assert.equal(facts.weakFoot, 5);
  assert.equal(facts.heightCm, 183);
  assert.equal(facts.bodyType, 'average');
  assert.equal(facts.outsideFootShot, false);
  assert.equal(facts.stats['Thăng bằng'], 135);
  assert.equal(facts.stats['Tốc độ'], undefined);
  assert.equal(facts.source, 'https://vn.fifaaddict.com/fo4db/pidawaklrry');
});
test('Không lấy nhầm mùa, tên, nguồn hoặc khẳng định thiếu chỉ số ẩn khi không đọc đủ', () => {
  assert.equal(parseFifaAddictEvidence(evidence, { name: 'Ronaldo', tier: 'stellar' }), null);
  assert.equal(parseFifaAddictEvidence(evidence, { name: 'Cristiano Ronaldo', tier: 'eternal' }), null);
  assert.equal(parseFifaAddictEvidence(evidence.replace('vn.fifaaddict.com', 'example.com'), { name: 'Ronaldo', tier: 'eternal' }), null);
  const partial = evidence.replace('L80: [Input]C.Số ẩn[Input]INFO[Input]PRICE', '');
  assert.equal(parseFifaAddictEvidence(partial, { name: 'Ronaldo', tier: 'eternal' }).outsideFootShot, undefined);
});
