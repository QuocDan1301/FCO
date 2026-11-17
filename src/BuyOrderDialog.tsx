import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { MAX_LEVEL, getPlayer, money } from './game';
import type { Card, Tier } from './game';
import { SELL_BAND_PERCENT, SYSTEM_BUY_LEVEL, hasSystemSale, sellRange } from './market';
import type { MarketDepth } from './inventory-server';
import { PriceChart, priceHistory } from './SellDialog';
import LevelPicker from './LevelPicker';
import './sell.css';
import './buy-order.css';

// Cửa sổ Mua cầu thủ kiểu FC Online (chợ giữa người chơi, migration 202611170002; hệ thống bán +1 và hàng phôi nhóm 1), cùng bố cục cửa sổ Bán:
//   thẻ + biểu đồ giá 30 ngày | tên + chọn cấp + sổ lệnh thật (8 dòng đặt mua, 8 dòng đang bán gồm hệ thống) | thông số, giá, số lượng, tổng.
//   • Mua thường: tự đặt giá trong ±10% — có người bán giá ≤ giá đặt thì mua ngay theo giá đó, không thì giữ BP treo lệnh tới khi khớp (không hết hạn, huỷ thì trả BP).
//   • Mua ngay: mua luôn theo giá bán thấp nhất đang có (không treo lệnh), mua được bao nhiêu báo bấy nhiêu.
type Tab = 'order' | 'now';
type Props = {
  card: Pick<Card, 'playerId' | 'level'>;
  balance: number;
  renderCard: (card: Card) => ReactNode;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
  loadDepth: (playerId: number, level: number) => Promise<MarketDepth>;
  // Mua thường: count lệnh cùng giá. Mua ngay: tối đa count thẻ, mỗi thẻ không quá maxPrice (fco_mkt_bulk_buy).
  onPlace: (card: Pick<Card, 'playerId' | 'level'>, price: number, count: number) => Promise<boolean>;
  onBuyNow: (card: Pick<Card, 'playerId' | 'level'>, count: number, maxPrice: number) => Promise<boolean>;
  onClose: () => void;
};
const MAX_COUNT = 10;
const BOOK_ROWS = 8;
const fullFormat = new Intl.NumberFormat('en-US');
type Level = { price: number; count: number | string; system?: boolean } | null;

