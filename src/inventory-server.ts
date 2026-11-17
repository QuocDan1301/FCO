import type { Card } from './game';
import type { SellItem } from './market';
import type { Wallet } from './wallet-state';
import { rpcCall } from './wallet';
import { buildCatalog, catalogVersion } from './inventory-catalog';
import type { InventoryState, ServerRecord } from './inventory-sync';
export * from './inventory-sync';

// Thao tác kho thẻ trên máy chủ (supabase/migrations/202611100013_fco_inventory_server.sql). Mỗi lệnh gửi kèm mã bộ dữ liệu;
// kết quả có save = bản lưu mới của máy chủ để game nhận (CloudSaveStore.adopt).
type WithSave = { save: ServerRecord };
/** Một cấp trong sổ lệnh: giá mua cao nhất / số lệnh mua, giá bán thấp nhất / số lệnh bán (null = không có lệnh). */
// sysPrice / sysLeft: hệ thống đang bán (giá tham chiếu; sysLeft = còn trong phút này, null = không giới hạn) — migration 202611170004.
export type BookLevel = { level: number; bid: number | null; bids: number; ask: number | null; asks: number; sysPrice?: number | null; sysLeft?: number | null };
export type MarketDepth = { bids: { price: number; count: number }[]; asks: { price: number; count: number }[]; volume: number; sys?: { price: number; left: number | null } | null };
export type MyOrder = { id: number; side: 'buy' | 'sell'; playerId: number; level: number; price: number; tax: number | null; status: 'open' | 'filled' | 'system' | 'cancelled' | 'expired'; fillPrice: number | null; createdAt: number; closedAt: number | null; pending?: boolean; claimBp?: number | null };
// Phần chờ nhận ở chợ (migration 202611170011): cards = số thẻ mua được, bp = tổng BP bán được, sells = số lần bán.
export type MarketPending = { cards: number; bp: number; sells: number };
const withVersion = async <T>(fn: string, args: Record<string, unknown>) => rpcCall<T>(fn, { p_catalog: await catalogVersion(), ...args });

