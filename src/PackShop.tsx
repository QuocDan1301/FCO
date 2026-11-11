import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Check, Eye, Minus, Plus, ShoppingBag, Zap } from 'lucide-react';
import { getPackStock, isPackAvailable, MAX_INVENTORY_OPEN, money } from './game';
import type { Pack, Save } from './game';
import { marketNow } from './market';
import { MEMBERSHIP_DAYS, MEMBERSHIPS, membershipLeft } from './membership';
import type { MembershipId } from './membership';
import StpShop from './StpShop';
import type { StpPackageId } from './stp';
import './shop.css';

type Props = {
  save: Save;
  packs: Pack[];
  free: boolean;
  onBuy: (pack: Pack, count: number) => boolean | Promise<boolean>;
  onBuyMembership: (id: MembershipId) => boolean | Promise<boolean>;
  // Gói Star Point (src/StpShop.tsx), đứng đầu lưới.
  onBuyStp: (id: StpPackageId) => boolean | Promise<boolean>;
  // Mở bảng nhiệm vụ Star Point; missionsReady = số phần thưởng chờ nhận.
  onStpMissions: () => void;
  missionsReady: number;
  online: boolean;
  onOpenNow: (pack: Pack, count: number) => void;
  onPreview: (pack: Pack, count: number) => void;
  onInventory: () => void;
  renderArt: (pack: Pack) => ReactNode;
};

