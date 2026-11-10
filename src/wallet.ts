import { accountClient } from './account-client';
import type { EventReward } from './game';
import type { GiftCode } from './gift-code-rules';
import type { MembershipId } from './membership';
import { LOGIN_FOR_FC, walletMessage } from './wallet-state';
import { MAINTENANCE_CHANGED } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';
import type { ServerRecord } from './inventory-sync';
import type { AdminAccountList, AdminGift, AdminStats, AnomalyRow, BilacConfig, BilacResult, BilacReward, EventPlayResult, FcStats, GiftCodeRow, Leaderboard, LedgerRow, ServerJackpot, Wallet } from './wallet-state';
export * from './wallet-state';

// Ví FC trên máy chủ (supabase/migrations/202611070001_fco_wallet.sql): số FC, quà ngày, gift code, lượt sự kiện và jackpot
// do máy chủ quyết định; trình duyệt chỉ hiển thị và cộng phần BP / gói. Chỉ dùng khi đã đăng nhập tài khoản.
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!accountClient) throw new Error(LOGIN_FOR_FC);
  const { data, error } = await accountClient.rpc(fn, args).abortSignal(AbortSignal.timeout(20000));
  if (error) {
    // Máy chủ vừa báo bảo trì: kiểm tra lại ngay để hiện màn bảo trì, khỏi chờ tới lần kiểm tra định kỳ.
    if (/FCO_MAINTENANCE|FCO_ACCOUNT_PAUSED/.test(error.message ?? '')) window.dispatchEvent(new Event(MAINTENANCE_CHANGED));
    throw new Error(walletMessage(error));
  }
  return data as T;
}

