import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { CLUB_NAMES, clubLogoUrl } from './club-logo';

// Chọn logo CLB làm ảnh đại diện HLV + logo đội GLXH (migration 202611120004). Danh sách = mọi CLB có logo trong game (src/clubLogos.json).
type Props = { value: string | null; onChoose: (club: string | null) => Promise<boolean> | boolean };

export default function ClubLogoPicker({ value, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const q = query.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return q ? CLUB_NAMES.filter(n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)) : CLUB_NAMES;
  }, [query]);
  const choose = async (club: string | null) => {
    if (busy) return;
    setBusy(true);
    try { if (await onChoose(club)) setOpen(false); } finally { setBusy(false); }
  };
  const current = clubLogoUrl(value);
  return <section className="club-picker" aria-label="Logo CLB">
    <div className="club-picker-head">
      <span className="club-picker-current">{current ? <img src={current} alt=""/> : <span>?</span>}</span>
      <div><b>Logo CLB</b><small>{value && current ? value : 'Chưa chọn'} · dùng cho ảnh đại diện và đội GLXH</small></div>
      <button type="button" className="secondary-button" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Đóng' : value ? 'Đổi logo' : 'Chọn logo'}</button>
    </div>
    {open && <div className="club-picker-body">
      <label className="club-picker-search"><Search size={14}/><input value={query} placeholder="Tìm CLB…" onChange={e => setQuery(e.target.value)} aria-label="Tìm CLB"/></label>
      <ul className="club-picker-grid">
        {value && <li><button type="button" className="club-picker-none" disabled={busy} onClick={() => void choose(null)} title="Bỏ logo"><X size={18}/><span>Bỏ logo</span></button></li>}
        {list.map(name => <li key={name}><button type="button" disabled={busy} aria-pressed={name === value} onClick={() => void choose(name)} title={name}>
          <img src={clubLogoUrl(name)!} alt="" loading="lazy"/><span>{name}</span>{name === value && <Check size={14} className="club-picker-check"/>}
        </button></li>)}
        {!list.length && <li className="club-picker-empty">Không tìm thấy CLB.</li>}
      </ul>
    </div>}
  </section>;
}
