import { dayKey, defaultUnopened, getPackStock, money, packs, random, uid } from './game';
import type { Entry, EventReward, EventState, Pack, Save } from './game';
export type { EventLogEntry, EventGiftEntry, EventReward } from './game';

// Sự kiện Nâng Cấp Siêu Sao: mỗi lượt trúng 1 trong 8 hũ quà của cấp hiện tại (gói cầu thủ hoặc BP) và nhận số điểm của hũ.
// Đủ điểm thì lên cấp (tối đa 7), cấp càng cao hũ càng xịn; điểm tích lũy còn mở các mốc quà bên dưới.
// frame: màu khung nút (public/assets/event/pay-<frame>.webp).
export const EVENT_PLAYS = [{ count: 1, price: 20, frame: 'green' }, { count: 10, price: 190, frame: 'blue' }, { count: 50, price: 900, frame: 'gold' }, { count: 100, price: 1800, frame: 'orange' }] as const;

// Quà (EventReward, khai báo ở game.ts): BP / FC cộng thẳng vào số dư, hoặc count gói (id trong src/packs.json) vào Kho vật phẩm.
// Nhật ký giữ tối đa EVENT_LOG_MAX lượt chơi và EVENT_GIFT_MAX lần nhận quà mốc gần nhất.
export const EVENT_LOG_MAX = 300, EVENT_GIFT_MAX = 100;
export type EventJar = { reward: EventReward; points: number; weight: number };
// Tỷ lệ hũ: 42%, 31%, 14%, 6%, 3%, 2%, 1,3%, 0,7% theo thứ tự điểm bên dưới.
// Trung bình 1,875 điểm/lượt → 1.250 điểm/vòng tốn ~12.000 FC ở giá 18 FC/lượt (gói 50/100).
// Chi phí trước quà FC/lượt miễn phí; hũ nhiều điểm hiếm hơn hũ ít điểm.
const JAR_POINTS = [1, 1, 2, 3, 5, 10, 15, 20], JAR_WEIGHTS = [420, 310, 140, 60, 30, 20, 13, 7];
const jars = (rewards: EventReward[]): EventJar[] => rewards.map((reward, i) => ({ reward, points: JAR_POINTS[i], weight: JAR_WEIGHTS[i] }));
const M = 1_000_000, K = 1_000;
export type EventLevel = { points: number; jars: EventJar[] };
export const EVENT_LEVELS: EventLevel[] = [
  // 8 hũ mỗi cấp theo file "quà rác.xlsx" của người dùng; gói event-* chỉ nhận từ sự kiện (eventOnly trong src/packs.json).
  { points: 0, jars: jars([{ bp: 18 * M }, { pack: 'event-multi-118', count: 1 }, { bp: 22 * M }, { pack: 'event-multi-107', count: 1 }, { bp: 30 * M }, { pack: 'event-top-250', count: 1 }, { fc: 100 }, { pack: 'eternal', count: 1 }]) },
  { points: 50, jars: jars([{ bp: 20 * M }, { pack: 'event-2-118', count: 1 }, { bp: 25 * M }, { pack: 'event-2-108', count: 1 }, { bp: 35 * M }, { pack: 'event-2-112', count: 1 }, { fc: 300 }, { pack: 'event-2-uc80', count: 1 }]) },
  { points: 200, jars: jars([{ bp: 23 * M }, { pack: 'event-3-top250', count: 1 }, { bp: 28 * M }, { pack: 'event-3-108', count: 1 }, { bp: 40 * M }, { pack: 'event-3-113', count: 1 }, { fc: 500 }, { pack: 'event-3-112', count: 1 }]) },
  { points: 500, jars: jars([{ bp: 26 * M }, { pack: 'event-4-all', count: 1 }, { bp: 32 * M }, { pack: 'event-4-109', count: 1 }, { bp: 45 * M }, { pack: 'event-4-top150', count: 1 }, { fc: 700 }, { pack: 'event-4-112', count: 1 }]) },
  { points: 900, jars: jars([{ bp: 31 * M }, { pack: 'event-5-all', count: 1 }, { bp: 36 * M }, { pack: 'event-5-109', count: 1 }, { bp: 50 * M }, { pack: 'event-5-110', count: 1 }, { fc: 900 }, { pack: 'event-5-bld30', count: 1 }]) },
  { points: 1400, jars: jars([{ bp: 33 * M }, { pack: 'event-6-108', count: 1 }, { bp: 40 * M }, { pack: 'event-6-110', count: 1 }, { bp: 55 * M }, { pack: 'event-6-111', count: 1 }, { fc: 1100 }, { pack: 'event-6-wb', count: 1 }]) },
  { points: 2000, jars: jars([{ bp: 34 * M }, { pack: 'event-7-108', count: 1 }, { bp: 42 * M }, { pack: 'event-7-113', count: 1 }, { bp: 60 * M }, { pack: 'event-7-109', count: 1 }, { fc: 1300 }, { pack: 'event-7-le', count: 1 }]) },
];

