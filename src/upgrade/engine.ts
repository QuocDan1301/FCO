import { BRIDGE_CONFIG } from './config';
import { type Rng } from './rng';
import { dropRange, isValidDrop, rollDrop, tail } from './dropTracking';
// hiddenPattern chỉ còn dùng để kiểm tra bản lưu cũ (mẫu ngầm đã lưu), engine không còn chọn cầu ngầm.
import { historicalCandidates, HIDDEN_KINDS, quadCandidates, sum3Candidates, type HiddenKind, type HiddenPatterns } from './hiddenPattern';
import { finalRate, rollSuccess } from './probability';

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

// Tỷ lệ xem trước trước khi đập = tỷ lệ gốc, đúng bằng tỷ lệ roll thật.
// Đã bỏ cả cầu ngầm lẫn cầu công khai (2026-11-09): không còn thưởng bắt cầu nào.
export function previewUpgrade(_bridge: BridgeState, currentLevel: number, baseRate: number) {
  assertLevel(currentLevel);
  return { baseRate, publicLength: 0, publicBonus: 0, rate: finalRate(baseRate, 0, 0) };
}

// Bước 10–11: thành công chốt dây, thay cầu công khai, reset dây; thất bại nối mức rớt.
// Đã bỏ cầu ngầm (2026-11-09, người dùng yêu cầu xoá mọi dây ngầm đập thẻ): không còn chọn mẫu ngầm hay bật nổ liên tiếp.
function settle(level: LevelBridge, drop: number | null) {
  // Chỉ 4 số cuối dùng để bắt cầu và dây nổ lưu 12 số cuối, nên dây hiện tại cũng chỉ giữ 12 số để bản lưu không phình khi xịt liên tục.
  if (drop !== null) { level.chain = tail([...level.chain, drop], BRIDGE_CONFIG.storedChainLength); return; }
  level.history = [...level.history, tail(level.chain, BRIDGE_CONFIG.storedChainLength)].slice(-BRIDGE_CONFIG.historyLimit);
  level.publicSource = tail(level.chain);
  level.patterns = null;
  level.chain = [];
}

function begin(bridge: BridgeState, currentLevel: number) {
  assertLevel(currentLevel);
  const targetLevel = currentLevel + 1;
  const level = cloneLevel(bridge.levels[String(targetLevel)]);
  // Mẫu ngầm còn trong bản lưu cũ không còn tác dụng: bỏ đi.
  level.patterns = null;
  const next: BridgeState = { ...bridge, levels: { ...bridge.levels }, backToBack: null, turn: bridge.turn + 1 };
  return { targetLevel, level, next };
}

function finish(next: BridgeState, level: LevelBridge, turn: TurnLog) {
  next.levels[String(turn.targetLevel)] = level;
  next.log = [turn, ...next.log].slice(0, BRIDGE_CONFIG.logLimit);
  return next;
}

// Một lượt đập: tỷ lệ gốc → roll → ghi dây rớt (chỉ để nhật ký). Tỷ lệ thật = tỷ lệ gốc, đúng như xem trước.
// Hàm thuần: không sửa bridge đầu vào; kết quả roll đã định thì không bị đổi. rng.pattern giữ trong chữ ký cho tương thích, không còn dùng.
export function resolveUpgrade(bridge: BridgeState, input: { currentLevel: number; baseRate: number; role: UpgradeRole }, rng: UpgradeRngs) {
  if (input.role !== 'main' && input.role !== 'material') throw new Error('Vai trò thẻ không hợp lệ.');
  const { targetLevel, level, next } = begin(bridge, input.currentLevel);
  const chain = [...level.chain];
  const rate = finalRate(input.baseRate, 0, 0);
  const success = rollSuccess(rate, rng.outcome);
  const drop = success ? null : rollDrop(input.currentLevel, rng.outcome);
  settle(level, drop);
  const turn: TurnLog = {
    turn: next.turn, targetLevel, role: input.role, chain, baseRate: input.baseRate, publicLength: 0, publicBonus: 0,
    hiddenKind: null, hiddenPattern: null, hiddenBonus: 0, bonus: 0, rate, success, drop,
  };
  return { bridge: finish(next, level, turn), success, drop, rate, turn };
}

// Nhập tay kết quả để kiểm thử: ghi dây như một lượt thật nhưng không roll và không đụng tới thẻ.
export function recordOutcome(bridge: BridgeState, currentLevel: number, outcome: ManualOutcome, _patternRng?: Rng) {
  if (!outcome.success && !isValidDrop(currentLevel, outcome.drop)) throw new Error(`Mức rớt phải từ +1 đến +${dropRange(currentLevel).max}.`);
  const { targetLevel, level, next } = begin(bridge, currentLevel);
  const chain = [...level.chain], drop = outcome.success ? null : outcome.drop;
  settle(level, drop);
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