import { money, uid } from './game';
import type { Entry, Save } from './game';

// Giải Đặc Biệt của sự kiện Nâng Cấp Siêu Sao: quỹ FC chung, mô phỏng trên máy người chơi.
// - Quỹ tự tăng theo thời gian (người chơi khác), lúc chậm lúc nhanh; FC mình trả để chơi cộng thẳng vào quỹ (chia đều cho từng lượt).
// - Giải Mini Đặc Biệt luôn bằng 1/10 quỹ. Từ JACKPOT_MIN FC trở lên, mỗi lượt chơi có tỷ lệ trúng; bot cũng săn giải.
// - Trúng Giải Đặc Biệt (người chơi hay bot) nhận cả quỹ, quỹ quay lại từ đầu (JACKPOT_RESET, cũng là mức quỹ lúc mới tạo);
//   trúng Giải Mini nhận 1/10 quỹ và phần đó trừ thẳng vào quỹ Giải Đặc Biệt.
// Lưu riêng ở localStorage (JACKPOT_KEY), không nằm trong bản lưu game; FC trúng thưởng thì cộng vào bản lưu.
export const JACKPOT_KEY = 'ncss-jackpot-v1';
export const JACKPOT_MIN = 10_000, JACKPOT_RESET = 2_000;
export const JACKPOT_TICK_MS = 2_000;
// Tỷ lệ gốc mỗi lượt chơi của người chơi và mỗi nhịp của bot (khi quỹ ≥ JACKPOT_MIN). Quỹ càng lớn càng nhiều người săn:
// tỷ lệ Giải Đặc Biệt nhân hệ số pressure (bình phương, +1 mỗi 5.000 FC trên mức 10.000), quỹ chạm JACKPOT_MAX thì chắc chắn có bot nổ.
export const PLAYER_ODDS = { special: .0005, mini: .004 } as const;
export const BOT_ODDS = { special: .004, mini: .02 } as const;
export const JACKPOT_MAX = 30_000;
export const pressure = (pot: number) => (1 + Math.max(0, pot - JACKPOT_MIN) / 5_000) ** 2;
export const botSpecialOdds = (pot: number) => pot >= JACKPOT_MAX ? 1 : Math.min(.5, BOT_ODDS.special * pressure(pot));
export const playerSpecialOdds = (pot: number) => Math.min(.05, PLAYER_ODDS.special * pressure(pot));
const MAX_CATCH_UP = 1_800; // tối đa 1 giờ bù khi mở lại trang
const FEED_MAX = 10;

export type JackpotWin = { name: string; amount: number; kind: 'special' | 'mini'; time: number; mine?: boolean };
// speed = số nhịp còn lại của đợt tăng nhanh (người chơi khác đổ dồn vào quay).
export type Jackpot = { pot: number; at: number; speed: number; feed: JackpotWin[] };

export const mini = (jackpot: Pick<Jackpot, 'pot'>) => Math.floor(jackpot.pot / 10);
export const newJackpot = (now = Date.now()): Jackpot => ({ pot: JACKPOT_RESET, at: now, speed: 0, feed: [] });

export function loadJackpot(now = Date.now()): Jackpot {
  try {
    const value = JSON.parse(localStorage.getItem(JACKPOT_KEY) ?? 'null') as Jackpot | null;
    if (value && Number.isSafeInteger(value.pot) && value.pot >= 0 && Number.isFinite(value.at) && Number.isInteger(value.speed) && Array.isArray(value.feed)) return value;
  } catch { /* Không đọc được thì bắt đầu quỹ mới. */ }
  return newJackpot(now);
}
export function saveJackpot(jackpot: Jackpot) {
  try { localStorage.setItem(JACKPOT_KEY, JSON.stringify(jackpot)); } catch { /* Không lưu được thì quỹ chỉ sống trong phiên này. */ }
}

// Tên bot kiểu tên tài khoản: ghép âm tiết, thêm chữ số.
const SYLLABLES = ['thim', 'trinh', 'duc', 'anh', 'khoa', 'minh', 'tuan', 'huy', 'nam', 'long', 'quan', 'bao', 'phuc', 'dat', 'vinh', 'son', 'kha', 'hieu'];
export function botName(rng: () => number) {
  const pick = () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  const name = pick() + pick() + (rng() < .5 ? pick().slice(0, 2) : '');
  const styled = rng() < .4 ? name.toUpperCase().slice(0, 3) + name.slice(3) : name;
  return styled + (rng() < .7 ? String(Math.floor(rng() * 1000)) : '');
}

