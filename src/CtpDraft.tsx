import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import { ovr, players, seasons } from './game';
import type { Card, Player, Tier } from './game';
import { marketQuote } from './market';
import { CTP_DRAFT, ctpDraftChances, ctpDraftSize } from './ctp';
import type { CtpDraftResult } from './wallet-state';

// Tuyển chọn cầu thủ (Huy Hiệu Tuyển Chọn) — giao diện theo ảnh mẫu người dùng gửi: tiêu đề + mô tả + "Chi tiết", 2 ô huy hiệu / số lần
// đã chơi, 2 ô tổng giá trị, huy hiệu lớn giữa nền; hàng N ô thẻ ("+" khi trống) với % tỷ lệ phía trên và nút Tuyển chọn; hộp "Chọn cầu thủ"
// lưới thẻ (lọc mùa / vị trí, xếp OVR / giá, trang). Máy chủ: fco_ctp_draft (202611220004_fco_ctp_draft.sql), tỷ lệ nghịch giá.
// Toạ độ px của nền tầng 4 (1920 × 1242) → %; tầng được nối dài thêm phần đá (ảnh lật) để chứa hàng ô thẻ và nút.
const A = (file: string) => `${import.meta.env.BASE_URL}assets/ctp/${file}`;
const H = 1242;
const at = (x: number, y: number) => ({ left: `${x / 19.2}%`, top: `${y / (H / 100)}%` }) as CSSProperties;
const PAGE = 18;
const POSITIONS = ['ST', 'CF', 'LW', 'RW', 'CAM', 'LM', 'RM', 'CM', 'CDM', 'LWB', 'RWB', 'LB', 'RB', 'CB', 'GK'];
const fold = (t: string) => t.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const levelOf = (p: Player) => CTP_DRAFT.levels[p.tier];
const priceOf = (p: Player) => marketQuote({ playerId: p.id, level: levelOf(p) }).price ?? 0;
const ovrOf = (p: Player) => ovr({ playerId: p.id, level: levelOf(p) });
// Giá ghi kiểu mẫu: triệu BP, ngăn cách hàng nghìn ("5.930M", "6.000M BP").
const mBp = (n: number) => `${Math.round(n / 1e6).toLocaleString('vi-VN')}M`;
const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: x < .1 ? 1 : 0 })}%`;
const toCard = (p: Player): Card => ({ uid: `ctd-${p.id}`, playerId: p.id, level: levelOf(p), received: 0 } as Card);

// Thẻ cầu thủ của game (rộng cố định 230 px) thu nhỏ vừa ô chứa.
// Khung cao đúng bằng thẻ thật sau khi thu nhỏ (thẻ có ảnh mặt riêng thấp hơn thẻ thường) → ô giá nằm sát dưới thẻ.
// fit = 'height' (ô thẻ trên nền): thẻ cao đúng bằng ô, căn giữa — thẻ có ảnh mặt riêng (khung 230 × 250, hình thẻ hẹp hơn) không bị nhỏ.
function Scaled({ children, fit = 'width' }: { children: ReactNode; fit?: 'width' | 'height' }) {
  const ref = useRef<HTMLSpanElement>(null), inner = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState(.5), [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current, box = inner.current; if (!el || !box) return;
    const measure = () => {
      if (fit === 'height') { setS(box.offsetHeight ? el.clientHeight / box.offsetHeight : .5); return; }
      const k = el.clientWidth / 230; setS(k); setH(box.offsetHeight * k);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el); ro.observe(box); measure();
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className={`ctd-scaled ${fit === 'height' ? 'is-fill' : ''}`} style={fit === 'width' && h ? { height: h, aspectRatio: 'auto' } : undefined}>
    <span ref={inner} style={{ transform: `scale(${s})` }}>{children}</span></span>;
}

function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  return createPortal(<div className="ctp-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className={`ctd-modal ${wide ? 'is-wide' : ''}`} onClick={e => e.stopPropagation()}>
      <button type="button" className="ctd-close" onClick={onClose} aria-label="Đóng"><X/></button>
      <h2>{title}</h2>
      {children}
    </div>
  </div>, document.body);
}

type Props = { badges: number; opened: number; busy: boolean; onDraft: (ids: number[]) => Promise<CtpDraftResult | null>; renderCard?: (card: Card) => ReactNode };

export default function CtpDraft({ badges, opened, busy, onDraft, renderCard }: Props) {
  const candidates = useMemo(() => players.filter(p => CTP_DRAFT.levels[p.tier] !== undefined && priceOf(p) > 0 && priceOf(p) <= CTP_DRAFT.cap), []);
  const byId = useMemo(() => new Map(candidates.map(p => [p.id, p])), [candidates]);
  const size = ctpDraftSize(opened);
  const [picked, setPicked] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [won, setWon] = useState<CtpDraftResult | null>(null);
  const [working, setWorking] = useState(false);
  const [warn, setWarn] = useState('');
  // Bộ lọc hộp chọn cầu thủ.
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState<Tier | ''>('');
  const [pos, setPos] = useState('');
  const [sort, setSort] = useState<'price-desc' | 'price-asc' | 'ovr-desc' | 'ovr-asc'>('price-desc');
  const [page, setPage] = useState(0);
  const chosen = picked.slice(0, size).map(id => byId.get(id)).filter((p): p is Player => !!p);
  const prices = chosen.map(priceOf), total = prices.reduce((a, b) => a + b, 0), chances = ctpDraftChances(prices);
  const over = total > CTP_DRAFT.cap, full = chosen.length === size;
  const tiers = Object.keys(CTP_DRAFT.levels).filter(t => candidates.some(p => p.tier === t)) as Tier[];
  const list = useMemo(() => {
    const q = fold(query.trim());
    const out = candidates.filter(p => (!q || fold(p.name).includes(q)) && (!season || p.tier === season) && (!pos || p.pos === pos));
    const k = sort.startsWith('price') ? priceOf : ovrOf, dir = sort.endsWith('desc') ? -1 : 1;
    return out.sort((a, b) => dir * (k(a) - k(b)) || a.id - b.id);
  }, [candidates, query, season, pos, sort]);
  useEffect(() => { setPage(0); }, [query, season, pos, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const toggle = (id: number) => setPicked(l => l.includes(id) ? l.filter(x => x !== id) : l.length >= size ? l : [...l.slice(0, size), id]);
  const go = async () => {
    setWarn('');
    if (!full) { setOpen(true); return; }
    if (over) { setWarn('Tổng giá trị vượt 6.000M BP — hãy đổi bớt cầu thủ đắt.'); return; }
    if (badges < 1) { setWarn('Bạn chưa có Huy Hiệu Tuyển Chọn (quà mốc 12.600 điểm).'); return; }
    if (working) return;
    setWorking(true);
    try { const r = await onDraft(chosen.map(p => p.id)); if (r) { setWon(r); setPicked(l => l.slice(0, ctpDraftSize(opened + 1))); } }
    finally { setWorking(false); }
  };
  const card = (p: Player, fit: 'width' | 'height' = 'width') => renderCard ? <Scaled fit={fit}>{renderCard(toCard(p))}</Scaled> : <span className="ctd-fallback">{p.name}</span>;
  // Hàng ô thẻ: căn giữa theo số ô của lượt (10 / 9 / 7 / 5), mỗi ô rộng 120 px nền, cách 22 px.
  const slotW = 120, gap = 22, rowW = size * slotW + (size - 1) * gap, x0 = 960 - rowW / 2;
  const wonP = won ? byId.get(won.playerId) ?? players.find(p => p.id === won.playerId) : undefined;

  return <>
    <h2 className="ctd-title" style={at(960, 82)}>Tuyển chọn</h2>
    <p className="ctd-desc" style={at(960, 168)}>Đặt huy hiệu tuyển chọn để chọn cầu thủ yêu thích theo giá trị, chơi càng nhiều lượt thì càng ít cầu thủ cần chọn nhưng tỷ lệ trúng cầu thủ ngon lại càng cao!
      <button type="button" className="ctd-detail" onClick={() => setInfo(true)}>Chi tiết</button></p>
    <span className="ctd-pill" style={at(960, 248)}>Huy hiệu đang có: {badges}<img src={A('badge-v1.webp')} alt=""/></span>
    <span className="ctd-pill" style={at(960, 296)}>Số lần đã chơi: {opened}</span>
    <span className={`ctd-pill is-wide ${over ? 'is-over' : ''}`} style={at(480, 346)}>Tổng giá trị cầu thủ đã chọn: {mBp(total)} BP</span>
    <span className="ctd-pill is-wide" style={at(1440, 346)}>Tổng giá trị cầu thủ cho phép: {mBp(CTP_DRAFT.cap)} BP</span>
    <img className="ctd-badge" src={A('badge-v1.webp')} alt="Huy Hiệu Tuyển Chọn" style={at(960, 700)} draggable={false}/>
    {Array.from({ length: size }, (_, i) => { const p = chosen[i], x = x0 + i * (slotW + gap) + slotW / 2;
      return <div key={i} className="ctd-slot-wrap" style={at(x, 1300)}>
        <span className="ctd-hex">{p ? pct(chances[i]) : '0%'}</span>
        <button type="button" className={`ctd-slot ${p ? 'is-full' : ''}`} onClick={() => setOpen(true)} aria-label={p ? `${p.name} — đổi cầu thủ` : `Chọn cầu thủ ô ${i + 1}`}>
          {p ? card(p, 'height') : <i aria-hidden="true"/>}
        </button>
      </div>; })}
    <button type="button" className="ctd-go" style={at(960, 1560)} disabled={busy || working} onClick={() => void go()}>Tuyển chọn</button>
    {warn && <p className="ctd-warn" style={at(960, 1630)} role="alert">{warn}</p>}

    {open && <Modal title="Chọn cầu thủ" wide onClose={() => setOpen(false)}>
      <div className="ctd-tools">
        <label className="ctd-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nhập tên cầu thủ" aria-label="Tìm theo tên"/><Search aria-hidden="true"/></label>
        <select className="ctd-tool" value={season} onChange={e => setSeason(e.target.value as Tier | '')} aria-label="Mùa"><option value="">Mùa</option>{tiers.map(t => <option key={t} value={t}>{seasons[t]} (+{CTP_DRAFT.levels[t]})</option>)}</select>
        <select className="ctd-tool" value={pos} onChange={e => setPos(e.target.value)} aria-label="Vị trí"><option value="">Vị trí</option>{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <button type="button" className={`ctd-tool ${sort.startsWith('ovr') ? 'is-on' : ''}`} onClick={() => setSort(sort === 'ovr-desc' ? 'ovr-asc' : 'ovr-desc')}>OVR {sort === 'ovr-asc' ? '↑' : sort === 'ovr-desc' ? '↓' : ''}</button>
        <button type="button" className={`ctd-tool ${sort.startsWith('price') ? 'is-on' : ''}`} onClick={() => setSort(sort === 'price-desc' ? 'price-asc' : 'price-desc')}>Giá {sort === 'price-asc' ? '↑' : sort === 'price-desc' ? '↓' : ''}</button>
        <button type="button" className="ctd-tool is-icon" onClick={() => { setQuery(''); setSeason(''); setPos(''); setSort('price-desc'); }} aria-label="Đặt lại bộ lọc"><RotateCcw/></button>
      </div>
      <nav className="ctd-pages" aria-label="Trang">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft/></button>
        {[...new Set([0, 1, 2, 3, 4, page - 1, page, page + 1, pages - 1])].filter(n => n >= 0 && n < pages).sort((a, b) => a - b).map((n, i, arr) =>
          <span key={n}>{i > 0 && n - arr[i - 1] > 1 && <i>…</i>}<button type="button" className={n === page ? 'is-on' : ''} onClick={() => setPage(n)}>{n + 1}</button></span>)}
        <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight/></button>
      </nav>
      <p className="ctd-count">Số lượng cầu thủ đã chọn: {chosen.length}/{size}</p>
      <p className={`ctd-count ${over ? 'is-over' : ''}`}>Tổng giá trị cầu thủ đã chọn: {mBp(total)} BP</p>
      <div className="ctd-grid">{shown.map(p => { const on = picked.includes(p.id);
        return <button key={p.id} type="button" className={`ctd-pick ${on ? 'is-on' : ''}`} disabled={!on && chosen.length >= size} onClick={() => toggle(p.id)}
          aria-pressed={on} aria-label={`${p.name} +${levelOf(p)}, OVR ${ovrOf(p)}, ${mBp(priceOf(p))} BP`}>
          <span className="ctd-pick-card">{card(p)}{on && <b className="ctd-check"><Check/></b>}</span>
          <span className="ctd-price">{mBp(priceOf(p))}</span>
        </button>; })}
        {!shown.length && <p className="ctd-empty">Không tìm thấy cầu thủ phù hợp.</p>}</div>
      <button type="button" className="ctd-ok" onClick={() => setOpen(false)}>Xác nhận</button>
    </Modal>}

    {info && <Modal title="Tuyển chọn cầu thủ" onClose={() => setInfo(false)}>
      <ul className="ctd-info">
        <li>Dùng <b>Huy Hiệu Tuyển Chọn</b> nhận ở mốc tích lũy đặc biệt 12.600 điểm.</li>
        <li>Lượt mở thứ 1 chọn đủ <b>10</b> cầu thủ, lượt 2 chọn <b>9</b>, lượt 3 chọn <b>7</b>, từ lượt 4 chọn <b>5</b> cầu thủ.</li>
        <li>Cầu thủ phải đúng mùa &amp; cấp thẻ quy định: +1 PRM · ICON TM; +8 GRU · BLD · CU; +9 MDL · UT · 24EP; +10 HG · RTN · CC · FCA · DC · JNM; +11 FA · LOL · LN · SPL · 23HW; +12 EBS · BOE21 · CAP.</li>
        <li>Tổng giá trị các cầu thủ đã chọn không vượt quá <b>6.000M BP</b> (theo giá thị trường lúc tuyển chọn).</li>
        <li>Mỗi lần tuyển chọn dùng 1 huy hiệu, nhận ngẫu nhiên 1 cầu thủ trong danh sách. Tỷ lệ xuất hiện tính theo giá: cầu thủ giá càng thấp tỷ lệ càng cao (đắt gấp 2 thì tỷ lệ chỉ bằng một nửa).</li>
        <li>Mẹo: chọn các cầu thủ có giá tương đương nhau để cơ hội ra cầu thủ ngon công bằng hơn.</li>
      </ul>
    </Modal>}

    {won && <Modal title="Tuyển chọn thành công!" onClose={() => setWon(null)}>
      {wonP && <div className="ctd-won"><span className="ctd-won-card">{card(wonP)}</span><p><b>{wonP.name} +{won.level}</b><br/>OVR {ovr({ playerId: won.playerId, level: won.level })} · đã vào kho</p></div>}
      <ul className="ctd-chances">{won.chances.map(c => { const p = byId.get(c.playerId);
        return <li key={c.playerId} className={c.playerId === won.playerId ? 'is-won' : ''}><span>{p?.name ?? c.playerId} +{c.level}</span><span>{mBp(c.price)} BP</span><b>{pct(c.chance)}</b></li>; })}</ul>
      <button type="button" className="ctd-ok" onClick={() => setWon(null)}>Đóng</button>
    </Modal>}
  </>;
}
