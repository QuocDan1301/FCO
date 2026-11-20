// Trang nạp FC: đơn nạp + mốc khuyến mãi (migration 202611200002_fco_topup_orders.sql).
// Máy chủ tính số FC thật khi tạo đơn; các hàm dưới chỉ để game xem trước cho người chơi.
export type TopupTier = { vnd: number; bonus: number };
export type TopupConfig = { vndPer1000: number; minVnd: number; maxVnd: number; tiers: TopupTier[] };
export type TopupOrderStatus = 'pending' | 'paid' | 'approved' | 'rejected' | 'cancelled';
export type TopupOrder = { id: number; code: string; vnd: number; baseFc: number; bonusFc: number; tierVnd: number | null; status: TopupOrderStatus;
  adminNote: string; createdAt: number; paidAt: number | null; decidedAt: number | null };
export type AdminTopupOrder = TopupOrder & { login: string; name: string; user: string; repeat?: boolean };
export type AdminTopupList = { counts: { paid: number; pending: number; approvedToday: number; vndToday: number }; orders: AdminTopupOrder[] };

export const TOPUP_STATUS: Record<TopupOrderStatus, string> = {
  pending: 'Chờ chuyển khoản', paid: 'Chờ admin duyệt', approved: 'Đã cộng FC', rejected: 'Bị từ chối', cancelled: 'Đã huỷ',
};
export const isOpenOrder = (o: Pick<TopupOrder, 'status'>) => o.status === 'pending' || o.status === 'paid';
export const validTopupVnd = (vnd: number, cfg: Pick<TopupConfig, 'minVnd' | 'maxVnd'>) =>
  Number.isSafeInteger(vnd) && vnd >= cfg.minVnd && vnd <= cfg.maxVnd && vnd % 1000 === 0;
/** Xem trước một đơn: FC gốc theo tỉ giá + FC khuyến mãi của mốc cao nhất đã đạt + mốc kế tiếp (để gợi ý nạp thêm). */
export function topupQuote(vnd: number, cfg: TopupConfig) {
  const tiers = [...cfg.tiers].sort((a, b) => a.vnd - b.vnd);
  const ok = Number.isSafeInteger(vnd) && vnd > 0;
  const tier = ok ? [...tiers].reverse().find(t => t.vnd <= vnd) ?? null : null;
  const next = tiers.find(t => t.vnd > (ok ? vnd : 0)) ?? null;
  const base = ok ? Math.floor(vnd * 1000 / cfg.vndPer1000) : 0;
  const bonus = tier?.bonus ?? 0;
  return { valid: validTopupVnd(vnd, cfg), base, bonus, total: base + bonus, tier, next };
}
/** Số tiền gõ tay ("100.000", "100k", "1tr") → VND; không đọc được thì NaN. */
export function parseVnd(text: string) {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return NaN;
  const m = /^([\d.,]+)(k|tr|triệu|m)?đ?$/.exec(t);
  if (!m) return NaN;
  const unit = m[2] === 'k' ? 1000 : m[2] ? 1_000_000 : 1;
  const num = unit === 1 ? Number(m[1].replace(/[.,]/g, '')) : Number(m[1].replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * unit) : NaN;
}
