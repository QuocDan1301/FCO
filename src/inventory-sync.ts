import type { Entry, Save } from './game';

// Phần thuần của kho thẻ trên máy chủ (không nạp client Supabase), dùng chung cho cloud-save.ts, App.tsx và test.
// Máy chủ (supabase/migrations/202611100013_fco_inventory_server.sql) giữ 5 phần được bảo vệ của bản lưu; trình duyệt giữ phần còn lại
// (cài đặt, đội hình, khoá thẻ, dây đập…). Lịch sử gộp theo id từ cả hai phía như fco_inv_merge.
// taxVouchers (phiếu giảm thuế từ gói Star Point, 202611110007) cũng do máy chủ giữ.
export const PROTECTED_KEYS = ['cards', 'balance', 'unopened', 'opened', 'upgrades', 'taxVouchers'] as const;
export type ServerRecord = { revision: number; data: Save };
export type InventoryState = { enforced: boolean; version: string | null; syncedAt: number | null };
// local: game tự xử lý như trước (chưa đồng bộ dữ liệu, chưa bắt buộc); server: máy chủ giữ kho; blocked: đã bắt buộc mà dữ liệu lệch.
export type InventoryMode = 'loading' | 'local' | 'server' | 'blocked';

export function inventoryMode(online: boolean, state: InventoryState | null, version: string | null, failed = false): InventoryMode {
  if (!online) return 'local';
  // Không lấy được trạng thái (máy chủ chưa chạy migration mới): chạy như trước.
  if (failed) return 'local';
  if (!state || !version) return 'loading';
  if (state.version === version) return 'server';
  return state.enforced ? 'blocked' : 'local';
}

export const INVENTORY_BLOCKED = 'Dữ liệu game trên máy bạn khác với máy chủ. Hãy tải lại trang để dùng bản mới nhất; nếu vẫn báo, chờ admin đồng bộ dữ liệu rồi thử lại.';
export const INVENTORY_LOADING = 'Đang kết nối kho thẻ trên máy chủ, thử lại sau giây lát.';

// Gộp lịch sử: mỗi id một dòng (ưu tiên bản máy chủ), mới nhất trước, tối đa 200 dòng.
export function mergeHistory(server: Entry[] = [], local: Entry[] = []): Entry[] {
  const seen = new Map<string, Entry>();
  for (const entry of [...server, ...local]) if (entry && typeof entry.id === 'string' && !seen.has(entry.id)) seen.set(entry.id, entry);
  return [...seen.values()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 200);
}

// Bản lưu trên máy (local) + phần được bảo vệ của bản máy chủ (server). Thông tin HLV đã lưu trên máy chủ không bị ghi đè (chỉ lưu một lần).
export function mergeProtected(local: Save, server: Save): Save {
  return { ...local, cards: server.cards, balance: server.balance, unopened: server.unopened, opened: server.opened, upgrades: server.upgrades, ...(server.taxVouchers || local.taxVouchers ? { taxVouchers: server.taxVouchers ?? {} } : {}), history: mergeHistory(server.history, local.history), ...(local.profile || server.profile ? { profile: { ...local.profile, ...server.profile } } : {}) };
}

// Hai bản lưu chỉ khác nhau ở phần máy chủ giữ (thẻ, BP, gói, bộ đếm) và lịch sử?
export function sameSettings(a: Save, b: Save) {
  const strip = (s: Save) => { const copy: Record<string, unknown> = { ...s }; for (const key of PROTECTED_KEYS) delete copy[key]; delete copy.history; delete copy.fc; delete copy.stp; return JSON.stringify(Object.keys(copy).sort().filter(key => copy[key] !== undefined).map(key => [key, copy[key]])); };
  return strip(a) === strip(b);
}
