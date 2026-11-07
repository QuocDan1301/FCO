import { accountClient } from './account-client';
import type { EventReward } from './game';
import type { GiftCode } from './gift-code-rules';
import { LOGIN_FOR_FC, walletMessage } from './wallet-state';
import type { AdminStats, AnomalyRow, EventPlayResult, GiftCodeRow, LedgerRow, ServerJackpot, Wallet } from './wallet-state';
export * from './wallet-state';

// Ví FC trên máy chủ (supabase/migrations/202611070001_fco_wallet.sql): số FC, quà ngày, gift code, lượt sự kiện và jackpot
// do máy chủ quyết định; trình duyệt chỉ hiển thị và cộng phần BP / gói. Chỉ dùng khi đã đăng nhập tài khoản.
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!accountClient) throw new Error(LOGIN_FOR_FC);
  const { data, error } = await accountClient.rpc(fn, args).abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error(walletMessage(error));
  return data as T;
}

export const fetchWallet = (seedPoints: number) => call<Wallet>('fco_wallet', { p_seed_points: Math.max(0, Math.floor(seedPoints)) });
export const claimDailyFc = () => call<Wallet>('fco_claim_daily');
export const spendFc = (amount: number, detail: Record<string, unknown>) => call<Wallet>('fco_spend_fc', { p_amount: amount, p_reason: 'shop', p_detail: detail });
export const redeemGiftHash = (hash: string) => call<{ rewards: EventReward[]; wallet: Wallet }>('fco_redeem_gift', { p_hash: hash });
export const claimMissionFc = (id: string) => call<Wallet>('fco_event_mission', { p_id: id });
export const playEventFc = (count: number, mode: 'fc' | 'free') => call<EventPlayResult>('fco_event_play', { p_count: count, p_mode: mode });
export const fetchJackpot = () => call<ServerJackpot>('fco_jackpot_state');
export const adminCredit = (login: string, amount: number, note: string) => call<{ login: string; fc: number }>('fco_admin_credit', { p_login: login, p_amount: amount, p_note: note });
export const adminLedger = (login?: string) => call<LedgerRow[]>('fco_admin_ledger', { p_limit: 100, p_login: login || null });
export const adminGiftCodes = () => call<GiftCodeRow[]>('fco_admin_gift_codes');
export const adminGiftSave = (code: GiftCode) => call<GiftCodeRow[]>('fco_admin_gift_save', { p_hash: code.hash, p_hint: code.hint, p_rewards: code.rewards, p_expires: code.expires });
export const adminGiftDelete = (hash: string) => call<GiftCodeRow[]>('fco_admin_gift_delete', { p_hash: hash });
export const adminAnomalies = () => call<AnomalyRow[]>('fco_admin_anomalies', { p_limit: 200, p_include_reviewed: false });
export const adminAnomalyReview = (id: number, all = false) => call<AnomalyRow[]>('fco_admin_anomaly_review', { p_id: id, p_all: all });
export const heartbeat = () => call<null>('fco_heartbeat');
export const adminStats = (search?: string) => call<AdminStats>('fco_admin_stats', { p_search: search || null, p_limit: 300 });