// Quà tích lũy theo file "quà mốc.xlsb.xlsx" của người dùng: mỗi lựa chọn là một bộ quà (gói + BP). Mốc 1 lựa chọn thì nhận luôn,
// mốc 3 lựa chọn thì chọn 1 trong 3. Mỗi EVENT_ROUND điểm là một vòng: mỗi mốc được nhận thêm 1 lần, trừ mốc once (chỉ nhận 1 lần).
export const EVENT_ROUND = 1250;
export type EventMilestone = { points: number; options: EventReward[][]; once?: boolean };
export const EVENT_MILESTONES: EventMilestone[] = [
  { points: 1, once: true, options: [[{ pack: 'ms-1-1', count: 1 }]] },
  { points: 10, options: [[{ pack: 'top-price-8', count: 1 }, { bp: 800 * K }]] },
  { points: 25, options: [[{ pack: 'ms-25-1', count: 1 }, { bp: 1 * M }]] },
  { points: 50, options: [[{ pack: 'ms-50-1', count: 1 }, { bp: 2 * M }]] },
  { points: 75, options: [[{ pack: 'ms-75-1', count: 1 }, { bp: 3 * M }]] },
  { points: 100, options: [[{ pack: 'ms-100-1', count: 1 }, { bp: 4 * M }], [{ pack: 'ms-100-2', count: 1 }, { bp: 4 * M }], [{ pack: 'ms-100-3', count: 1 }, { bp: 4 * M }]] },
  { points: 150, options: [[{ pack: 'ms-150-1', count: 1 }, { bp: 5 * M }], [{ pack: 'ms-150-2', count: 1 }, { bp: 5 * M }], [{ pack: 'ms-150-3', count: 1 }, { bp: 5 * M }]] },
  { points: 200, options: [[{ pack: 'ms-200-1', count: 1 }, { bp: 6 * M }], [{ pack: 'ms-200-2', count: 1 }, { bp: 6 * M }], [{ pack: 'ms-200-3', count: 1 }, { bp: 6 * M }]] },
  { points: 250, options: [[{ pack: 'ms-250-1', count: 1 }, { bp: 8 * M }], [{ pack: 'ms-250-2', count: 1 }, { bp: 8 * M }], [{ pack: 'ms-250-3', count: 1 }, { bp: 8 * M }]] },
  { points: 300, options: [[{ pack: 'ms-300-1', count: 1 }, { bp: 10 * M }], [{ pack: 'ms-300-2', count: 1 }, { bp: 10 * M }], [{ pack: 'ms-300-3', count: 1 }, { bp: 10 * M }]] },
  { points: 350, options: [[{ pack: 'ms-350-1', count: 1 }, { bp: 12 * M }], [{ pack: 'ms-350-2', count: 1 }, { bp: 12 * M }], [{ pack: 'ms-350-3', count: 1 }, { bp: 12 * M }]] },
  { points: 400, options: [[{ pack: 'ms-400-1', count: 1 }, { bp: 14 * M }], [{ pack: 'ms-400-2', count: 1 }, { bp: 14 * M }], [{ pack: 'ms-400-3', count: 1 }, { bp: 14 * M }]] },
  { points: 450, options: [[{ pack: 'ms-450-1', count: 1 }, { bp: 16 * M }], [{ pack: 'ms-450-2', count: 1 }, { bp: 16 * M }], [{ pack: 'ms-450-3', count: 1 }, { bp: 16 * M }]] },
  { points: 500, options: [[{ pack: 'ms-500-1', count: 1 }, { bp: 20 * M }], [{ pack: 'event-7-le', count: 1 }, { bp: 20 * M }], [{ pack: 'ms-500-3', count: 1 }, { bp: 20 * M }]] },
  { points: 600, options: [[{ pack: 'ms-600-1', count: 1 }, { bp: 30 * M }], [{ pack: 'ms-600-2', count: 1 }, { bp: 30 * M }], [{ pack: 'ms-600-3', count: 1 }, { bp: 30 * M }]] },
  { points: 700, options: [[{ pack: 'ms-700-1', count: 1 }, { bp: 40 * M }], [{ pack: 'ms-700-2', count: 1 }, { bp: 40 * M }], [{ pack: 'ms-700-3', count: 1 }, { bp: 40 * M }]] },
  { points: 750, options: [[{ pack: 'ms-750-1', count: 1 }, { bp: 50 * M }], [{ pack: 'ms-750-2', count: 1 }, { bp: 50 * M }], [{ pack: 'ms-750-3', count: 1 }, { bp: 50 * M }]] },
  { points: 800, options: [[{ pack: 'eternal', count: 1 }, { bp: 60 * M }], [{ pack: 'ms-800-2', count: 1 }, { bp: 60 * M }], [{ pack: 'ms-800-3', count: 1 }, { bp: 60 * M }]] },
  { points: 850, options: [[{ pack: 'ms-850-1', count: 1 }, { bp: 80 * M }], [{ pack: 'ms-850-2', count: 1 }, { bp: 80 * M }], [{ pack: 'ms-850-3', count: 1 }, { bp: 80 * M }]] },
  { points: 900, options: [[{ pack: 'ms-900-1', count: 1 }, { bp: 100 * M }], [{ pack: 'ms-900-2', count: 1 }, { bp: 100 * M }], [{ pack: 'ms-900-3', count: 1 }, { bp: 100 * M }]] },
  { points: 950, options: [[{ pack: 'ms-950-1', count: 1 }, { bp: 110 * M }], [{ pack: 'ms-950-2', count: 1 }, { bp: 110 * M }], [{ pack: 'ms-950-3', count: 1 }, { bp: 110 * M }]] },
  { points: 1000, options: [[{ pack: 'ms-1000-1', count: 1 }, { bp: 120 * M }], [{ pack: 'ms-1000-2', count: 1 }, { bp: 120 * M }], [{ pack: 'ms-1000-3', count: 1 }, { bp: 120 * M }]] },
  { points: 1100, options: [[{ pack: 'ms-1100-1', count: 1 }, { bp: 130 * M }], [{ pack: 'ms-1100-2', count: 1 }, { bp: 130 * M }], [{ pack: 'ms-1100-3', count: 1 }, { bp: 130 * M }]] },
  { points: 1200, options: [[{ pack: 'ms-1200-1', count: 1 }, { bp: 160 * M }], [{ pack: 'ms-1200-2', count: 1 }, { bp: 160 * M }], [{ pack: 'ms-1200-3', count: 1 }, { bp: 160 * M }]] },
];

