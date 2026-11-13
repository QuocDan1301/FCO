import { test } from 'node:test';
import assert from 'node:assert/strict';
import { players } from '../src/game.ts';
import { publicLineupState } from '../src/public-lineup.ts';
import { FORMATIONS } from '../src/squad.ts';

const some = players.slice(0, 11);

test('Xem đội hình HLV khác: dựng đủ 11 ô, OVR / lương / giá trị như màn Đội hình', () => {
  const v = publicLineupState({ formation: '4-3-3', slots: some.map(p => ({ playerId: p.id, level: 3 })) });
  assert.equal(v.set.formation, '4-3-3');
  assert.equal(v.cards.filter(Boolean).length, 11);
  assert.equal(v.slots.length, 11);
  assert.ok(v.summary.ovr > 0);
  assert.equal(v.cards[0]!.playerId, some[0].id);
});

test('Xem đội hình HLV khác: ô trống / cầu thủ lạ / cấp sai bỏ trống, sơ đồ lạ về mặc định, vị trí tuỳ chỉnh hỏng bị bỏ', () => {
  const slots = [null, { playerId: -5, level: 1 }, { playerId: some[0].id, level: 0 }, ...some.slice(1, 9).map(p => ({ playerId: p.id, level: 1 }))];
  const v = publicLineupState({ formation: 'xx', custom: [{ label: 'ST', x: 'a', y: 2 }], slots });
  assert.ok(FORMATIONS[v.set.formation]);
  assert.equal(v.cards.filter(Boolean).length, 8);
  assert.equal(v.cards[0], null); assert.equal(v.cards[1], null); assert.equal(v.cards[2], null);
  assert.equal(v.set.custom, undefined);
  assert.equal(publicLineupState({ formation: '4-3-3', slots: [] as never }).cards.filter(Boolean).length, 0);
});
