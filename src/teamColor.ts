// Team color (độ ăn ý) cho đội hình đá chính, kiểu FC Online. Module thuần: không đọc bản lưu / dữ liệu game, chỉ nhận danh sách cầu thủ + cấu hình.
//
// Ghép nhóm và cộng dồn:
// 1. CLB / quốc gia: đếm số cầu thủ mỗi nhóm (một cầu thủ có thể thuộc nhiều CLB). Nhóm đủ người thì kích hoạt mốc cao nhất đạt được.
//    Một cầu thủ thuộc nhiều nhóm đang kích hoạt (nhiều CLB, hoặc CLB + quốc gia) chỉ nhận MỘT buff mạnh nhất trong số đó — không cộng dồn.
// 2. Cấp thẻ (cộng cao): mỗi quy tắc đếm cầu thủ có cấp ≥ minLevel, nên thẻ +8 vẫn được tính cho mốc +5. Quy tắc đủ người thì kích hoạt;
//    mỗi cầu thủ chỉ nhận quy tắc mạnh nhất mà mình đủ cấp (các mốc cấp thẻ không cộng dồn với nhau).
// 3. Buff CLB/quốc gia và buff cấp thẻ CỘNG DỒN với nhau (OVR và từng chỉ số).
//
// Độ phức tạp: O(n·c + n log n) với n ≤ 11 cầu thủ, c = số CLB mỗi cầu thủ — đếm nhóm bằng Map một lượt, không so từng cặp cầu thủ.

export const STAT_KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'] as const;
export type StatKey = typeof STAT_KEYS[number];
export type StatBonus = Partial<Record<StatKey, number>>;
export type StatTotals = Record<StatKey, number>;

export interface Player {
  id: string;
  baseOvr: number;
  upgradeLevel: number;
  /** Mọi CLB cầu thủ từng / đang thuộc về; trùng lặp được bỏ, chuỗi rỗng bị bỏ qua. */
  clubIds: readonly string[];
  /** Chuỗi rỗng = không tính team color quốc gia. */
  nationId: string;
  /** Mùa thẻ (vd. 'GRU'); trống / thiếu = không tính team color mùa (thêm 2026-11-14). */
  seasonId?: string;
}

/** Mốc team color CLB / quốc gia: kích hoạt khi nhóm có từ minPlayers cầu thủ (mốc kế tiếp là giới hạn trên). */
export interface TeamColorTier {
  tier: number;
  minPlayers: number;
  ovr: number;
  stats: StatBonus;
}
/** Team color cấp thẻ: kích hoạt khi có từ minPlayers cầu thủ cấp ≥ minLevel. scope 'team' = cả đội nhận, mặc định chỉ cầu thủ đủ cấp. */
export interface UpgradeTeamColorRule {
  id: string;
  tier: number;
  minLevel: number;
  minPlayers: number;
  ovr: number;
  stats: StatBonus;
  scope?: 'qualified' | 'team';
}
export interface TeamColorConfig {
  maxPlayers: number;
  club: readonly TeamColorTier[];
  nation: readonly TeamColorTier[];
  /** Team color mùa: cùng mốc với CLB / quốc gia; thiếu = không có. */
  season?: readonly TeamColorTier[];
  upgrade: readonly UpgradeTeamColorRule[];
}

// 'lineup': phần cộng cố định cho mọi cầu thủ đá chính (squad.ts), không phải team color nhưng hiện cùng chỗ.
// 'season': team color mùa thẻ (2026-11-14) — như CLB / quốc gia, mỗi cầu thủ chỉ nhận MỘT trong ba loại (loại mạnh nhất).
export type TeamColorKind = 'club' | 'nation' | 'season' | 'upgrade' | 'lineup';
type IdentityKind = 'club' | 'nation' | 'season';
/** Một buff một cầu thủ thực nhận (key = mã CLB / quốc gia / id quy tắc cấp thẻ). */
export interface AppliedBuff {
  kind: TeamColorKind;
  key: string;
  tier: number;
  ovr: number;
  stats: StatBonus;
  minLevel?: number;
}
/** Team color đang kích hoạt trên đội: members = cầu thủ thuộc nhóm, beneficiaries = cầu thủ thực sự nhận buff này. */
export interface ActiveTeamColor extends AppliedBuff {
  members: string[];
  beneficiaries: string[];
}
export interface BuffResult {
  playerId: string;
  baseOvr: number;
  ovrBonus: number;
  finalOvr: number;
  stats: StatTotals;
  applied: AppliedBuff[];
}
export interface TeamColorReport {
  players: BuffResult[];
  active: ActiveTeamColor[];
}

