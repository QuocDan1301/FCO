import { ACCOUNT_LOCKED_MESSAGE } from './account-identity';
import { ACCOUNT_PAUSED_MESSAGE } from './maintenance-state';
import { dayKey } from './game';
import type { EventReward, Save } from './game';
import { eventState } from './event';
import type { Membership } from './membership';

// Phần thuần của ví FC (không nạp client Supabase): kiểu dữ liệu máy chủ trả về, thông báo lỗi, áp ví vào bản lưu.
export type Checkin = { claimedToday: boolean; day: number; done: number };
// claimed[i] = số lần đã nhận mốc i (null = chưa nhận).
export type BilacState = { points: number; claimed: (number | null)[]; freeToday: boolean };
export type Wallet = { fc: number; dailyClaimed: boolean; checkin?: Checkin; bilac?: BilacState; membership?: Membership; event: { points: number; free: number; paid: number; missions: string[] }; admin: boolean };
export type ServerJackpotWin = { name: string; amount: number; kind: 'special' | 'mini'; time: number; mine: boolean };
export type ServerJackpot = { pot: number; feed: ServerJackpotWin[] };
// Bảng xếp hạng HLV (fco_leaderboard): top 10 kỷ lục đập thẻ OVR, top 10 giá trị đội hình, hạng của người xem.
export type LeaderboardOvr = { name: string; ovr: number; playerId: number | null; level: number | null; mine: boolean };
export type LeaderboardSquad = { name: string; value: number; mine: boolean };
export type Leaderboard = { ovr: LeaderboardOvr[]; squad: LeaderboardSquad[]; me: { ovr: number | null; ovrRank: number | null; squad: number | null; squadRank: number | null } };
export type EventPlayResult = { hits: { level: number; jar: number }[]; paid: number; jarFc: number; jackpotWins: { kind: 'special' | 'mini'; amount: number; time: number }[]; jackpot: ServerJackpot; wallet: Wallet };
// Quà admin tặng (supabase/migrations/202611090002_fco_admin_gifts.sql); claimed chỉ có ở danh sách của admin.
export type AdminGift = { id: number; rewards: EventReward[]; note: string; time: number; claimed?: boolean };
export type LedgerRow = { time: number; login: string; delta: number; balance: number; reason: string; note: string | null; admin: boolean };
export type GiftCodeRow = { hash: string; hint: string; rewards: EventReward[]; expires: string | null; created: string; used: number };
export type AnomalyRow = { id: number; time: number; login: string; flags: string[]; bpBefore: number | null; bpAfter: number; cardsBefore: number | null; cardsAfter: number; packsBefore: number | null; packsAfter: number; history: string[]; reviewed: boolean };
export type StatsSummary = { registered: number; registeredToday: number; registered7: number; online: number; activeToday: number; active7: number; playSecondsToday: number; playSeconds7: number; playSecondsAll: number; topupFcToday: number; topupFc7: number; topupFc30: number; topupFcAll: number; topupVndToday: number; topupVnd7: number; topupVnd30: number; topupVndAll: number; payers: number };
export type StatsDay = { day: string; active: number; seconds: number; topupFc: number; topupVnd: number; registered: number };
export type StatsPlayer = { login: string; registered: number; lastSeen: number | null; online: boolean; playSeconds: number; playSecondsToday: number; topupFc: number; topupVnd: number; fc: number };
// Thống kê FC của chính người chơi (fco_my_fc_stats): topup = FC admin đã cộng, spent = FC đã chi cho Shop và sự kiện.
export type FcStats = { topup: number; spent: number };
// Quản lý tài khoản (fco_admin_accounts): total = mọi tài khoản, matched = số khớp tìm kiếm, accounts = trang hiện tại.
export type AdminAccount = { id: string; login: string; registered: number; lastSeen: number | null; online: boolean; playSeconds: number; topupFc: number; topupVnd: number; fc: number; bp: number; cards: number; packs: number; hasSave: boolean; locked: boolean; admin: boolean; paused: boolean };
export type AdminAccountList = { total: number; matched: number; accounts: AdminAccount[]; now: number };
export const LEDGER_REASONS: Record<string, string> = { admin: 'Admin', daily: 'Quà ngày', shop: 'Mua gói', event: 'Chơi sự kiện', event_jar: 'Hũ sự kiện', jackpot: 'Jackpot', gift: 'Gift code', admin_gift: 'Admin tặng quà', reset: 'Admin reset tài khoản' };
export type AdminStats = { summary: StatsSummary; days: StatsDay[]; players: StatsPlayer[]; now: number };
// Bi Lắc (supabase/migrations/202611070005_fco_bilac.sql): quà {fc} / {bp} / {pack,count}; quà Giải Đặc Biệt / Phụ trả về {fc, jackpot}.
export type BilacReward = EventReward | { fc: number; jackpot: 'special' | 'mini' } | { jackpot: 'special' | 'mini' };
export type BilacSymbol = 'club' | 'fc' | 'special' | 'bp' | 'card';
export type BilacRow = { id: string; symbol: BilacSymbol | null; kind: 'triple' | 'pair' | 'mixed'; points: number; rewards: BilacReward[] };
export type BilacConfig = { symbols: { id: BilacSymbol; label: string }[]; rows: BilacRow[]; milestones: BilacMilestone[]; round: number; prices: { count: number; price: number }[] };
export type BilacMilestone = { points: number; options: BilacReward[][]; once: boolean };
export type BilacPlay = { balls: BilacSymbol[]; row: string; points: number; reward: BilacReward };
export type BilacResult = { plays: BilacPlay[]; paid: number; points: number; jackpot: ServerJackpot; wallet: Wallet };
export const LOGIN_FOR_FC = 'Hãy đăng nhập tài khoản để dùng FC.';

