import { useEffect, useRef, useState, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, ChevronUp, Menu, RefreshCw } from 'lucide-react';
import { MAX_LEVEL, TIERS, getPlayer, money, ovr, players, seasons, upgradeInfo } from './game';
import type { Card, Tier } from './game';
import { marketQuote } from './market';
import { asset } from './asset';
import { posGroup, seasonShort } from './badges';
import './upgrade-market.css';

// Mua phôi ngay ở màn nâng cấp như FC Online: tab "Mua cầu thủ" (danh sách giá thấp → cao) và "Mua hàng loạt" (mua nhiều thẻ rẻ nhất theo điều kiện).
// Hai tab dùng chung bộ lọc cấp thẻ, chỉ số và lớp cầu thủ (mùa thẻ).
export type Offer = { playerId: number; level: number; tier: Tier; ovr: number; price: number };
type Props = {
  mode: 'buy' | 'bulk';
  target: Card | undefined;
  free: boolean;
  balance: number;
  onBuy: (offer: Offer) => void;
  onBulkBuy: (offer: Offer, count: number) => void;
  levelBadge: (level: number) => string;
};

// Mọi thẻ (cầu thủ × cấp) có giá thật, xếp giá thấp → cao; giá 0 là thẻ chưa định giá nên không bán ở đây. Tính một lần vì bảng giá cố định.
let catalog: Offer[] | null = null;
function offers() {
  if (catalog) return catalog;
  const list: Offer[] = [];
  for (const p of players) for (let level = 1; level <= MAX_LEVEL; level++) {
    const price = marketQuote({ playerId: p.id, level }).price;
    if (price) list.push({ playerId: p.id, level, tier: p.tier, ovr: ovr({ playerId: p.id, level }), price });
  }
  return catalog = list.sort((a, b) => a.price - b.price || b.ovr - a.ovr || a.level - b.level);
}
const LIST_LIMIT = 100, MAX_BULK = 10;
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

