import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players } from '../src/game.ts';
import { GK_STATS, OUTFIELD_STATS, playerStats, statProfile } from '../src/player-stats.ts';

test('Chỉ số chung: trung bình đúng bằng OVR với mọi vị trí, cố định theo cầu thủ', () => {
  const sample = players.filter((_, i) => i % 37 === 0);
  for (const p of sample) for (const overall of [60, 101, 137, 158]) {
    const s = playerStats(p, overall);
    assert.equal(s.length, p.pos === 'GK' ? GK_STATS.length : OUTFIELD_STATS.length);
    assert.equal(s.reduce((a, x) => a + x.value, 0), overall * s.length, `${p.name} ${overall}`);
    assert.deepEqual(playerStats(p, overall), s, 'gọi lại ra cùng kết quả');
  }
});

test('Chỉ số chung: tiền đạo dứt điểm cao hơn phòng ngự, trung vệ ngược lại, thủ môn mạnh nhất ở chỉ số thủ môn', () => {
  const get = (pos: string, name: string) => playerStats({ id: 7, pos }, 120).find(s => s.name === name)!.value;
  assert.ok(get('ST', 'Dứt điểm') > get('ST', 'Xoạc bóng') + 20);
  assert.ok(get('CB', 'Xoạc bóng') > get('CB', 'Dứt điểm') + 20);
  assert.ok(get('GK', 'Phản xạ') > get('GK', 'Tốc độ') + 15);
  assert.deepEqual(['ST', 'RW', 'CAM', 'CDM', 'LB', 'CB', 'GK'].map(statProfile), ['st', 'wing', 'mid', 'dm', 'fb', 'cb', 'gk']);
});
