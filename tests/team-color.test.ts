import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTeamColors, calculateTeamColorBuffs, DEFAULT_TEAM_COLOR_CONFIG } from '../src/teamColor.ts';
import type { Player, TeamColorConfig } from '../src/teamColor.ts';

// Cầu thủ mẫu: mặc định OVR 100, cấp +1, không CLB, quốc gia riêng (không ghép nhóm nào).
let seq = 0;
const player = (over: Partial<Player> = {}): Player => ({ id: `p${++seq}`, baseOvr: 100, upgradeLevel: 1, clubIds: [], nationId: `solo-${seq}`, ...over });
const many = (n: number, over: Partial<Player>) => Array.from({ length: n }, () => player(over));
const byId = (players: Player[]) => { const result = calculateTeamColorBuffs(players); return (p: Player) => result.find(r => r.playerId === p.id)!; };

describe('Team color CLB / quốc gia', () => {
  it('5 Real Madrid + 5 Chelsea: hai nhóm cùng mốc 2 (+2), cầu thủ lẻ không nhận gì', () => {
    const real = many(5, { clubIds: ['real-madrid'] }), chelsea = many(5, { clubIds: ['chelsea'] }), loner = player({ clubIds: ['ajax'] });
    const report = analyzeTeamColors([...real, ...chelsea, loner]);
    assert.deepEqual(report.active.map(c => [c.kind, c.key, c.tier, c.members.length]), [['club', 'chelsea', 2, 5], ['club', 'real-madrid', 2, 5]]);
    for (const r of report.players.slice(0, 10)) {
      assert.equal(r.ovrBonus, 2);
      assert.equal(r.finalOvr, 102);
      assert.deepEqual([r.stats.passing, r.stats.dribbling, r.stats.pace], [2, 2, 0]);
    }
    assert.equal(report.players[10].ovrBonus, 0);
    assert.deepEqual(report.players[10].applied, []);
  });

  it('Ranh giới mốc: 2 → 0, 3–4 → +1, 5–7 → +2, 8–11 → +3', () => {
    for (const [size, bonus] of [[2, 0], [3, 1], [4, 1], [5, 2], [7, 2], [8, 3], [11, 3]]) {
      const team = many(size, { clubIds: [`club-${size}`] });
      assert.ok(calculateTeamColorBuffs(team).every(r => r.ovrBonus === bonus), `nhóm ${size} người`);
    }
  });

  it('Cầu thủ thuộc CLB 3 người nhưng đội có nhóm quốc gia 8 người: chỉ nhận +3 quốc gia, không cộng thêm +1 CLB', () => {
    const french = many(8, { nationId: 'france' });
    french[0] = { ...french[0], clubIds: ['psg'] };
    const psgOthers = many(2, { clubIds: ['psg'], nationId: 'brazil' });
    const team = [...french, ...psgOthers, player()];
    const get = byId(team), report = analyzeTeamColors(team);
    assert.equal(get(french[0]).ovrBonus, 3);
    assert.deepEqual(get(french[0]).applied.map(a => [a.kind, a.key]), [['nation', 'france']]);
    assert.deepEqual([get(french[0]).stats.pace, get(french[0]).stats.passing], [3, 0]);
    // Hai cầu thủ PSG còn lại không thuộc nhóm Pháp vẫn nhận +1 CLB; nhóm PSG vẫn đang kích hoạt.
    for (const p of psgOthers) assert.deepEqual(get(p).applied.map(a => [a.kind, a.key, a.ovr]), [['club', 'psg', 1]]);
    const psg = report.active.find(c => c.key === 'psg')!;
    assert.deepEqual(psg.members.length, 3);
    assert.deepEqual(psg.beneficiaries, psgOthers.map(p => p.id));
  });

  it('Nhiều CLB trong một cầu thủ: lấy CLB có mốc cao nhất; CLB trùng trong cùng cầu thủ chỉ tính một lần', () => {
    const star = player({ clubIds: ['barca', 'inter', 'barca'] });
    const barca = many(4, { clubIds: ['barca'] }), inter = many(2, { clubIds: ['inter'] });
    const team = [star, ...barca, ...inter];
    const report = analyzeTeamColors(team), get = byId(team);
    assert.equal(report.active.find(c => c.key === 'barca')!.members.length, 5);
    assert.deepEqual(get(star).applied.map(a => [a.key, a.ovr]), [['barca', 2]]);
    assert.ok(inter.every(p => get(p).applied.find(a => a.key === 'inter')?.ovr === 1));
  });
});

