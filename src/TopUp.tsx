import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Crown, Gift, RotateCcw } from 'lucide-react';
import { ROYAL_TAX_DISCOUNT, ROYAL_TOPUP_FC } from './market';
import { TIER_RENEW } from './profile';
import { asset } from './asset';
import { money, packs } from './game';
import { TOPUP_QR, TOPUP_VIETQR, TOPUP_ZALO } from './config';
import VietQr from './VietQr';
import { dynamicVietQr } from './vietqr-payload';
import { cancelTopupOrder, claimTopupGift, claimTopupTier, createTopupOrder, fetchFcStats, fetchMyTopupOrders, fetchTopupConfig, fetchTopupGiftsMe, fetchTopupTiersMe, markTopupPaid } from './wallet';
import type { FcStats } from './wallet';
import { giftRewardText, giftsUnlockedBy, isOpenOrder, leftText, milestoneTrack, parseVnd, shortVnd, tiersUnlockedBy, topupQuote, TOPUP_STATUS } from './topup-orders';
import type { TopupConfig, TopupGiftState, TopupOrder, TopupTierState } from './topup-orders';

// Trang nạp FC (nap.html; migration 202611200002_fco_topup_orders.sql + 202611200004_fco_topup_cumulative.sql):
// thanh KM tích luỹ (tổng tiền đã nạp, qua mốc nào bấm Nhận FC KM mốc đó, mỗi mốc 1 lần) → nhập / chọn số tiền → tạo đơn (mã riêng ghi vào
// nội dung chuyển khoản) → "Tôi đã chuyển khoản" → admin duyệt thì FC gốc tự vào ví. Máy chủ tự tính số FC, game chỉ xem trước.
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export type TopUpApi = { config: () => Promise<TopupConfig>; orders: () => Promise<TopupOrder[]>; create: (vnd: number) => Promise<TopupOrder>;
  paid: (id: number) => Promise<TopupOrder>; cancel: (id: number) => Promise<TopupOrder>; stats: () => Promise<FcStats>;
  tiers: () => Promise<TopupTierState>; claim: (vnd: number) => Promise<unknown>;
  gifts?: () => Promise<TopupGiftState>; claimGift?: (vnd: number) => Promise<unknown> };
const LIVE: TopUpApi = { config: fetchTopupConfig, orders: fetchMyTopupOrders, create: createTopupOrder, paid: markTopupPaid, cancel: cancelTopupOrder, stats: fetchFcStats,
  tiers: fetchTopupTiersMe, claim: claimTopupTier, gifts: fetchTopupGiftsMe, claimGift: claimTopupGift };
const packName = (id: string) => packs.find(p => p.id === id)?.name ?? id;
const giftText = (t: TopupGiftState['tiers'][number]) => t.rewards.map(r => giftRewardText(r, packName)).join(' + ');

// Thanh KM tích luỹ (như ảnh mẫu "Gói nạp đặc biệt"): tổng tiền đã nạp, các mốc KM cách đều, "Cần X" tới mốc kế, nút Nhận từng mốc.
function TierTrack({ data, onClaim, busy }: { data: TopupTierState; onClaim: (vnd: number) => void; busy: boolean }) {
  const track = milestoneTrack(data.totalVnd, data.tiers.map(t => t.vnd));
  const ready = data.tiers.filter(t => !t.claimed && data.totalVnd >= t.vnd).length;
  const [open, setOpen] = useState(ready > 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (ready > 0) setOpen(true); }, [ready]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ev = data.event!, running = now < ev.endsAt;
  return <section className="tp-ms" aria-label={ev.title}>
    <div className="tp-ms-head"><div><b>{ev.title}</b>
      <small className={running ? 'tp-ms-time' : 'tp-ms-time is-ended'}>{running ? <>Kết thúc sau <b>{leftText(ev.endsAt - now)}</b></> : <>Đã kết thúc · nhận quà trong <b>{leftText(ev.claimUntil - now)}</b></>}</small>
      <small>Đã nạp trong sự kiện: <b>{vnd(data.totalVnd)}</b></small></div>
      <button type="button" className="tp-ms-link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Chi tiết quyền lợi'}{ready > 0 && <i>{ready}</i>}</button></div>
    <div className="tp-ms-bar" role="progressbar" aria-valuemin={0} aria-valuemax={track.nodes[track.nodes.length - 1].fc} aria-valuenow={data.totalVnd}>
      <div className="tp-ms-rail"><span style={{ width: `${track.fill}%` }}/></div>
      {track.next !== null && <span className="tp-ms-tip" style={{ left: `${track.fill}%` }}>Cần {vnd(track.need)}</span>}
      {track.nodes.map(n => { const t = data.tiers.find(x => x.vnd === n.fc);
        return <span key={n.fc} className={`tp-ms-node ${n.reached ? 'is-on' : ''} ${t && n.reached && !t.claimed ? 'is-ready' : ''}`} style={{ left: `${n.pos}%` }} title={t ? `${vnd(t.vnd)}: +${money(t.bonus)} FC` : undefined}><i/><small>{shortVnd(n.fc)}</small></span>; })}
    </div>
    {open && <ul className="tp-ms-list">{data.tiers.map(t => { const reached = data.totalVnd >= t.vnd;
      return <li key={t.vnd} className={t.claimed ? 'is-claimed' : reached ? 'is-ready' : undefined}>
        <span><b>Mốc {vnd(t.vnd)}</b><small>+{money(t.bonus)} FC khuyến mãi</small></span>
        {t.claimed ? <em className="tp-ms-done">Đã cộng ✓</em> : reached ? <button type="button" className="primary-button" disabled={busy} onClick={() => onClaim(t.vnd)}>Nhận</button> : <em>Còn {vnd(t.vnd - data.totalVnd)}</em>}
      </li>; })}</ul>}
  </section>;
}

