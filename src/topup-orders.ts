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

// Khuyến mãi theo tổng tiền nạp cộng dồn (migration 202611200004_fco_topup_cumulative.sql): qua mốc nào nhận KM mốc đó, mỗi mốc 1 lần.
// Sự kiện nạp tích luỹ có thời gian (migration 202611200005_fco_topup_event.sql): event = null khi không có đợt nào (thanh ẩn).
export type TopupEvent = { id: number; title: string; startsAt: number; endsAt: number; claimUntil: number };
export type TopupTierState = { event: TopupEvent | null; totalVnd: number; tiers: (TopupTier & { claimed: boolean })[] };
export type AdminTopupEvent = { id: number; title: string; startsAt: number; endsAt: number; claims: number; players: number; bonusFc: number };
export type AdminTopupEvents = { claimDays: number; now: number; events: AdminTopupEvent[] };
/** Thời gian còn lại dạng "2 ngày 05:12:33". */
export function leftText(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), pad = (n: number) => String(n).padStart(2, '0');
  return `${d ? `${d} ngày ` : ''}${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
/** Nhãn gọn cho mốc trên thanh: 20k, 150k, 1tr, 1,5tr. */
export const shortVnd = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr` : v >= 1000 ? `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k` : `${v}`;
/** Các mốc KM mà một đơn `vnd` sẽ giúp vượt qua (chưa nhận, tổng hiện tại chưa tới, tổng sau đơn đã tới). */
export const tiersUnlockedBy = (state: TopupTierState, vnd: number) =>
  state.tiers.filter(t => !t.claimed && t.vnd > state.totalVnd && t.vnd <= state.totalVnd + (Number.isFinite(vnd) && vnd > 0 ? vnd : 0));
/** Thanh mốc như ảnh mẫu: các mốc (kể cả 0) cách đều nhau, phần tô chạy tuyến tính trong từng đoạn; need = số FC còn thiếu tới mốc kế tiếp. */
export function milestoneTrack(total: number, fcs: number[]) {
  const nodes = [0, ...[...new Set(fcs)].filter(v => v > 0).sort((a, b) => a - b)];
  const n = nodes.length - 1;
  if (n <= 0) return { nodes: nodes.map(v => ({ fc: v, pos: 0, reached: true })), fill: 0, next: null as number | null, need: 0 };
  const pos = (i: number) => i / n * 100;
  let fill = 100, next: number | null = null;
  for (let k = 0; k < n; k++) {
    if (total < nodes[k + 1]) { fill = (k + Math.max(0, total - nodes[k]) / (nodes[k + 1] - nodes[k])) / n * 100; next = nodes[k + 1]; break; }
  }
  return { nodes: nodes.map((v, i) => ({ fc: v, pos: pos(i), reached: total >= v })), fill, next, need: next === null ? 0 : next - total };
}

