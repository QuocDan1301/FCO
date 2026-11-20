import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { asset } from './asset';
import { money } from './game';
import { TOPUP_QR, TOPUP_ZALO } from './config';
import { cancelTopupOrder, createTopupOrder, fetchFcStats, fetchMyTopupOrders, fetchTopupConfig, markTopupPaid } from './wallet';
import type { FcStats } from './wallet';
import { isOpenOrder, parseVnd, topupQuote, TOPUP_STATUS } from './topup-orders';
import type { TopupConfig, TopupOrder } from './topup-orders';

// Trang nạp FC (nút "+" cạnh ô FC; migration 202611200002_fco_topup_orders.sql):
// chọn mốc / nhập số tiền → xem FC gốc + FC khuyến mãi của mốc đạt được → tạo đơn (mã riêng ghi vào nội dung chuyển khoản)
// → "Tôi đã chuyển khoản" → admin duyệt ở Quản trị FC → Đơn nạp thì FC tự vào ví. Máy chủ tự tính số FC, game chỉ xem trước.
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export type TopUpApi = { config: () => Promise<TopupConfig>; orders: () => Promise<TopupOrder[]>; create: (vnd: number) => Promise<TopupOrder>;
  paid: (id: number) => Promise<TopupOrder>; cancel: (id: number) => Promise<TopupOrder>; stats: () => Promise<FcStats> };
const LIVE: TopUpApi = { config: fetchTopupConfig, orders: fetchMyTopupOrders, create: createTopupOrder, paid: markTopupPaid, cancel: cancelTopupOrder, stats: fetchFcStats };

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return <div className="tp-copy"><dt>{label}</dt><dd><b>{value}</b><button type="button" className="tp-copy-btn" onClick={copy} aria-label={`Chép ${label}`}>{done ? <Check size={14}/> : <Copy size={14}/>}</button></dd></div>;
}