function win(jackpot: Jackpot, kind: JackpotWin['kind'], name: string, time: number, mine = false): { jackpot: Jackpot; won: JackpotWin } {
  const amount = kind === 'special' ? jackpot.pot : mini(jackpot);
  const won: JackpotWin = { name, amount, kind, time, ...(mine ? { mine } : {}) };
  return { jackpot: { ...jackpot, pot: kind === 'special' ? JACKPOT_RESET : jackpot.pot - amount, feed: [won, ...jackpot.feed].slice(0, FEED_MAX) }, won };
}

// Chạy các nhịp từ lần cập nhật trước đến now: quỹ tăng (đợt nhanh 40–120 FC, bình thường 3–12 FC mỗi nhịp; trung bình ~1.000 FC/phút), bot có thể trúng.
export function tickJackpot(jackpot: Jackpot, now: number, rng: () => number): Jackpot {
  const steps = Math.floor((now - jackpot.at) / JACKPOT_TICK_MS);
  if (steps <= 0) return jackpot;
  let next = { ...jackpot, at: jackpot.at + steps * JACKPOT_TICK_MS };
  for (let i = 0, run = Math.min(steps, MAX_CATCH_UP); i < run; i++) {
    const speed = next.speed > 0 ? next.speed - 1 : rng() < .03 ? 10 + Math.floor(rng() * 20) : 0;
    const gain = speed > 0 ? 40 + Math.floor(rng() * 81) : 3 + Math.floor(rng() * 10);
    next = { ...next, speed, pot: next.pot + gain };
    if (next.pot < JACKPOT_MIN) continue;
    const roll = rng();
    const special = botSpecialOdds(next.pot);
    if (roll < special) next = win(next, 'special', botName(rng), next.at - (run - 1 - i) * JACKPOT_TICK_MS).jackpot;
    else if (roll < special + BOT_ODDS.mini) next = win(next, 'mini', botName(rng), next.at - (run - 1 - i) * JACKPOT_TICK_MS).jackpot;
  }
  return next;
}

// Lượt chơi của người chơi: paid = tổng FC đã trả cho các lượt này (lượt miễn phí = 0), chia đều vào quỹ theo từng lượt;
// sau mỗi lượt (khi quỹ đủ JACKPOT_MIN) có tỷ lệ trúng Giải Đặc Biệt / Mini.
export function rollJackpot(jackpot: Jackpot, plays: number, paid: number, rng: () => number, now = Date.now()): { jackpot: Jackpot; wins: JackpotWin[] } {
  let next = jackpot;
  const wins: JackpotWin[] = [];
  for (let i = 0; i < plays; i++) {
    const share = Math.floor(paid / plays) + (i < paid % plays ? 1 : 0);
    next = { ...next, pot: next.pot + share };
    if (next.pot < JACKPOT_MIN) continue;
    const roll = rng();
    const special = playerSpecialOdds(next.pot);
    const kind = roll < special ? 'special' : roll < special + PLAYER_ODDS.mini ? 'mini' : null;
    if (!kind) continue;
    const result = win(next, kind, 'Bạn', now, true);
    next = result.jackpot;
    wins.push(result.won);
  }
  return { jackpot: next, wins };
}

// Cộng FC trúng thưởng vào bản lưu kèm dòng lịch sử.
export function grantJackpot(state: Save, wins: JackpotWin[]): Save {
  if (!wins.length) return state;
  const total = wins.reduce((sum, w) => sum + w.amount, 0);
  const entries: Entry[] = wins.map(w => ({ id: uid(), time: w.time, type: 'event', title: w.kind === 'special' ? 'Trúng Giải Đặc Biệt' : 'Trúng Giải Mini Đặc Biệt', detail: `+${money(w.amount)} FC · Nâng Cấp Siêu Sao` }));
  return { ...state, fc: (state.fc ?? 0) + total, history: [...entries.reverse(), ...state.history].slice(0, 200) };
}