// Nhiệm vụ ngày (giờ Việt Nam): mỗi nhiệm vụ hoàn thành nhận lượt chơi miễn phí một lần mỗi ngày.
export type EventMission = { id: string; title: string; goal: number; free: number };
export const EVENT_MISSIONS: EventMission[] = [
  { id: 'daily', title: 'Nhận Quà mỗi ngày', goal: 1, free: 1 },
  { id: 'pack', title: 'Mở gói cầu thủ 3 lần', goal: 3, free: 1 },
  { id: 'upgrade', title: 'Nâng cấp thẻ 3 lần', goal: 3, free: 1 },
  { id: 'play', title: 'Chơi sự kiện 10 lượt bằng FC', goal: 10, free: 2 },
];

export const findPack = (id: string): Pack | undefined => packs.find(pack => pack.id === id);
export const rewardLabel = (reward: EventReward) => 'bp' in reward ? `${money(reward.bp)} BP` : 'fc' in reward ? `${money(reward.fc)} FC` : `${reward.count} × ${findPack(reward.pack)?.name ?? reward.pack}`;

// Tiến trình đã sang ngày mới thì nhiệm vụ và lượt trả phí trong ngày bắt đầu lại; lượt miễn phí còn giữ.
export function eventState(state: Save, today = dayKey()): Required<EventState> {
  const event = state.event;
  const base = { points: event?.points ?? 0, plays: event?.plays ?? 0, claimed: event?.claimed ?? [], free: event?.free ?? 0, day: today, log: event?.log ?? [], gifts: event?.gifts ?? [] };
  return event?.day === today ? { ...base, missions: event.missions ?? [], paid: event.paid ?? 0 } : { ...base, missions: [], paid: 0 };
}
// Cấp hiện tại (0 = cấp 1) theo điểm tích lũy.
export const eventLevel = (points: number) => EVENT_LEVELS.reduce((found, level, i) => points >= level.points ? i : found, 0);
export function milestoneAvailable(state: Save, index: number) {
  const { points, claimed } = eventState(state), milestone = EVENT_MILESTONES[index];
  if (points < milestone.points) return 0;
  const reached = milestone.once ? 1 : 1 + Math.floor((points - milestone.points) / EVENT_ROUND);
  return Math.max(0, reached - (claimed[index] ?? 0));
}
// Tiến độ nhiệm vụ trong ngày: đếm hoạt động hôm nay trong lịch sử, lượt chơi trả phí lấy từ tiến trình sự kiện.
export function missionProgress(state: Save, mission: EventMission, today = dayKey()) {
  if (mission.id === 'daily') return state.daily === today ? 1 : 0;
  if (mission.id === 'play') return eventState(state, today).paid;
  return state.history.filter(entry => entry.type === mission.id && dayKey(new Date(entry.time)) === today).length;
}