// Thanh mốc quà tích luỹ (202611250004): cùng sự kiện + tổng tiền với thanh FC, quà là gói cầu thủ / BP / STP, tự trao khi admin duyệt đơn.
function GiftTrack({ data, onClaim, busy }: { data: TopupGiftState; onClaim: (vnd: number) => void; busy: boolean }) {
  const track = milestoneTrack(data.totalVnd, data.tiers.map(t => t.vnd));
  const ready = data.tiers.filter(t => !t.claimed && data.totalVnd >= t.vnd).length;
  const [open, setOpen] = useState(true);
  return <section className="tp-ms tp-gifts" aria-label="Quà mốc nạp tích luỹ">
    <div className="tp-ms-head"><div><b><Gift size={16}/> Quà mốc nạp</b>
      <small>Nạp đủ mốc trong sự kiện nhận gói cầu thủ / BP / STP — gói và BP vào kho khi vào game, STP cộng ngay.</small></div>
      <button type="button" className="tp-ms-link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Xem quà'}{ready > 0 && <i>{ready}</i>}</button></div>
    <div className="tp-ms-bar" role="progressbar" aria-valuemin={0} aria-valuemax={track.nodes[track.nodes.length - 1].fc} aria-valuenow={data.totalVnd}>
      <div className="tp-ms-rail"><span style={{ width: `${track.fill}%` }}/></div>
      {track.next !== null && <span className="tp-ms-tip" style={{ left: `${track.fill}%` }}>Cần {vnd(track.need)}</span>}
      {track.nodes.map(n => { const t = data.tiers.find(x => x.vnd === n.fc);
        return <span key={n.fc} className={`tp-ms-node ${n.reached ? 'is-on' : ''} ${t && n.reached && !t.claimed ? 'is-ready' : ''}`} style={{ left: `${n.pos}%` }} title={t ? `${vnd(t.vnd)}: ${giftText(t)}` : undefined}><i/><small>{shortVnd(n.fc)}</small></span>; })}
    </div>
    {open && <ul className="tp-ms-list">{data.tiers.map(t => { const reached = data.totalVnd >= t.vnd;
      return <li key={t.vnd} className={t.claimed ? 'is-claimed' : reached ? 'is-ready' : undefined}>
        <span><b>Mốc {vnd(t.vnd)}</b><small className="tp-gift-items">{t.rewards.map((r, i) => <em key={i} className={`tp-gift is-${'pack' in r ? 'pack' : 'bp' in r ? 'bp' : 'stp'}`}>{giftRewardText(r, packName)}</em>)}</small></span>
        {t.claimed ? <em className="tp-ms-done">Đã trao ✓</em> : reached ? <button type="button" className="primary-button" disabled={busy} onClick={() => onClaim(t.vnd)}>Nhận</button> : <em>Còn {vnd(t.vnd - data.totalVnd)}</em>}
      </li>; })}</ul>}
  </section>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return <div className="tp-copy"><dt>{label}</dt><dd><b>{value}</b><button type="button" className="tp-copy-btn" onClick={copy} aria-label={`Chép ${label}`}>{done ? <Check size={14}/> : <Copy size={14}/>}</button></dd></div>;
}