// Mốc theo fcoplayers.com/squad-builder (đọc từ đội hình mẫu trên trang ngày 2026-11-09):
// - CLB và quốc gia cùng bảng mốc: 3–5 người cấp 1 (+1), 6–7 cấp 2 (+3), 8–10 cấp 3 (+3, chỉ số phụ +2 / +1), 11 cấp 4 (+4, chỉ số phụ +3 / +3).
// - Cấp thẻ theo bảng người dùng (2026-11-09), đếm số thẻ đạt từ mức đó trở lên:
//   Đồng (+3): từ 3 thẻ +1. Bạc (+5): 3–5 thẻ +1, từ 6 thẻ +2. Vàng (+8): 3–5 thẻ +1, 6–7 thẻ +3, từ 8 thẻ +4.
//   Bạch kim (+11): 5–7 thẻ +4, từ 8 thẻ +5 (không có mốc 3–4 thẻ).
// Trang gắn chỉ số phụ riêng cho từng CLB / quốc gia; game dùng chung theo loại: CLB chuyền / rê, quốc gia tốc độ / thể lực, mùa sút / phòng ngự.
const tiers = ([first, second]: readonly [StatKey, StatKey]): TeamColorTier[] => [
  { tier: 1, minPlayers: 3, ovr: 1, stats: {} },
  { tier: 2, minPlayers: 6, ovr: 3, stats: {} },
  { tier: 3, minPlayers: 8, ovr: 3, stats: { [first]: 2, [second]: 1 } },
  { tier: 4, minPlayers: 11, ovr: 4, stats: { [first]: 3, [second]: 3 } },
];
// tiers: [số thẻ tối thiểu, OVR cộng] theo thứ tự cấp 1, 2, 3.
const UPGRADE_COLORS: { id: string; name: string; minLevel: number; tiers: [number, number][] }[] = [
  { id: 'bronze', name: 'Đồng', minLevel: 3, tiers: [[3, 1]] },
  { id: 'silver', name: 'Bạc', minLevel: 5, tiers: [[3, 1], [6, 2]] },
  { id: 'gold', name: 'Vàng', minLevel: 8, tiers: [[3, 1], [6, 3], [8, 4]] },
  { id: 'platinum', name: 'Bạch kim', minLevel: 11, tiers: [[5, 4], [8, 5]] },
];
export const upgradeColorName = (minLevel: number) => UPGRADE_COLORS.find(c => c.minLevel === minLevel)?.name ?? `Cấp +${minLevel}`;
// Tên hiển thị của một team color: "QG Brazil cấp 1", "Vàng cấp 2".
export const teamColorName = (c: Pick<AppliedBuff, 'kind' | 'key' | 'tier' | 'minLevel'>) => c.kind === 'lineup' ? 'Vào đội hình' : `${c.kind === 'upgrade' ? upgradeColorName(c.minLevel!) : `${c.kind === 'club' ? 'CLB' : c.kind === 'season' ? 'Mùa' : 'QG'} ${c.key}`} cấp ${c.tier}`;
export const DEFAULT_TEAM_COLOR_CONFIG: TeamColorConfig = {
  maxPlayers: 11,
  club: tiers(['passing', 'dribbling']),
  nation: tiers(['pace', 'physical']),
  season: tiers(['shooting', 'defending']),
  upgrade: UPGRADE_COLORS.flatMap(color => color.tiers.map(([minPlayers, ovr], i) => ({ id: `${color.id}-${i + 1}`, tier: i + 1, minLevel: color.minLevel, minPlayers, ovr, stats: {} }))),
};

