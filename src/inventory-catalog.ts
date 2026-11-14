import { GAUGE_ABOVE_STEP, GAUGE_BELOW, MAX_INVENTORY_OPEN, MAX_LEVEL, PACK_LEVELS, PROTECT_MIN_LEVEL, RESTORE_MIN_LEVEL, UPGRADE_LEVELS, draftCandidates, draftSize, fixedLevel, isPackAvailable, ovr, packOdds, packs, players } from './game';
import type { Pack } from './game';
import priceData from './player-prices.json';
import { MARKET_FEE_PERCENT, MAX_BULK_SELL, PRICE_EPOCH, PRICE_PERIOD_MS, PRICE_SWING_PERCENT, SELL_BAND_PERCENT, fixedPricePlayers } from './market';
import { FLAT_PRICE } from './group-price';
import { insuranceRate } from './pricing';
import { MEMBERSHIPS } from './membership';
import { BRIDGE_CONFIG } from './upgrade/config';
import { FORMATIONS, LINEUP_BONUS, ZONE_LABELS, playerClubs, playerPositions, positionPenalty, slotRole } from './squad';
import { DEFAULT_TEAM_COLOR_CONFIG } from './teamColor';
import { seasons } from './game';

// Kho thẻ trên máy chủ (supabase/migrations/202611100013_fco_inventory_server.sql): máy chủ mở gói, đập thẻ, mua / bán theo đúng
// dữ liệu của game. Dữ liệu đó nằm trong mã game (cầu thủ, OVR sửa tay, bảng giá, gói, luật đập) nên game dựng "bộ dữ liệu"
// dưới đây, admin bấm Đồng bộ ở Quản trị FC để gửi lên máy chủ. Mọi thao tác gửi kèm mã phiên bản (SHA-256 của bộ dữ liệu);
// máy chủ từ chối khi mã khác bản đã đồng bộ, nên không bao giờ mở gói / tính giá theo dữ liệu cũ.
// Đổi giá, gói, OVR hay luật đập thì sau khi deploy phải đồng bộ lại (bảng Quản trị báo khi máy chủ lệch).

export type CatalogRules = {
  maxLevel: number; chances: number[]; gaugeStep: number; gaugeBelow: number[];
  dropWeights: Record<string, [number, number][]>; protectMin: number; restoreMin: number; maxOpen: number;
  marketFee: number; sellBand: number; maxBulkSell: number; priceEpoch: number; pricePeriodMs: number; priceSwing: number; flatPrice: number;
  membership: Record<string, number>;
  // GLXH: máy chủ tự tính OVR từng ô (202611140016) — nhãn ô → vị trí, bảng trừ OVR vị trí → ô, luật team color, +5 đội hình.
  ranked: {
    labels: Record<string, string>; penalty: Record<string, Record<string, number>>; lineupBonus: number;
    identity: Record<'club' | 'nation' | 'season', { minPlayers: number; ovr: number }[]>;
    upgrade: { minLevel: number; minPlayers: number; ovr: number; team: boolean }[];
  };
};
// Cầu thủ: [id, tên, OVR từng cấp +1…+13, giá chuẩn từng cấp (null = chưa có giá), giá cố định (không dao động), tỷ lệ bảo hiểm].
// [id, tên, OVR theo cấp, giá theo cấp, giá cố định, tỷ lệ bảo hiểm, lương] — lương dùng cho mức lương GLXH (202611120006).
// [id, tên, OVR +1…+13, giá, giá cố định, tỷ lệ bảo hiểm, lương, vị trí sở trường (GLXH tính chỉ số, migration 202611130001)]
// … + [vị trí đá được (mọi mùa), CLB tính team color (cả CLB cũ), quốc tịch, mùa] cho GLXH tự tính team color (202611140016).
export type CatalogPlayer = [number, string, number[], (number | null)[], boolean, number, number, string, string[], string[], string, string];
// Gói: tỷ lệ từng cầu thủ và từng cấp đúng như packOdds; gói chỉ định giữ danh sách cầu thủ được chọn.
export type CatalogPack = {
  id: string; name: string; label: string; price: number; shop: boolean; choose: boolean; available: boolean;
  players: number[]; weights: number[]; levels: number[]; levelWeights: number[];
  draft: number[]; draftSize: number; draftLevel: number;
  // Cấp cố định từng cầu thủ (cùng thứ tự players, 0 = theo levels); rỗng khi gói không có seasonLevels (202611140006).
  fixedLevels: number[];
};
export type Catalog = { rules: CatalogRules; players: CatalogPlayer[]; packs: CatalogPack[] };

const recordedPrices: Record<string, (number | null)[]> = priceData.players;

