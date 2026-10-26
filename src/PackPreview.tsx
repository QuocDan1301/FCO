import { ShoppingBag, X, Zap } from 'lucide-react';
import { money, ovr, packOdds } from './game';
import type { Pack } from './game';
import { marketQuote } from './market';
import { GradeBadge, PositionBadge } from './badges';
import { asset } from './asset';

type Props = { pack: Pack; count: number; free: boolean; balance: number; onBuy: () => void; onOpenNow: () => void; onClose: () => void };

const TOP = 10;
// Tỷ lệ (0–1) ra phần trăm: từ 1% trở lên 1 chữ số thập phân, nhỏ hơn giữ 2 chữ số có nghĩa (0,00032%).
const percent = (chance: number) => {
  const value = chance * 100;
  return `${new Intl.NumberFormat('vi-VN', value >= 1 ? { maximumFractionDigits: 1 } : { maximumSignificantDigits: 2 }).format(value)}%`;
};

// Xem trước gói ở Shop: tỷ lệ công bố theo packOdds (OVR cao / giá +1 đắt thì hiếm hơn), tỷ lệ cấp cộng và 10 cầu thủ OVR (+1) cao nhất.
export default function PackPreview({ pack, count, free, balance, onBuy, onOpenNow, onClose }: Props) {
  const { pool, levels } = packOdds(pack);
  const rows = pool.map(({ player, chance }) => { const card = { playerId: player.id, level: 1 }; return { player, chance, value: ovr(card), price: marketQuote(card).price }; });
  const top = [...rows].sort((a, b) => b.value - a.value || (b.price ?? 0) - (a.price ?? 0) || a.player.name.localeCompare(b.player.name)).slice(0, TOP);
  const likeliest = rows.reduce((best, row) => row.chance > best.chance ? row : best, rows[0]);
  const cost = count * pack.price, affordable = free || balance >= cost, single = levels.length === 1;
  return <div className="pack-preview" data-pack={pack.id}>
    <div className="modal-heading"><div><span className="pack-preview-kicker">Xem trước gói</span><h2>{pack.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng xem trước gói"><X/></button></div>
    <p className="pack-preview-sub"><span><b>{rows.length}</b> cầu thủ</span><span>OVR <b>{pack.range}</b></span>{single && <span>Thẻ <b>+{levels[0].level}</b></span>}{likeliest && <span>Dễ ra nhất <b>{likeliest.player.name} {percent(likeliest.chance)}</b></span>}</p>
    {/* Gói chỉ ra một cấp (gói ALL ra +1) thì không cần dòng tỷ lệ cấp. */}
    {!single && <div className="pack-preview-levels" aria-label="Tỷ lệ cấp thẻ">{levels.map(({ level, chance }) => <span key={level}><GradeBadge level={level}/><b>{percent(chance)}</b></span>)}</div>}
    <h3 className="pack-preview-title">Top {top.length} OVR cao nhất</h3>
    <ol className="pack-preview-list">{top.map(({ player, value, price, chance }, index) => <li key={player.id}>
      <span className="pack-preview-rank">{index + 1}</span>
      <img src={player.cardFace || asset('/assets/silhouette.svg')} alt="" loading="lazy"/>
      <PositionBadge pos={player.pos}/>
      <b className="pack-preview-name">{player.name}</b>
      <strong className="pack-preview-ovr" aria-label={`OVR ${value}`}>{value}</strong>
      <span className="pack-preview-chance" aria-label={`Tỷ lệ ${percent(chance)}`}>{percent(chance)}</span>
      <span className="pack-preview-price">{price === null ? '—' : `${money(price)} BP`}</span>
    </li>)}</ol>
    <p className="fine-print">{single ? `Mỗi gói ra 1 thẻ +${levels[0].level}. Cầu thủ OVR càng cao so với mức thấp nhất của gói và giá +1 càng đắt thì càng hiếm.` : 'Mỗi gói ra 1 thẻ. Cầu thủ OVR càng cao so với mức thấp nhất của gói và giá +1 càng đắt thì càng hiếm; cấp cộng rút riêng, mỗi cấp hiếm hơn cấp trước khoảng 3,2 lần. Tỷ lệ cầu thủ tính cho mọi cấp.'} Giá là giá thẻ +1 ở TTCN. Đây là tỷ lệ của trò chơi giả lập, không phải tỷ lệ chính thức của FC Online.</p>
    <div className="shop-actions pack-preview-actions">
      <button className="shop-buy" disabled={!affordable} onClick={onBuy}><ShoppingBag size={17}/>Mua {count} gói · {money(cost)} BP</button>
      <button className="shop-open-now" disabled={!affordable} onClick={onOpenNow} aria-label={`Mua và mở ngay ${count} ${pack.name}`}><Zap size={16}/>Mở ngay</button>
    </div>
  </div>;
}
