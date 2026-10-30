import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronUp, Search, X } from 'lucide-react';
import { getPackStock, isPackAvailable, MAX_INVENTORY_OPEN } from './game';
import type { Pack, Save } from './game';

type Props = {
  save: Save;
  packs: Pack[];
  onUse: (pack: Pack) => void;
  onShop: () => void;
  onUseSelected: (packs: Pack[]) => void;
  onClose: () => void;
  renderArt: (pack: Pack) => ReactNode;
  testMode?: boolean;
  onReceiveTest?: (pack: Pack) => void;
};
type Sort = 'new' | 'old' | 'desc' | 'asc';
const CAPACITY = 1000;
const categories = [
  { id: 'pack', label: 'Gói' },
  { id: 'player', label: 'Gói cầu thủ' },
  { id: 'coach', label: 'Gói HLV' },
  { id: 'card', label: 'Thẻ' },
  { id: 'sim', label: 'Giả lập' },
  { id: 'starpoint', label: 'Gói Starpoint' },
  { id: 'other', label: 'Khác' },
  { id: 'coupon', label: 'Coupon giảm giá' },
  { id: 'vp', label: 'VP nâng cấp' },
];
const sorts: { id: Sort; label: string }[] = [{ id: 'new', label: 'Mới nhất' }, { id: 'old', label: 'Cũ nhất' }, { id: 'desc', label: 'Giảm dần' }, { id: 'asc', label: 'Tăng dần' }];
// Mọi gói trong game đều là gói cầu thủ; các nhóm còn lại chưa có vật phẩm.
const categoryOf = (_: Pack) => ['pack', 'player'];