const MESSAGES: Record<string, string> = {
  FCO_NOT_ENOUGH_FC: 'Không đủ FC.',
  FCO_DAILY_CLAIMED: 'Bạn đã nhận quà hôm nay. Hẹn gặp lại vào ngày mai!',
  FCO_GIFT_INVALID: 'Gift code không đúng.',
  FCO_GIFT_EXPIRED: 'Gift code đã hết hạn.',
  FCO_GIFT_USED: 'Bạn đã dùng gift code này rồi.',
  FCO_GIFT_EXISTS: 'Code này đã có.',
  FCO_GIFT_BAD_REWARDS: 'Phần quà không hợp lệ.',
  FCO_NO_FREE_PLAYS: 'Bạn không có lượt chơi miễn phí. Hãy làm nhiệm vụ để nhận thêm.',
  FCO_MISSION_DONE: 'Bạn đã nhận thưởng nhiệm vụ này hôm nay.',
  FCO_MISSION_INCOMPLETE: 'Chưa hoàn thành nhiệm vụ.',
  FCO_MILESTONE_CLAIMED: 'Bạn đã nhận quà mốc này rồi.',
  FCO_MILESTONE_LOCKED: 'Chưa đủ điểm để nhận quà mốc này.',
  FCO_MILESTONE_CHOICE: 'Hãy chọn một phần quà.',
  FCO_ADMIN_ONLY: 'Chỉ admin mới dùng được chức năng này.',
  FCO_USER_NOT_FOUND: 'Không tìm thấy tài khoản này.',
  FCO_MAINTENANCE: 'Game đang bảo trì. Vui lòng quay lại sau.',
  FCO_ACCOUNT_PAUSED: `.`,
  FCO_NO_ACCOUNTS: 'Chưa chọn tài khoản nào.',
  FCO_ADMIN_PROTECTED: 'Không thể khoá hoặc xoá tài khoản admin.',
  FCO_ACCOUNT_LOCKED: ACCOUNT_LOCKED_MESSAGE,
  FCO_BAD_AMOUNT: 'Số FC không hợp lệ.',
  'Authentication required': 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.',
};
export function walletMessage(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  const code = Object.keys(MESSAGES).find(key => text.includes(key));
  if (code) return MESSAGES[code];
  if (/PGRST202|Could not find the function/i.test(text)) return 'Máy chủ chưa cài chức năng này (admin cần chạy migration Supabase mới nhất).';
  if (/fetch|network|timeout|abort/i.test(text)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return 'Máy chủ FC đang lỗi, hãy thử lại sau.';
}

// Áp số FC, quà ngày và tiến trình sự kiện (điểm, lượt miễn phí, lượt trả phí, nhiệm vụ trong ngày) từ máy chủ vào bản lưu.
export function applyWallet(state: Save, wallet: Wallet, today = dayKey()): Save {
  const event = eventState(state, today);
  const daily = wallet.dailyClaimed ? today : state.daily === today ? '' : state.daily;
  return { ...state, fc: wallet.fc, daily, ...(wallet.membership ? { membership: wallet.membership } : {}), event: { ...event, day: today, points: wallet.event.points, free: wallet.event.free, paid: wallet.event.paid, missions: [...wallet.event.missions] } };
}
