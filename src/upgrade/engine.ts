import { BRIDGE_CONFIG } from './config';
import { unit, type Rng } from './rng';
import { dropRange, isValidDrop, rollDrop, tail } from './dropTracking';
import { matchPublic } from './publicPattern';
import { choosePatterns, eligibleKinds, hiddenMatches, historicalCandidates, HIDDEN_KINDS, quadCandidates, selectHidden, sum3Candidates, type HiddenKind, type HiddenPatterns } from './hiddenPattern';
import { appliedBonus, finalRate, rollSuccess } from './probability';

// Phôi và thẻ chính dùng cùng thuật toán; vai trò chỉ được ghi vào nhật ký.
export type UpgradeRole = 'material' | 'main';
// Trạng thái cầu riêng của một cấp nâng (khóa = cấp mục tiêu).
export type LevelBridge = { chain: number[]; publicSource: number[] | null; history: number[][]; patterns: HiddenPatterns | null };
export type TurnLog = {
  turn: number; targetLevel: number; role: UpgradeRole | 'manual'; chain: number[];
  baseRate: number | null; publicLength: number; publicBonus: number;
  hiddenKind: HiddenKind | null; hiddenPattern: number[] | null; hiddenBonus: number;
  bonus: number; rate: number | null; success: boolean; drop: number | null;
};
// backToBack: cấp mục tiêu đang có hiệu ứng nổ liên tiếp, chỉ dùng được cho đúng lượt kế tiếp.
export type BridgeState = { version: 1; turn: number; levels: Record<string, LevelBridge>; backToBack: number | null; log: TurnLog[] };
export type UpgradeRngs = { outcome: Rng; pattern: Rng };
export type ManualOutcome = { success: true } | { success: false; drop: number };

export function emptyBridge(): BridgeState {
  return { version: 1, turn: 0, levels: {}, backToBack: null, log: [] };
}

function assertLevel(currentLevel: number) {
  if (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel >= BRIDGE_CONFIG.maxLevel) throw new Error(`Cấp nâng không hợp lệ: +${currentLevel}.`);
}

function cloneLevel(level: LevelBridge | undefined): LevelBridge {
  if (!level) return { chain: [], publicSource: null, history: [], patterns: null };
  const patterns = level.patterns && { historical: level.patterns.historical && [...level.patterns.historical], sum3: level.patterns.sum3 && [...level.patterns.sum3], quad: level.patterns.quad && [...level.patterns.quad] };
  return { chain: [...level.chain], publicSource: level.publicSource && [...level.publicSource], history: level.history.map(chain => [...chain]), patterns };
}

// Tỷ lệ xem trước trước khi đập: chỉ cầu công khai, không tiết lộ cầu ngầm.
export function previewUpgrade(bridge: BridgeState, currentLevel: number, baseRate: number) {
  assertLevel(currentLevel);
  const level = bridge.levels[String(currentLevel + 1)];
  const match = matchPublic(level?.publicSource ?? null, level?.chain ?? []);
  return { baseRate, publicLength: match.length, publicBonus: match.bonus, rate: finalRate(baseRate, match.bonus, 0) };
}

// Bước 10–11: thành công chốt dây, thay cầu công khai, chọn lại mẫu ngầm, xét nổ liên tiếp, reset dây; thất bại nối mức rớt.
function settle(next: BridgeState, level: LevelBridge, targetLevel: number, drop: number | null, rng: Rng) {
  // Chỉ 4 số cuối dùng để bắt cầu và dây nổ lưu 12 số cuối, nên dây hiện tại cũng chỉ giữ 12 số để bản lưu không phình khi xịt liên tục.
  if (drop !== null) { level.chain = tail([...level.chain, drop], BRIDGE_CONFIG.storedChainLength); return; }
  level.history = [...level.history, tail(level.chain, BRIDGE_CONFIG.storedChainLength)].slice(-BRIDGE_CONFIG.historyLimit);
  level.publicSource = tail(level.chain);
  level.patterns = choosePatterns(level.history, targetLevel, rng);
  next.backToBack = unit(rng) < BRIDGE_CONFIG.backToBackChance ? targetLevel : null;
  level.chain = [];
}