// Kho vật phẩm kiểu FC Online: khung giữa màn (thanh tiêu đề + nút đóng), tab Kho / Vật phẩm, bộ lọc thu gọn được, lưới gói 4 cột.
export default function Inventory({ save, packs, onUse, onShop, onUseSelected, onClose, renderArt }: Props) {
  const [checked, setChecked] = useState<string[]>(['player']);
  const [sort, setSort] = useState<Sort>('new');
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState('');
  const [folded, setFolded] = useState<string[]>([]);
  const owned = packs.map((pack, i) => ({ pack, stock: getPackStock(save, pack), order: i })).filter(x => x.stock > 0 && isPackAvailable(x.pack));
  const shown = owned.filter(x => !checked.length || categoryOf(x.pack).some(c => checked.includes(c))).sort((a, b) => {
    switch (sort) {
      case 'old': return a.order - b.order;
      case 'desc': return b.stock - a.stock || a.order - b.order;
      case 'asc': return a.stock - b.stock || a.order - b.order;
      default: return b.order - a.order;
    }
  });
  const toggleCategory = (id: string) => setChecked(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const toggleItem = (id: string) => setSelected(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const toggleFold = (id: string) => setFolded(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const selectedItems = shown.filter(x => selected.includes(x.pack.id));
  const selectedStock = Math.min(MAX_INVENTORY_OPEN, selectedItems.reduce((sum, x) => sum + x.stock, 0));
  const allSelected = shown.length > 0 && selectedItems.length === shown.length;
  // Tiêu đề nhóm lọc có nút ▲ ở sát lề phải để thu gọn / mở lại danh sách bên dưới.
  const group = (id: string, title: string, list: ReactNode) => <>
    <h2><button className="inv-fold" aria-expanded={!folded.includes(id)} aria-controls={`inv-group-${id}`} onClick={() => toggleFold(id)}>{title}<ChevronUp size={14} aria-hidden="true"/></button></h2>
    {!folded.includes(id) && <ul id={`inv-group-${id}`}>{list}</ul>}
  </>;

  return <section className="workspace inv-workspace" aria-labelledby="inv-title">
    <header className="inv-head"><h1 id="inv-title">Vật phẩm</h1><button className="inv-close" onClick={onClose} aria-label="Đóng kho vật phẩm" title="Đóng"><X size={20}/></button></header>
    <div className="inv-top">
      <div className="inv-tabs"><span className="inv-tab-muted" aria-disabled="true" title="Chưa có vật phẩm trong mục Kho">Kho</span><span className="inv-tab-active" aria-current="page">Vật phẩm</span></div>
      <p className="inv-capacity"><span>Số loại đang sở hữu</span> <b>{owned.length} / {CAPACITY.toLocaleString('vi-VN')}</b> cái<span className="inv-help" role="img" aria-label={`Kho chứa tối đa ${CAPACITY.toLocaleString('vi-VN')} loại vật phẩm; mỗi loại gói tính là 1 loại dù có nhiều gói.`} title={`Kho chứa tối đa ${CAPACITY.toLocaleString('vi-VN')} loại vật phẩm; mỗi loại gói tính là 1 loại dù có nhiều gói.`}>?</span></p>
    </div>
    <div className="inv-body">
      <aside className="inv-side" aria-label="Bộ lọc kho">
        <div className="inv-filter-bar"><div className="inv-filter-tabs" role="group" aria-label="Loại sản phẩm"><button aria-pressed={!checked.length} onClick={() => setChecked([])}>Tất cả</button>{categories.map(c => <button key={c.id} aria-pressed={checked.includes(c.id)} onClick={() => setChecked([c.id])}>{c.label}</button>)}</div><select aria-label="Sắp xếp vật phẩm" value={sort} onChange={e => setSort(e.target.value as Sort)}>{sorts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        {group('type', 'Loại sản phẩm', categories.map(c => <li key={c.id}><label><input type="checkbox" checked={checked.includes(c.id)} onChange={() => toggleCategory(c.id)}/><span className="inv-check"/>{c.label}</label></li>))}
        {group('sort', 'Sắp xếp vật phẩm', sorts.map(s => <li key={s.id}><label><input type="radio" name="inv-sort" checked={sort === s.id} onChange={() => setSort(s.id)}/><span className="inv-radio"/>{s.label}</label></li>))}
      </aside>
      <div className="inv-main">
        {shown.length ? <div key={`${checked.join()}-${sort}`} className="inv-grid" role="region" aria-label="Danh sách vật phẩm" tabIndex={0}>{shown.map(({ pack, stock }) => {
          const isSelected = selected.includes(pack.id);
          return <article key={pack.id} className={`inv-item ${pack.color} ${isSelected ? 'is-selected' : ''}`} onMouseEnter={() => setHover(pack.id)} onMouseLeave={() => setHover('')}>
            <button className="inv-tick" role="checkbox" aria-checked={isSelected} aria-label={`Chọn ${pack.name}`} onClick={() => toggleItem(pack.id)}>{isSelected && <i/>}</button>
            <button className="inv-art" onClick={() => toggleItem(pack.id)} aria-label={`${pack.name}, còn ${stock}`}>{renderArt(pack)}</button>
            <div className="inv-item-action">
              <h3 title={pack.name}>{pack.name}</h3>
              <button className="inv-use" aria-label={`Dùng ${pack.name}`} onClick={() => onUse(pack)}>Dùng</button>
            </div>
            <div className="inv-item-foot"><span className="inv-count">SL:{stock}</span></div>
            {hover === pack.id && <div className="inv-tip" role="tooltip"><b className="inv-tip-title"><span>{pack.name}</span></b><em>SL:{stock}</em><p>Bạn sẽ nhận được 1 cầu thủ thuộc {pack.name}.</p></div>}
          </article>;
        })}</div> : <div className="inv-empty"><Search size={30}/><h2>Kho đang trống</h2><p>{owned.length ? 'Không có vật phẩm thuộc nhóm đã chọn.' : 'Bạn chưa sở hữu gói cầu thủ nào.'}</p><button className="secondary-button" onClick={onShop}>Đến shop mua gói</button></div>}
      </div>
    </div>
    <div className="inv-foot">
      <button className="inv-foot-btn" disabled={!selected.length} onClick={() => setSelected([])}>Hủy</button>
      <button className="inv-foot-btn" disabled={!shown.length} onClick={() => setSelected(allSelected ? [] : shown.map(x => x.pack.id))}>{allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}</button>
      <span className="inv-selected">Số lượng lựa chọn : {selectedStock} / {MAX_INVENTORY_OPEN} món</span>
      <button className="inv-foot-btn inv-open" disabled={!selectedStock} onClick={() => onUseSelected(selectedItems.map(x => x.pack))}>{selectedStock ? `Mở ${selectedStock} vật phẩm` : 'Chọn VP để mở'}</button>
    </div>
  </section>;
}