export default function BuyOrderDialog({ card: initial, balance, renderCard, levelBadge, seasonShort, loadDepth, onPlace, onBuyNow, onClose }: Props) {
  const [level, setLevel] = useState(initial.level);
  const card = { playerId: initial.playerId, level };
  const player = getPlayer(card), range = sellRange(card);
  const levels = useMemo(() => Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).filter(lv => sellRange({ playerId: initial.playerId, level: lv })), [initial.playerId]);
  const [tab, setTab] = useState<Tab>('order');
  const [depth, setDepth] = useState<MarketDepth | null>(null);
  const [depthError, setDepthError] = useState(false);
  const [priceText, setPriceText] = useState(() => range ? fullFormat.format(range.price) : '');
  const [touched, setTouched] = useState(false);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setDepth(null); setDepthError(false);
    const load = () => loadDepth(card.playerId, level).then(d => { if (alive) { setDepth(d); setDepthError(false); } }).catch(() => { if (alive) setDepthError(true); });
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [card.playerId, level]);
  const changeLevel = (lv: number) => { const r = sellRange({ playerId: card.playerId, level: lv }); setLevel(lv); setPriceText(r ? fullFormat.format(r.price) : ''); setTouched(false); setCount(1); };

  // Hệ thống bán: +1 không giới hạn, hàng phôi (nhóm 1) mọi cấp có giới hạn mỗi phút (depth.sys); chưa tải sổ lệnh thì tạm coi +1 không giới hạn.
  const sysOffer = depth ? depth.sys ?? null : level <= SYSTEM_BUY_LEVEL && range && hasSystemSale(card) ? { price: range.price, left: null } : null;
  const systemPrice = sysOffer && (sysOffer.left === null || sysOffer.left > 0) ? sysOffer.price : null;
  const asks = useMemo(() => {
    const list: NonNullable<Level>[] = (depth?.asks ?? []).map(a => ({ ...a }));
    if (systemPrice !== null) {
      const same = list.find(a => a.price === systemPrice), n = sysOffer!.left;
      if (same) same.count = n === null ? '∞' : Number(same.count) + n; else list.push({ price: systemPrice, count: n ?? '∞', system: true });
    }
    return list.sort((a, b) => a.price - b.price);
  }, [depth, systemPrice]);
  const bestAsk = asks[0]?.price ?? null;
  const atBest = asks[0] ? (asks[0].count === '∞' ? Infinity : Number(asks[0].count)) : 0;
  // Chưa tự sửa giá thì đề xuất giá bán thấp nhất trong khung (mua ngay được).
  useEffect(() => { if (!touched && bestAsk && range && bestAsk >= range.min && bestAsk <= range.max) setPriceText(fullFormat.format(bestAsk)); }, [bestAsk, touched, level]);
  const pad = (list: Level[], top: boolean) => { const out = list.slice(0, BOOK_ROWS), fill = Array<Level>(BOOK_ROWS - out.length).fill(null); return top ? [...fill, ...out] : [...out, ...fill]; };
  const bidRows = pad([...(depth?.bids ?? [])].sort((a, b) => a.price - b.price).slice(-BOOK_ROWS), true);
  const askRows = pad(asks, false);

  const typed = Number(priceText.replace(/\D/g, '')) || 0;
  const price = tab === 'now' ? bestAsk ?? 0 : typed;
  const priceOk = tab === 'now' ? bestAsk !== null : !!range && price >= range.min && price <= range.max;
  const maxCount = tab === 'now' ? Math.max(1, Math.min(MAX_COUNT, atBest)) : MAX_COUNT;
  const shownCount = Math.min(count, maxCount);
  const total = price * shownCount;
  const enough = balance >= total;
  const instant = tab === 'now' || (bestAsk !== null && price >= bestAsk);
  const pickPrice = (value: number) => { if (!range) return; setTab('order'); setTouched(true); setPriceText(fullFormat.format(Math.min(range.max, Math.max(range.min, value)))); };
  const pick = (value: number, label: string) => <button className="sd-pick" onClick={() => pickPrice(value)} title={label}>{money(value)}</button>;
  const step = (dir: 1 | -1) => { if (!range) return; const unit = Math.max(1, Math.round(range.price / 100)); setTouched(true); setPriceText(fullFormat.format(Math.min(range.max, Math.max(range.min, (typed || range.price) + dir * unit)))); };
  const submit = async () => {
    if (!priceOk || !enough || busy) return;
    setBusy(true);
    try { if (await (tab === 'now' ? onBuyNow(card, shownCount, price) : onPlace(card, price, shownCount))) onClose(); } finally { setBusy(false); }
  };
  const note = !range ? 'Thẻ này chưa có giá.'
    : tab === 'now' && bestAsk === null ? 'Chưa có ai bán thẻ này. Dùng Mua thường để đặt mua.'
    : !priceOk ? `Giá phải từ ${money(range.min)} đến ${money(range.max)} (±${SELL_BAND_PERCENT}% giá tham chiếu).`
    : !enough ? 'Bạn không có đủ BP'
    : tab === 'now' ? `Mua ngay giá ${money(bestAsk!)}${asks[0]?.system ? ' của hệ thống' : ''}.`
    : instant ? `Có người bán ${money(bestAsk!)}: mua ngay theo giá đó.` : 'Chưa ai bán giá này: giữ BP, treo lệnh mua tới khi có người bán (không hết hạn; huỷ ở Lịch sử chuyển nhượng thì trả lại BP).';
  const full = { uid: `market-${card.playerId}-${level}`, playerId: card.playerId, level, received: 0 };

  return <div className="sd-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}><div className="sd bo" role="dialog" aria-modal="true" aria-labelledby="bo-title">
    <header className="sd-head"><h2 id="bo-title">Mua cầu thủ</h2><button className="sd-x" onClick={onClose} aria-label="Đóng"><X size={22}/></button></header>
    <nav className="sd-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'order'} onClick={() => setTab('order')}>Mua thường</button>
      <button role="tab" aria-selected={tab === 'now'} disabled={bestAsk === null} onClick={() => { setTab('now'); setCount(1); }} title={bestAsk === null ? 'Chưa có ai bán thẻ này' : 'Mua luôn theo giá bán thấp nhất'}>Mua ngay</button>
    </nav>
    <div className="sd-single">
      <aside className="sd-left">
        <div className="sd-card">{renderCard(full)}</div>
        {range ? <PriceChart history={priceHistory(card, range.price)}/> : <p className="sd-muted">Chưa có lịch sử giá.</p>}
      </aside>
      <section className="sd-book">
        <h3><b className={`squad-season season-tag-${player.tier}`}>{seasonShort(player.tier)}</b>{player.name}
          <LevelPicker value={level} levels={levels} levelBadge={levelBadge} onChange={changeLevel} tone="light"/>
        </h3>
        <div className="sd-book-table" role="table" aria-label="Sổ lệnh">
          <div className="sd-book-head" role="row"><span>Đang bán</span><span>Giá</span><span>Số lượng mua</span></div>
          {bidRows.map((b, i) => <div key={`b${i}`} className="sd-book-row is-buy" role="row"><span/><span>{b ? pick(b.price, 'Đặt giá này') : '-'}</span><span>{b ? b.count : ''}</span></div>)}
          {askRows.map((a, i) => <div key={`a${i}`} className={`sd-book-row is-sell${a?.system ? ' is-system' : ''}`} role="row" title={a?.system ? 'Hệ thống bán' : undefined}><span>{a ? a.count : ''}</span><span>{a ? pick(a.price, 'Đặt giá này') : '-'}</span><span/></div>)}
        </div>
        {depthError && <p className="sd-muted">Không tải được sổ lệnh.</p>}
      </section>
      <section className="sd-form">
        <dl className="sd-stats">
          <div><dt>Khối lượng giao dịch 2 giờ</dt><dd>{depth?.volume ?? 0}<small> lần</small></dd></div>
          <div><dt>Giá tối thiểu</dt><dd>{range ? pick(range.min, 'Đặt giá tối thiểu') : '—'}</dd></div>
          <div><dt>Giá tối đa</dt><dd>{range ? pick(range.max, 'Đặt giá tối đa') : '—'}</dd></div>
        </dl>
        <label className="sd-field"><span>Giá</span>
          <input inputMode="numeric" value={tab === 'now' ? (bestAsk !== null ? fullFormat.format(bestAsk) : '') : priceText} readOnly={tab === 'now'} disabled={!range} aria-invalid={tab === 'order' && !!range && !priceOk}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); setTouched(true); setPriceText(v ? fullFormat.format(Number(v)) : ''); }}
            onBlur={() => { if (range && tab === 'order') setPriceText(fullFormat.format(Math.min(range.max, Math.max(range.min, typed || range.price)))); }}
            onKeyDown={e => { if (tab !== 'order') return; if (e.key === 'ArrowUp') { e.preventDefault(); step(1); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); } }}/>
        </label>
        <p className="sd-price-note">{price ? money(price) : ''}</p>
        <div className="sd-row"><span>Số lượng mua</span><div className="sd-stepper"><b>{shownCount}</b><span><button aria-label="Tăng số lượng" disabled={shownCount >= maxCount} onClick={() => setCount(Math.min(maxCount, shownCount + 1))}><ChevronUp size={14}/></button><button aria-label="Giảm số lượng" disabled={shownCount <= 1} onClick={() => setCount(Math.max(1, shownCount - 1))}><ChevronDown size={14}/></button></span></div></div>
        <div className="bo-total"><span>Tổng giá trị</span><b>{money(total)}</b></div>
        <p className={`bo-note${range && (!priceOk || !enough) ? ' is-error' : ''}`}>{note}</p>
        <div className="sd-actions"><button className="sd-sell" disabled={!priceOk || !enough || busy} onClick={() => void submit()}>{busy ? 'Đang gửi…' : 'Mua cầu thủ'}</button><button className="sd-cancel" onClick={onClose}>Hủy</button></div>
      </section>
    </div>
  </div></div>;
}