export default function PackShop({ save, packs, free, onBuy, onBuyMembership, onBuyStp, onStpMissions, missionsReady, online, onOpenNow, onPreview, onInventory, renderArt }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const setQuantity = (id: string, value: string) => setQuantities(current => ({ ...current, [id]: value }));
  // Tổng gói chưa mở hiện trên nút Kho vật phẩm; tổng tăng (vừa mua) thì nút nảy nhẹ.
  const stockTotal = packs.filter(isPackAvailable).reduce((sum, pack) => sum + getPackStock(save, pack), 0);
  const [stock, setStock] = useState({ total: stockTotal, bump: 0 });
  if (stock.total !== stockTotal) setStock({ total: stockTotal, bump: stockTotal > stock.total ? stock.bump + 1 : stock.bump });
  const inventoryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!stock.bump || save.reduced) return;
    inventoryRef.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: .35 }, { transform: 'scale(.97)', offset: .7 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
  }, [stock.bump]);
  // Nút mua vừa thêm gói vào kho: đổi sang "Đã thêm" trong chốc lát (thông báo chi tiết ở toast).
  const [added, setAdded] = useState<{ id: string } | null>(null);
  useEffect(() => { if (!added) return; const timer = window.setTimeout(() => setAdded(null), 1400); return () => clearTimeout(timer); }, [added]);
  return <section className="workspace shop-workspace" aria-labelledby="shop-title">
    <div className="page-heading shop-heading">
      <div><div className="shop-title-row"><h1 id="shop-title">Shop gói cầu thủ</h1></div><p>Chọn gói, mua số lượng bạn muốn và mở trong kho vật phẩm.</p></div>
      <div className="shop-heading-actions"><button className="secondary-button shop-stp-missions" onClick={onStpMissions} aria-label={`Nhiệm vụ Star Point${missionsReady ? ` · ${missionsReady} phần thưởng chờ nhận` : ''}`}>Nhiệm vụ STP{missionsReady > 0 && <b className="shop-inventory-count" aria-hidden="true">{missionsReady}</b>}</button>
      <button ref={inventoryRef} className="secondary-button shop-inventory" onClick={onInventory} aria-label={`Kho vật phẩm · ${stockTotal} gói chưa mở`}>Kho vật phẩm<b className="shop-inventory-count" aria-hidden="true">{money(stockTotal)}</b><ArrowRight size={17}/></button></div>
    </div>
    <div className="shop-grid" aria-label="Các gói đang bán">
      <StpShop save={save} online={online} onBuy={onBuyStp} renderArt={renderArt}/>
      {MEMBERSHIPS.map(item => {
        const left = membershipLeft(save.membership?.[item.id], marketNow());
        const affordable = free || (save.fc ?? 0) >= item.price;
        return <article className="shop-product shop-membership" key={item.id} data-tone={item.id}>
          <div className="shop-product-heading"><h2>{item.name}</h2><span className="shop-membership-tag">{MEMBERSHIP_DAYS} ngày</span></div>
          <div className="shop-art"><img src={item.image} alt=""/></div>
          <p className="shop-membership-perk">Giảm <b>{item.discount}%</b> thuế bán cầu thủ</p>
          <p className={`shop-membership-status ${left ? 'is-active' : ''}`}>{left ?? 'Chưa kích hoạt'}</p>
          <div className="shop-total"><span>Giá mỗi tuần</span><strong>{money(item.price)} <small>FC</small></strong></div>
          <p className="shop-note shop-error">{affordable ? '' : 'Bạn chưa đủ FC để mua gói này.'}</p>
          <div className="shop-actions"><button className="shop-buy" disabled={!affordable} onClick={() => { if (affordable) void onBuyMembership(item.id); }}><ShoppingBag size={17}/>{left ? 'Gia hạn' : 'Mua'} {MEMBERSHIP_DAYS} ngày</button></div>
        </article>;
      })}
      {packs.map(pack => {
        // Gói chưa có cầu thủ vẫn hiện để báo trước, nhưng không mua được (buyPacks cũng chặn).
        if (!isPackAvailable(pack)) return <article className="shop-product shop-upcoming" key={pack.id} data-pack={pack.id} data-tone={pack.tone ?? pack.id} aria-disabled="true">
          <div className="shop-product-heading"><h2>{pack.name}</h2><span className="shop-upcoming-badge">Sắp ra mắt</span></div>
          <div className="shop-art">{renderArt(pack)}</div>
          <p className="shop-note">Gói chưa có cầu thủ. Sẽ mở bán khi cập nhật danh sách thẻ.</p>
          <div className="shop-actions"><button className="shop-buy" disabled><ShoppingBag size={17}/>Sắp ra mắt</button></div>
        </article>;
        const quantity = quantities[pack.id] ?? '1';
        const count = Number(quantity);
        const valid = quantity.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= MAX_INVENTORY_OPEN;
        const cost = valid ? count * pack.price : 0;
        const affordable = free || (save.fc ?? 0) >= cost;
        const inStock = getPackStock(save, pack);
        const preview = () => onPreview(pack, valid ? count : 1);
        const justAdded = added?.id === pack.id;
        // Khung chia 7 hàng con (subgrid) để tên, ảnh, giá, nút của các gói cùng hàng luôn thẳng nhau dù tên dài ngắn khác nhau.
        return <article className="shop-product" key={pack.id} data-pack={pack.id} data-tone={pack.tone ?? pack.id}>
          <div className="shop-product-heading"><h2>{pack.name}</h2>{pack.draft && <span className="shop-draft-badge" title="Chỉ hiện khi chạy npm run dev, người chơi không thấy">Nháp</span>}</div>
          <button className="shop-art" onClick={preview} aria-label={`Xem trước cầu thủ trong ${pack.name} · trong kho ${inStock} gói`}>{renderArt(pack)}<span className={`shop-stock ${inStock > 0 ? 'has-stock' : ''}`}>Trong kho <b>{money(inStock)}</b></span><span className="shop-art-hint" aria-hidden="true"><Eye size={13}/>Xem cầu thủ</span></button>
          <div className="shop-quantity"><label htmlFor={`shop-quantity-${pack.id}`}>Số lượng</label><div className="shop-stepper"><button aria-label={`Giảm số lượng ${pack.name}`} disabled={!valid || count <= 1} onClick={() => setQuantity(pack.id, String(count - 1))}><Minus size={16}/></button><input id={`shop-quantity-${pack.id}`} aria-label={`Số lượng ${pack.name}`} aria-invalid={!valid} aria-describedby={`shop-note-${pack.id}`} type="number" inputMode="numeric" min={1} max={MAX_INVENTORY_OPEN} step={1} value={quantity} onChange={event => setQuantity(pack.id, event.target.value)}/><button aria-label={`Tăng số lượng ${pack.name}`} disabled={!valid || count >= MAX_INVENTORY_OPEN} onClick={() => setQuantity(pack.id, String(count + 1))}><Plus size={16}/></button></div></div>
          <div className="shop-presets" aria-label={`Chọn nhanh số lượng ${pack.name}`}>{[1, 10, 50, MAX_INVENTORY_OPEN].map(value => <button key={value} aria-pressed={count === value} onClick={() => setQuantity(pack.id, String(value))}>{value} gói</button>)}</div>
          <div className="shop-total"><span>Tổng thanh toán</span><strong>{valid ? money(cost) : '—'} <small>FC</small></strong></div>
          <p id={`shop-note-${pack.id}`} className="shop-note shop-error">{!valid ? `Nhập số nguyên từ 1 đến ${MAX_INVENTORY_OPEN}.` : !affordable ? 'Bạn chưa đủ FC để mua số gói này.' : ''}</p>
          <div className="shop-actions">
            <button className={`shop-buy ${justAdded ? 'is-added' : ''}`} disabled={!valid || !affordable} onClick={() => { if (valid && affordable) void Promise.resolve(onBuy(pack, count)).then(ok => { if (ok) setAdded({ id: pack.id }); }); }}>{justAdded ? <><Check size={17}/>Đã thêm</> : <><ShoppingBag size={17}/>Mua {valid ? count : ''} gói</>}</button>
            <button className="shop-open-now" disabled={!valid || !affordable} onClick={() => valid && affordable && onOpenNow(pack, count)} aria-label={`Mua và mở ngay ${valid ? count : ''} ${pack.name}`} title="Mua và mở ngay"><Zap size={16}/>Mở ngay</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