// Ô chọn kiểu FC Online (giá trị + ▼); danh sách đổ xuống, bấm ra ngoài hoặc Esc để đóng.
function Dropdown({ value, options, render, onChange, label, className = '' }: { value: number; options: number[]; render: (value: number) => ReactNode; onChange: (value: number) => void; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return <div className={`um-drop ${className}`} ref={box}>
    <button className="um-drop-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>{render(value)}<ChevronDown size={16}/></button>
    {open && <div className="um-drop-list" role="listbox" aria-label={label} ref={list}>{options.map(option => <button key={option} role="option" aria-selected={option === value} onClick={() => { onChange(option); setOpen(false); }}>{render(option)}</button>)}</div>}
  </div>;
}

export default function UpgradeMarket({ mode, target, free, balance, onBuy, onBulkBuy, levelBadge }: Props) {
  const all = offers();
  const [minOvrAll, maxOvrAll] = useMemo(() => all.reduce(([lo, hi], o) => [Math.min(lo, o.ovr), Math.max(hi, o.ovr)], [Infinity, -Infinity]), [all]);
  const tiers = useMemo(() => TIERS.filter(tier => all.some(o => o.tier === tier)), [all]);
  // Mặc định tìm phôi quanh chỉ số thẻ chính (OVR thẻ chính → +2), mọi cấp, mọi mùa.
  const defaultOvr = (): [number, number] => { const from = Math.min(maxOvrAll, Math.max(minOvrAll, target ? ovr(target) : minOvrAll)); return [from, Math.min(maxOvrAll, from + 2)]; };
  const [levels, setLevels] = useState<[number, number]>([1, MAX_LEVEL]);
  const [ovrs, setOvrs] = useState<[number, number]>(defaultOvr);
  const [classes, setClasses] = useState<Tier[]>([]);
  const [classesOpen, setClassesOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState(0);
  const [count, setCount] = useState(1);
  // Ô số lượng cho gõ tự do (kể cả để trống lúc đang gõ); rời ô thì về lại số hợp lệ.
  const [countText, setCountText] = useState('1');
  useEffect(() => { setCountText(String(count)); }, [count]);
  const typeCount = (text: string) => { const digits = text.replace(/\D/g, '').slice(0, 3); setCountText(digits); if (digits) setCount(Math.min(MAX_BULK, Math.max(1, Number(digits)))); };
  const listRef = useRef<HTMLDivElement>(null), classBox = useRef<HTMLDivElement>(null);
  useEffect(() => { setOvrs(defaultOvr()); }, [target?.uid, target?.level]);
  useEffect(() => {
    if (!classesOpen) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !classBox.current?.contains(e.target as Node)) setClassesOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [classesOpen]);
  const matches = useMemo(() => all.filter(o => o.level >= levels[0] && o.level <= levels[1] && o.ovr >= ovrs[0] && o.ovr <= ovrs[1] && (!classes.length || classes.includes(o.tier))), [all, levels, ovrs, classes]);
  const floor = matches[0]?.price ?? null;
  // Đổi điều kiện thì giá tối đa mỗi thẻ về lại giá sàn mới.
  useEffect(() => { setMaxPrice(floor ?? 0); }, [floor]);
  const research = () => { setLevels([1, MAX_LEVEL]); setOvrs(defaultOvr()); setClasses([]); setClassesOpen(false); setCount(1); listRef.current?.scrollTo({ top: 0 }); };
  const setLevel = (i: 0 | 1, value: number) => setLevels(([from, to]) => i ? [Math.min(from, value), value] : [value, Math.max(to, value)]);
  const setOvr = (i: 0 | 1, value: number) => setOvrs(([from, to]) => i ? [Math.min(from, value), value] : [value, Math.max(to, value)]);
  const toggleClass = (tier: Tier) => setClasses(list => list.includes(tier) ? list.filter(t => t !== tier) : [...list, tier]);

  const levelDrop = (i: 0 | 1) => <Dropdown className="um-drop-level" label={i ? 'Cấp thẻ đến' : 'Cấp thẻ từ'} value={levels[i]} options={range(1, MAX_LEVEL)} render={level => <img src={levelBadge(level)} alt={`+${level}`}/>} onChange={value => setLevel(i, value)}/>;
  const ovrDrop = (i: 0 | 1) => <Dropdown className="um-drop-ovr" label={i ? 'Chỉ số đến' : 'Chỉ số từ'} value={ovrs[i]} options={range(minOvrAll, maxOvrAll)} render={value => <b>{value}</b>} onChange={value => setOvr(i, value)}/>;
  const classPicker = <div className="um-classes" ref={classBox}>
    <button className={`um-class-btn ${classes.length ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={classesOpen} onClick={() => setClassesOpen(o => !o)}><span>Lớp cầu thủ{classes.length ? ` (${classes.length})` : ''}</span><Menu size={18}/></button>
    {classesOpen && <div className="um-class-menu" role="dialog" aria-label="Chọn lớp cầu thủ">
      <div className="um-class-head"><button onClick={() => setClasses([])} className={!classes.length ? 'on' : ''}>Tất cả</button><button onClick={() => setClassesOpen(false)}>Xong<ChevronUp size={14}/></button></div>
      <div className="um-class-grid">{tiers.map(tier => <button key={tier} aria-pressed={classes.includes(tier)} title={seasons[tier]} onClick={() => toggleClass(tier)}><b className={`squad-season season-tag-${tier}`}>{seasonShort(tier)}</b><span>{seasons[tier]}</span></button>)}</div>
    </div>}
  </div>;
  const researchBtn = <button className="fco-ghost um-research" onClick={research} title="Đặt lại điều kiện tìm kiếm">Tìm kiếm lại<RefreshCw size={15}/></button>;

  if (mode === 'buy') {
    const shown = matches.slice(0, LIST_LIMIT);
    return <>
      <div className="um-filters"><div className="um-pair">{levelDrop(0)}<i>~</i>{levelDrop(1)}</div><div className="um-pair">{ovrDrop(0)}<i>~</i>{ovrDrop(1)}</div>{classPicker}</div>
      <div className="fco-table um-list" role="table">
        <div className="fco-head" role="row">{['Tăng', 'Vị trí', 'Tên cầu thủ', 'OVR', 'Thẻ', 'Giá'].map(label => <span key={label} role="columnheader" className={label === 'Giá' ? 'um-price-head' : undefined}>{label}</span>)}<span role="columnheader"/></div>
        <div className="fco-body" role="rowgroup" aria-label="Cầu thủ đang bán, giá thấp đến cao" tabIndex={0} ref={listRef}>
          {shown.map(o => {
            const p = getPlayer(o), short = !free && balance < o.price, boost = target ? upgradeInfo(target, [{ uid: '', received: 0, playerId: o.playerId, level: o.level }]).energy : 0;
            return <button key={`${o.playerId}-${o.level}`} role="row" className="fco-line" disabled={short} title={short ? 'Không đủ BP để mua thẻ này' : `Mua ${p.name} +${o.level}`} onClick={() => onBuy(o)}>
              <span className="fco-boost" aria-label={`Tăng ${boost}% năng lượng`} title={`${boost}% năng lượng · ${Number((boost / 20).toFixed(3))} vạch`}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--energy-fill': `${Math.min(100, Math.max(0, boost - (n - 1) * 20) * 5)}%` } as CSSProperties} className={boost >= n * 20 ? 'on' : boost > (n - 1) * 20 ? 'part' : ''}/>)}</span>
              <span className={`fco-pos pos-${posGroup(p.pos)}`}>{p.pos}</span>
              <span className="fco-name"><img src={p.cardFace || p.image || asset('/assets/silhouette.svg')} alt=""/><em className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</em><b>{p.name}</b></span>
              <span className="fco-ovr">{o.ovr}</span>
              <span><img className="fco-badge" src={levelBadge(o.level)} alt={`+${o.level}`}/></span>
              <span className="fco-cost">{money(o.price)}</span>
              <span/>
            </button>;
          })}
          {!shown.length && <p className="fine-print um-empty">Không có cầu thủ phù hợp điều kiện. Hãy nới khoảng chỉ số, cấp thẻ hoặc lớp cầu thủ.</p>}
          {matches.length > LIST_LIMIT && <p className="fine-print um-empty">Hiện {LIST_LIMIT} thẻ rẻ nhất trong {money(matches.length)} kết quả.</p>}
        </div>
      </div>
      <div className="fco-actions">{researchBtn}<span className="um-count">{money(matches.length)} kết quả</span></div>
    </>;
  }

  // Mua hàng loạt: mua thẻ rẻ nhất thỏa điều kiện, chỉ khi giá không vượt giá tối đa mỗi thẻ.
  const pick = matches[0] && matches[0].price <= maxPrice ? matches[0] : null;
  const estimate = maxPrice * count, cost = pick ? pick.price * count : 0;
  const blocked = !pick ? (matches.length ? 'Giá tối đa mỗi thẻ thấp hơn giá sàn hiện tại.' : 'Không có cầu thủ phù hợp điều kiện.') : !free && balance < cost ? 'Không đủ BP để mua số lượng này.' : '';
  return <>
    <div className="um-bulk">
      <div className="um-bulk-row um-floor"><span>Giá sàn tối thiểu dự kiến theo ĐK hiện tại<i className="fco-help" title="Giá thẻ rẻ nhất đang bán thỏa điều kiện cấp thẻ, chỉ số và lớp cầu thủ bên dưới.">?</i></span><strong>{floor === null ? '–' : money(floor)}</strong></div>
      <div className="um-bulk-group">
        <div className="um-bulk-row"><span>Nâng cấp</span><div className="um-pair">{levelDrop(0)}<i>~</i>{levelDrop(1)}</div></div>
        <div className="um-bulk-row"><span>Chỉ số</span><div className="um-pair">{ovrDrop(0)}<i>~</i>{ovrDrop(1)}</div></div>
        <div className="um-bulk-row"><span>Lớp cầu thủ</span>{classPicker}</div>
      </div>
      <div className="um-bulk-group">
        <label className="um-bulk-row um-max"><span>Giá trị tối đa mỗi thẻ</span><span className="um-max-field"><input inputMode="numeric" value={money(maxPrice)} onChange={e => setMaxPrice(Math.min(Number.MAX_SAFE_INTEGER, Number(e.target.value.replace(/\D/g, '')) || 0))} onFocus={e => e.target.select()}/><small>{pick ? `Mua với giá ${money(pick.price)}` : money(maxPrice)}</small></span></label>
        <div className="um-bulk-row"><span>Số lượng</span><div className="um-stepper"><input aria-label="Số lượng thẻ mua" inputMode="numeric" value={countText} onChange={e => typeCount(e.target.value)} onBlur={() => setCountText(String(count))} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setCount(c => Math.min(MAX_BULK, Math.max(1, c + (e.key === 'ArrowUp' ? 1 : -1)))); } }}/><span><button aria-label="Tăng số lượng" disabled={count >= MAX_BULK} onClick={() => setCount(c => Math.min(MAX_BULK, c + 1))}><ChevronUp size={14}/></button><button aria-label="Giảm số lượng" disabled={count <= 1} onClick={() => setCount(c => Math.max(1, c - 1))}><ChevronDown size={14}/></button></span></div></div>
      </div>
      <div className="um-bulk-row um-total"><span>Tổng số tiền tiêu hao dự tính</span><strong>{money(estimate)}</strong></div>
      <p className="um-note">{blocked || `Bạn sẽ mua ${count} cầu thủ với giá sàn từ tổng số tiền tiêu hao dự tính trên.${free ? ' Chế độ thử: không trừ BP.' : ''}`}</p>
    </div>
    <div className="fco-actions">{researchBtn}<button className="fco-go" disabled={!!blocked} onClick={() => pick && onBulkBuy(pick, count)}>Mua hàng loạt</button></div>
  </>;
}
