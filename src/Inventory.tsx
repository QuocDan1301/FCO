import { useState } from 'react';
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { getPackStock, isPackAvailable } from './game';
import type { Pack, Save } from './game';

type Props = {
  save: Save;
  packs: Pack[];
  onUse: (pack: Pack) => void;
  renderArt: (pack: Pack) => ReactNode;
  testMode?: boolean;
  onReceiveTest?: (pack: Pack) => void;
};
type Sort = 'new' | 'old' | 'desc' | 'asc';
const CAPACITY = 1000;
const BATCH = 150;
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

export default function Inventory({ save, packs, onUse, renderArt, testMode, onReceiveTest }: Props) {
  const [checked, setChecked] = useState<string[]>(['player']);
  const [sort, setSort] = useState<Sort>('new');
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState('');
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
  const selectedStock = owned.filter(x => selected.includes(x.pack.id)).reduce((sum, x) => sum + x.stock, 0);
  const first = shown.find(x => selected.includes(x.pack.id));

  return <section className="workspace inv-workspace" aria-labelledby="inv-title">
    <div className="inv-top"><h1 id="inv-title">Kho vật phẩm</h1><div className="inv-tab"><span>Vật phẩm</span></div><p className="inv-capacity">Số loại đang sở hữu <b>{owned.length} / {CAPACITY.toLocaleString('vi-VN')}</b> cái</p></div>
    <div className="inv-body">
      <aside className="inv-side" aria-label="Bộ lọc kho">
        <h2>Loại sản phẩm</h2>
        <ul>{categories.map(c => <li key={c.id}><label><input type="checkbox" checked={checked.includes(c.id)} onChange={() => toggleCategory(c.id)}/><span className="inv-check"/>{c.label}</label></li>)}</ul>
        <h2>Sắp xếp vật phẩm</h2>
        <ul>{sorts.map(s => <li key={s.id}><label><input type="radio" name="inv-sort" checked={sort === s.id} onChange={() => setSort(s.id)}/><span className="inv-radio"/>{s.label}</label></li>)}</ul>
      </aside>
      <div className="inv-main">
        {shown.length ? <div className="inv-grid">{shown.map(({ pack, stock }) => {
          const isSelected = selected.includes(pack.id);
          return <article key={pack.id} className={`inv-item ${pack.color} ${isSelected ? 'is-selected' : ''}`} onMouseEnter={() => setHover(pack.id)} onMouseLeave={() => setHover('')}>
            <span className="inv-new">Mới</span>
            <button className="inv-tick" role="checkbox" aria-checked={isSelected} aria-label={`Chọn ${pack.name}`} onClick={() => toggleItem(pack.id)}>{isSelected && <i/>}</button>
            <button className="inv-art" onClick={() => toggleItem(pack.id)} aria-label={`${pack.name}, còn ${stock}`}>{renderArt(pack)}</button>
            <div className="inv-item-action">
              <h3>{pack.name}</h3>
              <button className="inv-use" aria-label={`Dùng ${pack.name}`} onClick={() => onUse(pack)}>Dùng</button>
            </div>
            <span className="inv-count">SL:{stock}</span>
            {hover === pack.id && <div className="inv-tip" role="tooltip"><b>{pack.name} {pack.range}</b><em>SL:{stock}</em><p>Bạn sẽ nhận được 1 cầu thủ thuộc {pack.name} với chỉ số OVR {pack.range}.</p></div>}
          </article>;
        })}</div> : <div className="inv-empty"><Search size={30}/><h2>Kho đang trống</h2><p>{owned.length ? 'Không có vật phẩm thuộc nhóm đã chọn.' : 'Bạn chưa sở hữu gói cầu thủ nào.'}</p>{testMode && <button className="secondary-button" onClick={() => packs[0] && onReceiveTest?.(packs[0])}>Nhận gói thử</button>}</div>}
      </div>
    </div>
    <div className="inv-foot">
      <button className="inv-foot-btn" disabled={!selected.length} onClick={() => setSelected([])}>Hủy</button>
      <button className="inv-foot-btn" disabled={!shown.length} onClick={() => setSelected(selected.length === shown.length ? [] : shown.map(x => x.pack.id))}>{selected.length && selected.length === shown.length ? 'Bỏ chọn' : 'Chọn tất cả'}</button>
      <span className="inv-selected">Số lượng lựa chọn : {selectedStock} / {BATCH} món</span>
      <button className="inv-foot-btn inv-open" disabled={!first} onClick={() => first && onUse(first.pack)}>Chọn VP để mở</button>
    </div>
  </section>;
}
