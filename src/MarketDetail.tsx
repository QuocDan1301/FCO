import { getPlayer, MAX_LEVEL, money, ovr } from './game';
import type { Card, Save } from './game';
import { useEffect, useState } from 'react';
import { hasSystemSale, isTradeLocked, marketQuote, marketNow, priceAt, PRICE_PERIOD_MS, SYSTEM_BUY_LEVEL } from './market';
import type { BookLevel } from './inventory-server';
import type { MarketTrade } from './market';
import type { ReactNode } from 'react';
import './market-detail.css';

// Khung chi tiết cầu thủ bên phải TTCN, bố cục kiểu FC Online (người dùng 2026-11-17):
// thẻ + giá (trên trái) · biểu đồ giá 7 ngày (trên phải) · bảng 13 cấp (OVR, giá mua, biến động so với kỳ trước, tiền nhận khi bán,
// số thẻ đang có) · nút Mua cầu thủ / Bán. Bấm một dòng để chọn cấp; thẻ, biểu đồ và hai nút theo cấp đang chọn.
// Giá là giá hệ thống (không có lệnh mua / bán giữa người chơi): lịch sử tính lại đúng theo từng kỳ 5 giờ (priceAt quá khứ).
type Props = {
  card: Card;
  save: Save;
  free: boolean;
  taxPercent: number;
  levelBadge: (level: number) => string;
  renderCard: (card: Card) => ReactNode;
  onDetail?: (card: Card) => void;
  onTrade: (trade: MarketTrade) => void;
  onLevel: (level: number) => void;
  // Sổ lệnh thật của cầu thủ (chợ giữa người chơi); không có (chưa kết nối máy chủ) thì các cột lệnh để trống.
  loadBook?: (playerId: number) => Promise<BookLevel[]>;
};

