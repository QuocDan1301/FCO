import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, ShoppingBag, X } from 'lucide-react';
import { money } from './game';
import type { Pack, Save } from './game';
import { findPack } from './event';
import { STP_ICON, STP_PACKAGES, stpItemName } from './stp';
import type { StpItem, StpPackage, StpPackageId } from './stp';
import { asset } from './asset';

// Gói Star Point trong Shop (src/stp.ts): 4 khung đứng đầu lưới Shop (cùng khung 7 hàng con với gói cầu thủ), thứ tự Siêu cấp → Tân binh.
// Bấm ảnh hoặc "Mua" mở danh sách vật phẩm (mua 1 gói nhận đủ cả danh sách); nút xác nhận trong danh sách mới trừ STP.
type Props = {
  save: Save;
  online: boolean;
  onBuy: (id: StpPackageId) => boolean | Promise<boolean>;
  // Gói đã mua hôm nay (mỗi gói 1 lần mỗi ngày, migration 202611120001); null = chưa tải được.
  bought: readonly string[] | null;
  renderArt: (pack: Pack) => ReactNode;
};

export function StpIcon({ size = 18 }: { size?: number }) {
  return <img className="stp-icon" src={asset(STP_ICON)} width={size} height={size} alt=""/>;
}

function ItemIcon({ item, renderArt }: { item: StpItem; renderArt: Props['renderArt'] }) {
  if ('voucher' in item) return <span className="stp-item-voucher" aria-hidden="true"><b>%</b><small>{item.voucher}%</small></span>;
  if ('bp' in item) return <img className="stp-item-bp" src={asset('/assets/currency-bp.png')} alt=""/>;
  const pack = findPack(item.pack);
  return <span className="stp-item-pack" aria-hidden="true">{pack ? renderArt(pack) : null}</span>;
}

function StpDialog({ pkg, stp, online, done, onBuy, onClose, renderArt }: { pkg: StpPackage; stp: number; online: boolean; done: boolean; onBuy: () => Promise<boolean>; onClose: () => void; renderArt: Props['renderArt'] }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  const affordable = stp >= pkg.price;
  // Gắn vào body: lưới Shop là khung cuộn có containment nên position: fixed bên trong có thể bị giới hạn.
  return createPortal(<div className="stp-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="stp-dialog" role="dialog" aria-modal="true" aria-labelledby="stp-dialog-title" data-stp={pkg.id}>
      <header className="stp-dialog-head">
        <img src={asset(pkg.image)} alt=""/>
        <div><span className="stp-dialog-kicker">{pkg.label} PACKAGE</span><h2 id="stp-dialog-title">{pkg.name}</h2><p>Mua 1 gói nhận đủ {pkg.items.length} vật phẩm dưới đây.</p></div>
        <button className="icon-button" aria-label="Đóng danh sách vật phẩm" onClick={onClose}><X/></button>
      </header>
      <ul className="stp-items">
        {pkg.items.map((item, i) => <li key={i}><ItemIcon item={item} renderArt={renderArt}/><span className="stp-item-name">{stpItemName(item)}</span><span className="stp-item-count">Số lượng {'count' in item ? item.count : 1}</span></li>)}
      </ul>
      <footer className="stp-dialog-foot">
        <div className="stp-dialog-price"><span>Giá</span><strong><StpIcon size={22}/>{money(pkg.price)} <small>STP</small></strong><span className="stp-dialog-have">Bạn có {money(stp)} STP</span></div>
        {!online ? <p className="stp-dialog-error">Hãy đăng nhập tài khoản để dùng Star Point.</p> : done ? <p className="stp-dialog-error">Bạn đã mua gói này hôm nay. Mỗi gói mua 1 lần mỗi ngày, làm mới lúc 00:00.</p> : !affordable && <p className="stp-dialog-error">Bạn chưa đủ Star Point để mua gói này.</p>}
        <div className="stp-dialog-actions"><button className="secondary-button" onClick={onClose}>Đóng</button><button className="shop-buy" disabled={busy || done || !affordable || !online} onClick={() => { setBusy(true); void onBuy().then(ok => { setBusy(false); if (ok) onClose(); }); }}><ShoppingBag size={17}/>Mua · {money(pkg.price)} STP</button></div>
      </footer>
    </div>
  </div>, document.body);
}

export default function StpShop({ save, online, onBuy, bought, renderArt }: Props) {
  const [open, setOpen] = useState<StpPackage | null>(null);
  const stp = save.stp ?? 0;
  return <>
    {STP_PACKAGES.map(pkg => {
      const affordable = stp >= pkg.price, done = !!bought?.includes(pkg.id);
      return <article className="shop-product stp-product" key={pkg.id} data-tone={`stp-${pkg.id}`} data-stp={pkg.id}>
        <div className="shop-product-heading"><h2>{pkg.name}</h2><span className="stp-tag">{pkg.label}</span></div>
        <button className="shop-art" onClick={() => setOpen(pkg)} aria-label={`Xem vật phẩm trong ${pkg.name}`}><img src={asset(pkg.image)} alt=""/><span className="shop-art-hint" aria-hidden="true"><Eye size={13}/>Xem vật phẩm</span></button>
        <div className="shop-total"><span>Giá mỗi gói</span><strong className="stp-price"><StpIcon size={22}/>{money(pkg.price)} <small>STP</small></strong></div>
        <p className={`shop-note ${done ? 'stp-limit-note' : 'shop-error'}`}>{done ? 'Đã mua hôm nay · mua lại sau 00:00' : affordable ? 'Mỗi gói mua 1 lần mỗi ngày.' : 'Bạn chưa đủ Star Point để mua gói này.'}</p>
        <div className="shop-actions"><button className={`shop-buy ${done ? 'is-added' : ''}`} onClick={() => setOpen(pkg)}>{done ? <><Check size={17}/>Đã mua hôm nay</> : <><ShoppingBag size={17}/>Mua gói</>}</button></div>
      </article>;
    })}
    {open && <StpDialog pkg={open} stp={stp} online={online} done={!!bought?.includes(open.id)} renderArt={renderArt} onClose={() => setOpen(null)} onBuy={() => Promise.resolve(onBuy(open.id))}/>}
  </>;
}
