import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MAX_LEVEL, players } from './game';
import type { Player } from './game';
import { baseTraitIcon, extraOf, traitIdsOf, traitOptions } from './player-extra';
import { goldTraitIcon } from './gold-traits';
import { physicalOf } from './physical';
import { NOT_CLUBS, positionGroup } from './squad';
import { SeasonBadge } from './badges';
import TeamColorPicker from './TeamColorPicker';
import SearchPicker, { normalizeSearch } from './SearchPicker';
import type { Tier } from './game';
import './market-advanced.css';

// Bảng "Nâng cao" của TTCN (người dùng 2026-11-24): xổ xuống dưới thanh tím, cột trái Tìm kiếm cơ bản / Lưu tìm kiếm 1–3, bên phải 4 cột bộ lọc.
// Bộ lọc nào chưa có dữ liệu trong game (Giải đấu, Lục địa, Team color chi tiết, C.Số chi tiết) hiện mờ, không chọn được.
export type Adv = { wageMin: string; wageMax: string; hMin: string; hMax: string; wMin: string; wMax: string; yMin: string; yMax: string; body: string; footL: string; footR: string; skill: string; club: string; nation: string; t1: string; t2: string; t3: string };
export const EMPTY_ADV: Adv = { wageMin: '', wageMax: '', hMin: '', hMax: '', wMin: '', wMax: '', yMin: '', yMax: '', body: '', footL: '', footR: '', skill: '', club: '', nation: '', t1: '', t2: '', t3: '' };
export const advCount = (a: Adv) => Object.values(a).filter(Boolean).length;

const num = (s: string) => Number(s);
const inRange = (v: number | undefined, lo: string, hi: string) => (!lo && !hi) || (v !== undefined && (!lo || v >= num(lo)) && (!hi || v <= num(hi)));
export function matchAdv(p: Player, a: Adv): boolean {
  if (!advCount(a)) return true;
  if (!inRange(p.wage ?? 0, a.wageMin, a.wageMax)) return false;
  if (a.club && p.club !== a.club) return false;
  if (a.nation && p.nation !== a.nation) return false;
  const needPhys = a.hMin || a.hMax || a.wMin || a.wMax || a.body || a.footL || a.footR;
  if (needPhys) {
    const ph = physicalOf(p.id);
    if (!ph || !inRange(ph.height, a.hMin, a.hMax) || !inRange(ph.weight, a.wMin, a.wMax) || (a.body && ph.body !== a.body) || (a.footL === 'R' && ph.right < ph.left) || (a.footL === 'L' && ph.left < ph.right) || (a.footR && Math.min(ph.left, ph.right) < num(a.footR))) return false;
  }
  const needExtra = a.yMin || a.yMax || a.skill || a.t1 || a.t2 || a.t3;
  if (needExtra) {
    const ex = extraOf(p.id);
    if (!ex) return false;
    if (a.yMin || a.yMax) { const y = ex.birth ? Number(ex.birth.slice(0, 4)) : undefined; if (!inRange(y, a.yMin, a.yMax)) return false; }
    if (a.skill && ex.skill !== num(a.skill)) return false;
    const have = a.t1 || a.t2 || a.t3 ? traitIdsOf(p.id) : [];
    for (const t of [a.t1, a.t2, a.t3]) if (t && !have.includes(num(t))) return false;
  }
  return true;
}

const range = (from: number, to: number, step = 1) => { const out: number[] = []; for (let i = from; i <= to; i += step) out.push(i); return out; };
let rangesCache: { wage: number[]; height: number[]; weight: number[]; year: number[]; clubs: string[]; nations: string[]; bodies: string[] } | null = null;
function ranges() {
  if (rangesCache) return rangesCache;
  let wMin = 99, wMax = 0, hMin = 999, hMax = 0, kMin = 999, kMax = 0, yMin = 9999, yMax = 0;
  const clubs = new Set<string>(), nations = new Set<string>(), bodies = new Set<string>();
  for (const p of players) {
    const w = p.wage ?? 0; wMin = Math.min(wMin, w); wMax = Math.max(wMax, w);
    if (p.club && !NOT_CLUBS.has(p.club)) clubs.add(p.club); // tên mùa ghi ở ô CLB (Ballon d’Or, 23 Hard Worker, 24 Energetic Player…) không phải CLB if (p.nation) nations.add(p.nation);
    const ph = physicalOf(p.id); if (ph) { hMin = Math.min(hMin, ph.height); hMax = Math.max(hMax, ph.height); kMin = Math.min(kMin, ph.weight); kMax = Math.max(kMax, ph.weight); if (ph.body) bodies.add(ph.body); }
    const ex = extraOf(p.id); if (ex?.birth) { const y = Number(ex.birth.slice(0, 4)); if (y) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); } }
  }
  const col = new Intl.Collator('vi');
  return rangesCache = { wage: range(wMin, wMax), height: range(hMin, hMax), weight: range(kMin, kMax), year: range(yMin, yMax).reverse(), clubs: [...clubs].sort(col.compare), nations: [...nations].sort(col.compare), bodies: [...bodies] };
}

