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
  upgrade: readonly UpgradeTeamColorRule[];
}

export type TeamColorKind = 'club' | 'nation' | 'upgrade';
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

// Cân bằng mặc định (dễ chỉnh): CLB buff chuyền / rê, quốc gia buff tốc độ / thể lực, cấp thẻ buff sút / phòng ngự.
const tiers = (stats: readonly StatKey[]): TeamColorTier[] => [[1, 3, 1], [2, 5, 2], [3, 8, 3]].map(([tier, minPlayers, value]) => ({ tier, minPlayers, ovr: value, stats: Object.fromEntries(stats.map(key => [key, value])) }));
export const DEFAULT_TEAM_COLOR_CONFIG: TeamColorConfig = {
  maxPlayers: 11,
  club: tiers(['passing', 'dribbling']),
  nation: tiers(['pace', 'physical']),
  upgrade: [[1, 3], [2, 5], [3, 8]].map(([tier, minLevel]) => ({ id: `level-${minLevel}`, tier, minLevel, minPlayers: 5, ovr: tier, stats: { shooting: tier, defending: tier } })),
};

const statSum = (stats: StatBonus) => STAT_KEYS.reduce((sum, key) => sum + (stats[key] ?? 0), 0);
const isCount = (n: number) => Number.isInteger(n) && n >= 1;
// Cấu hình được chuẩn hoá (sắp mốc giảm dần) một lần cho mỗi đối tượng cấu hình — hàm tính chạy liên tục khi xếp đội hình.
const prepared = new WeakMap<TeamColorConfig, { club: TeamColorTier[]; nation: TeamColorTier[]; upgrade: UpgradeTeamColorRule[] }>();
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
  const result = { club: byPlayers(config.club), nation: byPlayers(config.nation), upgrade: [...config.upgrade].sort((a, b) => b.minLevel - a.minLevel) };
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
  const groups = new Map<string, { kind: 'club' | 'nation'; key: string; members: string[] }>();
  const groupKeysOf = new Map<string, string[]>();
  const join = (player: Player, kind: 'club' | 'nation', key: string) => {
    const id = `${kind}:${key}`;
    const group = groups.get(id);
    if (group) group.members.push(player.id); else groups.set(id, { kind, key, members: [player.id] });
    groupKeysOf.get(player.id)!.push(id);
  };
  for (const p of startingXI) {
    groupKeysOf.set(p.id, []);
    for (const club of new Set(p.clubIds)) if (club) join(p, 'club', club);
    if (p.nationId) join(p, 'nation', p.nationId);
  }
  // 2. Nhóm đủ người → team color kích hoạt ở mốc cao nhất đạt được.
  const active = new Map<string, ActiveTeamColor>();
  for (const [id, group] of groups) {
    const tier = reachedTier(group.members.length, group.kind === 'club' ? rules.club : rules.nation);
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
  const players = startingXI.map((p): BuffResult => {
    let identity: ActiveTeamColor | null = null;
    for (const id of groupKeysOf.get(p.id)!) { const color = active.get(id); if (color && (!identity || better(color, identity) > 0)) identity = color; }
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
  const order = { club: 0, nation: 1, upgrade: 2 };
  const list = [...active.values(), ...activeRules].sort((a, b) => order[a.kind] - order[b.kind] || b.tier - a.tier || b.members.length - a.members.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { players, active: list };
}

/** Buff team color của từng cầu thủ đá chính, đúng thứ tự đầu vào. */
export function calculateTeamColorBuffs(startingXI: readonly Player[], config: TeamColorConfig = DEFAULT_TEAM_COLOR_CONFIG): BuffResult[] {
  return analyzeTeamColors(startingXI, config).players;
}
