import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { getPlayer, MAX_LEVEL, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { marketQuote } from './market';
import { isLocked, positionGroup, squadCards } from './squad';
import { asset } from './asset';
import './target-picker.css';

type Props = {
  save: Save;
  targetId: string;
  onPick: (uid: string) => void;
  onClose: () => void;
  view: PickerView;
  onView: (view: PickerView) => void;
  top: number;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
};
// Hai nhóm như FC Online: cầu thủ trong đội hình chính và cầu thủ chưa đăng ký (chưa có trong đội).
type Filter = 'squad' | 'free';
type SortKey = 'position' | 'name' | 'ovr' | 'level' | 'price';
// Mục và cách sắp xếp do App giữ: đóng danh sách vẫn nhớ, chỉ đặt lại khi vào lại trang Nâng cấp. filter null = chưa bấm, mặc định theo đội hình.
export type PickerView = { filter: Filter | null; sort: { key: SortKey; desc: boolean } };
export const DEFAULT_PICKER_VIEW: PickerView = { filter: null, sort: { key: 'ovr', desc: true } };
const groupOrder = { gk: 0, df: 1, mf: 2, fw: 3 };
const price = (card: Card) => marketQuote(card).price;

function compare(a: Card, b: Card, key: SortKey) {
  const pa = getPlayer(a), pb = getPlayer(b);
  switch (key) {
    case 'position': return groupOrder[positionGroup(pa.pos)] - groupOrder[positionGroup(pb.pos)] || pa.pos.localeCompare(pb.pos);
    case 'name': return pa.name.localeCompare(pb.name, 'vi');
    case 'ovr': return ovr(a) - ovr(b);
    case 'level': return a.level - b.level;
    case 'price': return (price(a) ?? -1) - (price(b) ?? -1);
  }
}

// Danh sách đổ xuống dưới nút "Thay đổi cầu thủ": lọc theo đội hình, sắp xếp theo cột, bấm hàng để chọn thẻ chính.
export default function TargetPicker({ save, targetId, onPick, onClose, view, onView, top, levelBadge, seasonShort }: Props) {
  const { sort } = view;
  const panel = useRef<HTMLDivElement>(null);
  const squad = useMemo(() => new Set(squadCards(save).map(c => c.uid)), [save.cards, save.squad]);
  // Thẻ đang là thẻ chính không hiện lại trong danh sách.
  const others = useMemo(() => save.cards.filter(c => c.uid !== targetId), [save.cards, targetId]);
  const inSquad = others.filter(c => squad.has(c.uid)).length;
  const filter = view.filter ?? (inSquad ? 'squad' : 'free');
  const rows = useMemo(() => others
    .filter(c => (filter === 'squad') === squad.has(c.uid))
    .sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key) || ovr(b) - ovr(a) || b.level - a.level), [others, squad, filter, sort]);
  // Đặt danh sách ngay dưới mép trên nút "Thay đổi cầu thủ" (đo sau khi hiển thị; lúc vừa mở trang ref của nút chưa có nên không dùng được giá trị top truyền vào).
  useLayoutEffect(() => {
    const place = () => { const el = panel.current, btn = el?.parentElement?.querySelector<HTMLElement>('.fco-change'); if (el) el.style.top = `${btn ? btn.offsetTop : top}px`; };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const header = (key: SortKey, label: string) => <button className={`tp-col ${sort.key === key ? 'on' : ''}`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => onView({ ...view, sort: { key, desc: sort.key === key ? !sort.desc : true } })}>{label}{sort.key === key && <ChevronDown size={12} className={sort.desc ? '' : 'up'}/>}</button>;
  const chips: [Filter, string, string][] = [['squad', `Đội hình (${inSquad})`, 'Cầu thủ trong đội hình chính'], ['free', `Chưa ĐK (${others.length - inSquad})`, 'Cầu thủ chưa có trong đội hình']];
  return <div className="tp-panel" ref={panel} role="dialog" aria-label="Chọn cầu thủ để nâng cấp">
    <div className="tp-head">
      <h3>Chọn cầu thủ</h3>
      <div className="tp-filters" role="tablist" aria-label="Lọc cầu thủ">{chips.map(([value, label, hint]) => <button key={value} role="tab" aria-selected={filter === value} title={hint} className={filter === value ? 'on' : ''} onClick={() => onView({ ...view, filter: value })}>{label}</button>)}</div>
    </div>
    <div className="tp-columns">{header('position', 'Vị trí')}<span/>{header('name', 'Tên cầu thủ')}{header('ovr', 'C.Số')}{header('level', 'Thẻ')}<span className="tp-col">Khóa</span>{header('price', 'Giá trị')}</div>
    <div className="tp-list" role="listbox" aria-label="Cầu thủ">
      {rows.map(c => {
        const p = getPlayer(c), maxed = c.level >= MAX_LEVEL, value = price(c);
        return <button key={c.uid} role="option" className="tp-row" disabled={maxed} title={maxed ? `Đã đạt cấp tối đa +${MAX_LEVEL}` : undefined} onClick={() => onPick(c.uid)}>
          <span className={`tp-pos pos-${positionGroup(p.pos)}`}>{p.pos}</span>
          <span className="tp-face"><img src={p.cardFace || p.image || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></span>
          <span className="tp-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></span>
          <span className="tp-ovr">{ovr(c)}</span>
          <span className="tp-level"><img src={levelBadge(c.level)} alt={`+${c.level}`}/></span>
          <span className="tp-lock">{isLocked(save, c.uid) && <Lock size={15} aria-label="Đã khóa"/>}</span>
          <span className={`tp-price ${value === null ? 'is-unpriced' : ''}`}>{value === null ? 'Chưa có giá' : money(value)}</span>
        </button>;
      })}
      {!rows.length && <p className="tp-empty">{filter === 'squad' ? 'Đội hình chưa có cầu thủ. Thêm cầu thủ ở mục Quản lí CT.' : 'Không còn cầu thủ nào chưa có trong đội hình.'}</p>}
    </div>
    <button className="tp-close" onClick={onClose}>Đóng<ChevronUp size={16}/></button>
  </div>;
}