// Chỗ mở danh sách xổ xuống: mặc định mở xuống; nếu dưới ô không đủ chỗ (bảng Nâng cao hết chiều cao) thì mở lên, và luôn giới hạn chiều cao để không bị cắt / khuất.
function useDropPlace(open: boolean, box: React.RefObject<HTMLElement | null>): CSSProperties {
  const [place, setPlace] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect(), floor = box.current.closest('.mka')?.getBoundingClientRect().bottom ?? window.innerHeight, ceil = box.current.closest('.mka')?.getBoundingClientRect().top ?? 0;
    const below = floor - r.bottom - 8, above = r.top - ceil - 8, up = below < 240 && above > below;
    setPlace(up ? { top: 'auto', bottom: '100%', maxHeight: Math.max(140, Math.min(360, above)) } : { maxHeight: Math.max(140, Math.min(360, below)) });
  }, [open, box]);
  return place;
}

// Chữ dài quá ô thì cắt và chạy qua lại (người dùng 2026-11-24): đo phần tràn, rồi dịch chữ tới cuối và về đầu liên tục; vừa ô thì đứng yên.
function Marq({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const el = box.current, inner = el?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !inner) return;
    const measure = () => setShift(Math.max(0, Math.ceil(inner.scrollWidth - el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  return <span ref={box} className="mka-marq" style={{ '--shift': `${shift}px`, '--dur': `${(shift / 28 + 2.4).toFixed(1)}s` } as CSSProperties}><span className={shift > 0 ? 'is-run' : undefined}>{children}</span></span>;
}

// Vị trí chọn nhiều (người dùng 2026-11-24): nút "Vị trí" xổ bảng 4 cột FW / MF / DF / GK, mỗi vị trí một ô tích, tiêu đề cột tích cả nhóm. Giá trị lưu dạng "ST,LW,CAM".
const GROUPS: { id: 'fw' | 'mf' | 'df' | 'gk'; label: string; first: string[] }[] = [
  { id: 'fw', label: 'FW', first: ['ST', 'LW', 'RW', 'CF'] }, { id: 'mf', label: 'MF', first: ['CAM', 'LM', 'CM', 'RM', 'CDM'] },
  { id: 'df', label: 'DF', first: ['LWB', 'RWB', 'LB', 'CB', 'RB'] }, { id: 'gk', label: 'GK', first: ['GK'] },
];
function PositionPicker({ value, onChange, positions }: { value: string; onChange: (v: string) => void; positions: string[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const chosen = value ? value.split(',') : [];
  const place = useDropPlace(open, box);
  const cols = GROUPS.map(g => ({ ...g, list: [...g.first.filter(x => positions.includes(x)), ...positions.filter(x => positionGroup(x) === g.id && !g.first.includes(x))] }));
  const toggle = (list: string[], on: boolean) => { const rest = chosen.filter(x => !list.includes(x)); onChange((on ? [...rest, ...list] : rest).join(',')); };
  return <div className="mka-pos" ref={box}>
    <button type="button" className={`mka-pos-head${chosen.length ? ' has' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}><Marq>{chosen.length ? chosen.join(', ') : 'Vị trí'}</Marq><i aria-hidden="true" className={open ? 'up' : ''}/></button>
    {open && <div className="mka-pos-list" style={place} role="listbox" aria-multiselectable="true" aria-label="Vị trí">{cols.map(c => <div className="mka-pos-col" key={c.id}>
      <label className={`mka-pos-row is-head pos-${c.id}`}><span><u/>{c.label}</span><input type="checkbox" checked={c.list.length > 0 && c.list.every(x => chosen.includes(x))} onChange={e => toggle(c.list, e.target.checked)}/><i aria-hidden="true"/></label>
      {c.list.map(pos => <label className="mka-pos-row" key={pos}><span>{pos}</span><input type="checkbox" checked={chosen.includes(pos)} onChange={e => toggle([pos], e.target.checked)}/><i aria-hidden="true"/></label>)}
    </div>)}</div>}
  </div>;
}

// Mùa chọn nhiều (người dùng 2026-11-24): nút "Mùa" có biểu tượng ≡, bấm xổ danh sách mùa kèm huy hiệu và ô tích. Giá trị lưu dạng "wg,cc,uc".
function SeasonPicker({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: { value: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const chosen = value ? value.split(',') : [];
  const place = useDropPlace(open, box);
  const toggle = (id: string, on: boolean) => onChange((on ? [...chosen, id] : chosen.filter(x => x !== id)).join(','));
  return <div className="mka-pos mka-season" ref={box}>
    <button type="button" className={`mka-pos-head is-menu${chosen.length ? ' has' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}><Marq>{chosen.length ? `Mùa (${chosen.length})` : 'Mùa'}</Marq><i aria-hidden="true"/></button>
    {open && <div className="mka-season-list" style={place} role="listbox" aria-multiselectable="true" aria-label="Mùa thẻ">{list.map(o => <label className="mka-pos-row" key={o.value}><span><SeasonBadge tier={o.value as Tier}/><Marq>{o.text}</Marq></span>
      <input type="checkbox" checked={chosen.includes(o.value)} onChange={e => toggle(o.value, e.target.checked)}/><i aria-hidden="true"/></label>)}</div>}
  </div>;
}

// Ô chọn cấp thẻ kiểu FC Online (người dùng 2026-11-24): nút hiện huy hiệu cấp + mũi tên, bấm xổ lưới huy hiệu 1…13 (5 cột), ô đang chọn có dấu tích xanh.
function LevelDrop({ value, onChange, badge, allowAny, label }: { value: string; onChange: (v: string) => void; badge: (level: number) => string; allowAny: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const place = useDropPlace(open, box);
  return <div className="mka-lv" ref={box}>
    <button type="button" className="mka-lv-head" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}>{value ? <img src={badge(Number(value))} alt={`+${value}`}/> : <span>--</span>}<i aria-hidden="true" className={open ? 'up' : ''}/></button>
    {open && <div className="mka-lv-list" style={place} role="listbox" aria-label={label}>
      {allowAny && <button type="button" role="option" aria-selected={!value} className={!value ? 'is-on' : ''} onClick={() => pick('')}>{!value && <b aria-hidden="true"/>}<span>--</span></button>}
      {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(n => <button type="button" role="option" aria-selected={value === String(n)} className={value === String(n) ? 'is-on' : ''} key={n} onClick={() => pick(String(n))}>{value === String(n) && <b aria-hidden="true"/>}<img src={badge(n)} alt={`+${n}`}/></button>)}
    </div>}
  </div>;
}

// Danh sách chọn một giá trị kiểu FC Online (người dùng 2026-11-24): nút hiện tên mục / nhãn, bấm xổ cột chữ trắng đậm căn giữa; dòng đầu là nhãn (xanh), bấm để bỏ chọn.
// Mục off (chưa có dữ liệu trong game) hiện mờ, không chọn được.
function ListDrop({ value, onChange, title, options, starry, menu }: { value: string; onChange: (v: string) => void; title: string; options: { value: string; label: string; off?: boolean; icon?: string }[]; starry?: boolean; menu?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const current = options.find(o => o.value === value);
  const place = useDropPlace(open, box);
  return <div className={`mka-pos mka-listdrop${starry ? ' is-stars' : ''}`} ref={box}>
    <button type="button" className={`mka-pos-head${menu ? ' is-menu' : ''}${value || open ? ' has' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}><Marq>{current?.label ?? title}</Marq><i aria-hidden="true" className={open ? 'up' : ''}/></button>
    {open && <ul className="mka-drop-list" style={place} role="listbox" aria-label={title}>
      <li role="option" aria-selected={!value} className="is-title" onClick={() => pick('')}><Marq>{title}</Marq></li>
      {options.map(o => <li key={o.value} role="option" aria-selected={value === o.value} aria-disabled={o.off || undefined} title={o.off ? 'Chưa có dữ liệu' : undefined} className={`${value === o.value ? 'is-on' : ''}${o.off ? ' is-off' : ''}${o.icon ? ' has-icon' : ''}`} onClick={() => { if (!o.off) pick(o.value); }}>{o.icon && <img src={o.icon} alt="" loading="lazy"/>}<Marq>{o.label}</Marq></li>)}
    </ul>}
  </div>;
}
// Kỹ năng hai chân (người dùng 2026-11-24): ô 1 = chân thuận (chân điểm cao hơn; hai chân bằng nhau tính là thuận cả hai nên khớp cả phải lẫn trái), ô 2 = điểm chân không thuận (chân điểm thấp hơn) tối thiểu.
// Thể hình theo dữ liệu fifaaddict: Nhỏ / TB / Sức khỏe ↔ Nhỏ / Trung bình / To; ba kiểu Special game có nhưng chưa có dữ liệu.
const BODY_OPTIONS = [{ value: 'Nhỏ', label: 'Nhỏ' }, { value: 'TB', label: 'Trung bình' }, { value: 'Sức khỏe', label: 'To' },
  { value: 'Nhỏ(Special)', label: 'Nhỏ(Special)', off: true }, { value: 'TB(Special)', label: 'TB(Special)', off: true }, { value: 'To(Special)', label: 'To(Special)', off: true }];

function Sel({ value, onChange, options, placeholder = '--', disabled, label }: { value: string; onChange?: (v: string) => void; options: { value: string; text: string }[]; placeholder?: string; disabled?: boolean; label: string }) {
  return <label className={`mka-sel${disabled ? ' is-off' : ''}`}><span className="sr-only">{label}</span>
    <select value={value} disabled={disabled} aria-label={label} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>{options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select><i aria-hidden="true"/></label>;
}
const opts = (list: (number | string)[]) => list.map(v => ({ value: String(v), text: String(v) }));
// Ô nhập số (người dùng 2026-11-24): OVR, Lương, Chiều cao, Cân nặng tự gõ, không xổ thanh chọn; chỉ nhận chữ số, tối đa 4 chữ số.
function NumBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="mka-in" inputMode="numeric" autoComplete="off" placeholder="--" aria-label={label} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}/>;
}
function Pair({ label, lo, hi, onLo, onHi, options, typed }: { label: string; lo: string; hi: string; onLo: (v: string) => void; onHi: (v: string) => void; options?: (number | string)[]; typed?: boolean }) {
  return <div className="mka-field"><span className="mka-label">{label}</span><div className="mka-pair">{typed
    ? <><NumBox label={`${label} từ`} value={lo} onChange={onLo}/><em>~</em><NumBox label={`${label} đến`} value={hi} onChange={onHi}/></>
    : <><Sel label={`${label} từ`} value={lo} onChange={onLo} options={opts(options ?? [])}/><em>~</em><Sel label={`${label} đến`} value={hi} onChange={onHi} options={opts(options ?? [])}/></>}</div></div>;
}

type Props = {
  adv: Adv; onAdv: (a: Adv) => void;
  position: string; onPosition: (v: string) => void; positions: string[];
  ovrMin: string; ovrMax: string; onOvrMin: (v: string) => void; onOvrMax: (v: string) => void; ovrs: number[];
  season: string; onSeason: (v: string) => void; seasonList: { value: string; text: string }[];
  level: string; onLevel: (v: string) => void; levelAll: boolean; levelMax: string; onLevelMax: (v: string) => void; levelBadge: (level: number) => string;
  teamColor: string; onTeamColor: (v: string) => void;
  slot: number; onSlot: (i: number) => void; savedSlots: boolean[]; onSave: () => void; onReset: () => void;
};
export default function MarketAdvanced(p: Props) {
  // Loại team color (CLB / quốc gia): đang có giá trị thì suy ra loại từ tiền tố, chưa có thì theo lựa chọn vừa bấm.
  const [tcKind, setTcKind] = useState<'' | 'club' | 'nation'>('');
  const kind = (p.teamColor.startsWith('club:') ? 'club' : p.teamColor.startsWith('nation:') ? 'nation' : tcKind);
  const R = ranges(), a = p.adv, set = (k: keyof Adv) => (v: string) => p.onAdv({ ...a, [k]: v });
  const traits = [...traitOptions()].sort((x, y) => Number(y.id >= 50) - Number(x.id >= 50) || x.id - y.id); // chỉ số ẩn vàng (mã 50+) lên trước như ảnh mẫu
  const side = ['Tìm kiếm cơ bản', 'Lưu tìm kiếm 1', 'Lưu tìm kiếm 2', 'Lưu tìm kiếm 3'];
  return <div className="mka" role="dialog" aria-label="Tìm kiếm nâng cao">
    <nav className="mka-side" aria-label="Bộ lọc đã lưu">{side.map((s, i) => <button key={s} type="button" className={p.slot === i ? 'is-on' : ''} onClick={() => p.onSlot(i)}>{s}{i > 0 && p.savedSlots[i - 1] && <i title="Đã lưu"/>}</button>)}</nav>
    <div className="mka-main">
      <header><h2>{side[p.slot]}</h2><span>{p.slot > 0 && <button type="button" onClick={p.onSave}>Lưu bộ lọc này</button>}<button type="button" onClick={p.onReset}>Tạo lại</button></span></header>
      <div className="mka-grid">
        <div className="mka-col">
          <div className="mka-field"><span className="mka-label">Vị trí</span><PositionPicker value={p.position} onChange={p.onPosition} positions={p.positions}/></div>
          <Pair label="OVR" lo={p.ovrMin} hi={p.ovrMax} onLo={p.onOvrMin} onHi={p.onOvrMax} typed/>
          <Pair label="Lương" lo={a.wageMin} hi={a.wageMax} onLo={set('wageMin')} onHi={set('wageMax')} typed/>
          <div className="mka-field"><span className="mka-label">Mùa</span><SeasonPicker value={p.season} onChange={p.onSeason} list={p.seasonList}/></div>
          <div className="mka-field"><span className="mka-label">Nâng cấp</span><div className="mka-pair"><LevelDrop label="Cấp thẻ từ" value={p.level} onChange={p.onLevel} badge={p.levelBadge} allowAny={p.levelAll}/><em>~</em><LevelDrop label="Cấp thẻ đến" value={p.levelMax || (p.levelAll ? '' : p.level)} onChange={p.onLevelMax} badge={p.levelBadge} allowAny={p.levelAll}/></div></div>
        </div>
        <div className="mka-col">
          <Pair label="Chiều cao" lo={a.hMin} hi={a.hMax} onLo={set('hMin')} onHi={set('hMax')} typed/>
          <Pair label="Cân nặng" lo={a.wMin} hi={a.wMax} onLo={set('wMin')} onHi={set('wMax')} typed/>
          <Pair label="Năm sinh" lo={a.yMin} hi={a.yMax} onLo={set('yMin')} onHi={set('yMax')} typed/>
          <div className="mka-field"><span className="mka-label">Thể hình</span><ListDrop value={a.body} onChange={set('body')} title="Thể hình" options={BODY_OPTIONS}/></div>
          <div className="mka-field"><span className="mka-label">Kỹ năng của hai chân</span><div className="mka-pair is-feet"><ListDrop value={a.footL} onChange={set('footL')} title="Chân thuận" options={[{ value: 'R', label: 'Chân phải' }, { value: 'L', label: 'Chân trái' }]}/><ListDrop value={a.footR} onChange={set('footR')} title="Chân không thuận" options={[1, 2, 3, 4].map(n => ({ value: String(n), label: `Từ ${n} trở lên` })).concat([{ value: '5', label: '5' }])}/></div></div>
          <div className="mka-field"><span className="mka-label">Kỹ thuật</span><ListDrop starry value={a.skill} onChange={set('skill')} title="Kỹ thuật" options={[2, 3, 4, 5].map(n => ({ value: String(n), label: '★'.repeat(n) }))}/></div>
        </div>
        <div className="mka-col">
          <div className="mka-field"><span className="mka-label">Team color</span><ListDrop menu value={kind} onChange={v => { setTcKind(v as '' | 'club' | 'nation'); p.onTeamColor(''); }} title="Loại team color" options={[{ value: 'club', label: 'Câu lạc bộ' }, { value: 'nation', label: 'Quốc gia' }]}/>
            {kind ? <div className="mka-tc"><TeamColorPicker kind={kind} value={p.teamColor} onChange={p.onTeamColor}/></div> : <Sel label="Team color" value="" disabled placeholder="Team color" options={[]}/>}</div>
          <div className="mka-field"><span className="mka-label">C.Số ẩn</span>{(['t1', 't2', 't3'] as const).map((k, i) => <ListDrop key={k} value={a[k]} onChange={set(k)} title={`C.Số ẩn ${i + 1}`}
            options={traits.map(t => ({ value: String(t.id), label: t.name, icon: t.id >= 50 ? goldTraitIcon(String(t.id)) : baseTraitIcon(t.id), off: (['t1', 't2', 't3'] as const).some(o => o !== k && a[o] === String(t.id)) }))}/>)}</div>
        </div>
      </div>
    </div>
  </div>;
}