const entry = (title: string, detail: string): Entry => ({ id: uid(), time: Date.now(), type: 'event', title, detail });
// Cộng quà vào bản lưu: BP vào số dư, gói vào kho chưa mở.
export function grantRewards(state: Save, rewards: EventReward[]): Save {
  let balance = state.balance, fc = state.fc ?? 0;
  const unopened = { ...defaultUnopened(), ...state.unopened };
  for (const reward of rewards) {
    if ('bp' in reward) { balance += reward.bp; continue; }
    if ('fc' in reward) { fc += reward.fc; continue; }
    const pack = findPack(reward.pack);
    if (!pack) throw new Error(`Gói ${reward.pack} hiện không có trong Shop.`);
    unopened[pack.id] = getPackStock({ ...state, unopened }, pack) + reward.count;
  }
  if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(fc) || !Object.values(unopened).every(Number.isSafeInteger)) throw new Error('Số BP hoặc số gói vượt giới hạn lưu trữ.');
  return { ...state, balance, ...(fc !== (state.fc ?? 0) ? { fc } : {}), unopened };
}
// Gộp quà giống nhau để hiển thị: tổng BP, tổng FC và số gói theo từng loại.
export function summarizeRewards(rewards: EventReward[]): EventReward[] {
  const bp = rewards.reduce((sum, reward) => sum + ('bp' in reward ? reward.bp : 0), 0), byPack = new Map<string, number>();
  for (const reward of rewards) if ('pack' in reward) byPack.set(reward.pack, (byPack.get(reward.pack) ?? 0) + reward.count);
  const fc = rewards.reduce((sum, reward) => sum + ('fc' in reward ? reward.fc : 0), 0);
  return [...[...byPack].map(([pack, count]) => ({ pack, count })).sort((a, b) => (findPack(b.pack)?.price ?? 0) - (findPack(a.pack)?.price ?? 0)), ...(fc ? [{ fc }] : []), ...(bp ? [{ bp }] : [])];
}

function pickJar(level: EventLevel, value: number) {
  let left = value * level.jars.reduce((sum, jar) => sum + jar.weight, 0);
  for (const [i, jar] of level.jars.entries()) { if (left < jar.weight) return i; left -= jar.weight; }
  return level.jars.length - 1;
}

