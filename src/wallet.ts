import { accountClient } from './account-client';
import { deviceId } from './device-id';
import type { EventReward } from './game';
import type { GiftCode } from './gift-code-rules';
import type { MembershipId } from './membership';
import type { StpItem, StpPackageId } from './stp';
import type { StpMissionId, StpMissionState } from './stp-missions';
import type { RankedFinish, RankedMatch, RankedState } from './ranked';
import { LOGIN_FOR_FC, walletMessage } from './wallet-state';
import { MAINTENANCE_CHANGED } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';
import type { ServerRecord } from './inventory-sync';
import type { NameEffect } from './name-effects';
import type { LineupBoardId, PublicLineupView } from './public-lineup';
import type { PenaltyKeep, PenaltyShot, PenaltyStart, ShotKind } from './penalty';
import type { AdminAccountList, AdminGift, AdminStats, AnomalyRow, BilacConfig, BilacResult, BilacReward, VqtgConfig, VqtgResult, VqtgReward, VqtgTop, EventPlayResult, FcStats, GiftCodeRow, Leaderboard, LedgerRow, ServerJackpot, Wallet } from './wallet-state';
import { checkForUpdate, requestReload } from './update-check';
export * from './wallet-state';

// Ví FC trên máy chủ (supabase/migrations/202611070001_fco_wallet.sql): số FC, quà ngày, gift code, lượt sự kiện và jackpot
// do máy chủ quyết định; trình duyệt chỉ hiển thị và cộng phần BP / gói. Chỉ dùng khi đã đăng nhập tài khoản.
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!accountClient) throw new Error(LOGIN_FOR_FC);
  const { data, error } = await accountClient.rpc(fn, args).abortSignal(AbortSignal.timeout(20000));
  if (error) {
    // Lỗi gốc của máy chủ (thông báo cho người chơi đã được dịch gọn): xem ở Console khi cần tìm nguyên nhân.
    console.error(`[fco] ${fn}`, error);
    // Máy chủ vừa báo bảo trì: kiểm tra lại ngay để hiện màn bảo trì, khỏi chờ tới lần kiểm tra định kỳ.
    if (/FCO_MAINTENANCE|FCO_ACCOUNT_PAUSED/.test(error.message ?? '')) window.dispatchEvent(new Event(MAINTENANCE_CHANGED));
    // Dữ liệu game trên máy chủ đã đổi: có bản game mới thì tải lại luôn (bản mới chưa đồng bộ dữ liệu thì chỉ báo lỗi, tránh tải lại liên tục).
    if (/FCO_CATALOG_STALE/.test(error.message ?? '')) void checkForUpdate().then(fresh => { if (fresh) requestReload(); });
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
// Gói Star Point (202611110007): save = bản lưu mới khi máy chủ giữ kho, null thì game tự cộng vật phẩm (grantStp).
export const buyStpPackage = (id: StpPackageId) => call<{ wallet: Wallet; save: ServerRecord | null; items: StpItem[]; bought?: string[] }>('fco_stp_buy', { p_package: id });
// Gói Star Point đã mua hôm nay (mỗi gói 1 lần mỗi ngày, 202611120001).
export const fetchStpToday = () => call<{ day: string; bought: string[] }>('fco_stp_today');
// Nhiệm vụ Star Point hằng ngày (202611110012).
export const fetchStpMissions = () => call<StpMissionState>('fco_stp_missions_state');
export const claimStpMission = (id: StpMissionId) => call<{ wallet: Wallet; reward: number; state: StpMissionState }>('fco_stp_mission_claim', { p_id: id });
// Xếp hạng giả lập (202611120002).
// Logo CLB tự chọn (202611120004).
export const setClubLogo = (club: string | null) => call<Wallet>('fco_set_club_logo', { p_club: club });
export const fetchRanked = () => call<RankedState>('fco_ranked_state');
// Đội hình đang dùng của HLV ở hạng p_rank trên một BXH (migration 202611120012).
export const viewLineup = (board: LineupBoardId, rank: number) => call<PublicLineupView | null>('fco_view_lineup', { p_board: board, p_rank: rank });
// Dòng LIVE trang chủ (migration 202611120008): tin chúc mừng chung, mới nhất trước.
// name / effect: tên + hiệu ứng tên Premium hiện tại của HLV (migration 202611120009).
export type LiveItem = { id: number; at: number; kind: string; text: string; name?: string | null; effect?: string | null };
export const fetchLiveFeed = () => call<LiveItem[]>('fco_live_feed');
export const finishRanked = () => call<RankedFinish>('fco_ranked_finish');
export const abandonRanked = () => call<RankedFinish>('fco_ranked_abandon');
export const playRanked = (team: { formation: string; slots: { uid: string; role: string; x: number; y: number; ovr: number }[] }) => call<RankedMatch>('fco_ranked_play', { p_team: team });
export const adminCreditStp = (login: string, amount: number, note: string) => call<{ login: string; stp: number }>('fco_admin_credit_stp', { p_login: login, p_amount: amount, p_note: note });
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
export const heartbeat = () => call<null>('fco_heartbeat', { p_device: deviceId() });
// Nghi clone (202611110014).
export type CloneAccount = { id: string; login: string; registered: number; lastSeen: number | null; topup: number; locked: boolean; admin: boolean };
export type CloneGroup = { kind: 'device' | 'ip'; key: string; allowed: boolean; accounts: CloneAccount[] };
export const adminCloneGroups = () => call<CloneGroup[]>('fco_admin_clone_groups');
export const adminDeviceAllow = (device: string, allow: boolean) => call<null>('fco_admin_device_allow', { p_device: device, p_allow: allow });
export const fetchMaintenanceState = () => call<MaintenanceState>('fco_maintenance_state');
export const adminMaintenanceSet = (enabled: boolean, message: string) => call<MaintenanceState>('fco_admin_maintenance_set', { p_enabled: enabled, p_message: message });
export const adminAccounts = (search: string, sort: string, limit: number, offset: number, status: string | null = null) => call<AdminAccountList>('fco_admin_accounts', { p_search: search || null, p_sort: sort, p_limit: limit, p_offset: offset, p_status: status });
// target: danh sách id, hoặc all = mọi tài khoản khớp tìm kiếm + bộ lọc đang xem (kể cả ở trang khác).
export const adminAccountsPause = (paused: boolean, target: { users: string[] } | { all: true; search: string; status: string | null }) => call<{ changed: number; skippedAdmins: number }>('fco_admin_accounts_pause', 'all' in target ? { p_paused: paused, p_all: true, p_search: target.search || null, p_status: target.status } : { p_paused: paused, p_users: target.users });
// Đặt lại mật khẩu người chơi (202611110015): mật khẩu tạm 6–72 ký tự, đăng xuất mọi thiết bị.
export const adminResetPassword = (user: string, password: string) => call<{ login: string }>('fco_admin_reset_password', { p_user: user, p_password: password });
export const adminAccountLock = (id: string, locked: boolean) => call<{ locked: boolean }>('fco_admin_account_lock', { p_user: id, p_locked: locked });
export const adminAccountReset = (id: string, resetFc: boolean) => call<{ reset: boolean; fc: number }>('fco_admin_account_reset', { p_user: id, p_reset_fc: resetFc });
// Xoá hàng loạt (migration 202611100010): mỗi lần tối đa 200 tài khoản, remaining = số còn lại cần gọi tiếp.
export const adminAccountsDelete = (target: { users: string[] } | { all: true; search: string; status: string | null }) => call<{ deleted: number; skippedAdmins: number; remaining: number }>('fco_admin_accounts_delete', 'all' in target ? { p_all: true, p_search: target.search || null, p_status: target.status } : { p_users: target.users });
// Loại tài khoản Classic / Premium (migration 202611110003): tier = null chỉ đọc.
// tier 'premium' = thêm 7 ngày (cộng dồn khi còn hạn, migration 202611110013); until = hạn Premium (ms).
export const adminAccountTier = (user: string, tier: 'classic' | 'premium' | 'luxury' | null = null) => call<{ tier: 'classic' | 'premium' | 'luxury'; until?: number | null }>('fco_admin_account_tier', { p_user: user, p_tier: tier });
// Hiệu ứng avatar + tên (migration 202611110004): chỉ tài khoản Premium đặt được, null = tắt.
export const setNameEffect = (effect: NameEffect | null) => call<Wallet>('fco_set_name_effect', { p_effect: effect });
export const adminAccountDelete = (id: string) => call<{ deleted: boolean }>('fco_admin_account_delete', { p_user: id });
export const adminSendGift = (user: string, gift: { fc: number } | { pack: string; count: number }, note: string) => call<{ id: number; fc: number | null }>('fco_admin_send_gift', 'fc' in gift ? { p_user: user, p_fc: gift.fc, p_note: note } : { p_user: user, p_pack: gift.pack, p_count: gift.count, p_note: note });
// Tặng quà hàng loạt (migration 202611130002): mỗi lần tối đa 200 tài khoản, remaining = số còn lại; cùng batch không tặng trùng.
export const adminGiftBulk = (batch: string, target: { users: string[] } | { all: true; search: string; status: string | null }, gift: { fc: number } | { pack: string; count: number }, note: string) =>
  call<{ sent: number; remaining: number; total: number }>('fco_admin_gift_bulk', { p_batch: batch, ...('all' in target ? { p_all: true, p_search: target.search, p_status: target.status } : { p_users: target.users }), ...('fc' in gift ? { p_fc: gift.fc } : { p_pack: gift.pack, p_count: gift.count }), p_note: note });
// Admin trừ FC (migration 202611130003): lý do 'admin_deduct', không tính Đã nạp / doanh thu. clamp: không đủ thì trừ hết số còn lại,
// không thì bỏ qua (skipped). Mỗi lần tối đa 200 tài khoản; cùng batch không trừ hai lần; done / doneFc = cả đợt tới giờ.
export const adminDeduct = (batch: string, target: { users: string[] } | { all: true; search: string; status: string | null }, amount: number, clamp: boolean, note: string) =>
  call<{ deducted: number; fc: number; balance: number | null; skipped: number; remaining: number; done: number; doneFc: number }>('fco_admin_deduct', { p_batch: batch, p_amount: amount, ...('all' in target ? { p_all: true, p_search: target.search, p_status: target.status } : { p_users: target.users }), p_clamp: clamp, p_note: note });
export const adminGiftList = (user: string) => call<AdminGift[]>('fco_admin_gift_list', { p_user: user });
export const fetchMyGifts = () => call<AdminGift[]>('fco_my_admin_gifts');
export const ackMyGifts = (ids: number[]) => call<number>('fco_my_admin_gifts_ack', { p_ids: ids });
export const adminStats = (search?: string) => call<AdminStats>('fco_admin_stats', { p_search: search || null, p_limit: 300 });
// Mini game Sút phạt đền (migration 202611110005): máy chủ quyết định thủ môn bắt hay không và ghi kỷ lục.
export const penaltyStart = () => call<PenaltyStart>('fco_penalty_start');
// Kiểu sút (migration 202611110006): kiểu Thường không gửi p_kind để máy chủ chưa chạy migration mới vẫn nhận.
export const penaltyShoot = (x: number, y: number, kind: ShotKind = 'normal') => call<PenaltyShot>('fco_penalty_shoot', { p_x: x, p_y: y, ...(kind === 'normal' ? {} : { p_kind: kind }) });
// Làm thủ môn: gửi điểm bay người, máy chủ tung cú sút của máy (migration 202611120013).
export const penaltyKeep = (x: number, y: number) => call<PenaltyKeep>('fco_penalty_keep', { p_x: x, p_y: y });
export const fetchBilacConfig = () => call<BilacConfig>('fco_bilac_config');
export const playBilac = (count: number, mode: 'fc' | 'free') => call<BilacResult>('fco_bilac_play', { p_count: count, p_mode: mode });
export const claimBilac = (index: number, choice: number | null) => call<{ rewards: BilacReward[]; wallet: Wallet; save?: ServerRecord | null }>('fco_bilac_claim', { p_index: index, p_choice: choice });
export const fetchVqtgConfig = () => call<VqtgConfig>('fco_vqtg_config');
export const playVqtg = (count: number, mode: 'fc' | 'free', pick?: number) => call<VqtgResult>('fco_vqtg_play', { p_count: count, p_mode: mode, ...(pick ? { p_pick: pick } : {}) });
export const fetchVqtgTop = () => call<VqtgTop>('fco_vqtg_top');
export const claimVqtg = (index: number, choice: number | null) => call<{ rewards: VqtgReward[]; wallet: Wallet; save?: ServerRecord | null }>('fco_vqtg_claim', { p_index: index, p_choice: choice });
