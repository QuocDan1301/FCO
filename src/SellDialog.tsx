import { useEffect, useMemo, useState } from 'react';
import { ovrStyle } from './ovr-color';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { MAX_BULK_SELL, MARKET_FEE_PERCENT, SELL_BAND_PERCENT, marketNow, premiumActive, priceAt, saleFee, saleTaxPercent, sellRange, taxFor, voucherHelps, isTradeLocked, TRADE_LOCKED } from './market';
import type { SellItem } from './market';
import { TAX_VOUCHERS, voucherCount } from './stp';
import type { TaxVoucher } from './stp';
import { usePricePeriod } from './use-price-period';
import { asset } from './asset';
import './sell.css';
import type { MarketDepth, MarketQuote } from './inventory-server';
import { faceOf } from './portraits';

type Tab = 'single' | 'bulk';
export type SellTarget = 'market' | 'system';
// Bán là xong ngay (202611180010): có lệnh đặt mua của người chơi thì khớp, không thì hệ thống mua ngay đúng giá bán.
const SELL_HINT = 'Bán ngay với giá tự đặt: có người đặt mua giá ≥ giá bán thì khớp với người đó, không thì hệ thống mua ngay đúng giá bán (trừ thuế). BP chờ nhận ở TTCN › Lịch sử chuyển nhượng.';
type Mode = 'fit' | 'min' | 'max';
type Props = {
  save: Save;
  initial: { tab: Tab; uid?: string };
  free: boolean;
  renderCard: (card: Card) => ReactNode;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
  // Promise khi máy chủ bán (src/inventory-server.ts); true = đã bán xong. voucher: phiếu giảm thuế dùng cho lượt bán này.
  onSell: (items: SellItem[], voucher: TaxVoucher | null) => boolean | Promise<boolean>;
  onClose: () => void;
  // Chợ giữa người chơi (migration 202611170002): sổ lệnh thật; bán = khớp lệnh mua của người chơi hoặc hệ thống mua ngay (202611180010).
  loadDepth?: (playerId: number, level: number) => Promise<MarketDepth>;
  // Bán hàng loạt: giá chợ của cả danh sách (migration 202611170009); có thì 'giá phù hợp' theo chợ thật.
  loadQuotes?: (keys: [number, number][]) => Promise<MarketQuote[]>;
};
const MODES: { id: Mode; label: string }[] = [{ id: 'fit', label: 'Đăng ký với giá phù hợp' }, { id: 'min', label: 'Đăng ký với giá thấp nhất' }, { id: 'max', label: 'Đăng ký với giá cao nhất' }];
const DAY = 86_400_000;
const BOOK_ROWS = 8;
const fullFormat = new Intl.NumberFormat('en-US');
const full = (n: number) => fullFormat.format(n);
// Số ngẫu nhiên cố định theo cầu thủ + cấp: bảng đang bán và khối lượng giao dịch là mô phỏng nhưng không đổi mỗi lần mở.
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
// Giá 30 ngày gần nhất, mỗi ngày một điểm (dùng chung với cửa sổ Mua, BuyOrderDialog.tsx).
export function priceHistory(card: Pick<Card, 'playerId' | 'level'>, price: number) {
  const now = marketNow();
  return Array.from({ length: 30 }, (_, i) => priceAt(card, now - (29 - i) * DAY) ?? price);
}
function marketView(card: Card, price: number) {
  const rng = seeded(card.playerId * 131 + card.level * 7919);
  // Biểu đồ dùng giá thật của 30 ngày gần nhất, mỗi ngày một điểm.
  const history = priceHistory(card, price);
  const listings = Array.from({ length: 5 }, (_, i) => ({ price: Math.round(price * (1 + 0.004 * (i + 1) + rng() * 0.003)), count: 1 + Math.floor(rng() * (i === 4 ? 4 : 2)) }));
  return { history, listings, volume: 5 + Math.floor(rng() * 56) };
}

