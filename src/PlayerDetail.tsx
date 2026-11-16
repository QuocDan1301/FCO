import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { X, Zap } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card } from './game';
import { seasonShort } from './badges';
import { NOT_CLUBS, playerClubs, playerPositions, positionGroup, slotOvr } from './squad';
import { PRICE_EPOCH, PRICE_PERIOD_MS, formatMarketPrice, marketNow, priceAt } from './market';
import { playerStats } from './player-stats';
import { flagImageUrl } from './flags';
import { goldExtras, goldTraitIcon, goldTraitName, goldTraitOf } from './gold-traits';
import type { GoldSlot } from './gold-traits';
import GoldExtraPicker from './GoldExtraPicker';
import { minifaceOptions, portraitOf } from './portraits';
import './player-detail.css';

type Props = {
  card: Card;
  // Phần OVR cộng thêm (team color + đội hình riêng), giống trên thẻ.
  bonus?: number;
  maxLevel: number;
  levelBadge: (level: number) => string;
  renderCard: (card: Card) => ReactNode;
  onUpgrade?: () => void;
  onClose: () => void;
  // Miniface (ảnh mặt trên sân / dòng): lựa chọn hiện tại của cầu thủ này (null = mặc định) và hàm đổi. Không truyền = không cho đổi.
  miniface?: { value: string | null; onChoose: (value: string | null) => void };
  // CSA vàng thêm (+7 / +11) của thẻ mình; không truyền = chỉ xem.
  onGold?: (slot: GoldSlot, trait: string | null) => Promise<void> | void;
};

const DAY = 86_400_000, HISTORY_DAYS = 14;
const dayLabel = (at: number) => new Date(at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric' });

// Lịch sử giá: mỗi kỳ 5 giờ một điểm, 14 ngày gần nhất (không trước lúc bắt đầu giá dao động).
export function priceHistory(card: Pick<Card, 'playerId' | 'level'>, now = marketNow()) {
  const from = Math.max(PRICE_EPOCH, now - HISTORY_DAYS * DAY), out: { at: number; price: number }[] = [];
  for (let at = PRICE_EPOCH + Math.ceil((from - PRICE_EPOCH) / PRICE_PERIOD_MS) * PRICE_PERIOD_MS; at <= now; at += PRICE_PERIOD_MS) {
    const price = priceAt(card, at + 1);
    if (price !== null) out.push({ at, price });
  }
  const current = priceAt(card, now);
  if (current !== null && (!out.length || out[out.length - 1].at < now)) out.push({ at: now, price: current });
  return out;
}

function PriceChart({ points }: { points: { at: number; price: number }[] }) {
  const W = 400, H = 170, L = 8, R = 392, T = 22, B = 140;
  const prices = points.map(p => p.price), max = Math.max(...prices), min = Math.min(...prices), span = max - min || max * .1 || 1;
  const t0 = points[0].at, t1 = points[points.length - 1].at, tw = t1 - t0 || 1;
  const xy = points.map(p => [L + (p.at - t0) / tw * (R - L), B - (p.price - min) / span * (B - T)] as const);
  const peak = prices.indexOf(max), last = xy.length - 1;
  // Mốc ngày dưới trục: 5 điểm chia đều, bỏ ngày trùng (khoảng ngắn hơn 5 ngày).
  const seen = new Set<string>(), ticks = Array.from({ length: 5 }, (_, i) => t0 + tw * i / 4).filter(at => { const k = dayLabel(at); if (seen.has(k)) return false; seen.add(k); return true; });
  return <svg className="pd-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Giá từ ${money(min)} đến ${money(max)} BP`}>
    {[0, .5, 1].map(f => <line key={f} x1={L} x2={R} y1={T + (B - T) * f} y2={T + (B - T) * f} className="pd-grid"/>)}
    <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} className="pd-line"/>
    <circle cx={xy[peak][0]} cy={xy[peak][1]} r="3" className="pd-dot"/>
    <text x={Math.min(R - 30, Math.max(L + 30, xy[peak][0]))} y={xy[peak][1] - 8} className="pd-label" textAnchor="middle">{money(max)}</text>
    {last !== peak && prices[last] !== max && <><circle cx={xy[last][0]} cy={xy[last][1]} r="3" className="pd-dot is-now"/>
      <text x={Math.min(R - 30, xy[last][0])} y={Math.min(H - 22, xy[last][1] + 16)} className="pd-label" textAnchor="middle">{money(prices[last])}</text></>}
    {ticks.map(at => { const x = L + (at - t0) / tw * (R - L); return <text key={at} x={x} y={H - 4} className="pd-tick" textAnchor={x < L + 20 ? 'start' : x > R - 20 ? 'end' : 'middle'}>{dayLabel(at)}</text>; })}
  </svg>;
}