function begin(bridge: BridgeState, currentLevel: number, rng: Rng) {
  assertLevel(currentLevel);
  const targetLevel = currentLevel + 1;
  const level = cloneLevel(bridge.levels[String(targetLevel)]);
  // Cấp chưa từng đập: tạo mẫu ngầm lần đầu trước khi roll.
  if (!level.patterns) level.patterns = choosePatterns(level.history, targetLevel, rng);
  const backToBackArmed = bridge.backToBack === targetLevel;
  // Hiệu ứng nổ liên tiếp chỉ sống tới lượt kế tiếp, dù lượt đó cùng cấp hay không, thành công hay thất bại.
  const next: BridgeState = { ...bridge, levels: { ...bridge.levels }, backToBack: null, turn: bridge.turn + 1 };
  return { targetLevel, level, backToBackArmed, next };
}

function finish(next: BridgeState, level: LevelBridge, turn: TurnLog) {
  next.levels[String(turn.targetLevel)] = level;
  next.log = [turn, ...next.log].slice(0, BRIDGE_CONFIG.logLimit);
  return next;
}

// Một lượt đập: đọc dây → cầu công khai → chọn tối đa một cầu ngầm → tính tỷ lệ → roll → ghi dây.
// Hàm thuần: không sửa bridge đầu vào; kết quả roll đã định thì không bị đổi.
export function resolveUpgrade(bridge: BridgeState, input: { currentLevel: number; baseRate: number; role: UpgradeRole }, rng: UpgradeRngs) {
  if (input.role !== 'main' && input.role !== 'material') throw new Error('Vai trò thẻ không hợp lệ.');
  const { targetLevel, level, backToBackArmed, next } = begin(bridge, input.currentLevel, rng.pattern);
  const chain = [...level.chain];
  const pub = matchPublic(level.publicSource, chain);
  const patterns = level.patterns!;
  const hiddenKind = selectHidden(eligibleKinds(patterns, backToBackArmed), rng.pattern);
  const hiddenBonus = hiddenKind && hiddenMatches(hiddenKind, patterns, chain) ? BRIDGE_CONFIG.hiddenBonus : 0;
  const rate = finalRate(input.baseRate, pub.bonus, hiddenBonus);
  const success = rollSuccess(rate, rng.outcome);
  const drop = success ? null : rollDrop(input.currentLevel, rng.outcome);
  settle(next, level, targetLevel, drop, rng.pattern);
  const turn: TurnLog = {
    turn: next.turn, targetLevel, role: input.role, chain, baseRate: input.baseRate, publicLength: pub.length, publicBonus: pub.bonus,
    hiddenKind, hiddenPattern: hiddenKind && hiddenKind !== 'backToBack' ? patterns[hiddenKind] : null, hiddenBonus,
    bonus: appliedBonus(pub.bonus, hiddenBonus), rate, success, drop,
  };
  return { bridge: finish(next, level, turn), success, drop, rate, turn };
}

// Nhập tay kết quả để kiểm thử: ghi dây như một lượt thật nhưng không roll và không đụng tới thẻ.
export function recordOutcome(bridge: BridgeState, currentLevel: number, outcome: ManualOutcome, patternRng: Rng) {
  if (!outcome.success && !isValidDrop(currentLevel, outcome.drop)) throw new Error(`Mức rớt phải từ +1 đến +${dropRange(currentLevel).max}.`);
  const { targetLevel, level, next } = begin(bridge, currentLevel, patternRng);
  const chain = [...level.chain], drop = outcome.success ? null : outcome.drop;
  settle(next, level, targetLevel, drop, patternRng);
  const turn: TurnLog = { turn: next.turn, targetLevel, role: 'manual', chain, baseRate: null, publicLength: 0, publicBonus: 0, hiddenKind: null, hiddenPattern: null, hiddenBonus: 0, bonus: 0, rate: null, success: outcome.success, drop };
  return finish(next, level, turn);
}