describe('Team color cấp thẻ (cộng cao)', () => {
  it('Cộng dồn với team color CLB: 5 Milan + 6 thẻ từ +5 trở lên', () => {
    const milanHigh = many(4, { clubIds: ['milan'], upgradeLevel: 5 }), milanLow = player({ clubIds: ['milan'], upgradeLevel: 2 });
    const othersHigh = many(2, { upgradeLevel: 7 }), othersLow = many(4, { upgradeLevel: 1 });
    const team = [...milanHigh, milanLow, ...othersHigh, ...othersLow];
    const report = analyzeTeamColors(team), get = byId(team);
    assert.deepEqual(report.active.map(c => [c.kind, c.key, c.members.length]), [['club', 'milan', 5], ['upgrade', 'level-5', 6], ['upgrade', 'level-3', 6]]);
    for (const p of milanHigh) {
      const r = get(p);
      assert.equal(r.ovrBonus, 4);
      assert.deepEqual(r.applied.map(a => a.kind), ['club', 'upgrade']);
      assert.deepEqual([r.stats.passing, r.stats.shooting, r.stats.defending], [2, 2, 2]);
    }
    assert.equal(get(milanLow).ovrBonus, 2);
    for (const p of othersHigh) assert.deepEqual(get(p).applied.map(a => [a.key, a.ovr]), [['level-5', 2]]);
    for (const p of othersLow) assert.equal(get(p).ovrBonus, 0);
    // Mốc +3 kích hoạt nhưng không ai nhận vì ai đủ +3 cũng đã có mốc +5 mạnh hơn (các mốc cấp thẻ không cộng dồn).
    assert.deepEqual(report.active.find(c => c.key === 'level-3')!.beneficiaries, []);
  });

  it('Thẻ +8 được tính cho mốc +5; khi đủ 5 thẻ +8 thì chính các thẻ đó lên mốc +8', () => {
    const fives = many(4, { upgradeLevel: 5 }), eight = player({ upgradeLevel: 8 });
    let get = byId([...fives, eight]);
    assert.deepEqual(get(eight).applied.map(a => a.key), ['level-5']);
    assert.ok(fives.every(p => get(p).ovrBonus === 2));
    const eights = many(5, { upgradeLevel: 10 }), five = player({ upgradeLevel: 6 });
    get = byId([...eights, five]);
    assert.ok(eights.every(p => get(p).applied[0].key === 'level-8' && get(p).ovrBonus === 3));
    assert.deepEqual(get(five).applied.map(a => a.key), ['level-5']);
  });

  it('scope "team": quy tắc kích hoạt thì cả đội nhận, kể cả cầu thủ chưa đủ cấp', () => {
    const config: TeamColorConfig = { ...DEFAULT_TEAM_COLOR_CONFIG, upgrade: [{ id: 'all-5', tier: 1, minLevel: 5, minPlayers: 3, ovr: 1, stats: {}, scope: 'team' }] };
    const team = [...many(3, { upgradeLevel: 5 }), player({ upgradeLevel: 1 })];
    assert.ok(calculateTeamColorBuffs(team, config).every(r => r.ovrBonus === 1));
  });
});

describe('Biên và tính thuần', () => {
  it('Đội trống trả về rỗng; thứ tự kết quả theo đầu vào; không sửa đầu vào hay cấu hình', () => {
    assert.deepEqual(analyzeTeamColors([]), { players: [], active: [] });
    const team = many(3, { clubIds: ['ajax'], upgradeLevel: 9 });
    const snapshot = JSON.stringify(team), configSnapshot = JSON.stringify(DEFAULT_TEAM_COLOR_CONFIG);
    const result = calculateTeamColorBuffs([...team].reverse());
    assert.deepEqual(result.map(r => r.playerId), [...team].reverse().map(p => p.id));
    result[0].applied[0].stats.passing = 99;
    assert.equal(JSON.stringify(team), snapshot);
    assert.equal(JSON.stringify(DEFAULT_TEAM_COLOR_CONFIG), configSnapshot);
  });

  it('Quốc gia / CLB rỗng không ghép nhóm; cấu hình mốc không theo thứ tự vẫn chọn đúng', () => {
    assert.ok(calculateTeamColorBuffs(many(11, { nationId: '', clubIds: [''] })).every(r => r.ovrBonus === 0));
    const shuffled: TeamColorConfig = { ...DEFAULT_TEAM_COLOR_CONFIG, club: [...DEFAULT_TEAM_COLOR_CONFIG.club].reverse() };
    assert.ok(calculateTeamColorBuffs(many(6, { clubIds: ['roma'] }), shuffled).every(r => r.ovrBonus === 2));
  });

  it('Báo lỗi: quá 11 người, trùng mã, OVR / cấp sai, cấu hình sai', () => {
    assert.throws(() => calculateTeamColorBuffs(many(12, {})), RangeError);
    const p = player();
    assert.throws(() => calculateTeamColorBuffs([p, { ...p }]), /trùng/);
    assert.throws(() => calculateTeamColorBuffs([player({ baseOvr: NaN })]), RangeError);
    assert.throws(() => calculateTeamColorBuffs([player({ upgradeLevel: 2.5 })]), RangeError);
    assert.throws(() => calculateTeamColorBuffs([player()], { ...DEFAULT_TEAM_COLOR_CONFIG, club: [{ tier: 1, minPlayers: 0, ovr: 1, stats: {} }] }), RangeError);
  });
});