// Dùng chung cho kho thẻ trên máy chủ (src/inventory-server.ts).
export const rpcCall = <T>(fn: string, args: Record<string, unknown> = {}) => call<T>(fn, args);
export const fetchServerNow = () => call<number>('fco_server_now');
export const fetchWallet = (seedPoints: number) => call<Wallet>('fco_wallet', { p_seed_points: Math.max(0, Math.floor(seedPoints)) });
export const claimDailyFc = () => call<Wallet>('fco_claim_daily');
// Bảng xếp hạng HLV (supabase/migrations/202611080001_fco_ranks.sql).
export const fetchLeaderboard = () => call<Leaderboard>('fco_leaderboard');
export const reportUpgradeRank = (ovr: number, playerId: number, level: number) => call<null>('fco_rank_upgrade', { p_ovr: ovr, p_player: playerId, p_level: level });
export const reportSquadRank = (value: number) => call<null>('fco_rank_squad', { p_value: Math.max(0, Math.floor(value)) });
export const spendFc = (amount: number, detail: Record<string, unknown>) => call<Wallet>('fco_spend_fc', { p_amount: amount, p_reason: 'shop', p_detail: detail });
export const buyMembership = (id: MembershipId) => call<Wallet>('fco_buy_membership', { p_tier: id });
export const redeemGiftHash = (hash: string) => call<{ rewards: EventReward[]; wallet: Wallet; save?: ServerRecord | null }>('fco_redeem_gift', { p_hash: hash });
export const claimMissionFc = (id: string) => call<Wallet>('fco_event_mission', { p_id: id });
export const playEventFc = (count: number, mode: 'fc' | 'free') => call<EventPlayResult>('fco_event_play', { p_count: count, p_mode: mode });
export const fetchFcStats = () => call<FcStats>('fco_my_fc_stats');
export const fetchJackpot = () => call<ServerJackpot>('fco_jackpot_state');
// gift = true: tặng FC (không tính vào Đã nạp / doanh thu), cần migration 202611090010. Nạp thường không gửi p_gift để vẫn chạy khi chưa có migration.
export const adminCredit = (login: string, amount: number, note: string, gift = false) => call<{ login: string; fc: number }>('fco_admin_credit', { p_login: login, p_amount: amount, p_note: note, ...(gift ? { p_gift: true } : {}) });
export const adminLedgerMarkGift = (id: number, gift: boolean) => call<{ id: number; reason: string }>('fco_admin_ledger_mark_gift', { p_id: id, p_gift: gift });
export const adminLedger = (login?: string) => call<LedgerRow[]>('fco_admin_ledger', { p_limit: 100, p_login: login || null });
export const adminGiftCodes = () => call<GiftCodeRow[]>('fco_admin_gift_codes');
export const adminGiftSave = (code: GiftCode) => call<GiftCodeRow[]>('fco_admin_gift_save', { p_hash: code.hash, p_hint: code.hint, p_rewards: code.rewards, p_expires: code.expires });
export const adminGiftDelete = (hash: string) => call<GiftCodeRow[]>('fco_admin_gift_delete', { p_hash: hash });
export const adminAnomalies = () => call<AnomalyRow[]>('fco_admin_anomalies', { p_limit: 200, p_include_reviewed: false });
export const adminAnomalyReview = (id: number, all = false) => call<AnomalyRow[]>('fco_admin_anomaly_review', { p_id: id, p_all: all });
export const heartbeat = () => call<null>('fco_heartbeat');
export const fetchMaintenanceState = () => call<MaintenanceState>('fco_maintenance_state');
export const adminMaintenanceSet = (enabled: boolean, message: string) => call<MaintenanceState>('fco_admin_maintenance_set', { p_enabled: enabled, p_message: message });
export const adminAccounts = (search: string, sort: string, limit: number, offset: number, status: string | null = null) => call<AdminAccountList>('fco_admin_accounts', { p_search: search || null, p_sort: sort, p_limit: limit, p_offset: offset, p_status: status });
// target: danh sách id, hoặc all = mọi tài khoản khớp tìm kiếm + bộ lọc đang xem (kể cả ở trang khác).
export const adminAccountsPause = (paused: boolean, target: { users: string[] } | { all: true; search: string; status: string | null }) => call<{ changed: number; skippedAdmins: number }>('fco_admin_accounts_pause', 'all' in target ? { p_paused: paused, p_all: true, p_search: target.search || null, p_status: target.status } : { p_paused: paused, p_users: target.users });
export const adminAccountLock = (id: string, locked: boolean) => call<{ locked: boolean }>('fco_admin_account_lock', { p_user: id, p_locked: locked });
export const adminAccountReset = (id: string, resetFc: boolean) => call<{ reset: boolean; fc: number }>('fco_admin_account_reset', { p_user: id, p_reset_fc: resetFc });
// Xoá hàng loạt (migration 202611100010): mỗi lần tối đa 200 tài khoản, remaining = số còn lại cần gọi tiếp.
export const adminAccountsDelete = (target: { users: string[] } | { all: true; search: string; status: string | null }) => call<{ deleted: number; skippedAdmins: number; remaining: number }>('fco_admin_accounts_delete', 'all' in target ? { p_all: true, p_search: target.search || null, p_status: target.status } : { p_users: target.users });
export const adminAccountDelete = (id: string) => call<{ deleted: boolean }>('fco_admin_account_delete', { p_user: id });
export const adminSendGift = (user: string, gift: { fc: number } | { pack: string; count: number }, note: string) => call<{ id: number; fc: number | null }>('fco_admin_send_gift', 'fc' in gift ? { p_user: user, p_fc: gift.fc, p_note: note } : { p_user: user, p_pack: gift.pack, p_count: gift.count, p_note: note });
export const adminGiftList = (user: string) => call<AdminGift[]>('fco_admin_gift_list', { p_user: user });
export const fetchMyGifts = () => call<AdminGift[]>('fco_my_admin_gifts');
export const ackMyGifts = (ids: number[]) => call<number>('fco_my_admin_gifts_ack', { p_ids: ids });
export const adminStats = (search?: string) => call<AdminStats>('fco_admin_stats', { p_search: search || null, p_limit: 300 });
export const fetchBilacConfig = () => call<BilacConfig>('fco_bilac_config');
export const playBilac = (count: number, mode: 'fc' | 'free') => call<BilacResult>('fco_bilac_play', { p_count: count, p_mode: mode });
export const claimBilac = (index: number, choice: number | null) => call<{ rewards: BilacReward[]; wallet: Wallet; save?: ServerRecord | null }>('fco_bilac_claim', { p_index: index, p_choice: choice });