const statSum = (stats: StatBonus) => STAT_KEYS.reduce((sum, key) => sum + (stats[key] ?? 0), 0);
const isCount = (n: number) => Number.isInteger(n) && n >= 1;
// Cấu hình được chuẩn hoá (sắp mốc giảm dần) một lần cho mỗi đối tượng cấu hình — hàm tính chạy liên tục khi xếp đội hình.
const prepared = new WeakMap<TeamColorConfig, { club: TeamColorTier[]; nation: TeamColorTier[]; season: TeamColorTier[]; upgrade: UpgradeTeamColorRule[] }>();
function prepare(config: TeamColorConfig) {
  const hit = prepared.get(config);
  if (hit) return hit;
  if (!isCount(config.maxPlayers)) throw new RangeError('maxPlayers phải là số nguyên ≥ 1.');
  const checkTier = (t: { minPlayers: number; ovr: number; stats: StatBonus }) => {
    if (!isCount(t.minPlayers) || !Number.isFinite(t.ovr) || !Object.values(t.stats).every(v => Number.isFinite(v))) throw new RangeError('Mốc team color sai: minPlayers ≥ 1, OVR và chỉ số phải là số.');
  };
  const byPlayers = (list: readonly TeamColorTier[]) => { list.forEach(checkTier); return [...list].sort((a, b) => b.minPlayers - a.minPlayers); };
  config.upgrade.forEach(rule => { checkTier(rule); if (!Number.isInteger(rule.minLevel)) throw new RangeError(`Quy tắc ${rule.id}: minLevel phải là số nguyên.`); });
  if (new Set(config.upgrade.map(r => r.id)).size !== config.upgrade.length) throw new RangeError('id quy tắc cấp thẻ bị trùng.');
  const result = { club: byPlayers(config.club), nation: byPlayers(config.nation), season: byPlayers(config.season ?? []), upgrade: [...config.upgrade].sort((a, b) => b.minLevel - a.minLevel) };
  prepared.set(config, result);
  return result;
}
// Mốc cao nhất nhóm đạt được (danh sách mốc đã sắp giảm dần theo minPlayers, chỉ vài phần tử).
const reachedTier = (count: number, list: TeamColorTier[]) => list.find(t => count >= t.minPlayers) ?? null;
// So hai buff CLB / quốc gia cho cùng một cầu thủ: OVR cao hơn → tổng chỉ số cao hơn → nhóm đông hơn → CLB trước quốc gia → mã nhỏ hơn.
function better(a: ActiveTeamColor, b: ActiveTeamColor) {
  return a.ovr - b.ovr || statSum(a.stats) - statSum(b.stats) || a.members.length - b.members.length || (a.kind === b.kind ? 0 : a.kind === 'club' ? 1 : -1) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
}
const applied = ({ kind, key, tier, ovr, stats, minLevel }: ActiveTeamColor): AppliedBuff => ({ kind, key, tier, ovr, stats: { ...stats }, ...(minLevel === undefined ? {} : { minLevel }) });