export function catalogRules(): CatalogRules {
  return {
    maxLevel: MAX_LEVEL,
    chances: UPGRADE_LEVELS.map(row => row.chance),
    gaugeStep: GAUGE_ABOVE_STEP,
    gaugeBelow: [...GAUGE_BELOW],
    dropWeights: Object.fromEntries(Object.entries(BRIDGE_CONFIG.dropWeights).map(([level, rows]) => [level, rows.map(([to, weight]) => [to, weight] as [number, number])])),
    protectMin: PROTECT_MIN_LEVEL,
    restoreMin: RESTORE_MIN_LEVEL,
    maxOpen: MAX_INVENTORY_OPEN,
    marketFee: MARKET_FEE_PERCENT,
    sellBand: SELL_BAND_PERCENT,
    maxBulkSell: MAX_BULK_SELL,
    priceEpoch: PRICE_EPOCH,
    pricePeriodMs: PRICE_PERIOD_MS,
    priceSwing: PRICE_SWING_PERCENT,
    flatPrice: FLAT_PRICE,
    membership: Object.fromEntries(MEMBERSHIPS.map(item => [item.id, item.discount])),
    ranked: rankedRules(),
  };
}

function rankedRules(): CatalogRules['ranked'] {
  const labels = [...new Set([...ZONE_LABELS, ...Object.values(FORMATIONS).flat().map(s => s.label)])].sort();
  const roles = [...new Set(labels.map(slotRole))].sort();
  const positions = [...new Set([...players.map(p => p.pos), ...roles])].sort();
  const tiers = (list: readonly { minPlayers: number; ovr: number }[] | undefined) => (list ?? []).map(t => ({ minPlayers: t.minPlayers, ovr: t.ovr }));
  const c = DEFAULT_TEAM_COLOR_CONFIG;
  return {
    labels: Object.fromEntries(labels.map(l => [l, slotRole(l)])),
    penalty: Object.fromEntries(positions.map(pos => [pos, Object.fromEntries(roles.map(role => [role, positionPenalty(pos, role)]))])),
    lineupBonus: LINEUP_BONUS,
    identity: { club: tiers(c.club), nation: tiers(c.nation), season: tiers(c.season) },
    upgrade: c.upgrade.map(r => ({ minLevel: r.minLevel, minPlayers: r.minPlayers, ovr: r.ovr, team: r.scope === 'team' })),
  };
}

export function catalogPlayers(): CatalogPlayer[] {
  return players.map(player => {
    const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
    const ovrs = levels.map(level => ovr({ playerId: player.id, level }));
    if (!ovrs.every(Number.isInteger)) throw new Error(`OVR của ${player.name} phải là số nguyên.`);
    const prices = levels.map(level => recordedPrices[String(player.id)]?.[level - 1] ?? null);
    return [player.id, player.name, ovrs, prices, fixedPricePlayers.has(player.id), insuranceRate(player.ovr), player.wage ?? 0, player.pos,
      playerPositions(player), playerClubs(player), player.nation ?? '', seasons[player.tier] ?? ''];
  });
}

export function catalogPack(pack: Pack): CatalogPack {
  const available = isPackAvailable(pack);
  const odds = available ? packOdds(pack) : { pool: [], levels: [] };
  const draft = available && pack.choose ? draftCandidates(pack).map(player => player.id) : [];
  return {
    id: pack.id, name: pack.name, label: pack.name.toLowerCase(), price: pack.price, shop: !pack.eventOnly, choose: !!pack.choose, available,
    players: odds.pool.map(row => row.player.id), weights: odds.pool.map(row => row.chance),
    levels: odds.levels.map(row => row.level), levelWeights: odds.levels.map(row => row.chance),
    draft, draftSize: available && pack.choose ? draftSize(pack) : 0, draftLevel: (pack.levels ?? PACK_LEVELS)[1],
    fixedLevels: pack.seasonLevels ? odds.pool.map(row => fixedLevel(pack, row.player) ?? 0) : [],
  };
}

let built: Catalog | null = null;
export function buildCatalog(): Catalog {
  built ??= { rules: catalogRules(), players: catalogPlayers(), packs: packs.map(catalogPack) };
  return built;
}

async function sha256(text: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
let version: Promise<string> | null = null;
// Mã tính lúc build (vite.config.ts → scripts/print-catalog-version.ts, chạy bằng Node). Mọi trình duyệt dùng chung mã này: Safari / iPhone
// tính Math.pow lệch chữ số cuối so với Chrome nên tự băm bộ dữ liệu sẽ ra mã khác → bị chặn khi kho máy chủ bắt buộc (sự cố 2026-11-14).
// Không có (test, script Node) thì tự tính — Node cùng engine với bước build nên ra cùng mã.
declare const __CATALOG_VERSION__: string | undefined;
const BUILT_VERSION = typeof __CATALOG_VERSION__ === 'string' && /^[0-9a-f]{64}$/.test(__CATALOG_VERSION__) ? __CATALOG_VERSION__ : null;
export const computeCatalogVersion = (catalog = buildCatalog()) => sha256(JSON.stringify(catalog));
// Mã phiên bản của bộ dữ liệu đang chạy (tính một lần mỗi phiên).
export const catalogVersion = (catalog = buildCatalog()) => catalog === built || !catalog ? (version ??= BUILT_VERSION ? Promise.resolve(BUILT_VERSION) : computeCatalogVersion()) : computeCatalogVersion(catalog);
