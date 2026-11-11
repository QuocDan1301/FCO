import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTeamColors, calculateTeamColorBuffs, DEFAULT_TEAM_COLOR_CONFIG, upgradeColorName } from '../src/teamColor.ts';
import type { Player, TeamColorConfig } from '../src/teamColor.ts';

// Cầu thủ mẫu: mặc định OVR 100, cấp +1, không CLB, quốc gia riêng (không ghép nhóm nào).
let seq = 0;
const player = (over: Partial<Player> = {}): Player => ({ id: `p${++seq}`, baseOvr: 100, upgradeLevel: 1, clubIds: [], nationId: `solo-${seq}`, ...over });
const many = (n: number, over: Partial<Player>) => Array.from({ length: n }, () => player(over));
const byId = (players: Player[]) => { const result = calculateTeamColorBuffs(players); return (p: Player) => result.find(r => r.playerId === p.id)!; };

describe('Team color CLB / quốc gia', () => {
  it('Ranh giới mốc theo fcoplayers: 3–5 cấp 1 (+1), 6–7 cấp 2 (+3), 8–10 cấp 3 (+3), 11 cấp 4 (+4)', () => {
    for (const [size, tier, bonus] of [[2, 0, 0], [3, 1, 1], [5, 1, 1], [6, 2, 3], [7, 2, 3], [8, 3, 3], [10, 3, 3], [11, 4, 4]]) {
      const team = many(size, { clubIds: [`club-${size}`] }), report = analyzeTeamColors(team);
      assert.ok(report.players.every(r => r.ovrBonus === bonus), `nhóm ${size} người`);
      assert.equal(report.active[0]?.tier ?? 0, tier, `cấp của nhóm ${size} người`);
    }
  });

  it('Quốc gia dùng cùng bảng mốc với CLB; chỉ số phụ chỉ có từ cấp 3', () => {
    assert.deepEqual(DEFAULT_TEAM_COLOR_CONFIG.nation.map(t => [t.minPlayers, t.ovr]), DEFAULT_TEAM_COLOR_CONFIG.club.map(t => [t.minPlayers, t.ovr]));
    const stats = (size: number) => calculateTeamColorBuffs(many(size, { clubIds: [`s-${size}`] }))[0].stats;
    assert.deepEqual([stats(7).passing, stats(7).dribbling], [0, 0]);
    assert.deepEqual([stats(8).passing, stats(8).dribbling], [2, 1]);
    assert.deepEqual([stats(11).passing, stats(11).dribbling], [3, 3]);
  });

  it('Cầu thủ thuộc CLB 3 người và quốc gia 8 người: chỉ nhận mức mạnh nhất, không cộng dồn', () => {
    const french = many(8, { nationId: 'france' });
    french[0] = { ...french[0], clubIds: ['psg'] };
    const psgOthers = many(2, { clubIds: ['psg'], nationId: 'brazil' });
    const team = [...french, ...psgOthers, player()];
    const get = byId(team), report = analyzeTeamColors(team);
    assert.equal(get(french[0]).ovrBonus, 3);
    assert.deepEqual(get(french[0]).applied.map(a => [a.kind, a.key]), [['nation', 'france']]);
    for (const p of psgOthers) assert.deepEqual(get(p).applied.map(a => [a.kind, a.key, a.ovr]), [['club', 'psg', 1]]);
    const psg = report.active.find(c => c.key === 'psg')!;
    assert.equal(psg.members.length, 3);
    assert.deepEqual(psg.beneficiaries, psgOthers.map(p => p.id));
  });

  it('Mẫu thật trên trang: 11 Real Madrid + 3 Spain, thẻ Spain vẫn chỉ nhận +4 của CLB', () => {
    const spain = many(3, { clubIds: ['real-madrid'], nationId: 'spain' }), rest = many(8, { clubIds: ['real-madrid'] });
    const get = byId([...spain, ...rest]);
    for (const p of [...spain, ...rest]) assert.deepEqual(get(p).applied.map(a => [a.key, a.tier, a.ovr]), [['real-madrid', 4, 4]]);
    // QG Spain đủ 3 người nhưng ai cũng đã nhận CLB mạnh hơn nên không hiện.
    assert.deepEqual(analyzeTeamColors([...spain, ...rest]).active.map(c => c.key), ['real-madrid']);
  });

  it('Nhiều CLB trong một cầu thủ: lấy CLB có mốc cao nhất; CLB trùng chỉ tính một lần', () => {
    const star = player({ clubIds: ['barca', 'inter', 'barca'] });
    const barca = many(5, { clubIds: ['barca'] }), inter = many(2, { clubIds: ['inter'] });
    const team = [star, ...barca, ...inter];
    const report = analyzeTeamColors(team), get = byId(team);
    assert.equal(report.active.find(c => c.key === 'barca')!.members.length, 6);
    assert.deepEqual(get(star).applied.map(a => [a.key, a.ovr]), [['barca', 3]]);
    assert.ok(inter.every(p => get(p).applied.find(a => a.key === 'inter')?.ovr === 1));
  });
});