/** Phân tích đầy đủ: buff từng cầu thủ (đúng thứ tự đầu vào) và danh sách team color đang kích hoạt. */
export function analyzeTeamColors(startingXI: readonly Player[], config: TeamColorConfig = DEFAULT_TEAM_COLOR_CONFIG): TeamColorReport {
  const rules = prepare(config);
  if (startingXI.length > config.maxPlayers) throw new RangeError(`Đội hình đá chính tối đa ${config.maxPlayers} cầu thủ.`);
  const ids = new Set<string>();
  for (const p of startingXI) {
    if (!p.id || ids.has(p.id)) throw new Error(`Mã cầu thủ trống hoặc bị trùng: "${p.id}".`);
    if (!Number.isFinite(p.baseOvr) || !Number.isInteger(p.upgradeLevel) || p.upgradeLevel < 0) throw new RangeError(`Cầu thủ ${p.id}: OVR phải là số, cấp thẻ là số nguyên ≥ 0.`);
    ids.add(p.id);
  }

  // 1. Đếm nhóm CLB / quốc gia trong một lượt (Set bỏ CLB trùng trong cùng một cầu thủ).
  const groups = new Map<string, { kind: IdentityKind; key: string; members: string[] }>();
  const groupKeysOf = new Map<string, string[]>();
  const join = (player: Player, kind: IdentityKind, key: string) => {
    const id = `${kind}:${key}`;
    const group = groups.get(id);
    if (group) group.members.push(player.id); else groups.set(id, { kind, key, members: [player.id] });
    groupKeysOf.get(player.id)!.push(id);
  };
  for (const p of startingXI) {
    groupKeysOf.set(p.id, []);
    for (const club of new Set(p.clubIds)) if (club) join(p, 'club', club);
    if (p.nationId) join(p, 'nation', p.nationId);
    if (p.seasonId) join(p, 'season', p.seasonId);
  }
  // 2. Nhóm đủ người → team color kích hoạt ở mốc cao nhất đạt được.
  const active = new Map<string, ActiveTeamColor>();
  for (const [id, group] of groups) {
    const tier = reachedTier(group.members.length, rules[group.kind]);
    if (tier) active.set(id, { kind: group.kind, key: group.key, tier: tier.tier, ovr: tier.ovr, stats: { ...tier.stats }, members: group.members, beneficiaries: [] });
  }
  // 3. Cấp thẻ: sắp cấp giảm dần một lần, quy tắc đã sắp minLevel giảm dần → đếm "cấp ≥ minLevel" bằng một con trỏ chạy tới.
  const byLevel = [...startingXI].sort((a, b) => b.upgradeLevel - a.upgradeLevel);
  const activeRules: ActiveTeamColor[] = [];
  let reached = 0;
  for (const rule of rules.upgrade) {
    while (reached < byLevel.length && byLevel[reached].upgradeLevel >= rule.minLevel) reached++;
    if (reached >= rule.minPlayers) activeRules.push({ kind: 'upgrade', key: rule.id, tier: rule.tier, ovr: rule.ovr, stats: { ...rule.stats }, minLevel: rule.minLevel, members: byLevel.slice(0, reached).map(p => p.id), beneficiaries: [] });
  }
  const teamWide = new Set(rules.upgrade.filter(r => r.scope === 'team').map(r => r.id));

  // 4. Phát buff: mỗi cầu thủ lấy 1 buff CLB/quốc gia mạnh nhất + 1 buff cấp thẻ mạnh nhất, rồi cộng dồn hai buff.
  // CLB / quốc gia: nhiều nhóm cùng mức (vd. huyền thoại từng khoác áo nhiều CLB) thì gom người nhận vào ít nhóm nhất —
  // lặp chọn nhóm phủ được nhiều cầu thủ chưa có màu nhất, chỉ tính người mà nhóm này đúng bằng mức tốt nhất của họ.
  // Mỗi người vẫn nhận đúng mức cộng cao nhất, chỉ bớt team color phải hiện.
  const value = (c: ActiveTeamColor) => c.ovr * 1000 + statSum(c.stats);
  const bestOf = new Map<string, number>();
  for (const p of startingXI) { let b = -1; for (const id of groupKeysOf.get(p.id)!) { const c = active.get(id); if (c) b = Math.max(b, value(c)); } bestOf.set(p.id, b); }
  const identityOf = new Map<string, ActiveTeamColor>();
  const candidates = [...active.values()];
  for (;;) {
    let pick: ActiveTeamColor | null = null, gain = 0;
    for (const c of candidates) {
      let n = 0;
      for (const id of c.members) if (!identityOf.has(id) && bestOf.get(id) === value(c)) n++;
      if (n > gain || (n > 0 && n === gain && pick && better(c, pick) > 0)) { pick = c; gain = n; }
    }
    if (!pick) break;
    for (const id of pick.members) if (!identityOf.has(id) && bestOf.get(id) === value(pick)) identityOf.set(id, pick);
  }
  // Bỏ nhóm thừa: mọi người nhận của nhóm đều chuyển được sang nhóm khác đang hiện, cùng mức → bỏ nhóm đó (thử nhóm ít người nhận trước).
  for (let changed = true; changed;) {
    changed = false;
    const used = [...new Set(identityOf.values())].sort((a, b) => [...identityOf.values()].filter(c => c === a).length - [...identityOf.values()].filter(c => c === b).length);
    for (const c of used) {
      const mine = [...identityOf].filter(([, v]) => v === c).map(([id]) => id);
      const moves = mine.map(id => used.find(o => o !== c && o.members.includes(id) && value(o) === bestOf.get(id) && [...identityOf.values()].includes(o)));
      if (moves.every(Boolean)) { mine.forEach((id, k) => identityOf.set(id, moves[k]!)); changed = true; break; }
    }
  }
  const players = startingXI.map((p): BuffResult => {
    const identity = identityOf.get(p.id) ?? null;
    let level: ActiveTeamColor | null = null;
    for (const rule of activeRules) if ((teamWide.has(rule.key) || p.upgradeLevel >= rule.minLevel!) && (!level || rule.ovr > level.ovr || (rule.ovr === level.ovr && statSum(rule.stats) > statSum(level.stats)))) level = rule;
    const chosen = [identity, level].filter((c): c is ActiveTeamColor => !!c);
    const stats = Object.fromEntries(STAT_KEYS.map(key => [key, 0])) as StatTotals;
    let ovrBonus = 0;
    for (const color of chosen) {
      color.beneficiaries.push(p.id);
      ovrBonus += color.ovr;
      for (const key of STAT_KEYS) stats[key] += color.stats[key] ?? 0;
    }
    return { playerId: p.id, baseOvr: p.baseOvr, ovrBonus, finalOvr: p.baseOvr + ovrBonus, stats, applied: chosen.map(applied) };
  });

  // Danh sách kích hoạt: CLB → quốc gia → cấp thẻ; trong từng loại mốc cao trước, nhóm đông trước.
  const order = { club: 0, nation: 1, season: 2, upgrade: 3, lineup: 4 };
  // Team color không ai nhận thì không hiện: đủ thẻ +8 thì không còn hiện bạc; 3 cầu thủ Pháp đều đã nhận CLB Barcelona mạnh hơn
  // thì không hiện QG Pháp (CLB và quốc gia không cộng dồn, mỗi người chỉ nhận một mức).
  const list = [...active.values(), ...activeRules].filter(color => color.beneficiaries.length).sort((a, b) => order[a.kind] - order[b.kind] || (b.minLevel ?? 0) - (a.minLevel ?? 0) || b.tier - a.tier || b.members.length - a.members.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { players, active: list };
}

/** Buff team color của từng cầu thủ đá chính, đúng thứ tự đầu vào. */
export function calculateTeamColorBuffs(startingXI: readonly Player[], config: TeamColorConfig = DEFAULT_TEAM_COLOR_CONFIG): BuffResult[] {
  return analyzeTeamColors(startingXI, config).players;
}
