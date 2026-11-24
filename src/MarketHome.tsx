import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getPlayer, MAX_LEVEL, money, players } from './game';
import type { Card } from './game';
import { PRICE_PERIOD_MS, marketNow, priceAt } from './market';
import { SeasonBadge } from './badges';
import { usePricePeriod } from './use-price-period';
import './market-home.css';

// Trang "Cầu thủ phổ biến" của TTCN, kiểu FC Online (người dùng 2026-11-24): 3 thẻ nổi bật (Giá tăng đột ngột · Lượt xem tối đa · Giá cao nhất)
// và 3 cột xếp hạng bên dưới. Tính từ bảng giá hiện tại (priceAt), chỉ để xem; bấm thẻ / dòng để mở thông tin cầu thủ.
const card = (playerId: number, level: number): Card => ({ uid: `market-${playerId}-${level}`, playerId, level, received: 0 });
type Jump = { id: number; now: number; before: number; abs: number; pct: number };
type Peak = { id: number; level: number; price: number };

// Giá mỗi kỳ (5 giờ) đổi một lần: so giá hiện tại với kỳ trước ở +1; cao nhất = mức cấp có giá lớn nhất của từng cầu thủ.
function compute(now: number) {
  const jumps: Jump[] = [], peaks: Peak[] = [];
  for (const p of players) {
    const a = priceAt({ playerId: p.id, level: 1 }, now), b = priceAt({ playerId: p.id, level: 1 }, now - PRICE_PERIOD_MS);
    if (a && b && a > b) jumps.push({ id: p.id, now: a, before: b, abs: a - b, pct: (a - b) / b * 100 });
    let best: Peak | null = null;
    for (let level = 1; level <= MAX_LEVEL; level++) { const price = priceAt({ playerId: p.id, level }, now); if (price && (!best || price > best.price)) best = { id: p.id, level, price }; }
    if (best) peaks.push(best);
  }
  return { byPct: [...jumps].sort((x, y) => y.pct - x.pct), byAbs: [...jumps].sort((x, y) => y.abs - x.abs), peaks: peaks.sort((x, y) => y.price - x.price) };
}

// Giá rất lớn: money() dừng ở B (tỷ), nên trên 1.000B đổi sang T (nghìn tỷ) và Q (triệu tỷ) cho gọn (1410000B → 1.41Q).
const compact = (n: number) => n >= 1e15 ? `${+(n / 1e15).toPrecision(3)}Q` : n >= 1e12 ? `${+(n / 1e12).toPrecision(3)}T` : money(n);

type Row = { key: string; card: Card; value: ReactNode; extra?: ReactNode };
function Rank({ title, rows, onOpen, flat }: { title?: string; rows: Row[]; onOpen: (card: Card) => void; flat?: boolean }) {
  return <section className={`mk-rank${flat ? ' is-flat' : ''}`}>
    {title && <h3>{title}</h3>}
    <ol>{rows.map((row, i) => { const p = getPlayer(row.card); return <li key={row.key} className={i === 0 ? 'is-top' : ''}><button type="button" onClick={() => onOpen(row.card)}>
      <i>{i + 1}</i><SeasonBadge tier={p.tier}/><span className="mk-rank-name">{p.name}</span><b>{row.value}</b>{row.extra}</button></li>; })}</ol>
  </section>;
}

export default function MarketHome({ renderCard, levelBadge, viewed, onOpen }: { renderCard: (card: Card) => ReactNode; levelBadge: (level: number) => string; viewed: { id: number; views: number }[]; onOpen: (card: Card) => void }) {
  const period = usePricePeriod();
  const data = useMemo(() => compute(marketNow()), [period]);
  const known = viewed.filter(v => players.some(p => p.id === v.id));
  const topJump = data.byPct[0], topView = known[0], topPeak = data.peaks[0];
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).formatToParts(new Date(marketNow())), today = `${parts.find(x => x.type === 'month')?.value}.${parts.find(x => x.type === 'day')?.value}`;
  const cardPos = (c: Card) => getPlayer(c).pos;
  return <div className="mk-home">
    <div className="mk-hero">
      <section className="mk-feature">
        <small>Giá tăng đột ngột</small>
        {topJump ? <>
          <b className="mk-big">{compact(topJump.now)} <em>BP</em></b>
          <span className="mk-sub">{compact(topJump.before)} <u>▲</u> {topJump.pct.toFixed(2)}%</span>
          <button type="button" className="mk-card" onClick={() => onOpen(card(topJump.id, 1))} aria-label={`Xem ${getPlayer(card(topJump.id, 1)).name}`}>{renderCard(card(topJump.id, 1))}</button>
        </> : <span className="mk-sub">Chưa có biến động giá</span>}
      </section>
      <section className="mk-feature">
        <small>Lượt xem tối đa</small>
        {topView ? <>
          <b className="mk-big">{topView.views.toLocaleString('en-US')} <em>Số lần</em></b>
          <span className="mk-sub mk-pos">{cardPos(card(topView.id, 1))}</span>
          <button type="button" className="mk-card is-main" onClick={() => onOpen(card(topView.id, 1))} aria-label={`Xem ${getPlayer(card(topView.id, 1)).name}`}>{renderCard(card(topView.id, 1))}</button>
        </> : <span className="mk-sub">Đang thống kê lượt xem…</span>}
      </section>
      <section className="mk-feature">
        <small>Giá cao nhất</small>
        {topPeak ? <>
          <b className="mk-big">{compact(topPeak.price)} <em>BP</em></b>
          <span className="mk-sub">{today} Tiêu chuẩn</span>
          <button type="button" className="mk-card" onClick={() => onOpen(card(topPeak.id, topPeak.level))} aria-label={`Xem ${getPlayer(card(topPeak.id, topPeak.level)).name}`}>{renderCard(card(topPeak.id, topPeak.level))}</button>
        </> : <span className="mk-sub">Chưa có giá</span>}
      </section>
    </div>
    <div className="mk-lists">
      <div className="mk-col">
        <Rank title="Giá đã tăng" onOpen={onOpen} rows={data.byAbs.slice(0, 3).map(j => ({ key: `a${j.id}`, card: card(j.id, 1), value: compact(j.now) }))}/>
        <Rank title="Tỉ lệ tăng lên" onOpen={onOpen} rows={data.byPct.slice(0, 3).map(j => ({ key: `p${j.id}`, card: card(j.id, 1), value: compact(j.now) }))}/>
      </div>
      <div className="mk-col">
        {known.length ? <Rank flat onOpen={onOpen} rows={known.slice(0, 8).map(v => ({ key: `v${v.id}`, card: card(v.id, 1), value: compact(priceAt({ playerId: v.id, level: 1 }) ?? 0) }))}/> : <p className="mk-empty">Đang thống kê lượt xem…<small>Mở Thông tin cầu thủ của bất kỳ thẻ nào để góp lượt xem.</small></p>}
      </div>
      <div className="mk-col">
        <Rank flat onOpen={onOpen} rows={data.peaks.slice(0, 8).map(x => ({ key: `h${x.id}`, card: card(x.id, x.level), value: compact(x.price), extra: <img className="mk-level" src={levelBadge(x.level)} alt={`+${x.level}`}/> }))}/>
      </div>
    </div>
  </div>;
}