const isLevelValue = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
const isChainOf = (value: unknown, max: number, length: number) => Array.isArray(value) && value.length <= length && value.every(v => isLevelValue(v, max));
const isRate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const samePattern = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
// Mẫu ngầm phải đúng là một ứng viên hợp lệ của cấp đó (tổng 3 / tứ quý), mẫu lịch sử phải lấy được từ lịch sử đang lưu.
const isOneOf = (value: unknown, candidates: number[][]) => value === null || (Array.isArray(value) && candidates.some(c => samePattern(c, value as number[])));

function isTurnLog(entry: unknown) {
  if (!entry || typeof entry !== 'object') return false;
  const t = entry as TurnLog, target = t.targetLevel;
  if (!Number.isInteger(target) || target < 2 || target > BRIDGE_CONFIG.maxLevel) return false;
  const max = dropRange(target - 1).max;
  return Number.isSafeInteger(t.turn) && t.turn > 0 && ['main', 'material', 'manual'].includes(t.role) && isChainOf(t.chain, max, MAX_CHAIN)
    && (t.baseRate === null || isRate(t.baseRate)) && (t.rate === null || isRate(t.rate)) && Number.isInteger(t.publicLength) && t.publicLength >= 0 && t.publicLength <= BRIDGE_CONFIG.tail
    && isRate(t.publicBonus) && isRate(t.hiddenBonus) && isRate(t.bonus) && (t.hiddenKind === null || HIDDEN_KINDS.includes(t.hiddenKind))
    && (t.hiddenPattern === null || isChainOf(t.hiddenPattern, max, BRIDGE_CONFIG.tail)) && typeof t.success === 'boolean' && (t.drop === null || isLevelValue(t.drop, max));
}
// Dây hiện tại trong bản lưu cũ có thể dài hơn 12 số (trước khi giới hạn); vẫn nhận nhưng chặn mức vô lý.
const MAX_CHAIN = 1000;

// Kiểm tra bản lưu trước khi khôi phục; dữ liệu sai thì bỏ để engine bắt đầu lại.
export function isBridgeState(data: unknown): data is BridgeState {
  if (!data || typeof data !== 'object') return false;
  const s = data as BridgeState;
  if (s.version !== 1 || !Number.isSafeInteger(s.turn) || s.turn < 0 || !Array.isArray(s.log) || s.log.length > BRIDGE_CONFIG.logLimit || !s.log.every(isTurnLog)) return false;
  if (s.backToBack !== null && !(Number.isInteger(s.backToBack) && s.backToBack >= 2 && s.backToBack <= BRIDGE_CONFIG.maxLevel)) return false;
  if (!s.levels || typeof s.levels !== 'object' || Array.isArray(s.levels)) return false;
  return Object.entries(s.levels).every(([key, level]) => {
    const target = Number(key);
    if (!Number.isInteger(target) || String(target) !== key || target < 2 || target > BRIDGE_CONFIG.maxLevel || !level || typeof level !== 'object') return false;
    const max = dropRange(target - 1).max, patterns = level.patterns;
    if (!isChainOf(level.chain, max, MAX_CHAIN) || !(level.publicSource === null || isChainOf(level.publicSource, max, BRIDGE_CONFIG.tail))) return false;
    if (!Array.isArray(level.history) || level.history.length > BRIDGE_CONFIG.historyLimit || !level.history.every(chain => isChainOf(chain, max, BRIDGE_CONFIG.storedChainLength))) return false;
    return patterns === null || (!!patterns && typeof patterns === 'object' && isOneOf(patterns.historical, level.history.flatMap(chain => historicalCandidates(chain)))
      && isOneOf(patterns.sum3, sum3Candidates(target)) && isOneOf(patterns.quad, quadCandidates(target)));
  });
}