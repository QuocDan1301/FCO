import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boltPoints } from '../src/click-fx.ts';

test('Hiệu ứng click: tia sét đi từ gần tâm ra ngoài đúng hướng, nằm trong khung 100×100', () => {
  let s = 1; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const angle of [0, Math.PI / 2, Math.PI, 4]) {
    const pts = boltPoints(angle, rand).split(' ').map(p => p.split(',').map(Number));
    assert.equal(pts.length, 5);
    const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
    assert.ok(Math.abs(Math.hypot(fx - 50, fy - 50) - 9) < .2, 'bắt đầu cách tâm 9');
    assert.ok(Math.abs(Math.hypot(lx - 50, ly - 50) - 34) < .2, 'kết thúc cách tâm 34');
    assert.ok(Math.abs(Math.atan2(ly - 50, lx - 50) - Math.atan2(Math.sin(angle), Math.cos(angle))) < .01, 'đúng hướng (toạ độ làm tròn 0,1)');
    for (const [x, y] of pts) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100);
  }
});
