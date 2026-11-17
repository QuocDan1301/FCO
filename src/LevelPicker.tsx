import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './level-picker.css';

// Ô chọn mức cộng: hiện huy hiệu cấp đang chọn, bấm mở danh sách huy hiệu +1 … +N (thay cho <select> chỉ có chữ).
// Dùng ở Thông tin cầu thủ (PlayerDetail) và cửa sổ Mua cầu thủ (BuyOrderDialog). tone: 'dark' (nền tối) / 'light' (nền sáng).
type Props = {
  value: number;
  levels: number[];
  levelBadge: (level: number) => string;
  onChange: (level: number) => void;
  tone?: 'dark' | 'light';
  className?: string;
};

export default function LevelPicker({ value, levels, levelBadge, onChange, tone = 'dark', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    list.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  return <div ref={box} className={`lvp is-${tone}${open ? ' is-open' : ''} ${className}`}>
    <button type="button" className="lvp-current" aria-haspopup="listbox" aria-expanded={open} aria-label={`Mức cộng +${value}, bấm để đổi`} onClick={() => setOpen(o => !o)}>
      <img src={levelBadge(value)} alt={`+${value}`}/><ChevronDown size={14}/>
    </button>
    {open && <div ref={list} className="lvp-list" role="listbox" aria-label="Chọn mức cộng">
      {levels.map(lv => <button key={lv} type="button" role="option" aria-selected={lv === value} aria-label={`+${lv}`} onClick={() => { onChange(lv); setOpen(false); }}>
        <img src={levelBadge(lv)} alt=""/>
      </button>)}
    </div>}
  </div>;
}
