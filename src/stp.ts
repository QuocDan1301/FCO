import { money, uid } from './game';
import type { EventReward, Save } from './game';
import { findPack, grantRewards } from './event';

// Gói Star Point (2026-11-11): 4 gói mua bằng Star Point (STP), mua 1 gói nhận ĐỦ mọi vật phẩm trong danh sách (gói cầu thủ, BP, phiếu giảm thuế).
// STP do máy chủ giữ trong ví (fco_wallets.stp, supabase/migrations/202611110007_fco_star_point.sql); giá và vật phẩm ở đây phải khớp bảng
// fco_stp_packages của migration (tests/stp.test.ts so khớp). Nguồn nhận STP (nhiệm vụ) người dùng sẽ đưa sau.
// Mọi gói trong danh sách người dùng gửi đã có đủ mùa (JVA = JUVENTUS).
// 2026-11-11 có mùa 24HR: thêm gói JNM, 24HR, DC, JVA 101+ (+9~+10) vào Siêu cấp (migration 202611110008).
// Có mùa CA (AMBASSADOR CHELSEA FC, tier chelsea): thêm gói CA 102+ (+11) vào Siêu cấp (migration 202611110009).
// Có mùa 26HR (26 HEROES, tier hr26): thêm gói WG, 26HR 119+ (+5) vào Siêu cấp (migration 202611110010).
// Có mùa LD (LAST DANCE, tier ld): thêm GRU, CU, 24EP, MDL, LD, UT 106+ (+8) vào Tinh anh và CU, LD, MDL All (+7~+8) vào Tân binh (202611110011).

// Phiếu giảm giá thuế các mùa: trừ thẳng số điểm % vào thuế bán của MỘT lần bán (1 thẻ hoặc 1 lượt bán hàng loạt), thuế không âm.
export const TAX_VOUCHERS = [30, 20, 10] as const;
export type TaxVoucher = typeof TAX_VOUCHERS[number];
export type TaxVouchers = Partial<Record<`${TaxVoucher}`, number>>;
export const isTaxVoucher = (value: unknown): value is TaxVoucher => TAX_VOUCHERS.includes(value as TaxVoucher);
export const voucherCount = (state: Pick<Save, 'taxVouchers'>, pct: TaxVoucher) => state.taxVouchers?.[`${pct}`] ?? 0;
export const voucherTotal = (state: Pick<Save, 'taxVouchers'>) => TAX_VOUCHERS.reduce((sum, pct) => sum + voucherCount(state, pct), 0);
export const voucherName = (pct: number) => `Phiếu giảm giá thuế các mùa ${pct}%`;
// Thuế sau khi dùng phiếu: trừ thẳng điểm %, không dưới 0.
export const taxWithVoucher = (tax: number, voucher: TaxVoucher | null | undefined) => voucher ? Math.max(0, tax - voucher) : tax;

// Bớt 1 phiếu (gọi khi bán có dùng phiếu). Hết phiếu thì báo lỗi.
export function spendVoucher(state: Save, pct: TaxVoucher): Save {
  const have = voucherCount(state, pct);
  if (have < 1) throw new Error(`Bạn không còn ${voucherName(pct)}.`);
  const next: TaxVouchers = { ...state.taxVouchers, [`${pct}`]: have - 1 };
  if (!next[`${pct}`]) delete next[`${pct}`];
  return { ...state, taxVouchers: next };
}

export type StpItem = { pack: string; count: number } | { bp: number } | { voucher: TaxVoucher; count: number };
export type StpPackageId = 'ultimate' | 'super' | 'challenge' | 'rookie';
export type StpPackage = { id: StpPackageId; name: string; label: string; price: number; image: string; items: StpItem[] };