// mode: 'fc' trả FC (free = chế độ thử không trừ FC), 'free' dùng lượt miễn phí. Trả về chỉ số hũ trúng từng lượt.
export function playEvent(state: Save, count: number, rng = random, free = false, mode: 'fc' | 'free' = 'fc'): { state: Save; hits: { level: number; jar: number }[]; rewards: EventReward[]; points: number; levelBefore: number; levelAfter: number } {
  const event = eventState(state), fc = state.fc ?? 0;
  const option = EVENT_PLAYS.find(play => play.count === count);
  if (mode === 'free') { if (!Number.isInteger(count) || count < 1) throw new Error('Số lượt không hợp lệ.'); if (event.free < count) throw new Error('Bạn không có lượt chơi miễn phí. Hãy làm nhiệm vụ để nhận thêm.'); }
  else if (!option) throw new Error('Hãy chọn 1, 10, 50 hoặc 100 lượt.');
  else if (!free && fc < option.price) throw new Error(`Không đủ FC. Cần ${money(option.price)} FC để chơi ${count} lượt.`);
  let points = event.points;
  const levelBefore = eventLevel(points), hits: { level: number; jar: number }[] = [];
  for (let i = 0; i < count; i++) { const level = eventLevel(points), jar = pickJar(EVENT_LEVELS[level], rng()); hits.push({ level, jar }); points += EVENT_LEVELS[level].jars[jar].points; }
  const rewards = hits.map(hit => EVENT_LEVELS[hit.level].jars[hit.jar].reward), levelAfter = eventLevel(points), gained = points - event.points;
  const cost = mode === 'free' ? `−${count} lượt miễn phí` : free ? 'Thử nghiệm · Không trừ FC' : `−${money(option!.price)} FC`;
  const record = entry(`Nâng Cấp Siêu Sao · ${count} lượt`, `${summarizeRewards(rewards).map(rewardLabel).join(', ')} · +${gained} điểm${levelAfter > levelBefore ? ` · Lên cấp ${levelAfter + 1}` : ''} · ${cost}`);
  const time = Date.now(), log = [...hits.map(hit => ({ time, ...hit, points: EVENT_LEVELS[hit.level].jars[hit.jar].points, reward: EVENT_LEVELS[hit.level].jars[hit.jar].reward })).reverse(), ...event.log].slice(0, EVENT_LOG_MAX);
  const next = { ...event, log, points, plays: event.plays + count, free: mode === 'free' ? event.free - count : event.free, paid: mode === 'fc' ? event.paid + count : event.paid };
  const granted = grantRewards(state, rewards);
  return { state: { ...granted, fc: mode === 'fc' && !free ? (granted.fc ?? 0) - option!.price : granted.fc ?? 0, event: next, history: [record, ...state.history].slice(0, 200) }, hits, rewards, points: gained, levelBefore, levelAfter };
}

export function claimMission(state: Save, id: string): Save {
  const mission = EVENT_MISSIONS.find(item => item.id === id), event = eventState(state);
  if (!mission) throw new Error('Không tìm thấy nhiệm vụ này.');
  if (event.missions.includes(id)) throw new Error('Bạn đã nhận thưởng nhiệm vụ này hôm nay.');
  if (missionProgress(state, mission) < mission.goal) throw new Error(`Chưa hoàn thành: ${mission.title}.`);
  const record = entry(`Nhiệm vụ sự kiện · ${mission.title}`, `+${mission.free} lượt chơi miễn phí`);
  return { ...state, event: { ...event, free: event.free + mission.free, missions: [...event.missions, id] }, history: [record, ...state.history].slice(0, 200) };
}

// Nhận một mốc: mốc 1 lựa chọn bỏ qua choice; mốc nhiều lựa chọn phải chọn 1 bộ quà (chỉ số trong options).
export function claimMilestone(state: Save, index: number, choice: number | null): { state: Save; rewards: EventReward[] } {
  const milestone = EVENT_MILESTONES[index];
  if (!milestone) throw new Error('Không tìm thấy mốc quà này.');
  if (milestoneAvailable(state, index) < 1) throw new Error(`Cần ${money(milestone.points)} điểm tích lũy để nhận mốc quà này.`);
  const rewards = milestone.options[milestone.options.length === 1 ? 0 : choice ?? -1];
  if (!rewards) throw new Error('Hãy chọn một phần quà.');
  const event = eventState(state), claimed = EVENT_MILESTONES.map((_, i) => (event.claimed[i] ?? 0) + (i === index ? 1 : 0));
  const record = entry(`Quà tích lũy · Mốc ${money(milestone.points)} điểm`, rewards.map(rewardLabel).join(' + '));
  const gifts = [{ time: Date.now(), milestone: index, rewards }, ...event.gifts].slice(0, EVENT_GIFT_MAX);
  return { state: { ...grantRewards(state, rewards), event: { ...event, claimed, gifts }, history: [record, ...state.history].slice(0, 200) }, rewards };
}
// Vòng quà tích lũy: số vòng đã hoàn thành và số điểm còn thiếu để xong vòng tiếp theo.
export const eventRound = (points: number) => ({ done: Math.floor(points / EVENT_ROUND), next: EVENT_ROUND - points % EVENT_ROUND });
