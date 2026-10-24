import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
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
  top: number;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
};
// Hai nhóm như FC Online: cầu thủ trong đội hình chính và cầu thủ chưa đăng ký (chưa có trong đội).
type Filter = 'squad' | 'free';
type SortKey = 'position' | 'name' | 'ovr' | 'level' | 'price';
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
export default function TargetPicker({ save, targetId, onPick, onClose, top, levelBadge, seasonShort }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'ovr', desc: true });
  const panel = useRef<HTMLDivElement>(null);
  const squad = useMemo(() => new Set(squadCards(save).map(c => c.uid)), [save.cards, save.squad]);
  // Thẻ đang là thẻ chính không hiện lại trong danh sách.
  const others = useMemo(() => save.cards.filter(c => c.uid !== targetId), [save.cards, targetId]);
  const inSquad = others.filter(c => squad.has(c.uid)).length;
  const [filter, setFilter] = useState<Filter>(() => inSquad ? 'squad' : 'free');
  const rows = useMemo(() => others
    .filter(c => (filter === 'squad') === squad.has(c.uid))
    .sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key) || ovr(b) - ovr(a) || b.level - a.level), [others, squad, filter, sort]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const header = (key: SortKey, label: string) => <button className={`tp-col ${sort.key === key ? 'on' : ''}`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}>{label}{sort.key === key && <ChevronDown size={12} className={sort.desc ? '' : 'up'}/>}</button>;
  const chips: [Filter, string, string][] = [['squad', `Đội hình (${inSquad})`, 'Cầu thủ trong đội hình chính'], ['free', `Chưa ĐK (${others.length - inSquad})`, 'Cầu thủ chưa có trong đội hình']];
  return <div className="tp-panel" ref={panel} style={{ top }} role="dialog" aria-label="Chọn cầu thủ để nâng cấp">
    <div className="tp-head">
      <h3>Chọn cầu thủ</h3>
      <div className="tp-filters" role="tablist" aria-label="Lọc cầu thủ">{chips.map(([value, label, hint]) => <button key={value} role="tab" aria-selected={filter === value} title={hint} className={filter === value ? 'on' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
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
  </div>;
}
