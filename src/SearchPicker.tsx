import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Search, X } from 'lucide-react';

// Ô lọc gõ-để-tìm dùng chung ở TTCN (Mùa thẻ, OVR, Team color): gõ (không cần dấu) → danh sách gợi ý có biểu tượng, chia nhóm;
// ↑ ↓ Enter để chọn, Esc để đóng; gõ đúng một mục rồi bấm ra ngoài / Tab cũng chọn luôn. Nút × bỏ lọc.
export type PickerOption = { value: string; label: string; key: string; icon?: ReactNode; hint?: string; group?: ReactNode; groupId?: string };

export const normalizeSearch = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();

type Props = {
  value: string; onChange: (value: string) => void; options: readonly PickerOption[];
  ariaLabel: string; placeholder: string;
  // numeric: bàn phím số trên điện thoại, chỉ khớp phần đầu (gõ "12" → 120…129); compact: ô hẹp (OVR).
  numeric?: boolean; compact?: boolean; listLabel?: string; empty?: string;
};

export default function SearchPicker({ value, onChange, options, ariaLabel, placeholder, numeric = false, compact = false, listLabel, empty = 'Không tìm thấy' }: Props) {
  const selected = value ? options.find(o => o.value === value) ?? null : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // Chỗ hiện danh sách: mở xuống nếu đủ chỗ, không thì mở lên (điện thoại cầm ngang: thanh dưới che); cao tối đa vừa chỗ trống.
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 340 });
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect(), dock = document.querySelector('.app-dock')?.getBoundingClientRect();
    const floor = dock && dock.top > r.bottom ? dock.top : window.innerHeight, below = floor - r.bottom - 10;
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0, above = r.top - Math.max(0, top) - 10;
    const up = below < 200 && above > below;
    setPlace({ up, max: Math.max(120, Math.min(340, up ? above : below)) });
  }, [open]);
  // Khớp phần đầu lên trước, rồi tới khớp ở giữa; giữ thứ tự nhóm như danh sách gốc.
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return [...options];
    const head = options.filter(o => o.key.startsWith(q) || o.key.includes(` ${q}`));
    if (numeric) return head;
    const rest = options.filter(o => !head.includes(o) && o.key.includes(q));
    const order = new Map<string, number>(); options.forEach(o => { const g = o.groupId ?? ''; if (!order.has(g)) order.set(g, order.size); });
    return [...head, ...rest].map((o, i) => ({ o, i })).sort((a, b) => order.get(a.o.groupId ?? '')! - order.get(b.o.groupId ?? '')! || a.i - b.i).map(x => x.o);
  }, [query, options, numeric]);
  useEffect(() => { setActive(0); }, [query]);
  const choose = (option: PickerOption | null) => { onChange(option?.value ?? ''); setQuery(''); setOpen(false); input.current?.blur(); };
  // Rời ô khi đã gõ đúng tên / số của một mục → chọn mục đó; không thì giữ lựa chọn cũ.
  const leave = () => {
    const q = normalizeSearch(query);
    const exact = q ? options.find(o => o.key === q || normalizeSearch(o.label) === q) : undefined;
    if (exact) onChange(exact.value);
    setQuery(''); setOpen(false);
  };
  const leaveRef = useRef(leave); leaveRef.current = leave;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) leaveRef.current(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // Giữ dòng đang chọn trong khung: chỉ cuộn danh sách (scrollIntoView kéo cả trang cuộn theo); chừa chỗ cho tiêu đề nhóm dính trên cùng.
  useEffect(() => {
    const list = listRef.current, el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !list || !el) return;
    if (el.offsetTop - 30 < list.scrollTop) list.scrollTop = Math.max(0, el.offsetTop - 30);
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
  }, [active, open]);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { if (open && filtered[active]) { e.preventDefault(); choose(filtered[active]); } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setQuery(''); setOpen(false); } }
    else if (e.key === 'Tab') leave();
  };
  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  filtered.forEach((o, i) => {
    if (o.group && o.groupId !== lastGroup) rows.push(<div key={`g-${o.groupId}`} className="sp-group" role="presentation">{o.group}</div>);
    lastGroup = o.groupId;
    rows.push(<div key={o.value} id={`${id}-${i}`} data-index={i} role="option" aria-selected={o.value === value}
      className={`sp-option${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
      onPointerDown={e => e.preventDefault()} onClick={() => choose(o)} onPointerMove={() => { if (active !== i) setActive(i); }}>
      {o.icon}<span className="sp-name">{o.label}</span>{o.hint && <small>{o.hint}</small>}
    </div>);
  });
  return <div className={`sp-picker${compact ? ' is-compact' : ''}`} ref={box}>
    <div className={`sp-field${open ? ' is-open' : ''}`} onClick={() => input.current?.focus()}>
      {selected && !open ? selected.icon : !compact && <Search size={15} className="sp-search"/>}
      <input ref={input} role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined} inputMode={numeric ? 'numeric' : undefined} enterKeyHint="done"
        value={open ? query : selected?.label ?? ''} placeholder={selected ? selected.label : placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }} onClick={() => setOpen(true)} onChange={e => { setQuery(numeric ? e.target.value.replace(/\D/g, '').slice(0, 3) : e.target.value); setOpen(true); }} onKeyDown={onKey}/>
      {value && <button type="button" className="sp-clear" aria-label={`Bỏ lọc ${ariaLabel}`} onPointerDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); choose(null); }}><X size={13}/></button>}
    </div>
    {open && <div className={`sp-list${place.up ? ' is-up' : ''}`} style={{ maxHeight: place.max }} id={`${id}-list`} role="listbox" aria-label={listLabel ?? ariaLabel} ref={listRef}>
      {rows}
      {!filtered.length && <div className="sp-empty">{empty} “{query.trim()}”.</div>}
    </div>}
  </div>;
}