// Biểu đồ giá 30 ngày: đường gấp khúc, ghi giá cao / thấp nhất và 5 mốc ngày.
// fco (cửa sổ Mua, 2026-11-25): thêm đường kẻ giữa + trục ngày, nhãn giá cao / thấp nhất nằm đúng vị trí điểm đó (--mx / --mn) như chợ FC Online.
export function PriceChart({ history, fco = false }: { history: number[]; fco?: boolean }) {
  const max = Math.max(...history), min = Math.min(...history), span = Math.max(1, max - min);
  const last = Math.max(1, history.length - 1), where = (v: number) => `${(history.indexOf(v) / last) * 100}%`;
  const points = history.map((v, i) => `${(i / (history.length - 1)) * 100},${8 + (1 - (v - min) / span) * 84}`).join(' ');
  const today = Date.now();
  return <figure className={`sd-chart${fco ? ' is-fco' : ''}`} style={fco ? { '--mx': where(max), '--mn': where(min) } as CSSProperties : undefined} aria-label={`Giá 30 ngày: cao nhất ${money(max)}, thấp nhất ${money(min)}`}>
    <span className="sd-chart-max">{money(max)}</span><span className="sd-chart-min">{money(min)}</span>
    <svg viewBox={`0 0 100 ${fco ? 138 : 100}`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="8" x2="100" y2="8"/>{fco && <line x1="0" y1="50" x2="100" y2="50"/>}<line x1="0" y1="92" x2="100" y2="92"/>{fco && <line className="axis" x1="0" y1="132" x2="100" y2="132"/>}<polyline points={points}/></svg>
    <figcaption>{[29, 22, 15, 8, 0].map(d => { const date = new Date(today - d * DAY); return <span key={d}>{date.getDate()}/{date.getMonth() + 1}</span>; })}</figcaption>
  </figure>;
}

// Cửa sổ Bán kiểu FC Online: "Bán từng cá nhân" (tự đặt giá trong khoảng ±10%, bán nhiều thẻ giống nhau một lúc) và
// "Bán hàng loạt" (tick tối đa MAX_BULK_SELL thẻ, bán cùng một mức: giá phù hợp / thấp nhất / cao nhất). Bán là bán ngay, trừ phí của từng thẻ.
export default function SellDialog({ save, initial, free, renderCard, levelBadge, seasonShort, onSell, onClose, loadDepth, loadQuotes }: Props) {
  const listing = !!loadDepth;
  const period = usePricePeriod();
  const toSystem = false;
  const feeBase = MARKET_FEE_PERCENT;
  // Phiếu giảm thuế (gói Star Point): giảm theo % của thuế lượt bán này (thuế × (100 − phiếu)%); hết phiếu đang chọn thì bỏ chọn.
  const [chosenVoucher, setVoucher] = useState<TaxVoucher | null>(null);
  // Premium (giảm 65%, không cộng dồn) chỉ dùng được phiếu cho thuế thấp hơn 14%.
  const usable = TAX_VOUCHERS.filter(pct => voucherCount(save, pct) > 0 && voucherHelps(save, pct, undefined, feeBase));
  const voucher = chosenVoucher && usable.includes(chosenVoucher) ? chosenVoucher : null;
  const baseTax = saleTaxPercent(save, undefined, feeBase);
  const pctText = (n: number) => (Math.round(n * 100) / 100).toLocaleString('vi-VN');
  const taxPercent = taxFor(save, voucher, undefined, feeBase);
  const voucherPicker = usable.length > 0 && <label className="sd-voucher"><span>Phiếu giảm thuế</span><select value={voucher ?? ''} onChange={e => setVoucher(e.target.value ? Number(e.target.value) as TaxVoucher : null)} aria-label="Dùng phiếu giảm thuế cho lượt bán này"><option value="">Không dùng · thuế {pctText(baseTax)}%{premiumActive(save) ? ' (Premium)' : ''}</option>{usable.map(pct => <option key={pct} value={pct}>Giảm {pct}% thuế · còn {pctText(taxFor(save, pct, undefined, feeBase))}% (còn {voucherCount(save, pct)} phiếu)</option>)}</select></label>;
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [uid, setUid] = useState(initial.uid ?? '');
  const locked = useMemo(() => new Set(save.locked ?? []), [save.locked]);
  const squad = useMemo(() => new Set(save.squad ?? []), [save.squad]);
  const card = save.cards.find(c => c.uid === uid) ?? null;

  // ---- Bán từng cá nhân ----
  const range = card ? sellRange(card) : null;
  const [priceText, setPriceText] = useState(() => { const c = save.cards.find(x => x.uid === initial.uid); const r = c && sellRange(c); return r ? full(r.price) : ''; });
  const [count, setCount] = useState(1);
  const pick = (next: Card) => { setUid(next.uid); setCount(1); const r = sellRange(next); setPriceText(r ? full(r.price) : ''); setTab('single'); };
  const typedPrice = Number(priceText.replace(/\D/g, '')) || 0;
  // Bán cho hệ thống: luôn theo giá tham chiếu, không tự đặt giá.
  const price = toSystem && range ? range.price : typedPrice;
  const priceOk = !!range && price >= range.min && price <= range.max;
  // Thẻ giống hệt (cùng cầu thủ + cấp, chưa khóa, không nằm trong đội hình riêng) bán cùng giá; thẻ đang chọn luôn tính.
  const twins = card ? [card, ...save.cards.filter(c => c.uid !== card.uid && c.playerId === card.playerId && c.level === card.level && !locked.has(c.uid) && !squad.has(c.uid))] : [];
  const sellable = card && !locked.has(card.uid) && !isTradeLocked(card) ? twins.length : 0;
  const selling = twins.slice(0, count);
  const sellingFees = selling.length * saleFee(price, taxPercent);
  const view = card && range ? marketView(card, range.price) : null;
  const [depth, setDepth] = useState<MarketDepth | null>(null);
  useEffect(() => {
    if (!loadDepth || !card) { setDepth(null); return; }
    let alive = true;
    const load = () => loadDepth(card.playerId, card.level).then(d => { if (alive) setDepth(d); }).catch(() => { /* lượt sau thử lại */ });
    setDepth(null); void load();
    const timer = window.setInterval(load, 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loadDepth, card?.playerId, card?.level]);
  const book = useMemo(() => {
    type Level = { price: number; count: number | string } | null;
    const pad = (list: Level[], top: boolean) => { const out = list.slice(0, BOOK_ROWS); const fill = Array<Level>(BOOK_ROWS - out.length).fill(null); return top ? [...fill, ...out] : [...out, ...fill]; };
    if (!listing) return { bids: pad([], true), asks: pad(view?.listings ?? [], false) };
    const asks: { price: number; count: number | string }[] = (depth?.asks ?? []).map(a => ({ ...a }));
    const sys = depth?.sys;
    if (sys && sys.price > 0 && (sys.left === null || sys.left > 0)) {
      const same = asks.find(a => a.price === sys.price);
      if (same) same.count = sys.left === null ? '∞' : Number(same.count) + sys.left; else asks.push({ price: sys.price, count: sys.left ?? '∞' });
    }
    asks.sort((x, y) => x.price - y.price);
    return { bids: pad([...(depth?.bids ?? [])].sort((x, y) => x.price - y.price).slice(-BOOK_ROWS), true), asks: pad(asks, false) };
  }, [listing, depth, view]);  // Bấm vào một mức giá (giá tối thiểu / tối đa, dòng sổ lệnh) → ô Giá lấy mức đó, kẹp trong khung ±10%.
  const pickPrice = (value: number) => { if (range) setPriceText(full(Math.min(range.max, Math.max(range.min, value)))); };
  const clampPrice = () => { if (!range) return; setPriceText(full(Math.min(range.max, Math.max(range.min, price || range.price)))); };
  const step = (dir: 1 | -1) => { if (!range) return; const unit = Math.max(1, Math.round(range.price / 100)); setPriceText(full(Math.min(range.max, Math.max(range.min, (price || range.price) + dir * unit)))); };
  const sellSingle = () => { if (card && priceOk && count >= 1 && count <= sellable) void Promise.resolve(onSell(selling.map(c => ({ uid: c.uid, price })), voucher)).then(ok => { if (ok) onClose(); }); };

  // ---- Bán hàng loạt ----
  const [mode, setMode] = useState<Mode>('fit');
  const [sortDesc, setSortDesc] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  // Thẻ trong đội hình (đội hình riêng, mọi bộ đội hình + dự bị) không bán được nên không hiện trong danh sách.
  const rows = useMemo(() => save.cards.filter(c => !squad.has(c.uid)).map(c => {
    const r = sellRange(c);
    const reason = isTradeLocked(c) ? 'Khóa giao dịch' : locked.has(c.uid) ? 'Đã khóa' : !r ? 'Chưa có giá' : null;
    return { card: c, range: r, reason };
  }).sort((a, b) => (sortDesc ? -1 : 1) * (ovr(a.card) - ovr(b.card)) || (b.range?.price ?? -1) - (a.range?.price ?? -1)), [save.cards, locked, squad, sortDesc, period]);
  // Giá chợ thật (đặt mua cao nhất / bán thấp nhất của người khác, gồm hệ thống), làm mới mỗi 15 giây khi đang ở tab hàng loạt.
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(() => new Map());
  const quoteKeys = useMemo(() => [...new Set(rows.filter(row => !row.reason).map(row => `${row.card.playerId}:${row.card.level}`))].slice(0, 400), [rows]);
  const quoteKeyText = quoteKeys.join(',');
  useEffect(() => {
    if (!loadQuotes || tab !== 'bulk' || !quoteKeys.length) return;
    let alive = true;
    const keys = quoteKeys.map(k => k.split(':').map(Number) as [number, number]);
    const load = () => loadQuotes(keys).then(list => { if (alive) setQuotes(new Map(list.map(q => [`${q.p}:${q.l}`, q]))); }).catch(() => { /* lượt sau thử lại */ });
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loadQuotes, tab, quoteKeyText]);
  // Giá phù hợp: có người đặt mua cao hơn / bằng giá bán thấp nhất thì lấy giá đặt mua (khớp ngay), không thì theo giá bán thấp nhất
  // trên chợ; chưa có ai thì giá tham chiếu. Luôn trong khung ±10% máy chủ chấp nhận.
  const priceFor = ({ card: c, range: r }: { card: Card; range: NonNullable<ReturnType<typeof sellRange>> }) => {
    if (toSystem) return r.price;
    if (mode === 'min') return r.min;
    if (mode === 'max') return r.max;
    const q = quotes.get(`${c.playerId}:${c.level}`);
    const market = q ? (q.bid != null && (q.ask == null || q.bid >= q.ask) ? q.bid : q.ask ?? r.price) : r.price;
    return Math.min(r.max, Math.max(r.min, market));
  };
  const checkedSet = new Set(checked);
  const chosen = rows.filter(row => checkedSet.has(row.card.uid) && row.range && !row.reason);
  const total = chosen.reduce((sum, row) => sum + priceFor({ card: row.card, range: row.range! }), 0);
  const totalFee = chosen.reduce((sum, row) => sum + saleFee(priceFor({ card: row.card, range: row.range! }), taxPercent), 0);
  const eligible = rows.filter(row => !row.reason);
  const allChecked = eligible.length > 0 && eligible.slice(0, MAX_BULK_SELL).every(row => checkedSet.has(row.card.uid));
  const toggle = (id: string) => setChecked(list => list.includes(id) ? list.filter(x => x !== id) : list.length >= MAX_BULK_SELL ? list : [...list, id]);
  const sellBulk = () => { if (chosen.length) void Promise.resolve(onSell(chosen.map(row => ({ uid: row.card.uid, price: priceFor({ card: row.card, range: row.range! }) })), voucher)).then(ok => { if (ok) { setChecked([]); onClose(); } }); };

  const p = card && getPlayer(card);
  return <div className="sd-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}><div className="sd" role="dialog" aria-modal="true" aria-labelledby="sd-title">
    <header className="sd-head"><h2 id="sd-title">Bán</h2><button className="sd-x" onClick={onClose} aria-label="Đóng"><X size={22}/></button></header>
    <nav className="sd-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'single'} onClick={() => setTab('single')}>Bán từng cá nhân</button>
      <button role="tab" aria-selected={tab === 'bulk'} onClick={() => setTab('bulk')}>Bán hàng loạt</button>
    </nav>

    {tab === 'single' ? (card && p ? <div className="sd-single">
      <aside className="sd-left">
        <div className="sd-card">{renderCard(card)}</div>
        {view ? <PriceChart history={view.history}/> : <p className="sd-muted">Chưa có lịch sử giá.</p>}
      </aside>
      <section className="sd-book">
        <h3><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>{p.name}<img src={levelBadge(card.level)} alt={`+${card.level}`}/></h3>
        <div className="sd-book-table" role="table" aria-label={listing ? 'Sổ lệnh' : 'Sổ lệnh mô phỏng'}>
          <div className="sd-book-head" role="row"><span>Đang bán</span><span>Giá</span><span>Số lượng mua</span></div>
          {book.bids.map((b, i) => <div key={`b${i}`} className="sd-book-row is-buy" role="row"><span/><span>{b ? <button className="sd-pick" onClick={() => pickPrice(b.price)} title="Đặt giá này">{money(b.price)}</button> : '-'}</span><span>{b ? b.count : ''}</span></div>)}
          {book.asks.map((a, i) => <div key={`s${i}`} className="sd-book-row is-sell" role="row"><span>{a ? a.count : ''}</span><span>{a ? <button className="sd-pick" onClick={() => pickPrice(a.price)} title="Đặt giá này">{money(a.price)}</button> : '-'}</span><span/></div>)}
        </div>
      </section>
      <section className="sd-form">
        <dl className="sd-stats">
          <div><dt>Khối lượng giao dịch 2 giờ</dt><dd>{listing ? depth?.volume ?? 0 : view?.volume ?? 0}<small> lần</small></dd></div>
          <div><dt>Giá tối thiểu</dt><dd>{range ? <button className="sd-pick" onClick={() => pickPrice(range.min)} title="Đặt giá tối thiểu">{money(range.min)}</button> : '—'}</dd></div>
          <div><dt>Giá tối đa</dt><dd>{range ? <button className="sd-pick" onClick={() => pickPrice(range.max)} title="Đặt giá tối đa">{money(range.max)}</button> : '—'}</dd></div>
        </dl>
        <label className="sd-field"><span>Giá{toSystem && <small> (giá tham chiếu)</small>}</span>
          <input inputMode="numeric" value={toSystem && range ? full(range.price) : priceText} readOnly={toSystem} disabled={!range} aria-invalid={!!range && !priceOk} onChange={e => setPriceText(e.target.value.replace(/\D/g, '') ? full(Number(e.target.value.replace(/\D/g, ''))) : '')} onBlur={clampPrice} onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); step(1); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); } }}/>
        </label>
        <p className={`sd-price-note ${range && !priceOk ? 'is-error' : ''}`}>{!range ? marketPriceMissing(card) : !priceOk ? `Giá phải từ ${money(range.min)} đến ${money(range.max)} (±${SELL_BAND_PERCENT}% giá thị trường)` : toSystem ? `Hệ thống mua ngay ${money(price)} · nhận ngay ${money(price * selling.length - sellingFees)} BP sau phí ${pctText(taxPercent)}%` : `${money(price)} · nhận ${money(price * selling.length - sellingFees)} BP sau phí ${pctText(taxPercent)}% · treo 24 giờ`}</p>
        <div className="sd-row"><span>Số lượng bán</span><div className="sd-stepper"><b>{count}</b><span><button aria-label="Tăng số lượng" disabled={count >= sellable} onClick={() => setCount(c => Math.min(sellable, c + 1))}><ChevronUp size={14}/></button><button aria-label="Giảm số lượng" disabled={count <= 1} onClick={() => setCount(c => Math.max(1, c - 1))}><ChevronDown size={14}/></button></span></div></div>
        <div className="sd-row"><span>Số lượng có thể bán</span><b className="sd-big">{sellable}</b></div>
        {isTradeLocked(card) ? <p className="sd-price-note is-error">{TRADE_LOCKED}</p> : locked.has(card.uid) && <p className="sd-price-note is-error">Thẻ đang bị khóa. Mở khóa trước khi bán.</p>}
        {voucherPicker}
        <div className="sd-actions"><button className="sd-sell" disabled={!priceOk || !sellable} onClick={sellSingle} title={listing ? SELL_HINT : undefined}>Bán cầu thủ</button><button className="sd-cancel" onClick={onClose}>Hủy</button></div>
      </section>
    </div> : <div className="sd-empty"><p>Chọn một cầu thủ ở tab Bán hàng loạt (bấm vào tên) để bán lẻ với giá tự đặt.</p><button className="sd-cancel" onClick={() => setTab('bulk')}>Đến Bán hàng loạt</button></div>)

    : <div className="sd-bulk">
      <div className="sd-bulk-head" role="row">
        <input type="checkbox" aria-label={`Chọn tất cả (tối đa ${MAX_BULK_SELL})`} checked={allChecked} disabled={!eligible.length} onChange={() => setChecked(allChecked ? [] : eligible.slice(0, MAX_BULK_SELL).map(row => row.card.uid))}/>
        <span>Tên cầu thủ</span><span>Lương</span><button className="sd-sort" onClick={() => setSortDesc(d => !d)} aria-label={`Sắp xếp OVR ${sortDesc ? 'tăng dần' : 'giảm dần'}`}>OVR{sortDesc ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button><span>Thẻ</span><span>Giá bán</span>
      </div>
      <div className="sd-bulk-rows" role="table" aria-label="Cầu thủ có thể bán">
        {rows.map(({ card: c, range: r, reason }) => { const pl = getPlayer(c), on = checkedSet.has(c.uid); return <div key={c.uid} role="row" className={`sd-bulk-row ${on ? 'is-on' : ''} ${reason ? 'is-off' : ''}`}>
          {reason ? <span className="sd-reason" title={reason}/> : <input type="checkbox" checked={on} onChange={() => toggle(c.uid)} aria-label={`Chọn ${pl.name} +${c.level}`}/>}
          <span className="sd-name"><span className={`squad-face sd-face${faceOf(pl).portrait ? ' is-portrait' : ''}`}><img src={faceOf(pl).src} alt=""/></span><b className={`squad-season season-tag-${pl.tier}`}>{seasonShort(pl.tier)}</b>{reason ? <strong>{pl.name}</strong> : <button className="sd-name-link" onClick={() => pick(c)} title="Bán lẻ với giá tự đặt">{pl.name}</button>}{reason && <em>{reason}</em>}</span>
          <span className="squad-wage"><b>{pl.wage ?? 0}</b></span>
          <strong className="sd-ovr" style={ovrStyle(ovr(c))}>{ovr(c)}</strong>
          <span><img className="sd-level" src={levelBadge(c.level)} alt={`+${c.level}`}/></span>
          <strong className="sd-price">{r && !reason ? money(priceFor({ card: c, range: r })) : '0'}</strong>
        </div>; })}
        {!rows.length && <p className="sd-muted">Kho chưa có cầu thủ.</p>}
      </div>
      <footer className="sd-bulk-foot">
        <div className="sd-bulk-sum">
          <span className="sd-fee">Chi phí bán<i title={`Phí ${pctText(taxPercent)}% giá bán của mỗi thẻ`}>?</i><b>{money(totalFee)}</b></span>
          {voucherPicker}
            {!toSystem && <select value={mode} onChange={e => setMode(e.target.value as Mode)} aria-label="Mức giá bán hàng loạt">{MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>}
          <span className="sd-total">Tổng giá trị<b>{money(total)}</b></span>
        </div>
        <div className="sd-actions">
          <span className="sd-count">{chosen.length} / {MAX_BULK_SELL}<i title={`Mỗi lần bán tối đa ${MAX_BULK_SELL} cầu thủ; thẻ khóa và thẻ chưa có giá không bán được; thẻ trong đội hình không hiện ở đây`}>?</i></span>
          <button className="sd-sell" disabled={!chosen.length} onClick={sellBulk} title={listing ? SELL_HINT : undefined}>Bán SL lớn cầu thủ</button><button className="sd-cancel" onClick={onClose}>Hủy</button>
        </div>
        {free && <p className="sd-muted">Chế độ thử nghiệm: bán không cộng BP.</p>}
      </footer>
    </div>}
  </div></div>;
}
const marketPriceMissing = (card: Card) => `Chưa có giá ${getPlayer(card).name} +${card.level} trong bảng giá.`;