export const STP_ICON = '/assets/stp/star-point.webp';
export const STP_PACKAGES: readonly StpPackage[] = [
  { id: 'ultimate', name: 'Gói STP Siêu cấp', label: 'ULTIMATE', price: 100, image: '/assets/stp/ultimate.webp', items: [
    { pack: 'stp-u-110', count: 1 }, { pack: 'stp-u-117', count: 1 }, { pack: 'stp-u-hg', count: 1 }, { pack: 'stp-u-111', count: 1 },
    { pack: 'stp-u-jnm', count: 1 }, { pack: 'stp-u-cum', count: 1 }, { pack: 'stp-u-wg26', count: 1 }, { pack: 'stp-u-ca', count: 1 }, { pack: 'stp-u-118', count: 1 }, { voucher: 30, count: 1 }, { bp: 75_000_000 }] },
  { id: 'super', name: 'Gói STP Cao cấp', label: 'SUPER', price: 50, image: '/assets/stp/super.webp', items: [
    { pack: 'stp-s-110', count: 1 }, { pack: 'stp-s-tp200', count: 1 }, { pack: 'stp-s-118', count: 1 }, { pack: 'stp-s-108', count: 1 },
    { pack: 'stp-s-108b', count: 1 }, { pack: 'stp-s-all', count: 1 }, { pack: 'stp-pw-all', count: 1 }, { voucher: 20, count: 1 }, { bp: 55_000_000 }] },
  { id: 'challenge', name: 'Gói STP Tinh anh', label: 'CHALLENGE', price: 30, image: '/assets/stp/challenge.webp', items: [
    { pack: 'stp-c-106ld', count: 1 }, { pack: 'stp-c-ep120', count: 1 }, { pack: 'stp-c-bld', count: 1 }, { pack: 'stp-c-106', count: 1 }, { pack: 'stp-c-118', count: 1 },
    { voucher: 10, count: 1 }, { bp: 35_000_000 }] },
  { id: 'rookie', name: 'Gói STP Tân binh', label: 'ROOKIE', price: 15, image: '/assets/stp/rookie.webp', items: [
    { pack: 'stp-r-wg119', count: 1 }, { pack: 'stp-r-104', count: 1 }, { pack: 'stp-pw-all', count: 1 }, { pack: 'stp-r-cldm', count: 1 }, { pack: 'stp-r-ts119', count: 1 },
    { voucher: 10, count: 1 }, { bp: 15_000_000 }] },
];
export const findStpPackage = (id: string) => STP_PACKAGES.find(p => p.id === id);

export const stpItemName = (item: StpItem) => 'voucher' in item ? voucherName(item.voucher) : 'bp' in item ? `${money(item.bp)} BP` : findPack(item.pack)?.name ?? item.pack;
// Tóm tắt cho lịch sử: "6 gói cầu thủ, phiếu giảm thuế 30%, 75.000.000 BP".
export function stpSummary(pkg: StpPackage, count = 1) {
  const packs = pkg.items.reduce((sum, item) => sum + ('pack' in item ? item.count : 0), 0) * count;
  const vouchers = pkg.items.filter((item): item is { voucher: TaxVoucher; count: number } => 'voucher' in item).map(item => `${item.count * count} phiếu giảm thuế ${item.voucher}%`);
  const bp = pkg.items.reduce((sum, item) => sum + ('bp' in item ? item.bp : 0), 0) * count;
  return [packs ? `${packs} gói cầu thủ` : '', ...vouchers, bp ? `${money(bp)} BP` : ''].filter(Boolean).join(', ');
}
export const stpHistoryTitle = (pkg: StpPackage, count = 1) => `Mua ${count > 1 ? `${count} ` : ''}${pkg.name}`;
export const stpHistoryDetail = (pkg: StpPackage, count = 1) => `${stpSummary(pkg, count)} · −${money(pkg.price * count)} STP`;

// Cộng vật phẩm của count gói vào bản lưu (khi máy chủ chưa giữ kho; máy chủ giữ kho thì fco_stp_buy tự cộng). STP đã trừ ở máy chủ.
// Lịch sử loại 'gift' để kiểm tra bất thường (fco_audit_save) nhận cả BP lẫn gói tăng.
export function grantStp(state: Save, pkg: StpPackage, count = 1): Save {
  const rewards: EventReward[] = [];
  const vouchers: TaxVouchers = { ...state.taxVouchers };
  for (const item of pkg.items) {
    if ('voucher' in item) vouchers[`${item.voucher}`] = (vouchers[`${item.voucher}`] ?? 0) + item.count * count;
    else if ('bp' in item) rewards.push({ bp: item.bp * count });
    else rewards.push({ pack: item.pack, count: item.count * count });
  }
  const granted = grantRewards(state, rewards);
  const entry = { id: uid(), time: Date.now(), type: 'gift' as const, title: stpHistoryTitle(pkg, count), detail: stpHistoryDetail(pkg, count) };
  return { ...granted, taxVouchers: vouchers, history: [entry, ...state.history].slice(0, 200) };
}

// Phiếu trong bản lưu: chỉ giữ mức 10/20/30 với số nguyên dương.
export function cleanVouchers(value: unknown): TaxVouchers | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: TaxVouchers = {};
  for (const pct of TAX_VOUCHERS) { const n = (value as Record<string, unknown>)[`${pct}`]; if (Number.isSafeInteger(n) && (n as number) > 0) out[`${pct}`] = n as number; }
  return out;
}