export default function TopUp({ online, onCredited, api = LIVE }: { online: boolean; onCredited?: () => void; api?: TopUpApi }) {
  const [cfg, setCfg] = useState<TopupConfig | null>(null);
  const [orders, setOrders] = useState<TopupOrder[] | null>(null);
  const [stats, setStats] = useState<FcStats | null>(null);
  const [tiers, setTiers] = useState<TopupTierState | null>(null);
  const [gifts, setGifts] = useState<TopupGiftState | null>(null);
  const giftsRef = useRef<TopupGiftState | null>(null);
  giftsRef.current = gifts;
  const tiersRef = useRef<TopupTierState | null>(null);
  tiersRef.current = tiers;
  const [claimed, setClaimed] = useState('');
  const [giftMsg, setGiftMsg] = useState('');
  const [amount, setAmount] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approved = useRef<Set<number> | null>(null);
  const loadOrders = () => api.orders().then(list => {
    // Đơn vừa được duyệt từ lần tải trước: báo game tải lại ví FC.
    const done = new Set(list.filter(o => o.status === 'approved').map(o => o.id));
    if (approved.current && [...done].some(id => !approved.current!.has(id))) {
      onCredited?.(); void api.stats().then(setStats).catch(() => {});
      void api.tiers().then(next => {
        const fresh = next.tiers.filter(t => t.claimed && !tiersRef.current?.tiers.find(o => o.vnd === t.vnd)?.claimed);
        if (fresh.length) setClaimed(`Đơn đã được duyệt · tự cộng ${money(fresh.reduce((n, t) => n + t.bonus, 0))} FC khuyến mãi (mốc ${fresh.map(t => shortVnd(t.vnd)).join(', ')}).`);
        setTiers(next);
      }).catch(() => {});
      void api.gifts?.().then(next => {
        const fresh = next.tiers.filter(t => t.claimed && !giftsRef.current?.tiers.find(o => o.vnd === t.vnd)?.claimed);
        if (fresh.length) setGiftMsg(`Đã trao quà mốc ${fresh.map(t => shortVnd(t.vnd)).join(', ')}: ${fresh.map(giftText).join(' · ')}.`);
        setGifts(next);
      }).catch(() => {});
    }
    approved.current = done; setOrders(list);
  });
  useEffect(() => {
    if (!online) return;
    void api.config().then(setCfg).catch(e => setError((e as Error).message));
    void api.stats().then(setStats).catch(() => {});
    void api.tiers().then(setTiers).catch(() => {});
    void api.gifts?.().then(setGifts).catch(() => {});
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
    {isOpenOrder(order) && <div className="tp-order-grid"><div className="tp-order-qr">
      {/* QR động (VietQR): quét bằng app ngân hàng là tự điền đúng số tiền + mã đơn; chưa cấu hình TOPUP_VIETQR thì dùng ảnh QR tĩnh. */}
      <div className="topup-qr">{TOPUP_VIETQR ? <VietQr payload={dynamicVietQr(TOPUP_VIETQR, order.vnd, order.code)} label={`Mã QR chuyển ${vnd(order.vnd)}, nội dung ${order.code}`}/>
        : TOPUP_QR ? <img src={asset(TOPUP_QR)} alt="Mã QR chuyển khoản"/> : <span>Chưa có mã QR chuyển khoản. Hãy liên hệ admin.</span>}</div>
      {TOPUP_VIETQR && <p className="tp-qr-note">Mở app ngân hàng → <b>Quét QR</b>: số tiền <b>{vnd(order.vnd)}</b> và nội dung <b>{order.code}</b> đã điền sẵn, chỉ cần xác nhận.</p>}
      </div><div className="tp-order-info">
      <dl className="topup-info">
        <CopyField label="Số tiền" value={order.vnd.toLocaleString('vi-VN')}/>
        <CopyField label="Nội dung chuyển khoản" value={order.code}/>
      </dl>
      <p className="topup-steps">{TOPUP_VIETQR ? 'Không quét được thì chuyển tay: ' : ''}Chuyển <b>đúng số tiền</b> và ghi <b>đúng mã {order.code}</b> vào nội dung để admin nhận ra đơn của bạn.</p>
      {order.status === 'pending'
        ? <button type="button" className="primary-button tp-main" disabled={busy} onClick={() => void run(async () => { await api.paid(order.id); await loadOrders(); })}>Tôi đã chuyển khoản</button>
        : <p className="tp-wait">Đã báo chuyển khoản lúc {time(order.paidAt ?? order.createdAt)}. FC sẽ tự vào ví khi admin duyệt.{TOPUP_ZALO && <> Cần gấp thì gửi bill qua <a href={TOPUP_ZALO} target="_blank" rel="noopener noreferrer">Zalo admin</a>.</>}</p>}
      <button type="button" className="tp-cancel" disabled={busy} onClick={() => { if (confirm(`Huỷ đơn ${order.code}?`)) void run(async () => { await api.cancel(order.id); await loadOrders(); }); }}>Huỷ đơn</button>
    </div></div>}
    {error && <p className="topup-summary-error" role="alert">{error}</p>}
  </div>;

  const eventOn = !!(tiers?.event && tiers.tiers.length > 0 && Date.now() < tiers.event.endsAt);
  const giftsOn = !!(gifts?.event && gifts.tiers.length > 0 && Date.now() < gifts.event.endsAt);
  return <div className={`topup tp-form${eventOn || giftsOn ? ' has-side' : ''}`}>
    {(eventOn || giftsOn) && <aside className="tp-side">
    {/* Hết sự kiện là ẩn thanh hẳn (máy chủ cũng không cho bấm Nhận sau giờ kết thúc, 202611200007). */}
    {eventOn && <TierTrack data={tiers!} busy={busy} onClaim={v => void run(async () => {
      const t = tiers!.tiers.find(x => x.vnd === v); await api.claim(v); onCredited?.();
      setTiers(await api.tiers());
      setClaimed(`Đã nhận ${money(t?.bonus ?? 0)} FC khuyến mãi mốc ${vnd(v)}.`);
    })}/>}
    {claimed && <p className="tp-claimed" role="status">{claimed}</p>}
    {giftsOn && <GiftTrack data={gifts!} busy={busy} onClaim={v => void run(async () => {
      const t = gifts!.tiers.find(x => x.vnd === v); await api.claimGift?.(v); onCredited?.();
      setGifts(await api.gifts!());
      setGiftMsg(`Đã nhận quà mốc ${vnd(v)}: ${t ? giftText(t) : ''}. Gói / BP vào kho khi bạn vào game.`);
    })}/>}
    {giftMsg && <p className="tp-claimed" role="status">{giftMsg}</p>}
    </aside>}
    <div className="tp-pay">
    {!eventOn && !giftsOn && claimed && <p className="tp-claimed" role="status">{claimed}</p>}
    {stats && <dl className="topup-summary"><div><dt>Đã nạp</dt><dd>{money(stats.topup)} <span>FC</span></dd></div><div><dt>Đã dùng</dt><dd>{money(stats.spent)} <span>FC</span></dd></div></dl>}
    {/* Hạng Royal (migration 202611240003_fco_royal.sql): tổng FC đã nạp đạt ROYAL_TOPUP_FC thì tự lên Royal vĩnh viễn. */}
    {stats && (() => { const done = stats.topup >= ROYAL_TOPUP_FC, pct = Math.min(100, stats.topup / ROYAL_TOPUP_FC * 100);
      return <section className={`tp-royal${done ? ' is-done' : ''}`} aria-label="Hạng Royal">
        <div className="tp-royal-head"><Crown size={20}/><b>ROYAL</b><span>Độc quyền</span></div>
        <p>{done ? <>Bạn đã là <b>Royal</b> vĩnh viễn: giảm {ROYAL_TAX_DISCOUNT}% thuế bán cầu thủ và 6 hiệu ứng avatar + tên độc quyền.</>
          : <>Nạp đủ <b>{money(ROYAL_TOPUP_FC)} FC</b> để lên <b>Royal</b> vĩnh viễn: giảm {ROYAL_TAX_DISCOUNT}% thuế bán cầu thủ, 6 hiệu ứng avatar + tên độc quyền.</>}</p>
        {!done && <div className="tp-royal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={ROYAL_TOPUP_FC} aria-valuenow={stats.topup}><span style={{ width: `${pct}%` }}/>
          <small>{money(stats.topup)} / {money(ROYAL_TOPUP_FC)} FC · còn {money(ROYAL_TOPUP_FC - stats.topup)} FC</small></div>}
      </section>; })()}
    <p className="tp-renew" role="note"><b>Tự gia hạn đặc quyền:</b> tài khoản <b>Premium</b> nạp ≥ {TIER_RENEW.premium.fc.toLocaleString('vi-VN')} FC trong {TIER_RENEW.premium.days} ngày, <b>Luxury</b> nạp ≥ {TIER_RENEW.luxury.fc.toLocaleString('vi-VN')} FC trong {TIER_RENEW.luxury.days} ngày thì hết hạn sẽ tự gia hạn thêm một kỳ.</p>
    {cfg && <>
      <p className="topup-rate">Tỷ lệ: <b>{vnd(cfg.vndPer1000)} = 1.000 FC</b>{tiers?.event && Date.now() < tiers.event.endsAt && cfg.tiers.length > 0 && ' · đang có sự kiện nạp tích luỹ'}</p>
      {cfg.tiers.length > 0 && <div className="tp-tiers" role="group" aria-label="Mốc nạp">
        {[...cfg.tiers].sort((a, b) => a.vnd - b.vnd).map(t => {
          const q = topupQuote(t.vnd, cfg), on = value === t.vnd;
          return <button key={t.vnd} type="button" className={`tp-tier ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => setAmount(t.vnd.toLocaleString('vi-VN'))}>
            <b>{vnd(t.vnd)}</b><span>{money(q.base)} FC</span>
            {eventOn && (() => { const km = tiersUnlockedBy(tiers!, t.vnd).reduce((n, x) => n + x.bonus, 0); return km > 0 ? <em>+{money(km)} FC KM</em> : null; })()}
          </button>;
        })}
      </div>}
      <label className="tp-amount"><span>Số tiền muốn nạp</span><span className="tp-amount-box"><input value={amount} inputMode="numeric" placeholder={`từ ${vnd(cfg.minVnd)}`} onChange={e => setAmount(e.target.value.slice(0, 20))}/><i aria-hidden="true">đ</i></span></label>
      {quote && amount.trim() && (quote.valid
        ? <p className="tp-quote"><span>Nhận <b>{money(quote.base)} FC</b></span>
            {tiers?.event && Date.now() < tiers.event.endsAt && (() => { const opened = tiersUnlockedBy(tiers, value), bonus = opened.reduce((n, t) => n + t.bonus, 0);
              return opened.length ? <small>Đơn này giúp bạn qua mốc {opened.map(t => shortVnd(t.vnd)).join(', ')}: nhận thêm <b className="tp-bonus">{money(bonus)} FC khuyến mãi</b>, tự cộng khi admin duyệt.</small> : null; })()}
            {giftsOn && (() => { const opened = giftsUnlockedBy(gifts!, value);
              return opened.length ? <small>Quà mốc {opened.map(t => shortVnd(t.vnd)).join(', ')}: <b className="tp-bonus">{opened.map(giftText).join(' · ')}</b>, tự trao khi admin duyệt.</small> : null; })()}</p>
        : <p className="topup-summary-error">Số tiền từ {vnd(cfg.minVnd)} tới {vnd(cfg.maxVnd)}, chẵn nghìn.</p>)}
      <button type="button" className="primary-button tp-main" disabled={busy || !quote?.valid} onClick={() => void run(async () => { const o = await api.create(value); setAmount(''); await loadOrders(); setActive(o.id); })}>Tạo đơn nạp</button>
    </>}
    {error && <p className="topup-summary-error" role="alert">{error}</p>}
    </div>
    {orders && orders.length > 0 && <div className="tp-history">
      <div className="tp-history-head"><b>Đơn nạp của bạn</b><button type="button" className="tp-refresh" onClick={() => void loadOrders().catch(() => {})} aria-label="Tải lại"><RotateCcw size={14}/></button></div>
      {orders.slice(0, 10).map(o => <button key={o.id} type="button" className="tp-row" onClick={() => setActive(o.id)}>
        <span><b>{vnd(o.vnd)}</b><small>{o.code} · {time(o.createdAt)}</small></span>
        <span className={`tp-chip is-${o.status}`}>{TOPUP_STATUS[o.status]}</span>
      </button>)}
    </div>}
  </div>;
}
