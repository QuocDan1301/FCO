import { ACCOUNT_LOCKED_MESSAGE } from './account-identity';
import { ACCOUNT_PAUSED_MESSAGE } from './maintenance-state';
import { dayKey } from './game';
import type { EventReward, Save } from './game';
import { eventState } from './event';
import type { Membership } from './membership';
import type { ServerRecord } from './inventory-sync';
import type { NameEffect } from './name-effects';

// Phần thuần của ví FC (không nạp client Supabase): kiểu dữ liệu máy chủ trả về, thông báo lỗi, áp ví vào bản lưu.
export type Checkin = { claimedToday: boolean; day: number; done: number };
// claimed[i] = số lần đã nhận mốc i (null = chưa nhận).
export type BilacState = { points: number; claimed: (number | null)[]; freeToday: boolean };
// Vòng Quanh Thế Giới: ô quân đang đứng (0 = Bắt đầu), số lượt Chỉ định, còn lượt miễn phí hôm nay (fco_wallet_json 'vqtg').
// claimed[i] = số lần đã nhận quà mốc i của Shop Đổi Vé; paid = đã từng chơi trả FC (mốc 1 vé chỉ nhận bằng lượt trả phí).
export type VqtgState = { pos: number; picks: number; tickets: number; freeToday: boolean; claimed?: number[]; paid?: boolean };
// save: bản lưu mới khi máy chủ vừa cộng quà vào kho (điểm danh ngày 7), xem src/inventory-sync.ts.
// stp: Star Point (migration 202611110007_fco_star_point.sql), máy chủ chưa chạy migration thì không có.
export type Wallet = { fc: number; stp?: number; dailyClaimed: boolean; checkin?: Checkin; bilac?: BilacState; vqtg?: VqtgState; membership?: Membership; event: { points: number; free: number; paid: number; missions: string[] }; admin: boolean; save?: ServerRecord | null; tier?: 'classic' | 'premium' | 'luxury'; tierUntil?: number | null; effect?: NameEffect | null; club?: string | null };
export type ServerJackpotWin = { name: string; amount: number; kind: 'special' | 'mini'; time: number; mine: boolean };
export type ServerJackpot = { pot: number; feed: ServerJackpotWin[] };
// Bảng xếp hạng HLV (fco_leaderboard): top 10 kỷ lục đập thẻ OVR, top 10 giá trị đội hình, hạng của người xem.
export type LeaderboardOvr = { name: string; ovr: number; playerId: number | null; level: number | null; mine: boolean; effect?: NameEffect | null; club?: string | null };
export type LeaderboardSquad = { name: string; value: number; mine: boolean; effect?: NameEffect | null; club?: string | null };
// Sút phạt đền (migration 202611110005): chuỗi bàn liên tiếp dài nhất.
export type LeaderboardPenalty = { name: string; goals: number; mine: boolean; effect?: NameEffect | null; club?: string | null };
// BXH "Đập +8 nhiều nhất" (fco_plus8_board): số cầu thủ khác nhau đập thành công lên +8, mỗi mùa tối đa 3.
export type Plus8Row = { name: string; count: number; mine: boolean; effect?: NameEffect | null; club?: string | null };
// Vòng đua BXH GLXH + Penalty (fco_rank_round_state, migration 202611140017): quà Top 1–3 (FC), mốc kết thúc, người thắng vòng trước.
export type RankRoundWinner = { rank: number; name: string; score: number; fc: number; pack?: string | null; mine: boolean };
export type RankRound = { round: number; endsAt: number; prizes: number[]; last: Partial<Record<'ranked' | 'penalty' | 'plus8', RankRoundWinner[]>> };
export type Plus8Board = { top: Plus8Row[]; me: { count: number; rank: number | null } };
// Lịch sử đập +8 của một HLV (fco_plus8_history, 202611140012): counted = được tính điểm (mỗi mùa 3 cầu thủ đạt sớm nhất).
export type Plus8History = { name: string; mine: boolean; club?: string | null; items: { pid: number; at: number; counted: boolean }[] };
export type Leaderboard = { ovr: LeaderboardOvr[]; squad: LeaderboardSquad[]; penalty?: LeaderboardPenalty[]; me: { ovr: number | null; ovrRank: number | null; squad: number | null; squadRank: number | null; penalty?: number | null; penaltyRank?: number | null } };
export type EventPlayResult = { hits: { level: number; jar: number }[]; paid: number; jarFc: number; jackpotWins: { kind: 'special' | 'mini'; amount: number; time: number }[]; jackpot: ServerJackpot; wallet: Wallet };
// Quà admin tặng (supabase/migrations/202611090002_fco_admin_gifts.sql); claimed chỉ có ở danh sách của admin.
export type AdminGift = { id: number; rewards: EventReward[]; note: string; time: number; claimed?: boolean };
export type LedgerRow = { id?: number; time: number; login: string; delta: number; balance: number; reason: string; note: string | null; admin: boolean };
// Dòng cộng FC do admin thực hiện đổi được giữa nạp ('admin') và tặng ('admin_gift'), xem 202611090010_fco_admin_fc_gift.sql.
export const canMarkGift = (row: LedgerRow) => row.id !== undefined && row.admin && row.delta > 0 && (row.reason === 'admin' || row.reason === 'admin_gift');
export type GiftCodeRow = { hash: string; hint: string; rewards: EventReward[]; expires: string | null; created: string; used: number };
// Sổ nghi vấn gian lận (fco_admin_cheat_flags, migration 202611140010): mỗi HLV một dòng, mỗi loại một mục.
export type CheatKind = { kind: string; hits: number; last: number; detail: Record<string, unknown> | null; fresh: boolean };
export type CheatSuspect = { user: string; login: string; name: string; locked: boolean; fresh: boolean; last: number; kinds: CheatKind[] };
export type GuardSummary = { suspects: number; anomalies: number; enforced: boolean; version: string | null };
export type AnomalyRow = { id: number; time: number; login: string; flags: string[]; bpBefore: number | null; bpAfter: number; cardsBefore: number | null; cardsAfter: number; packsBefore: number | null; packsAfter: number; history: string[]; reviewed: boolean };
export type StatsSummary = { registered: number; registeredToday: number; registered7: number; online: number; activeToday: number; active7: number; playSecondsToday: number; playSeconds7: number; playSecondsAll: number; topupFcToday: number; topupFc7: number; topupFc30: number; topupFcAll: number; topupVndToday: number; topupVnd7: number; topupVnd30: number; topupVndAll: number; payers: number };
export type StatsDay = { day: string; active: number; seconds: number; topupFc: number; topupVnd: number; registered: number };
export type StatsPlayer = { login: string; registered: number; lastSeen: number | null; online: boolean; playSeconds: number; playSecondsToday: number; topupFc: number; topupVnd: number; fc: number };
// Thống kê FC của chính người chơi (fco_my_fc_stats): topup = FC admin đã cộng, spent = FC đã chi cho Shop và sự kiện.
export type FcStats = { topup: number; spent: number };
// Quản lý tài khoản (fco_admin_accounts): total = mọi tài khoản, matched = số khớp tìm kiếm, accounts = trang hiện tại.
export type AdminAccount = { id: string; login: string; registered: number; lastSeen: number | null; online: boolean; playSeconds: number; topupFc: number; topupVnd: number; fc: number; bp: number; cards: number; packs: number; hasSave: boolean; locked: boolean; admin: boolean; paused: boolean };
// online: số tài khoản đang online (migration 202611090014); chưa chạy migration thì không có.
export type AdminAccountList = { total: number; matched: number; online?: number; accounts: AdminAccount[]; now: number };
export const LEDGER_REASONS: Record<string, string> = { admin: 'Admin nạp', admin_old: 'Admin nạp (trước reset)', daily: 'Quà ngày', shop: 'Mua gói', event: 'Chơi sự kiện', event_jar: 'Hũ sự kiện', jackpot: 'Jackpot', gift: 'Gift code', admin_gift: 'Admin tặng quà', admin_deduct: 'Admin trừ FC', reset: 'Admin reset tài khoản' };
export type AdminStats = { summary: StatsSummary; days: StatsDay[]; players: StatsPlayer[]; now: number };
// Bi Lắc (supabase/migrations/202611070005_fco_bilac.sql): quà {fc} / {bp} / {pack,count}; quà Giải Đặc Biệt / Phụ trả về {fc, jackpot}.
export type BilacReward = EventReward | { fc: number; jackpot: 'special' | 'mini' } | { jackpot: 'special' | 'mini' };
export type BilacSymbol = 'club' | 'fc' | 'special' | 'bp' | 'card';
export type BilacRow = { id: string; symbol: BilacSymbol | null; kind: 'triple' | 'pair' | 'mixed'; points: number; rewards: BilacReward[] };
export type BilacConfig = { symbols: { id: BilacSymbol; label: string }[]; rows: BilacRow[]; milestones: BilacMilestone[]; round: number; prices: { count: number; price: number }[] };
export type BilacMilestone = { points: number; options: BilacReward[][]; once: boolean };
export type BilacPlay = { balls: BilacSymbol[]; row: string; points: number; reward: BilacReward };
export type BilacResult = { plays: BilacPlay[]; paid: number; points: number; jackpot: ServerJackpot; wallet: Wallet; save?: ServerRecord | null; miniFeed?: VqtgMiniWin[] };
// Vòng Quanh Thế Giới (supabase/migrations/202611130004_fco_vqtg.sql): mỗi lượt lắc roll, đi from → to; pick = được +1 Chỉ định,
// pool = trúng cả Quỹ BP. reward null khi ô không có quà (ô Chỉ định).
// Quà mốc Shop Đổi Vé có thêm phiếu giảm thuế {voucher, count}.
export type VqtgReward = BilacReward | { voucher: number; count: number };
export type VqtgMilestone = { idx: number; tickets: number; options: VqtgReward[][]; once: boolean; paidOnly: boolean };
// Đua top nhận quà hot: top 5 theo vé (fco_vqtg_top).
export type VqtgTopRow = { rank: number; name: string; tickets: number; mine: boolean; effect?: NameEffect | null; club?: string | null };
export type VqtgTop = { top: VqtgTopRow[]; me: { tickets: number; rank: number | null }; rewards: { rank: number; rewards: VqtgReward[]; note?: string }[] };
// Tin người trúng Mini Jackpot (BP) của VQTG, lưu riêng với bảng tin Jackpot FC.
export type VqtgMiniWin = { name: string; amount: number; time: number; mine: boolean };
export type VqtgConfig = { tiles: import('./vqtg').VqtgTile[]; prices: { count: number; price: number }[]; bpPool: number; milestones?: VqtgMilestone[]; round?: number; miniFeed?: VqtgMiniWin[] };
export type VqtgPlay = { roll: number; from: number; to: number; kind: import('./vqtg').VqtgTileKind; reward: BilacReward | null; pick?: number; pool?: boolean; tickets?: number };
export type VqtgResult = { plays: VqtgPlay[]; paid: number; picks: number; pos: number; tickets: number; bpPool: number; jackpot: ServerJackpot; wallet: Wallet; save?: ServerRecord | null; miniFeed?: VqtgMiniWin[] };
export const LOGIN_FOR_FC = 'Hãy đăng nhập tài khoản để dùng FC.';