describe('Team color cấp thẻ', () => {
  const keys = (team: Player[]) => analyzeTeamColors(team).active.filter(c => c.kind === 'upgrade').map(c => c.key);

  it('Cộng dồn với CLB; thẻ dưới +3 không nhận', () => {
    const milanHigh = many(5, { clubIds: ['milan'], upgradeLevel: 5 }), mid = many(3, { upgradeLevel: 4 }), low = many(3, { upgradeLevel: 2 });
    const get = byId([...milanHigh, ...mid, ...low]);
    for (const p of milanHigh) {
      assert.equal(get(p).ovrBonus, 1 + 1, 'CLB 5 người +1, bạc 5 thẻ +1');
      assert.deepEqual(get(p).applied.map(a => a.kind), ['club', 'upgrade']);
    }
    for (const p of mid) assert.equal(get(p).ovrBonus, 1, 'Đồng: 8 thẻ từ +3');
    for (const p of low) assert.equal(get(p).ovrBonus, 0);
  });

  it('Mốc từng màu theo bảng người dùng', () => {
    const bonus = (levels: number[]) => calculateTeamColorBuffs(levels.map(upgradeLevel => player({ upgradeLevel }))).map(r => r.ovrBonus);
    // Đồng (+3): một mốc từ 3 thẻ.
    assert.deepEqual(bonus([3, 4]), [0, 0]);
    assert.deepEqual(bonus([3, 3, 4]), [1, 1, 1]);
    assert.deepEqual(bonus(Array(11).fill(4)), Array(11).fill(1));
    // Bạc (+5): 3–5 thẻ +1, từ 6 thẻ +2.
    assert.deepEqual(bonus([5, 6, 7]), [1, 1, 1]);
    assert.deepEqual(bonus(Array(5).fill(7)), Array(5).fill(1));
    assert.deepEqual(bonus(Array(6).fill(5)), Array(6).fill(2));
    assert.deepEqual(bonus(Array(11).fill(7)), Array(11).fill(2));
    // Vàng (+8): 3–5 thẻ +1, 6–7 thẻ +3, từ 8 thẻ +4.
    assert.deepEqual(bonus([8, 9, 10]), [1, 1, 1]);
    assert.deepEqual(bonus(Array(6).fill(8)), Array(6).fill(3));
    assert.deepEqual(bonus(Array(7).fill(10)), Array(7).fill(3));
    assert.deepEqual(bonus(Array(8).fill(8)), Array(8).fill(4));
    // Bạch kim (+11): không có mốc 3–4 thẻ; 5–7 thẻ +4, từ 8 thẻ +5.
    assert.deepEqual(bonus(Array(4).fill(11)), Array(4).fill(1), '4 thẻ +11 chỉ được vàng 3–5 thẻ');
    assert.deepEqual(bonus(Array(5).fill(12)), Array(5).fill(4));
    assert.deepEqual(bonus(Array(7).fill(13)), Array(7).fill(4));
    assert.deepEqual(bonus(Array(8).fill(11)), Array(8).fill(5));
    assert.deepEqual([upgradeColorName(3), upgradeColorName(5), upgradeColorName(8), upgradeColorName(11)], ['Đồng', 'Bạc', 'Vàng', 'Bạch kim']);
  });

  it('Thẻ cao được đếm cho màu thấp; mỗi thẻ nhận màu mạnh nhất, màu không ai nhận thì ẩn', () => {
    const team = (...levels: number[]) => levels.map(upgradeLevel => player({ upgradeLevel }));
    const bonus = (levels: number[]) => calculateTeamColorBuffs(team(...levels)).map(r => r.ovrBonus);
    // 6 thẻ +8 và 2 thẻ +5: bạc đếm 8 thẻ (+2), vàng 6 thẻ (+3).
    assert.deepEqual(bonus([8, 8, 8, 8, 8, 8, 5, 5]), [3, 3, 3, 3, 3, 3, 2, 2]);
    assert.deepEqual(keys(team(8, 8, 8, 8, 8, 8, 5, 5)), ['gold-2', 'silver-2']);
    assert.deepEqual(keys(team(...Array(11).fill(8))), ['gold-3'], 'Cả đội +8: bạc, đồng không ai nhận nên ẩn');
    // 5 thẻ +11 cũng tính cho vàng nên vàng có 8 thẻ (cấp 3), nhưng chỉ 3 thẻ +8 nhận vàng; thẻ +11 nhận bạch kim.
    assert.deepEqual(keys(team(11, 11, 11, 11, 11, 8, 8, 8, 5, 3, 3)), ['platinum-1', 'gold-3', 'silver-2', 'bronze-1']);
    assert.deepEqual(bonus([11, 11, 11, 11, 11, 8, 8, 8, 5, 3, 3]), [4, 4, 4, 4, 4, 4, 4, 4, 2, 1, 1]);
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
    assert.ok(calculateTeamColorBuffs(many(6, { clubIds: ['roma'] }), shuffled).every(r => r.ovrBonus === 3));
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

describe('Team color hiển thị gọn', () => {
  it('Nhiều CLB cùng mức: gom người nhận vào ít CLB nhất, mỗi người vẫn +1; chỉ hiện CLB có người được cộng', () => {
    // X = a b c d, Y = a b e, Z = c d f → chỉ cần Y và Z (X thừa).
    const a = player({ clubIds: ['X', 'Y'] }), b = player({ clubIds: ['X', 'Y'] }), c = player({ clubIds: ['X', 'Z'] }), d = player({ clubIds: ['X', 'Z'] });
    const e = player({ clubIds: ['Y'] }), f = player({ clubIds: ['Z'] });
    const report = analyzeTeamColors([a, b, c, d, e, f]);
    assert.ok(report.players.every(r => r.ovrBonus === 1));
    assert.deepEqual(report.active.map(x => [x.key, x.beneficiaries.length]).sort(), [['Y', 3], ['Z', 3]]);
  });
  it('Gom không làm giảm mức cộng: người có CLB mạnh hơn vẫn nhận CLB đó', () => {
    const big = many(6, { clubIds: ['BIG', 'SMALL'] }), extra = many(2, { clubIds: ['SMALL'] });
    const report = analyzeTeamColors([...big, ...extra]);
    assert.deepEqual(report.players.map(r => r.ovrBonus), [3, 3, 3, 3, 3, 3, 3, 3]);
  });
});
