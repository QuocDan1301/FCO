import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveTopMessages } from '../src/live-tops.ts';

test('Dòng LIVE khi không có tin: lần lượt Top 1, 2, 3 từng mục BXH, bỏ mục trống / chưa có điểm', () => {
  const board = {
    ovr: [{ name: 'An', ovr: 141, playerId: 7, level: 10, mine: false, effect: 'gold' as const }, { name: 'Bình', ovr: 139, playerId: null, level: null, mine: false }, { name: 'Chi', ovr: 138, playerId: 7, level: 9, mine: true }, { name: 'Dũng', ovr: 130, playerId: 7, level: 8, mine: false }],
    squad: [{ name: 'An', value: 2400000000, mine: false }, { name: 'Bình', value: 1500000, mine: false }],
    penalty: [{ name: 'Bình', goals: 0, mine: false }],
    me: { ovr: null, ovrRank: null, squad: null, squadRank: null },
  };
  const ranked = [{ name: 'Chi', points: 1520, tier: 'gold' as const, wins: 10, draws: 1, losses: 2, mine: true }, { name: 'An', points: 1400, tier: 'gold' as const, wins: 8, draws: 0, losses: 3, mine: false }];
  const all = liveTopMessages(board, ranked, id => id === 7 ? { name: 'Pelé', season: 'ICTM' } : undefined), msgs = all.map(m => m.text);
  assert.deepEqual([all[0].name, all[0].effect, all[1].effect], ['An', 'gold', null], 'kèm tên + hiệu ứng Premium để tô lên tên');
  assert.deepEqual(msgs, [
    '🥇 Top 1 Đập thẻ OVR cao nhất: HLV An · Pelé · mùa ICTM · +10 · OVR 141',
    '🥈 Top 2 Đập thẻ OVR cao nhất: HLV Bình · OVR 139',
    '🥉 Top 3 Đập thẻ OVR cao nhất: HLV Chi · Pelé · mùa ICTM · +9 · OVR 138',
    '🥇 Top 1 Giá trị đội hình: HLV An · 2.4B BP',
    '🥈 Top 2 Giá trị đội hình: HLV Bình · 1.5M BP',
    '🥇 Top 1 GLXH: HLV Chi · 1.520 điểm',
    '🥈 Top 2 GLXH: HLV An · 1.400 điểm',
  ]);
  assert.deepEqual(liveTopMessages(null, null), []);
});

test('Dòng LIVE: tô hiệu ứng Premium đúng phần tên HLV trong câu', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const LiveTicker = (await import('../src/LiveTicker.tsx')).default;
  const html = renderToStaticMarkup(createElement(LiveTicker, { reduced: true, messages: [{ text: '🔥 Chúc mừng HLV An đập thành công Pelé lên +10 · OVR 141!', name: 'An', effect: 'fire' }] }));
  assert.match(html, /HLV <span class="fx-name fx-fire">An<\/span> đập thành công/);
  const plain = renderToStaticMarkup(createElement(LiveTicker, { reduced: true, messages: [{ text: 'HLV Bình lên Top 1', name: 'Bình', effect: null }] }));
  assert.doesNotMatch(plain, /fx-name/);
});
