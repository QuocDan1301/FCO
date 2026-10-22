import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag } from 'lucide-react';
import { getPackStock, isPackAvailable, MAX_INVENTORY_OPEN, money } from './game';
import type { Pack, Save } from './game';
import './shop.css';

type Props = {
  save: Save;
  packs: Pack[];
  free: boolean;
  onBuy: (pack: Pack, count: number) => void;
  onInventory: () => void;
  renderArt: (pack: Pack) => ReactNode;
};

export default function PackShop({ save, packs, free, onBuy, onInventory, renderArt }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const setQuantity = (id: string, value: string) => setQuantities(current => ({ ...current, [id]: value }));
  return <section className="workspace shop-workspace" aria-labelledby="shop-title">
    <div className="page-heading shop-heading"><div><h1 id="shop-title">Shop gói cầu thủ</h1><p>Chọn gói, mua số lượng bạn muốn và mở trong kho vật phẩm.</p></div><button className="secondary-button" onClick={onInventory}>Kho vật phẩm<ArrowRight size={17}/></button></div>
    <div className="shop-grid" aria-label="Các gói đang bán">
      {packs.filter(isPackAvailable).map(pack => {
        const quantity = quantities[pack.id] ?? '1';
        const count = Number(quantity);
        const valid = quantity.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= MAX_INVENTORY_OPEN;
        const cost = valid ? count * pack.price : 0;
        const affordable = free || save.balance >= cost;
        return <article className="shop-product" key={pack.id} data-pack={pack.id}>
          <div className="shop-product-heading"><h2>{pack.name}</h2><span>Trong kho <b>{money(getPackStock(save, pack))}</b></span></div>
          <p className="shop-description">{pack.description}</p>
          <div className="shop-art">{renderArt(pack)}</div>
          <div className="shop-pack-details"><span>OVR <b>{pack.range}</b></span><span>1 gói = 1 cầu thủ</span></div>
          <div className="shop-price"><span>Giá mỗi gói</span><b>{money(pack.price)} <small>xu</small></b></div>
          <div className="shop-quantity"><label htmlFor={`shop-quantity-${pack.id}`}>Số lượng</label><div className="shop-stepper"><button aria-label={`Giảm số lượng ${pack.name}`} disabled={!valid || count <= 1} onClick={() => setQuantity(pack.id, String(count - 1))}><Minus size={16}/></button><input id={`shop-quantity-${pack.id}`} aria-label={`Số lượng ${pack.name}`} aria-invalid={!valid} aria-describedby={`shop-note-${pack.id}`} type="number" inputMode="numeric" min={1} max={MAX_INVENTORY_OPEN} step={1} value={quantity} onChange={event => setQuantity(pack.id, event.target.value)}/><button aria-label={`Tăng số lượng ${pack.name}`} disabled={!valid || count >= MAX_INVENTORY_OPEN} onClick={() => setQuantity(pack.id, String(count + 1))}><Plus size={16}/></button></div></div>
          <div className="shop-presets" aria-label={`Chọn nhanh số lượng ${pack.name}`}>{[1, 10, 50, MAX_INVENTORY_OPEN].map(value => <button key={value} aria-pressed={count === value} onClick={() => setQuantity(pack.id, String(value))}>{value} gói</button>)}</div>
          <div className="shop-total"><span>Tổng tiền</span><strong>{valid ? money(cost) : '—'} <small>xu</small></strong></div>
          <p id={`shop-note-${pack.id}`} className={`shop-note ${!valid || !affordable ? 'shop-error' : ''}`}>{!valid ? `Nhập số nguyên từ 1 đến ${MAX_INVENTORY_OPEN}.` : !affordable ? 'Bạn chưa đủ xu để mua số gói này.' : free ? 'Xu vô hạn · Mua không trừ xu.' : 'Thanh toán một lần · Không thu thêm phí khi mở.'}</p>
          <button className="shop-buy primary-button" disabled={!valid || !affordable} onClick={() => valid && affordable && onBuy(pack, count)}><ShoppingBag size={17}/>Mua {valid ? count : ''} gói<ArrowRight size={17}/></button>
        </article>;
      })}
    </div>
  </section>;
}