// Thông tin cầu thủ: phần đầu (mùa, tên, OVR theo vị trí, CLB, quốc tịch, lương), tab Giá / Sự nghiệp CLB, cột Chỉ số chung.
export default function PlayerDetail({ card, bonus = 0, maxLevel, levelBadge, renderCard, onUpgrade, onClose, miniface, onGold }: Props) {
  const p = getPlayer(card), overall = ovr(card) + bonus;
  const [tab, setTab] = useState<'price' | 'career'>('price');
  const positions = playerPositions(p).slice(0, 3).map(pos => ({ pos, value: slotOvr(card, pos) + bonus }));
  const stats = useMemo(() => playerStats(p, ovr(card)), [p, card]);
  const history = useMemo(() => priceHistory(card), [card]);
  const now = priceAt(card);
  const clubs = playerClubs(p), cardClub = p.club && !NOT_CLUBS.has(p.club) ? p.club : null;
  const goldTrait = goldTraitOf(p.id);
  const faces = useMemo(() => miniface ? minifaceOptions(p) : [], [p, miniface]);
  const tone = (v: number) => v >= overall + 4 ? 'is-top' : v >= overall - 6 ? 'is-mid' : 'is-low';
  return <div className="pd">
    <header className="pd-bar"><h2>Thông tin cầu thủ</h2><button className="icon-button" aria-label="Đóng chi tiết" onClick={onClose}><X/></button></header>
    <div className="pd-body">
      <section className="pd-left">
        <div className="pd-id">
          <div className="pd-id-text">
            <p className="pd-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong><img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/></p>
            <p className="pd-pos">{positions.map(x => <span key={x.pos}><i className={`pos-${positionGroup(x.pos)}`}>{x.pos}</i><b>{x.value}</b></span>)}</p>
            <p className="pd-meta">{(cardClub ?? p.club) !== p.nation && <>{cardClub ?? p.club}<i/></>}{p.flag && <img src={flagImageUrl(p.flag)} alt=""/>}{p.nation}</p>
            {goldTrait && <p className="pd-gold" title={`${goldTrait.desc} (nguồn: FIFA Addict)`}><span>Chỉ số ẩn vàng</span><b><img src={goldTrait.icon} alt="" width={26} height={26}/>{goldTrait.name}</b></p>}
        {/* CSA vàng thêm đang có hiệu lực (xem thẻ của người khác cũng thấy); thẻ mình thì có ô chọn bên dưới. */}
        {!onGold && goldExtras(card, p.tier, p.pos).map(id => <p key={id} className="pd-gold is-extra"><span>CSA vàng thêm</span><b><img src={goldTraitIcon(id)} alt="" width={26} height={26}/>{goldTraitName(id)}</b></p>)}
        {onGold && <GoldExtraPicker card={card} player={p} onChoose={onGold}/>}
            {miniface && faces.length > 0 && <div className="pd-faces" role="radiogroup" aria-label="Miniface">
          <span className="pd-faces-title">Miniface <small>áp cho {p.name} ở mọi mùa</small></span>
          <div className="pd-faces-list">
            {[{ value: null, src: portraitOf(p.id) ?? faces[faces.length - 1].src, label: 'Mặc định' }, ...faces].map(o => {
              const on = (miniface.value ?? null) === o.value, flat = o.value === 'card' || (o.value === null && !portraitOf(p.id));
              return <button key={o.value ?? 'default'} type="button" role="radio" aria-checked={on} className={`pd-face${on ? ' is-on' : ''}${flat ? ' is-card' : ''}`} title={o.label}
                onClick={() => miniface.onChoose(o.value)}><img src={o.src} alt="" loading="lazy"/><span>{o.label}</span></button>;
            })}
          </div>
        </div>}
        <p className="pd-meta">Lương <b className="pd-wage">{p.wage ?? 0}</b><i/>Thẻ <b>+{card.level}</b>/+{maxLevel}{bonus > 0 && <><i/>Team color <b className="pd-plus">+{bonus}</b></>}</p>
          </div>
          <div className="pd-card">{renderCard(card)}</div>
        </div>
        <div className="pd-tabs" role="tablist" aria-label="Thông tin thêm">
          <button type="button" role="tab" aria-selected={tab === 'price'} onClick={() => setTab('price')}>Giá</button>
          <button type="button" role="tab" aria-selected={tab === 'career'} onClick={() => setTab('career')}>Sự nghiệp CLB</button>
        </div>
        {tab === 'price' ? <div className="pd-price" role="tabpanel">
          {history.length > 1 ? <PriceChart points={history}/> : <p className="pd-empty">{now === null ? 'Thẻ này chưa có giá.' : 'Chưa đủ dữ liệu để vẽ biểu đồ.'}</p>}
          <p className="pd-now"><span>Giá hiện tại</span><b>{formatMarketPrice(now)}</b></p>
        </div> : <div className="pd-career" role="tabpanel">
          {clubs.length ? <ol>{clubs.map(club => <li key={club}><b>{club}</b>{club === cardClub && <small>CLB trên thẻ</small>}</li>)}</ol>
            : <p className="pd-empty">Chưa có dữ liệu CLB của cầu thủ này.</p>}
          <p className="pd-note">Các CLB từng thi đấu (tính vào team color CLB).</p>
        </div>}
        {onUpgrade && <button className="primary-button pd-upgrade" disabled={card.level >= maxLevel} onClick={onUpgrade}><Zap size={18}/>Nâng cấp cầu thủ này</button>}
      </section>
      <section className="pd-right" aria-label="Chỉ số chung">
        <div className="pd-tabs"><span className="is-on">Chỉ số chung</span></div>
        <ul className="pd-stats">{stats.map(s => <li key={s.name}><span>{s.name}</span><b className={tone(s.value + bonus)}>{s.value + bonus}</b>{bonus > 0 ? <i>+{bonus}</i> : <i/>}</li>)}</ul>
      </section>
    </div>
  </div>;
}