const CHART_DAYS = 7, CHART_W = 300, CHART_H = 150, PAD_L = 4, PAD_R = 4, PAD_T = 14, PAD_B = 22;
const dayLabel = (at: number) => new Date(at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

function PriceChart({ card }: { card: Card }) {
  const now = marketNow(), count = Math.round(CHART_DAYS * 24 * 3_600_000 / PRICE_PERIOD_MS) + 1;
  const points = Array.from({ length: count }, (_, i) => { const at = now - (count - 1 - i) * PRICE_PERIOD_MS; return { at, price: priceAt(card, at) }; });
  const prices = points.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  if (!prices.length) return <div className="md-chart is-empty">Chưa có giá</div>;
  const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || hi * .1 || 1;
  const x = (i: number) => PAD_L + (CHART_W - PAD_L - PAD_R) * i / (count - 1);
  const y = (p: number) => PAD_T + (CHART_H - PAD_T - PAD_B) * (1 - (p - (lo - span * .15)) / (span * 1.3));
  const line = points.map((p, i) => p.price ? `${x(i).toFixed(1)},${y(p.price).toFixed(1)}` : '').filter(Boolean).join(' ');
  const ticks = [0, .25, .5, .75, 1].map(k => Math.round(k * (count - 1)));
  const last = points[count - 1].price ?? lo;
  return <div className="md-chart">
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-label={`Biểu đồ giá ${CHART_DAYS} ngày`} role="img">
      {[.2, .5, .8].map(k => <line key={k} className="md-grid" x1={PAD_L} x2={CHART_W - PAD_R} y1={PAD_T + (CHART_H - PAD_T - PAD_B) * k} y2={PAD_T + (CHART_H - PAD_T - PAD_B) * k}/>)}
      <polyline className="md-line" points={line}/>
      <circle className="md-dot" cx={x(count - 1)} cy={y(last)} r="3"/>
    </svg>
    <span className="md-hi" title="Giá cao nhất 7 ngày">{money(hi)}</span>
    <span className="md-lo" title="Giá thấp nhất 7 ngày">{money(lo)}</span>
    <div className="md-days">{ticks.map(i => <span key={i}>{dayLabel(points[i].at)}</span>)}</div>
  </div>;
}

export default function MarketDetail({ card, save, free, taxPercent, levelBadge, renderCard, onDetail, onTrade, onLevel, loadBook }: Props) {
  const player = getPlayer(card), locked = isTradeLocked(card);
  const [book, setBook] = useState<Map<number, BookLevel> | null>(null);
  useEffect(() => {
    if (!loadBook) { setBook(null); return; }
    let alive = true;
    const load = () => loadBook(card.playerId).then(rows => { if (alive) setBook(new Map(rows.map(r => [r.level, r]))); }).catch(() => { /* giữ bảng cũ, lượt sau thử lại */ });
    setBook(null); void load();
    const timer = window.setInterval(load, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loadBook, card.playerId]);
  // Vừa mua / bán xong (số dư đổi) thì tải lại sổ lệnh ngay, không chờ lượt 15 giây — số lượng hệ thống còn bán giảm theo liền.
  const [seenBalance, setSeenBalance] = useState(save.balance);
  useEffect(() => {
    if (save.balance === seenBalance) return;
    setSeenBalance(save.balance);
    if (!loadBook) return;
    let alive = true;
    void loadBook(card.playerId).then(rows => { if (alive) setBook(new Map(rows.map(r => [r.level, r]))); }).catch(() => {});
    return () => { alive = false; };
  }, [save.balance]);
  const owned = save.cards.filter(c => c.playerId === card.playerId);
  const quote = marketQuote(card, taxPercent);
  // Thẻ để bán ở cấp đang chọn: chính thẻ đang xem nếu là thẻ trong kho, không thì thẻ cùng cầu thủ cùng cấp đầu tiên.
  const sellCard = owned.find(c => c.uid === card.uid) ?? owned.find(c => c.level === card.level);
  // +1 mua thẳng của hệ thống; từ +2 đặt mua từ người chơi (cửa sổ Đặt mua tự kiểm số dư theo giá đặt).
  const systemBuy = (card.level <= SYSTEM_BUY_LEVEL && hasSystemSale(card)) || !!book?.get(card.level)?.sysPrice;
  const canBuy = !locked && quote.available && (!!loadBook || !systemBuy || free || save.balance >= (quote.price ?? Infinity));
  return <aside className="market-preview md" aria-label="Cầu thủ đang xem">
    <div className="md-top">
      <div className="md-card">
        {onDetail ? <button type="button" className="md-card-art is-link" onClick={() => onDetail(card)} aria-label={`Thông tin ${player.name}`}>{renderCard(card)}</button> : <div className="md-card-art">{renderCard(card)}</div>}
        <div className="md-price"><span title="Giá tham chiếu của hệ thống; lệnh đặt trong ±10% giá này">Giá cầu thủ</span><b>{quote.price === null ? '—' : money(quote.price)}</b></div>
      </div>
      <PriceChart card={card}/>
    </div>
    <div className="md-table" role="table" aria-label={`Giá ${player.name} theo cấp thẻ`}>
      <div className="md-row md-head" role="row"><span role="columnheader">Nâng cấp</span><span role="columnheader">OVR</span><span role="columnheader" title="Lệnh đặt mua giá cao nhất của người chơi">Giá mua cao nhất</span><span role="columnheader" title="Số lệnh đặt mua">SL</span><span role="columnheader" title="Lệnh treo bán giá thấp nhất của người chơi">Giá bán thấp nhất</span><span role="columnheader" title="Số lệnh treo bán">SL</span></div>
      {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(level => {
        const row = { playerId: card.playerId, level }, b = book?.get(level);
        // Hệ thống bán: theo sổ lệnh máy chủ (nhóm 1 / hàng phôi mọi cấp, giới hạn mỗi phút; nhóm khác +1 không giới hạn);
        // chưa có sổ lệnh thì tạm hiện +1 không giới hạn. Lệnh người chơi rẻ hơn thì hiện giá và số lệnh của người chơi.
        const sys = b ? (b.sysPrice ?? null) : level <= SYSTEM_BUY_LEVEL && hasSystemSale(row) ? marketQuote(row).price : null;
        const sysLeft = b ? b.sysLeft ?? null : null;
        const playerCheaper = !!b?.ask && (sys === null || b.ask < sys);
        const ask = playerCheaper ? b!.ask : sys !== null && sys > 0 ? sys : null;
        return <button type="button" role="row" key={level} className={`md-row${level === card.level ? ' is-on' : ''}`} aria-pressed={level === card.level} onClick={() => onLevel(level)}>
          <span role="cell" className="md-lv"><img src={levelBadge(level)} alt={`+${level}`}/></span>
          <span role="cell" className="md-ovr">{ovr(row)}</span>
          <span role="cell" className="md-buy">{b?.bid ? money(b.bid) : '-'}</span>
          <span role="cell" className="md-cnt is-bid">{b?.bids || '-'}</span>
          <span role="cell" className="md-sell">{ask ? money(ask) : '-'}</span>
          <span role="cell" className="md-cnt is-ask" title={!playerCheaper && sys ? (sysLeft === null ? 'Hệ thống bán không giới hạn' : 'Hệ thống còn bán trong phút này — sang phút mới hệ thống treo thêm lượt mới') : undefined}>{playerCheaper ? b!.asks : sys ? (sysLeft === null ? '∞' : sysLeft) : '-'}</span>
        </button>;
      })}
    </div>
    <div className="md-actions">
      <button type="button" className="md-btn-buy" disabled={!canBuy} onClick={() => onTrade({ kind: 'buy', card: { playerId: card.playerId, level: card.level, uid: `market-${card.playerId}-${card.level}`, received: 0 } })}>{systemBuy ? 'Mua cầu thủ' : 'Đặt mua'}</button>
      <button type="button" className="md-btn-sell" disabled={locked || !sellCard || !quote.available} onClick={() => sellCard && onTrade({ kind: 'sell', card: sellCard })}>Bán</button>
    </div>
  </aside>;
}