export const fetchInventoryState = () => rpcCall<InventoryState>('fco_inventory_state');
export const serverOpen = (packIds: string[], count: number | null) => withVersion<{ cards: Card[]; pack: string } & WithSave>('fco_inv_open', { p_packs: packIds, p_count: count });
export const serverOpenDraft = (packId: string, playerIds: number[], count: number) => withVersion<{ cards: Card[]; pack: string } & WithSave>('fco_inv_open_draft', { p_pack: packId, p_players: playerIds, p_count: count });
export type ServerUpgrade = { success: boolean; card: Card; before: number; drop: number | null; restored: number | null; shielded: boolean; cost: number; rate: number; energy: number; restoreChance: number; keep: number } & WithSave;
export const serverUpgrade = (targetId: string, materialIds: string[], protect: number) => withVersion<ServerUpgrade>('fco_inv_upgrade', { p_target: targetId, p_materials: materialIds, p_protect: protect });
// voucher: phiếu giảm thuế 10 / 20 / 30 (migration 202611110007); không dùng phiếu thì không gửi để chạy được cả khi chưa có migration.
export const serverSell = (items: SellItem[], voucher: number | null = null) => withVersion<{ sold: number; total: number; fees: number; proceeds: number; tax: number } & WithSave>('fco_inv_sell', { p_items: items, ...(voucher ? { p_voucher: voucher } : {}) });
export const serverBuy = (playerId: number, level: number, count: number) => withVersion<{ cards: Card[]; price: number } & WithSave>('fco_inv_buy', { p_player: playerId, p_level: level, p_count: count });
export const serverShop = (packId: string, count: number) => withVersion<{ wallet: Wallet } & WithSave>('fco_inv_shop', { p_pack: packId, p_count: count });
// CSA vàng thêm của thẻ (migration 202611160006): đặt / đổi / bỏ (trait null) CSA ô "7" / "11".
export const serverGold = (uid: string, slot: '7' | '11', trait: string | null) => rpcCall<{ card: Card } & WithSave>('fco_inv_gold', { p_uid: uid, p_slot: slot, p_trait: trait });
export const serverRelease = (uids: string[]) => rpcCall<WithSave>('fco_inv_release', { p_uids: uids });
// ===== Chợ giữa người chơi (migration 202611170002_fco_player_market.sql) =====
// Bán cho người chơi: khớp ngay với lệnh mua giá ≥ giá treo; còn lại treo 24 giờ, hết hạn thì thẻ về kho. Bán cho hệ thống: serverSell (giá tham chiếu, nhận ngay).
export const serverMarketSell = (items: SellItem[], voucher: number | null = null) => withVersion<{ placed: number; matched: number; tax: number; texts: string[] } & WithSave>('fco_mkt_sell', { p_items: items, ...(voucher ? { p_voucher: voucher } : {}) });
// Đặt mua 1 thẻ giá tối đa price: có lệnh bán rẻ hơn thì mua ngay theo giá đó, không thì giữ BP và treo lệnh tới khi khớp (không hết hạn).
// direct = true (mua ở màn đập thẻ, migration 202611170015): thẻ mua được ngay vào thẳng kho, không chờ nhận ở TTCN.
export const serverMarketBuy = (playerId: number, level: number, price: number, direct = false) => withVersion<{ matched: boolean; system?: boolean; price: number; order: number | null; texts: string[] } & WithSave>('fco_mkt_buy', { p_player: playerId, p_level: level, p_price: price, ...(direct ? { p_direct: true } : {}) });
// Mua hàng loạt qua chợ (migration 202611170008): tối đa count thẻ, mỗi thẻ nguồn rẻ nhất (người chơi / hệ thống) không vượt maxPrice.
export const serverMarketBulkBuy = (playerId: number, level: number, count: number, maxPrice: number, direct = false) => withVersion<{ bought: number; spent: number; texts: string[] } & WithSave>('fco_mkt_bulk_buy', { p_player: playerId, p_level: level, p_count: count, p_max: maxPrice, ...(direct ? { p_direct: true } : {}) });
export const serverMarketCancel = (orderId: number) => rpcCall<WithSave>('fco_mkt_cancel', { p_order: orderId });
export const serverMarketClaim = () => rpcCall<{ texts: string[]; save: ServerRecord | null; pending?: MarketPending }>('fco_mkt_claim');
export const serverMarketTake = (kind: 'buy' | 'sell') => rpcCall<{ texts: string[]; save: ServerRecord | null; pending?: MarketPending }>('fco_mkt_take', { p_kind: kind });
export const fetchMarketBook = (playerId: number) => rpcCall<BookLevel[]>('fco_mkt_book', { p_player: playerId });
export const fetchMarketDepth = (playerId: number, level: number) => rpcCall<MarketDepth>('fco_mkt_depth', { p_player: playerId, p_level: level });
// Giá chợ của nhiều thẻ một lượt (Bán hàng loạt): bid = đặt mua cao nhất, ask = bán thấp nhất (gồm hệ thống), migration 202611170009.
export type MarketQuote = { p: number; l: number; bid: number | null; ask: number | null };
export const fetchMarketQuotes = (keys: [number, number][]) => rpcCall<MarketQuote[]>('fco_mkt_quotes', { p_keys: keys });
export const fetchMyOrders = () => rpcCall<MyOrder[]>('fco_mkt_mine');
export const serverClaimGifts = () => rpcCall<{ texts: string[]; fc: boolean; save: ServerRecord | null }>('fco_inv_claim_gifts');

// ===== Admin =====
export const adminInventoryEnforce = (enabled: boolean) => rpcCall<InventoryState>('fco_admin_inventory_enforce', { p_enabled: enabled });
// Gửi bộ dữ liệu của bản game đang chạy lên máy chủ: begin → cầu thủ / gói từng phần → commit (một giao dịch thay bản cũ).
export async function adminSyncCatalog(progress: (done: number, total: number) => void = () => {}) {
  const catalog = buildCatalog(), version = await catalogVersion();
  const playerChunks = Math.ceil(catalog.players.length / 800), packChunks = Math.ceil(catalog.packs.length / 15), total = playerChunks + packChunks + 2;
  let done = 0;
  const step = () => progress(++done, total);
  await rpcCall('fco_admin_catalog_begin', { p_version: version }); step();
  for (let i = 0; i < catalog.players.length; i += 800) { await rpcCall('fco_admin_catalog_players', { p_version: version, p_rows: catalog.players.slice(i, i + 800) }); step(); }
  for (let i = 0; i < catalog.packs.length; i += 15) { await rpcCall('fco_admin_catalog_packs', { p_version: version, p_rows: catalog.packs.slice(i, i + 15) }); step(); }
  const state = await rpcCall<InventoryState>('fco_admin_catalog_commit', { p_version: version, p_rules: catalog.rules, p_players: catalog.players.length, p_packs: catalog.packs.length }); step();
  return state;
}