const MESSAGES: Record<string, string> = {
  FCO_NOT_ENOUGH_FC: 'Không đủ FC.',
  FCO_NOT_ENOUGH_STP: 'Không đủ Star Point.',
  FCO_BAD_CLUB: 'Logo CLB không hợp lệ.',
  FCO_RANKED_TEAM: 'Bộ đội hình đang dùng chưa đủ 11 cầu thủ.',
  FCO_RANKED_CARD: 'Đội hình có thẻ không còn trong kho. Hãy kiểm tra lại Đội hình.',
  FCO_RANKED_WAGE: 'Đội hình vượt mức lương 310. Hãy giảm lương đội hình ở mục Đội hình rồi đá GLXH.',
  FCO_RANKED_TOO_FAST: 'Đợi vài giây rồi đá trận tiếp theo.',
  FCO_RANKED_EARLY: 'Trận đấu chưa kết thúc.',
  FCO_RANKED_IN_PROGRESS: 'Bạn đang có một trận chưa kết thúc.',
  FCO_RANKED_NO_MATCH: 'Trận này đã kết thúc.',
  FCO_BAD_PASSWORD: 'Mật khẩu phải từ 6 đến 72 ký tự.',
  FCO_DEVICE_LIMIT: 'Thiết bị này đã nhận phần quà này cho một tài khoản khác. Mỗi thiết bị chỉ một tài khoản được nhận.',
  FCO_STP_MISSION_INCOMPLETE: 'Bạn chưa hoàn thành nhiệm vụ này hôm nay.',
  FCO_STP_MISSION_CLAIMED: 'Bạn đã nhận thưởng nhiệm vụ này hôm nay.',
  FCO_STP_MISSION_UNKNOWN: 'Nhiệm vụ không tồn tại.',
  FCO_STP_PACKAGE: 'Gói Star Point này không còn bán.',
  FCO_STP_DAILY_LIMIT: 'Bạn đã mua gói này hôm nay. Mỗi gói Star Point mua 1 lần mỗi ngày, làm mới lúc 00:00.',
  FCO_NO_VOUCHER: 'Bạn không còn phiếu giảm thuế này.',
  FCO_VOUCHER_USELESS: 'Phiếu này không giảm thêm thuế cho tài khoản Premium (không cộng dồn).',
  FCO_BAD_VOUCHER: 'Phiếu giảm thuế không hợp lệ.',
  FCO_DAILY_CLAIMED: 'Bạn đã nhận quà hôm nay. Hẹn gặp lại vào ngày mai!',
  FCO_GIFT_INVALID: 'Gift code không đúng.',
  FCO_GIFT_TOO_MANY: 'Bạn nhập sai gift code quá nhiều lần. Hãy thử lại sau 10 phút.',
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
  FCO_LEDGER_NOT_FOUND: 'Không tìm thấy dòng sổ cái này.',
  FCO_LEDGER_NOT_ADMIN_CREDIT: 'Chỉ đổi được lần cộng FC do admin thực hiện.',
  // Kho thẻ trên máy chủ (202611100013_fco_inventory_server.sql). Mã dài đứng trước mã là phần con của nó.
  FCO_CATALOG_MISSING: 'Máy chủ chưa có dữ liệu game. Admin cần đồng bộ dữ liệu ở Quản trị FC.',
  FCO_CATALOG_STALE: 'Dữ liệu game vừa thay đổi. Hãy tải lại trang rồi thử lại.',
  FCO_CATALOG_INVALID: 'Dữ liệu đồng bộ không hợp lệ, hãy đồng bộ lại.',
  FCO_UPDATE_REQUIRED: 'Game đã có bản mới. Hãy tải lại trang.',
  FCO_NO_SAVE: 'Chưa tải được kho thẻ trên máy chủ. Hãy tải lại trang.',
  FCO_INVENTORY_LOCAL: 'Kho thẻ chưa chuyển lên máy chủ.',
  FCO_NO_PACKS: 'Hãy chọn vật phẩm còn trong kho để mở.',
  FCO_BAD_COUNT: 'Số lượng không hợp lệ.',
  FCO_PACK_UNAVAILABLE: 'Gói này hiện không mở hoặc mua được.',
  FCO_PACK_EMPTY: 'Gói này chưa có cầu thủ.',
  FCO_NOT_CHOOSE_PACK: 'Gói này không phải gói chỉ định.',
  FCO_CHOOSE_PACK: 'Đây là gói chỉ định: hãy chọn cầu thủ muốn nhận.',
  FCO_NOT_ENOUGH_PACKS: 'Không còn đủ gói trong kho.',
  FCO_BAD_DRAFT: 'Danh sách cầu thủ đã chọn không hợp lệ.',
  FCO_BAD_TARGET: 'Chọn thẻ chính có cấp cộng dưới +13.',
  FCO_BAD_MATERIALS: 'Cần chọn từ 1 đến 5 thẻ nguyên liệu khác nhau.',
  FCO_MATERIAL_MISSING: 'Nguyên liệu không còn trong kho.',
  FCO_MATERIAL_LOCKED: 'Có thẻ nguyên liệu đang bị khóa.',
  FCO_UNKNOWN_PLAYER: 'Không tìm thấy cầu thủ này trong dữ liệu máy chủ.',
  FCO_BAD_PROTECTION: 'Mức bảo vệ nâng cấp không hợp lệ.',
  FCO_PROTECTION_LEVEL: 'Bảo vệ nâng cấp chỉ áp dụng cho thẻ từ +8.',
  FCO_NO_PRICE: 'Thẻ này chưa có giá.',
  FCO_NOT_ENOUGH_BP: 'Không đủ BP.',
  FCO_BAD_SELL: 'Danh sách bán không hợp lệ.',
  FCO_CARD_MISSING: 'Thẻ này không còn trong kho. Hãy chọn lại cầu thủ.',
  FCO_CARD_LOCKED: 'Thẻ đang bị khóa. Mở khóa trước khi bán hoặc xóa.',
  FCO_TRADE_LOCKED: 'Thẻ mùa này bị khóa giao dịch: không mua / bán được trên TTCN.',
  FCO_PENALTY_NO_RUN: 'Lượt sút đã kết thúc. Hãy bấm Chơi lại.',
  FCO_PENALTY_TOO_FAST: 'Sút chậm lại một chút rồi thử lại.',
  FCO_PENALTY_BAD_AIM: 'Hướng sút không hợp lệ.',
  FCO_PENALTY_BAD_KIND: 'Kiểu sút không hợp lệ.',
  FCO_PREMIUM_ONLY: 'Hiệu ứng này chỉ dành cho tài khoản Premium.',
  FCO_LUXURY_ONLY: 'Hiệu ứng này chỉ dành cho tài khoản Luxury.',
  FCO_BAD_EFFECT: 'Hiệu ứng không hợp lệ.',
  FCO_BAD_PRICE: 'Giá bán phải nằm trong ±10% giá thị trường. Giá có thể vừa đổi kỳ, hãy mở lại cửa sổ bán.',
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
  return { ...state, fc: wallet.fc, ...(wallet.stp !== undefined ? { stp: wallet.stp } : {}), ...(wallet.tier ? { premiumUntil: wallet.tier === 'premium' ? wallet.tierUntil ?? null : null, luxuryUntil: wallet.tier === 'luxury' ? wallet.tierUntil ?? null : null } : {}), daily, ...(wallet.membership ? { membership: wallet.membership } : {}), event: { ...event, day: today, points: wallet.event.points, free: wallet.event.free, paid: wallet.event.paid, missions: [...wallet.event.missions] } };
}
