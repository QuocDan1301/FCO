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
const withVersion = async <T>(fn: string, args: Record<string, unknown>) => rpcCall<T>(fn, { p_catalog: await catalogVersion(), ...args });

export const fetchInventoryState = () => rpcCall<InventoryState>('fco_inventory_state');
export const serverOpen = (packIds: string[], count: number | null) => withVersion<{ cards: Card[]; pack: string } & WithSave>('fco_inv_open', { p_packs: packIds, p_count: count });
export const serverOpenDraft = (packId: string, playerIds: number[], count: number) => withVersion<{ cards: Card[]; pack: string } & WithSave>('fco_inv_open_draft', { p_pack: packId, p_players: playerIds, p_count: count });
export type ServerUpgrade = { success: boolean; card: Card; before: number; drop: number | null; restored: number | null; shielded: boolean; cost: number; rate: number; energy: number; restoreChance: number; keep: number } & WithSave;
export const serverUpgrade = (targetId: string, materialIds: string[], protect: number) => withVersion<ServerUpgrade>('fco_inv_upgrade', { p_target: targetId, p_materials: materialIds, p_protect: protect });
export const serverSell = (items: SellItem[]) => withVersion<{ sold: number; total: number; fees: number; proceeds: number; tax: number } & WithSave>('fco_inv_sell', { p_items: items });
export const serverBuy = (playerId: number, level: number, count: number) => withVersion<{ cards: Card[]; price: number } & WithSave>('fco_inv_buy', { p_player: playerId, p_level: level, p_count: count });
export const serverShop = (packId: string, count: number) => withVersion<{ wallet: Wallet } & WithSave>('fco_inv_shop', { p_pack: packId, p_count: count });
export const serverRelease = (uids: string[]) => rpcCall<WithSave>('fco_inv_release', { p_uids: uids });
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