export default function TopUp({ online, onCredited, api = LIVE }: { online: boolean; onCredited?: () => void; api?: TopUpApi }) {
  const [cfg, setCfg] = useState<TopupConfig | null>(null);
  const [orders, setOrders] = useState<TopupOrder[] | null>(null);
  const [stats, setStats] = useState<FcStats | null>(null);
  const [amount, setAmount] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approved = useRef<Set<number> | null>(null);
  const loadOrders = () => api.orders().then(list => {
    // Đơn vừa được duyệt từ lần tải trước: báo game tải lại ví FC.
    const done = new Set(list.filter(o => o.status === 'approved').map(o => o.id));
    if (approved.current && [...done].some(id => !approved.current!.has(id))) { onCredited?.(); void api.stats().then(setStats).catch(() => {}); }
    approved.current = done; setOrders(list);
  });
  useEffect(() => {
    if (!online) return;
    void api.config().then(setCfg).catch(e => setError((e as Error).message));
    void api.stats().then(setStats).catch(() => {});
    void loadOrders().catch(e => setError((e as Error).message));
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void loadOrders().catch(() => {}); }, 15_000);
    return () => clearInterval(timer);
  }, [online]);
  const value = parseVnd(amount);
  const quote = useMemo(() => cfg ? topupQuote(value, cfg) : null, [cfg, value]);
  const order = orders?.find(o => o.id === active) ?? null;
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setError(''); try { await task(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  if (!online) return <div className="topup"><p className="topup-steps">FC được lưu trên tài khoản. Hãy đăng nhập (hoặc đăng ký) tài khoản để nạp và dùng FC.</p></div>;

  // Đơn đang xem: QR + mã đơn + nút báo đã chuyển.
  if (order) return <div className="topup tp-order">
    <button type="button" className="tp-back" onClick={() => setActive(null)}>← Quay lại</button>
    <div className={`tp-status is-${order.status}`}>{TOPUP_STATUS[order.status]}{order.status === 'rejected' && order.adminNote ? ` · ${order.adminNote}` : ''}</div>
    <p className="tp-order-fc"><b>{money(order.baseFc)} FC</b>{order.bonusFc > 0 && <span> + {money(order.bonusFc)} FC khuyến mãi</span>}</p>
    {isOpenOrder(order) && <>
      <div className="topup-qr">{TOPUP_QR ? <img src={asset(TOPUP_QR)} alt="Mã QR chuyển khoản"/> : <span>Chưa có mã QR chuyển khoản. Hãy liên hệ admin.</span>}</div>
      <dl className="topup-info">
        <CopyField label="Số tiền" value={order.vnd.toLocaleString('vi-VN')}/>
        <CopyField label="Nội dung chuyển khoản" value={order.code}/>
      </dl>
      <p className="topup-steps">Chuyển <b>đúng số tiền</b> và ghi <b>đúng mã {order.code}</b> vào nội dung để admin nhận ra đơn của bạn.</p>
      {order.status === 'pending'
        ? <button type="button" className="primary-button tp-main" disabled={busy} onClick={() => void run(async () => { await api.paid(order.id); await loadOrders(); })}>Tôi đã chuyển khoản</button>
        : <p className="tp-wait">Đã báo chuyển khoản lúc {time(order.paidAt ?? order.createdAt)}. FC sẽ tự vào ví khi admin duyệt.{TOPUP_ZALO && <> Cần gấp thì gửi bill qua <a href={TOPUP_ZALO} target="_blank" rel="noopener noreferrer">Zalo admin</a>.</>}</p>}
      <button type="button" className="tp-cancel" disabled={busy} onClick={() => { if (confirm(`Huỷ đơn ${order.code}?`)) void run(async () => { await api.cancel(order.id); await loadOrders(); }); }}>Huỷ đơn</button>
    </>}
    {error && <p className="topup-summary-error" role="alert">{error}</p>}
  </div>;

  return <div className="topup">
    {stats && <dl className="topup-summary"><div><dt>Đã nạp</dt><dd>{money(stats.topup)} <span>FC</span></dd></div><div><dt>Đã dùng</dt><dd>{money(stats.spent)} <span>FC</span></dd></div></dl>}
    {cfg && <>
      <p className="topup-rate">Tỷ lệ: <b>{vnd(cfg.vndPer1000)} = 1.000 FC</b>{cfg.tiers.length > 0 && ' · nạp đạt mốc nào nhận FC khuyến mãi của mốc đó'}</p>
      {cfg.tiers.length > 0 && <div className="tp-tiers" role="group" aria-label="Mốc nạp">
        {[...cfg.tiers].sort((a, b) => a.vnd - b.vnd).map(t => {
          const q = topupQuote(t.vnd, cfg), on = value === t.vnd;
          return <button key={t.vnd} type="button" className={`tp-tier ${on ? 'is-on' : ''} ${quote?.tier?.vnd === t.vnd && !on ? 'is-reached' : ''}`} aria-pressed={on} onClick={() => setAmount(t.vnd.toLocaleString('vi-VN'))}>
            <b>{vnd(t.vnd)}</b><span>{money(q.base)} FC</span>{t.bonus > 0 && <em>+{money(t.bonus)} KM</em>}
          </button>;
        })}
      </div>}
      <label className="tp-amount"><span>Số tiền muốn nạp</span><input value={amount} inputMode="numeric" placeholder={`từ ${vnd(cfg.minVnd)}`} onChange={e => setAmount(e.target.value.slice(0, 20))}/></label>
      {quote && amount.trim() && (quote.valid
        ? <p className="tp-quote"><span>Nhận <b>{money(quote.base)} FC</b>{quote.bonus > 0 && <> + <b className="tp-bonus">{money(quote.bonus)} FC khuyến mãi</b> (mốc {vnd(quote.tier!.vnd)})</>} = <b>{money(quote.total)} FC</b></span>
            {quote.next && <small>Nạp thêm {vnd(quote.next.vnd - value)} để đạt mốc {vnd(quote.next.vnd)} (+{money(quote.next.bonus)} FC khuyến mãi).</small>}</p>
        : <p className="topup-summary-error">Số tiền từ {vnd(cfg.minVnd)} tới {vnd(cfg.maxVnd)}, chẵn nghìn.</p>)}
      <button type="button" className="primary-button tp-main" disabled={busy || !quote?.valid} onClick={() => void run(async () => { const o = await api.create(value); setAmount(''); await loadOrders(); setActive(o.id); })}>Tạo đơn nạp</button>
    </>}
    {error && <p className="topup-summary-error" role="alert">{error}</p>}
    {orders && orders.length > 0 && <div className="tp-history">
      <div className="tp-history-head"><b>Đơn nạp của bạn</b><button type="button" className="tp-refresh" onClick={() => void loadOrders().catch(() => {})} aria-label="Tải lại"><RotateCcw size={14}/></button></div>
      {orders.slice(0, 10).map(o => <button key={o.id} type="button" className="tp-row" onClick={() => setActive(o.id)}>
        <span><b>{vnd(o.vnd)}</b><small>{o.code} · {time(o.createdAt)}</small></span>
        <span className={`tp-chip is-${o.status}`}>{TOPUP_STATUS[o.status]}</span>
      </button>)}
    </div>}
  </div>;
}
