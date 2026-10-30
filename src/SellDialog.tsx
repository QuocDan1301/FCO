import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { MARKET_FEE_PERCENT, MAX_BULK_SELL, SELL_BAND_PERCENT, sellRange } from './market';
import type { SellItem } from './market';
import { asset } from './asset';
import './sell.css';

type Tab = 'single' | 'bulk';
type Mode = 'fit' | 'min' | 'max';
type Props = {
  save: Save;
  initial: { tab: Tab; uid?: string };
  free: boolean;
  renderCard: (card: Card) => ReactNode;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
  onSell: (items: SellItem[]) => boolean;
  onClose: () => void;
};
const MODES: { id: Mode; label: string }[] = [{ id: 'fit', label: 'Đăng ký với giá phù hợp' }, { id: 'min', label: 'Đăng ký với giá thấp nhất' }, { id: 'max', label: 'Đăng ký với giá cao nhất' }];
const DAY = 86_400_000;
const fee = (price: number) => Math.floor(price * MARKET_FEE_PERCENT / 100);
const full = (n: number) => n.toLocaleString('en-US');
// Số ngẫu nhiên cố định theo cầu thủ + cấp: biểu đồ giá, bảng đang bán và khối lượng giao dịch là mô phỏng nhưng không đổi mỗi lần mở.
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
function marketView(card: Card, price: number) {
  const rng = seeded(card.playerId * 131 + card.level * 7919);
  let value = price * (0.88 + rng() * 0.3);
  const history = Array.from({ length: 30 }, (_, i) => {
    if (i === 29) return price;
    value = value * (0.95 + rng() * 0.1) * 0.85 + price * 0.15;
    return Math.round(value);
  });
  const listings = Array.from({ length: 5 }, (_, i) => ({ price: Math.round(price * (1 + 0.004 * (i + 1) + rng() * 0.003)), count: 1 + Math.floor(rng() * (i === 4 ? 4 : 2)) }));
  return { history, listings, volume: 5 + Math.floor(rng() * 56) };
}

// Biểu đồ giá 30 ngày: đường gấp khúc, ghi giá cao / thấp nhất và 5 mốc ngày.
function PriceChart({ history }: { history: number[] }) {
  const max = Math.max(...history), min = Math.min(...history), span = Math.max(1, max - min);
  const points = history.map((v, i) => `${(i / (history.length - 1)) * 100},${8 + (1 - (v - min) / span) * 84}`).join(' ');
  const today = Date.now();
  return <figure className="sd-chart" aria-label={`Giá 30 ngày: cao nhất ${money(max)}, thấp nhất ${money(min)}`}>
    <span className="sd-chart-max">{money(max)}</span><span className="sd-chart-min">{money(min)}</span>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="8" x2="100" y2="8"/><line x1="0" y1="92" x2="100" y2="92"/><polyline points={points}/></svg>
    <figcaption>{[29, 22, 15, 8, 0].map(d => { const date = new Date(today - d * DAY); return <span key={d}>{date.getDate()}/{date.getMonth() + 1}</span>; })}</figcaption>
  </figure>;
}

// Cửa sổ Bán kiểu FC Online: "Bán từng cá nhân" (tự đặt giá trong khoảng ±10%, bán nhiều thẻ giống nhau một lúc) và
// "Bán hàng loạt" (tick tối đa 99 thẻ, bán cùng một mức: giá phù hợp / thấp nhất / cao nhất). Bán là bán ngay, trừ phí 5%.
export default function SellDialog({ save, initial, free, renderCard, levelBadge, seasonShort, onSell, onClose }: Props) {
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
  const price = Number(priceText.replace(/\D/g, '')) || 0;
  const priceOk = !!range && price >= range.min && price <= range.max;
  // Thẻ giống hệt (cùng cầu thủ + cấp, chưa khóa, không nằm trong đội hình riêng) bán cùng giá; thẻ đang chọn luôn tính.
  const twins = card ? [card, ...save.cards.filter(c => c.uid !== card.uid && c.playerId === card.playerId && c.level === card.level && !locked.has(c.uid) && !squad.has(c.uid))] : [];
  const sellable = card && !locked.has(card.uid) ? twins.length : 0;
  const view = card && range ? marketView(card, range.price) : null;
  const clampPrice = () => { if (!range) return; setPriceText(full(Math.min(range.max, Math.max(range.min, price || range.price)))); };
  const step = (dir: 1 | -1) => { if (!range) return; const unit = Math.max(1, Math.round(range.price / 100)); setPriceText(full(Math.min(range.max, Math.max(range.min, (price || range.price) + dir * unit)))); };
  const sellSingle = () => { if (card && priceOk && count >= 1 && count <= sellable && onSell(twins.slice(0, count).map(c => ({ uid: c.uid, price })))) onClose(); };

  // ---- Bán hàng loạt ----
  const [mode, setMode] = useState<Mode>('fit');
  const [sortDesc, setSortDesc] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const rows = useMemo(() => save.cards.map(c => {
    const r = sellRange(c);
    const reason = locked.has(c.uid) ? 'Đã khóa' : squad.has(c.uid) ? 'Trong đội hình' : !r ? 'Chưa có giá' : null;
    return { card: c, range: r, reason };
  }).sort((a, b) => (sortDesc ? -1 : 1) * (ovr(a.card) - ovr(b.card)) || (b.range?.price ?? -1) - (a.range?.price ?? -1)), [save.cards, locked, squad, sortDesc]);
  const priceFor = (r: NonNullable<ReturnType<typeof sellRange>>) => mode === 'min' ? r.min : mode === 'max' ? r.max : r.price;
  const checkedSet = new Set(checked);
  const chosen = rows.filter(row => checkedSet.has(row.card.uid) && row.range && !row.reason);
  const total = chosen.reduce((sum, row) => sum + priceFor(row.range!), 0);
  const totalFee = chosen.reduce((sum, row) => sum + fee(priceFor(row.range!)), 0);
  const eligible = rows.filter(row => !row.reason);
  const allChecked = eligible.length > 0 && eligible.slice(0, MAX_BULK_SELL).every(row => checkedSet.has(row.card.uid));
  const toggle = (id: string) => setChecked(list => list.includes(id) ? list.filter(x => x !== id) : list.length >= MAX_BULK_SELL ? list : [...list, id]);
  const sellBulk = () => { if (chosen.length && onSell(chosen.map(row => ({ uid: row.card.uid, price: priceFor(row.range!) })))) { setChecked([]); onClose(); } };

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
        <div className="sd-book-table" role="table" aria-label="Sổ lệnh mô phỏng">
          <div className="sd-book-head" role="row"><span>Đang bán</span><span>Giá</span><span>Số lượng mua</span></div>
          {Array.from({ length: 8 }, (_, i) => <div key={`b${i}`} className="sd-book-row is-buy" role="row"><span/><span>-</span><span/></div>)}
          {view?.listings.map((l, i) => <div key={`s${i}`} className="sd-book-row is-sell" role="row"><span>{l.count}</span><span>{money(l.price)}</span><span/></div>)}
          {Array.from({ length: 3 }, (_, i) => <div key={`e${i}`} className="sd-book-row is-sell" role="row"><span/><span>-</span><span/></div>)}
        </div>
      </section>
      <section className="sd-form">
        <dl className="sd-stats">
          <div><dt>Khối lượng giao dịch 2 giờ</dt><dd>{view?.volume ?? 0}<small> lần</small></dd></div>
          <div><dt>Giá tối thiểu</dt><dd>{range ? money(range.min) : '—'}</dd></div>
          <div><dt>Giá tối đa</dt><dd>{range ? money(range.max) : '—'}</dd></div>
        </dl>
        <label className="sd-field"><span>Giá</span>
          <input inputMode="numeric" value={priceText} disabled={!range} aria-invalid={!!range && !priceOk} onChange={e => setPriceText(e.target.value.replace(/\D/g, '') ? full(Number(e.target.value.replace(/\D/g, ''))) : '')} onBlur={clampPrice} onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); step(1); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); } }}/>
        </label>
        <p className={`sd-price-note ${range && !priceOk ? 'is-error' : ''}`}>{!range ? marketPriceMissing(card) : !priceOk ? `Giá phải từ ${money(range.min)} đến ${money(range.max)} (±${SELL_BAND_PERCENT}% giá thị trường)` : `${money(price)} · nhận ${money((price - fee(price)) * count)} BP sau phí ${MARKET_FEE_PERCENT}%`}</p>
        <div className="sd-row"><span>Số lượng bán</span><div className="sd-stepper"><b>{count}</b><span><button aria-label="Tăng số lượng" disabled={count >= sellable} onClick={() => setCount(c => Math.min(sellable, c + 1))}><ChevronUp size={14}/></button><button aria-label="Giảm số lượng" disabled={count <= 1} onClick={() => setCount(c => Math.max(1, c - 1))}><ChevronDown size={14}/></button></span></div></div>
        <div className="sd-row"><span>Số lượng có thể bán</span><b className="sd-big">{sellable}</b></div>
        {locked.has(card.uid) && <p className="sd-price-note is-error">Thẻ đang bị khóa. Mở khóa trước khi bán.</p>}
        <div className="sd-actions"><button className="sd-sell" disabled={!priceOk || !sellable} onClick={sellSingle}>Bán cầu thủ</button><button className="sd-cancel" onClick={onClose}>Hủy</button></div>
      </section>
    </div> : <div className="sd-empty"><p>Chọn một cầu thủ ở tab Bán hàng loạt (bấm vào tên) để bán lẻ với giá tự đặt.</p><button className="sd-cancel" onClick={() => setTab('bulk')}>Đến Bán hàng loạt</button></div>)

    : <div className="sd-bulk">
      <div className="sd-bulk-head" role="row">
        <input type="checkbox" aria-label="Chọn tất cả (tối đa 99)" checked={allChecked} disabled={!eligible.length} onChange={() => setChecked(allChecked ? [] : eligible.slice(0, MAX_BULK_SELL).map(row => row.card.uid))}/>
        <span>Tên cầu thủ</span><span>Lương</span><button className="sd-sort" onClick={() => setSortDesc(d => !d)} aria-label={`Sắp xếp OVR ${sortDesc ? 'tăng dần' : 'giảm dần'}`}>OVR{sortDesc ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button><span>Thẻ</span><span>Giá bán</span>
      </div>
      <div className="sd-bulk-rows" role="table" aria-label="Cầu thủ có thể bán">
        {rows.map(({ card: c, range: r, reason }) => { const pl = getPlayer(c), on = checkedSet.has(c.uid); return <div key={c.uid} role="row" className={`sd-bulk-row ${on ? 'is-on' : ''} ${reason ? 'is-off' : ''}`}>
          {reason ? <span className="sd-reason" title={reason}/> : <input type="checkbox" checked={on} onChange={() => toggle(c.uid)} aria-label={`Chọn ${pl.name} +${c.level}`}/>}
          <span className="sd-name"><span className="squad-face sd-face"><img src={pl.cardFace || pl.image || asset('/assets/silhouette.svg')} alt=""/></span><b className={`squad-season season-tag-${pl.tier}`}>{seasonShort(pl.tier)}</b>{reason ? <strong>{pl.name}</strong> : <button className="sd-name-link" onClick={() => pick(c)} title="Bán lẻ với giá tự đặt">{pl.name}</button>}{reason && <em>{reason}</em>}</span>
          <span className="squad-wage"><b>{pl.wage ?? 0}</b></span>
          <strong className="sd-ovr">{ovr(c)}</strong>
          <span><img className="sd-level" src={levelBadge(c.level)} alt={`+${c.level}`}/></span>
          <strong className="sd-price">{r && !reason ? money(priceFor(r)) : '0'}</strong>
        </div>; })}
        {!rows.length && <p className="sd-muted">Kho chưa có cầu thủ.</p>}
      </div>
      <footer className="sd-bulk-foot">
        <div className="sd-bulk-sum">
          <span className="sd-fee">Chi phí bán<i title={`Phí ${MARKET_FEE_PERCENT}% giá bán của mỗi thẻ`}>?</i><b>{money(totalFee)}</b></span>
          <select value={mode} onChange={e => setMode(e.target.value as Mode)} aria-label="Mức giá bán hàng loạt">{MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          <span className="sd-total">Tổng giá trị<b>{money(total)}</b></span>
        </div>
        <div className="sd-actions">
          <span className="sd-count">{chosen.length} / {MAX_BULK_SELL}<i title={`Mỗi lần bán tối đa ${MAX_BULK_SELL} cầu thủ; thẻ khóa, thẻ trong đội hình riêng và thẻ chưa có giá không bán được`}>?</i></span>
          <button className="sd-sell" disabled={!chosen.length} onClick={sellBulk}>Bán SL lớn cầu thủ</button><button className="sd-cancel" onClick={onClose}>Hủy</button>
        </div>
        {free && <p className="sd-muted">Chế độ thử nghiệm: bán không cộng BP.</p>}
      </footer>
    </div>}
  </div></div>;
}
const marketPriceMissing = (card: Card) => `Chưa có giá ${getPlayer(card).name} +${card.level} trong bảng giá.`;
