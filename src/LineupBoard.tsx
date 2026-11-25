import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ChevronDown, ChevronUp, Pencil, Eraser, RefreshCw, RotateCcw, Search, Sparkles, Users } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tactic, Tier } from './game';
import { marketQuote } from './market';
import { benchBuff, FORMATIONS, LINEUP_NAMES, SQUAD_WAGE_CAP, clearLineup, getLineups, isLocked, getTactics, renameTactic, selectTactic, lineupSlots, lineupSummary, moveSlot, optimizeLineup, placeCard, playerPenalty, positionGroup, resetPositions, selectLineup, setFormation, slotOvr, setCards, zoneAt } from './squad';
import type { Zone } from './squad';
import { teamColorName as colorNameOf } from './teamColor';
import type { AppliedBuff } from './teamColor';
import { flagImageUrl } from './flags';
import { asset } from './asset';
import './squad.css';
import './lineup.css';
import { faceOf } from './portraits';
import { summaryStats } from './player-stats';
import { ovrStyle } from './ovr-color';
import { managerImage } from './managers';
import { physicalOf } from './physical';
import { Foot } from './PlayerDetail';
import type { Faces } from './portraits';

type Props = {
  save: Save;
  onUpdate: (update: (state: Save) => Save) => void;
  onDetail: (card: Card) => void;
  onUpgrade: (uid: string) => void;
  onLock: (uid: string) => void;
  onManage: () => void;
  coachName?: string;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
};
// Ô đang chọn: một vị trí trên sân (kể cả ô trống) hoặc một cầu thủ dự bị.
type Pick = { slot: number } | { uid: string };
const same = (a: Pick, b: Pick) => 'slot' in a ? 'slot' in b && a.slot === b.slot : 'uid' in b && a.uid === b.uid;
const groupOrder = { fw: 0, mf: 1, df: 2, gk: 3 };

// Nửa sân phối cảnh kiểu FC Online (2026-11-23): chỉ vẽ nửa sân nhà. Toạ độ hiển thị (0–100: 0 = vạch giữa sân, 100 = vạch cầu môn)
// chiếu lên hình thang chiếm gần hết khung: cạnh trên ~80% bề ngang, cạnh dưới ~98%.
const TOP_W = .8, BOTTOM_W = .98, Y0 = 1, YH = 98;
const widthAt = (y: number) => TOP_W + (BOTTOM_W - TOP_W) * y / 100;
const projectRaw = (x: number, y: number): [number, number] => [50 + (x - 50) * widthAt(y), Y0 + y * YH / 100];
const unprojectRaw = (px: number, py: number): [number, number] => { const y = (py - Y0) * 100 / YH; return [50 + (px - 50) / widthAt(y), y]; };
// Sơ đồ (squad.ts, vùng kéo thả zoneAt) giữ toạ độ cũ; khi vẽ đổi sang nửa sân: ST sát nửa vòng tròn giữa sân, LW / RW thấp hơn ST và rộng ra
// gần biên (ngang LB / RB), trung vệ ngay mép trên vòng cấm (68), thủ môn giữa khu 5m50 (94). Nội suy tuyến tính giữa các mốc.
const Y_MAP: [number, number][] = [[0, 0], [13, 13], [18, 21], [76, 66], [92, 85], [100, 92]];
const X_SPREAD = 1.06;
const piecewise = (v: number, pairs: [number, number][]) => {
  if (v <= pairs[0][0]) return pairs[0][1] + (v - pairs[0][0]);
  for (let i = 1; i < pairs.length; i++) { const [x0, y0] = pairs[i - 1], [x1, y1] = pairs[i]; if (v <= x1) return y0 + (y1 - y0) * (v - x0) / (x1 - x0); }
  const last = pairs[pairs.length - 1]; return last[1] + (v - last[0]);
};
const mapY = (y: number) => piecewise(y, Y_MAP), unmapY = (y: number) => piecewise(y, Y_MAP.map(([a, b]) => [b, a]));
// Tỉ lệ thu nhỏ cầu thủ theo độ xa (1 ở vạch cầu môn).
// Giữ cả ảnh, số và tên cầu thủ nằm trong sân: chỗ vẽ được giới hạn 8–92 theo chiều ngang, 4–85 theo chiều dọc (tên nằm dưới ảnh).
const SAFE = { x0: 8, x1: 92, y0: 4, y1: 85 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const shownY = (y: number) => clamp(mapY(y), SAFE.y0, SAFE.y1);
export const depth = (y: number) => widthAt(shownY(y)) / BOTTOM_W;
export const project = (x: number, y: number): [number, number] => projectRaw(clamp(50 + (x - 50) * X_SPREAD, SAFE.x0, SAFE.x1), shownY(y));
// Ngược lại: điểm trên khung sân (%) về toạ độ sơ đồ, để biết con trỏ đang ở vùng vị trí nào.
const unproject = (px: number, py: number): [number, number] => { const [hx, hy] = unprojectRaw(px, py); return [50 + (hx - 50) / X_SPREAD, unmapY(hy)]; };
const path = (points: [number, number][], close = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${projectRaw(x, y).map(n => n.toFixed(2)).join(' ')}`).join('') + (close ? 'Z' : '');
const box = (x0: number, y0: number, x1: number, y1: number) => path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
const arc = (cx: number, cy: number, rx: number, ry: number, from = 0, to = 360) => path(Array.from({ length: 41 }, (_, i) => { const a = (from + (to - from) * i / 40) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }));
// Chỉ vẽ: đường biên, nửa vòng tròn giữa sân (chạm vạch trên), vòng cấm 16m50, khu 5m50 và vòng cung vòng cấm.
const PITCH_LINES = [box(0, 0, 100, 100), arc(50, 0, 15, 17, 0, 180), box(20, 68, 80, 100), box(36, 88, 64, 100), arc(50, 78, 12, 16, 219, 321)].join('');
const EDGE: [number, number, number, number] = [-1, -1, 101, 101];
const TURF = box(...EDGE);
// Sọc cắt cỏ dọc theo phối cảnh, hai tông xanh ô liu xen kẽ.
const STRIPE_COUNT = 8;
const STRIPES = Array.from({ length: STRIPE_COUNT }, (_, i) => { const w = (EDGE[2] - EDGE[0]) / STRIPE_COUNT; return box(EDGE[0] + i * w, EDGE[1], EDGE[0] + (i + 1) * w, EDGE[3]); });
// Sân tĩnh dựng một lần: lớp vùng kéo nằm ở SVG riêng nên kéo cầu thủ không vẽ lại cỏ và bộ lọc độ hạt.
export const PITCH_ART = <svg className="lu-pitch-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <clipPath id="lu-turf-clip"><path d={TURF}/></clipPath>
    <linearGradient id="lu-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4c7d21" stopOpacity="0"/><stop offset="1" stopColor="#4c7d21" stopOpacity=".75"/></linearGradient>
  </defs>
  <path d={TURF} className="lu-turf"/>
  {STRIPES.map((d, i) => <path key={i} d={d} className={i % 2 ? 'lu-stripe-b' : 'lu-stripe-a'}/>)}
  <g clipPath="url(#lu-turf-clip)"><rect x="0" y="0" width="100" height="100" fill="url(#lu-shade)"/></g>
  <path d={PITCH_LINES} className="lu-lines"/>
</svg>;

export const Face = ({ card, className, faces }: { card: Card; className: string; faces?: Faces }) => { const p = getPlayer(card), f = faceOf(p, faces); return <span className={`${className}${f.portrait ? ' is-portrait' : ''}`}><img src={f.src} alt="" loading="lazy" draggable={false}/></span>; };
const colorName = (c: AppliedBuff) => colorNameOf(c);
export const Wage = ({ card }: { card: Card }) => <span className="squad-wage"><b>{getPlayer(card).wage ?? 0}</b></span>;

// Màn Đội hình: chọn bộ A/B/C và sơ đồ, xếp 11 cầu thủ của đội hình riêng lên sân; bấm (hoặc kéo) hai ô để đổi chỗ.
// Ảnh mini face HLV ở thanh thông tin dưới sân: người dùng sẽ gửi ảnh sau; điền đường dẫn ảnh (vd. asset('/assets/coach.webp')) vào đây, null = hình bóng mặc định.
// Ảnh HLV ở hàng dưới sân: Nhà quản lý người chơi chọn (Save.manager), chưa chọn thì ảnh mặc định.
// Chiến thuật đội hình: bấm xổ xuống 10 chiến thuật (tên + sơ đồ). Chọn một chiến thuật thì bộ đang xếp đổi sang sơ đồ đó;
// đổi sơ đồ ở ô Sơ đồ dưới sân thì sơ đồ của chiến thuật đang dùng đổi theo. Bút chì để đổi tên (Enter lưu, Esc huỷ).
function TacticPicker({ tactics, current, onPick, onRename }: { tactics: Tactic[]; current?: number; onPick: (i: number) => void; onRename: (i: number, name: string) => void }) {
  const [open, setOpen] = useState(false), [edit, setEdit] = useState<number | null>(null), [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setEdit(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && edit === null) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open, edit]);
  const commitName = (i: number) => { const n = draft.replace(/\s+/g, ' ').trim(); if (n && n !== tactics[i].name) onRename(i, n); setEdit(null); };
  return <div className="lu-field lu-tactic" ref={ref}>
    <small>Chiến thuật</small>
    <button type="button" className="lu-tactic-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(o => !o); setEdit(null); }}>
      <span>{current === undefined ? 'Chọn chiến thuật' : `${current + 1}. ${tactics[current].name}`}</span>{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
    </button>
    {open && <ul className="lu-tactic-list" role="listbox" aria-label="Chiến thuật đội hình">{tactics.map((t, i) => <li key={i} className={i === current ? 'is-on' : undefined} role="option" aria-selected={i === current}>
      {edit === i
        ? <input className="lu-tactic-input" autoFocus value={draft} maxLength={24} aria-label={`Tên chiến thuật ${i + 1}`} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitName(i); if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} onBlur={() => commitName(i)}/>
        : <button type="button" className="lu-tactic-pick" onClick={() => { onPick(i); setOpen(false); }}><b>{i + 1}. {t.name}</b><small>{t.formation}</small></button>}
      {edit !== i && <button type="button" className="lu-tactic-rename" title="Đổi tên chiến thuật" aria-label={`Đổi tên chiến thuật ${i + 1}`} onClick={() => { setEdit(i); setDraft(t.name); }}><Pencil size={13}/></button>}
    </li>)}</ul>}
  </div>;
}

// Biểu tượng cờ Team color CLB / quốc gia / mùa (người dùng gửi ảnh mẫu 2026-11-24): cờ trắng đặc đang phấp phới, cán nghiêng.
const TeamFlag = () => <svg className="lu-teamflag" width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 21 8.8 3.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path fill="currentColor" d="M9.6 4.8c2.8-1.6 5.4-.2 8.1.5 1.3.3 2.4.2 3.2-.1l-2.5 9.7c-.8.4-2 .5-3.4.1-2.7-.7-5.3-2.2-8.1-.7z"/></svg>;

// Biểu tượng Team color cấp thẻ (ảnh mẫu 2026-11-24): mũi tên đặc hướng lên đứng trên hai vạch ngang.
const TeamUp = () => <svg className="lu-teamup" width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 1.5 22 11.6H16.4V14H7.6v-2.4H2z"/><rect x="7.6" y="15.2" width="8.8" height="2.8" rx=".4"/><rect x="7.6" y="19.2" width="8.8" height="2.8" rx=".4"/></svg>;

// So sánh hai cầu thủ (2026-11-24): bảng hai cột, ô tốt hơn tô xanh.
function ComparePanel({ a, b, levelBadge, seasonShort, onClose }: { a: Card; b: Card; levelBadge: (level: number) => string; seasonShort: (tier: Tier) => string; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  const pa = getPlayer(a), pb = getPlayer(b), qa = marketQuote(a).price, qb = marketQuote(b).price;
  // better: 1 = bên trái tốt hơn, 2 = bên phải tốt hơn, 0 = bằng nhau / không so được.
  const cmp = (x: number | null, y: number | null, lowerIsBetter = false) => x === null || y === null || x === y ? 0 : (x > y) !== lowerIsBetter ? 1 : 2;
  const rows: { label: string; l: ReactNode; r: ReactNode; better: number }[] = [
    { label: 'OVR', l: ovr(a), r: ovr(b), better: cmp(ovr(a), ovr(b)) },
    { label: 'Cấp thẻ', l: <img className="squad-level-img" src={levelBadge(a.level)} alt={`+${a.level}`}/>, r: <img className="squad-level-img" src={levelBadge(b.level)} alt={`+${b.level}`}/>, better: cmp(a.level, b.level) },
    { label: 'Vị trí', l: pa.pos, r: pb.pos, better: 0 },
    { label: 'Mùa', l: seasonShort(pa.tier), r: seasonShort(pb.tier), better: 0 },
    { label: 'Lương', l: pa.wage ?? 0, r: pb.wage ?? 0, better: cmp(pa.wage ?? 0, pb.wage ?? 0, true) },
    { label: 'Giá', l: qa === null ? '—' : money(qa), r: qb === null ? '—' : money(qb), better: cmp(qa, qb) },
    { label: 'CLB', l: pa.club || '—', r: pb.club || '—', better: 0 },
    { label: 'Quốc gia', l: pa.nation || '—', r: pb.nation || '—', better: 0 },
  ];
  return <div className="lu-compare-back" onClick={onClose}>
    <div className="lu-compare" role="dialog" aria-modal="true" aria-label="So sánh cầu thủ" onClick={e => e.stopPropagation()}>
      <button className="lu-compare-x" onClick={onClose} aria-label="Đóng">×</button>
      <div className="lu-compare-head"><div><Face card={a} className="lu-face"/><strong>{pa.name}</strong></div><span>VS</span><div><Face card={b} className="lu-face"/><strong>{pb.name}</strong></div></div>
      {rows.map(x => <div key={x.label} className="lu-compare-row"><span className={x.better === 1 ? 'is-better' : ''}>{x.l}</span><em>{x.label}</em><span className={x.better === 2 ? 'is-better' : ''}>{x.r}</span></div>)}
    </div>
  </div>;
}

export default function LineupBoard({ save, onUpdate, onDetail, onUpgrade, onLock, onManage, coachName, levelBadge, seasonShort }: Props) {
  const lineups = getLineups(save), index = lineups.active, set = lineups.sets[index], slots = lineupSlots(set);
  const squad = setCards(save, set), byUid = new Map(squad.map(c => [c.uid, c]));
  const starters = set.slots.map(uid => uid ? byUid.get(uid) ?? null : null);
  const playing = new Set(set.slots.filter(Boolean));
  const subs = squad.filter(c => !playing.has(c.uid)).sort((a, b) => groupOrder[positionGroup(getPlayer(a).pos)] - groupOrder[positionGroup(getPlayer(b).pos)] || ovr(b) - ovr(a));
  // Dự bị cũng có +5 vì nằm trong đội hình riêng (benchBuff), chỉ không có team color.
  // Giá trị cầu thủ trong đội = đội hình chính (summary.value) + dự bị. summary.value giữ nguyên chỉ tính đội hình chính (dùng cho BXH giá trị ĐH).
  const summary = lineupSummary(save, set), teamValue = summary.value + subs.reduce((sum, c) => sum + (marketQuote(c).price ?? 0), 0), buffs = new Map([...subs.map(c => [c.uid, benchBuff(c)] as const), ...summary.colors.players.map(r => [r.playerId, r] as const)]);
  // OVR hiển thị của cầu thủ đá chính = OVR theo vị trí + team color; chú thích ghi rõ phần trừ / cộng.
  const shownOvr = (card: Card, role: string) => buffs.get(card.uid)?.finalOvr ?? slotOvr(card, role);
  const ovrNote = (card: Card, role: string) => { const p = getPlayer(card), penalty = playerPenalty(p, role), buff = buffs.get(card.uid); return [penalty ? `Đá trái vị trí (${p.pos}): −${penalty}` : '', ...(buff?.applied ?? []).map(c => `Team color ${colorName(c)}: +${c.ovr}`)].filter(Boolean).join(' · ') || undefined; };
  const [rawPick, setPick] = useState<Pick | null>(null);
  // Luôn có một cầu thủ được chọn (2026-11-24): lựa chọn hợp lệ của người chơi, không thì cầu thủ đầu tiên trên sân.
  const firstSlot = starters.findIndex(Boolean);
  const pick: Pick | null = rawPick && ('slot' in rawPick ? (starters[rawPick.slot] || firstSlot < 0) : byUid.has(rawPick.uid)) ? rawPick : firstSlot >= 0 ? { slot: firstSlot } : null;
  const [dragging, setDragging] = useState<Pick | null>(null);

  // Ghép hai lựa chọn: ô ↔ ô đổi chỗ, dự bị ↔ ô thì dự bị vào sân (cầu thủ cũ của ô về dự bị).
  const combine = (a: Pick, b: Pick) => {
    if ('uid' in a && 'uid' in b) return false;
    if ('slot' in a && 'slot' in b) {
      const ua = set.slots[a.slot], ub = set.slots[b.slot];
      if (ua) onUpdate(s => placeCard(s, index, b.slot, ua));
      else if (ub) onUpdate(s => placeCard(s, index, a.slot, ub));
      return true;
    }
    const [slot, uid] = 'slot' in a ? [a.slot, (b as { uid: string }).uid] : [(b as { slot: number }).slot, a.uid];
    onUpdate(s => placeCard(s, index, slot, uid));
    return true;
  };
  const choose = (target: Pick) => {
    if (!pick || same(pick, target)) { if (!pick) setPick(target); return; }
    // Chỉ đưa cầu thủ đang chọn vào ô trống; bấm vào cầu thủ khác thì chuyển lựa chọn sang người đó (đổi chỗ bằng cách kéo thả).
    if ('slot' in target && !starters[target.slot]) { combine(pick, target); setPick(target); return; }
    setPick(target);
  };
  const dragProps = (target: Pick, draggable: boolean) => ({
    draggable,
    onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setDragging(target); setPick(null); },
    onDragEnd: () => setDragging(null),
    onDragOver: (e: DragEvent) => { if (dragging && !same(dragging, target)) e.preventDefault(); },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (dragging && !same(dragging, target)) combine(dragging, target); setDragging(null); },
  });
  // Kéo cầu thủ trên sân bằng sự kiện con trỏ (chạy cả trên cảm ứng): vùng dưới con trỏ sáng lên, thả vào đâu đá vị trí đó, vùng đã có người thì đổi chỗ.
  const pitchRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ slot: number; x: number; y: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [move, setMove] = useState<{ slot: number; px: number; py: number; zone: Zone | null; target: number } | null>(null);
  const moveAt = (slot: number, clientX: number, clientY: number) => {
    const rect = pitchRef.current!.getBoundingClientRect(), px = (clientX - rect.left) / rect.width * 100, py = (clientY - rect.top) / rect.height * 100;
    const [x, y] = unproject(px, py), taken = new Set(slots.filter((_, i) => i !== slot).map(s => s.label));
    const hovered = px < 0 || px > 100 || py < 0 || py > 100 ? null : zoneAt(x, y, taken);
    return { slot, px, py, x, y, zone: hovered, target: hovered ? slots.findIndex((s, i) => i !== slot && s.label === hovered.label) : -1 };
  };
  const tokenPointer = (slot: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => { if (e.button !== 0) return; press.current = { slot, x: e.clientX, y: e.clientY, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const state = press.current;
      if (!state) return;
      if (!state.moved && Math.hypot(e.clientX - state.x, e.clientY - state.y) < 6) return;
      state.moved = true;
      const { x: _x, y: _y, ...view } = moveAt(slot, e.clientX, e.clientY);
      setMove(view);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const state = press.current;
      press.current = null;
      if (!state?.moved) return;
      justDragged.current = true;
      setMove(null); setPick(null);
      const { x, y, zone: dropped, target } = moveAt(slot, e.clientX, e.clientY);
      if (dropped) {
        if (target >= 0) combine({ slot }, { slot: target });
        else {
          // Giữ cầu thủ hơi lùi vào trong vùng để ảnh và nhãn không nằm đè ra vùng bên cạnh.
          const left = Math.min(dropped.x1 - 2, Math.max(dropped.x0 + 2, x)), top = Math.min(dropped.y1 - 2, Math.max(dropped.y0 + 2, y));
          onUpdate(s => moveSlot(s, index, slot, dropped.label, left, top));
        }
        return;
      }
      // Thả ra ngoài sân: lên một dòng trong danh sách thì đổi chỗ, lên mục Thay thế thì về dự bị.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const row = under?.closest<HTMLElement>('[data-lu-pick]')?.dataset.luPick;
      if (under?.closest('.lu-subhead')) onUpdate(s => placeCard(s, index, slot, null));
      else if (row) combine({ slot }, row.startsWith('s:') ? { slot: Number(row.slice(2)) } : { uid: row.slice(2) });
    },
    onPointerCancel: () => { press.current = null; setMove(null); },
  });
  const switchSet = (next: number) => { setPick(null); onUpdate(s => selectLineup(s, next)); };
  const run = (update: (state: Save) => Save) => onUpdate(update);

  // Thẻ đang xem ở khung thông tin: ô / dự bị đang chọn, mặc định cầu thủ đầu tiên trên sân.
  const pickedSlot = pick && 'slot' in pick && !starters[pick.slot] ? pick.slot : null;
  const focus = pick ? ('slot' in pick ? starters[pick.slot] : byUid.get(pick.uid) ?? null) : starters.find(Boolean) ?? null;
  const focusSlot = focus ? set.slots.indexOf(focus.uid) : -1;
  const isPicked = (target: Pick) => !!pick && same(pick, target);
  const overCap = summary.wage > SQUAD_WAGE_CAP;

  const [compare, setCompare] = useState<[Card, Card] | null>(null);
  // Đổi chỗ cầu thủ đang chọn với cầu thủ ở dòng này; lựa chọn đi theo cầu thủ đã chọn.
  const swapWith = (target: Pick) => {
    if (!pick || !focus || !combine(pick, target)) return;
    setPick('slot' in pick ? ('slot' in target ? target : { uid: focus.uid }) : target);
  };
  const row = (target: Pick, card: Card | null, label: string, role: string | null) => {
    const p = card && getPlayer(card), group = positionGroup(role ?? p?.pos ?? 'CM');
    const value = card ? role ? shownOvr(card, role) : buffs.get(card.uid)?.finalOvr ?? ovr(card) : null, off = !!(card && role && playerPenalty(p!, role));
    const picked = isPicked(target), locked = !!card && isLocked(save, card.uid);
    return <div key={'slot' in target ? `s${target.slot}` : target.uid} data-lu-pick={'slot' in target ? `s:${target.slot}` : `u:${target.uid}`} role="row" tabIndex={0} className={`lu-row ${picked ? 'is-picked' : ''} ${card ? '' : 'is-empty'}`} onClick={() => choose(target)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); choose(target); } }} {...dragProps(target, !!card)} aria-pressed={picked} aria-label={card ? `${label} · ${p!.name} · OVR ${value}` : `${label} · trống`}>
      <span className={`lu-pos pos-${group}`} role="cell">{label}</span>
      <span className="squad-name" role="cell">{p ? <><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></> : <em>Trống</em>}</span>
      <span role="cell">{card && <Wage card={card}/>}</span>
      <strong className={`lu-row-ovr ${off ? 'is-off' : ''}`} role="cell" title={card && role ? ovrNote(card, role) : undefined}>{value ?? ''}</strong>
      <span role="cell">{card && <img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/>}</span>
      {card && !!pick && !!focus && <span className="lu-row-acts" role="cell" onClick={e => e.stopPropagation()}>
        <button onClick={() => onUpgrade(card.uid)} title="Nâng cấp" aria-label={`Nâng cấp ${p!.name}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 22 11.6H16.4V14H7.6v-2.4H2z"/><rect x="7.6" y="15.2" width="8.8" height="2.8" rx=".4"/><rect x="7.6" y="19.2" width="8.8" height="2.8" rx=".4"/></svg></button>
        {picked ? <button onClick={() => onDetail(card)} title="Xem thông tin" aria-label={`Xem thông tin ${p!.name}`}><Search size={18} strokeWidth={3}/></button> : <>
          {!('uid' in pick! && 'uid' in target) && <button onClick={() => swapWith(target)} title="Đổi vị trí với cầu thủ đang chọn" aria-label={`Đổi vị trí với ${p!.name}`}><RefreshCw size={18} strokeWidth={3}/></button>}
          <button onClick={() => setCompare([focus!, card])} title="So sánh với cầu thủ đang chọn" aria-label={`So sánh ${p!.name} với cầu thủ đang chọn`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.6" fill="none" stroke="currentColor" strokeWidth="2.6"/><path d="m16.2 16.2 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><text x="10.5" y="13.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="currentColor" stroke="none">VS</text></svg></button>
        </>}
        <button className={locked ? 'on' : ''} onClick={() => onLock(card.uid)} title={locked ? 'Mở khóa' : 'Khóa'} aria-label={`${locked ? 'Mở khóa' : 'Khóa'} ${p!.name}`} aria-pressed={locked}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={locked ? 'M8 11V7.4a4 4 0 0 1 8 0V11' : 'M8 11V7.4a4 4 0 0 1 7.6-1.8'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path fillRule="evenodd" d="M4 13a2.2 2.2 0 0 1 2.2-2.2h11.6A2.2 2.2 0 0 1 20 13v7.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 20.6zM12 14.2a1.9 1.9 0 0 1 .95 3.55V20h-1.9v-2.25A1.9 1.9 0 0 1 12 14.2z" fill="currentColor"/></svg></button>
      </span>}
    </div>;
  };

  return <section className="workspace lineup-workspace" aria-labelledby="lineup-title">
    <div className="lu-main">
      <header className="lu-bar">
        <h1 id="lineup-title" className="sr-only">Sắp xếp đội hình</h1>
        <div className="lu-field"><small>Đội hình</small><div className="lu-sets" role="group" aria-label="Chọn bộ đội hình">{LINEUP_NAMES.map((name, i) => <button key={name} aria-pressed={i === index} onClick={() => switchSet(i)}>{name}</button>)}</div></div>
        <TacticPicker tactics={getTactics(save)} current={set.tactic} onPick={i => run(s => selectTactic(s, index, i))} onRename={(i, name) => run(s => renameTactic(s, i, name))}/>
        <div className="lu-stats">
          <div><small>Giá trị của cầu thủ trong đội<i className="lu-help" title="Tổng giá trị thị trường của các cầu thủ trong đội, gồm cả đội hình chính và dự bị." aria-label="Giải thích">?</i></small><strong>{money(teamValue)}</strong></div>
          <div className={overCap ? 'is-over' : ''} title={overCap ? `Vượt mức lương ${summary.wage - SQUAD_WAGE_CAP}` : undefined}><small>Tổng lương</small><strong>{summary.wage}<small>/{SQUAD_WAGE_CAP}</small></strong></div>
        </div>
      </header>
      <div className={`lu-pitch ${move ? 'is-moving' : ''}`} ref={pitchRef}>
        {PITCH_ART}
        <svg className="lu-pitch-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {move?.zone && <path d={box(move.zone.x0, move.zone.y0, move.zone.x1, move.zone.y1)} className="lu-zone"/>}
          {move && (() => { const [ox, oy] = project(slots[move.slot].x, slots[move.slot].y); return <line x1={ox} y1={oy} x2={move.px} y2={move.py} className="lu-move-line"/>; })()}
        </svg>
        {slots.map((slot, i) => {
          const card = starters[i], p = card && getPlayer(card), [left, top] = project(slot.x, slot.y), target = { slot: i };
          const value = card ? shownOvr(card, slot.role) : 0, penalty = p ? playerPenalty(p, slot.role) : 0, off = penalty > 0, applied = card ? buffs.get(card.uid)?.applied ?? [] : [];
          const moving = move?.slot === i;
          return <button key={`${set.formation}-${i}`} className={`lu-token pos-${positionGroup(slot.role)} ${card ? '' : 'is-empty'} ${isPicked(target) ? 'is-picked' : ''} ${dragging && !same(dragging, target) ? 'is-drop' : ''} ${moving ? 'is-origin' : ''} ${move?.target === i ? 'is-swap' : ''}`} style={{ left: `${left}%`, top: `${top}%`, '--k': depth(slot.y) } as CSSProperties}
            onClick={() => { if (justDragged.current) { justDragged.current = false; return; } choose(target); }} {...dragProps(target, false)} {...(card && slot.role !== 'GK' ? tokenPointer(i) : {})} aria-pressed={isPicked(target)} aria-label={card ? `${slot.label}: ${p!.name}, OVR ${value}` : `${slot.label}: trống`}>
            {isPicked(target) && !moving && <svg className="lu-ring" viewBox="0 0 240 100" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="120" cy="50" rx="117" ry="47" pathLength="100"/></svg>}
            {moving ? <span className="lu-token-top"><span className="lu-face lu-face-ghost"><img src={asset('/assets/silhouette.svg')} alt="" draggable={false}/></span></span> : card ? <>
              <span className="lu-token-top"><Wage card={card}/><Face card={card} className="lu-face"/><strong className={off ? 'is-off' : ''}>{value}</strong></span>
              <span className="lu-token-name"><b className={`squad-season season-tag-${p!.tier}`}>{seasonShort(p!.tier)}</b>{p!.name}</span>
            </> : <>
              <span className="lu-token-top"><span className="lu-face lu-face-empty">+</span></span>
              <span className="lu-token-name">{slot.label}</span>
            </>}
          </button>;
        })}
        {move && starters[move.slot] && (() => {
          const card = starters[move.slot]!, from = slots[move.slot], role = move.zone?.role, changed = !!move.zone && move.zone.label !== from.label;
          const bonus = buffs.get(card.uid)?.ovrBonus ?? 0;
          return <div className="lu-drag" style={{ left: `${move.px}%`, top: `${move.py}%`, '--face': 'clamp(36px,13.5cqh,86px)' } as CSSProperties} aria-hidden="true">
            {move.target >= 0 && <i className="lu-drag-swap"><RefreshCw size={14}/></i>}
            <Face card={card} className="lu-face"/>
            <span className="lu-drag-tag">
              <span className={`pos-${positionGroup(from.role)} ${changed ? 'is-old' : ''}`}><b>{from.label}</b><strong>{shownOvr(card, from.role)}</strong></span>
              {changed && <span className={`pos-${positionGroup(role!)}`}><b>{move.zone!.label}</b><strong>{slotOvr(card, role!) + bonus}</strong></span>}
            </span>
          </div>;
        })()}
        <div className="lu-pitch-actions">
          <button className="lu-optimize" onClick={() => run(s => optimizeLineup(s, index))} disabled={!squad.length} title="Xếp 11 cầu thủ có OVR theo vị trí cao nhất"><RefreshCw size={16}/>Tối ưu ĐH</button>
        </div>
      </div>
      <div className="lu-coachbar">
        <div className="lu-coach">
          <span className="lu-coach-face"><img src={managerImage(save.manager)} alt=""/></span>
          <span className="lu-coach-text"><small>HLV</small><b>{coachName || 'HLV'}</b></span>
        </div>
        <div className="lu-coach-colors" aria-label="Team color đang kích hoạt">
          <small>Team color</small>
          <span><span title="Team color CLB / quốc gia / mùa đang kích hoạt"><TeamFlag/>{summary.colors.active.filter(c => c.kind !== 'upgrade').length}</span><span title="Team color cấp thẻ đang kích hoạt"><TeamUp/>{summary.colors.active.filter(c => c.kind === 'upgrade').length}</span></span>
        </div>
        <label className="lu-coach-formation"><small>Sơ đồ</small><select aria-label="Sơ đồ" value={set.formation} onChange={e => run(s => setFormation(s, index, e.target.value))}>{Object.keys(FORMATIONS).map(key => <option key={key} value={key}>{key}</option>)}</select></label>
      </div>
    </div>

    <aside className="lu-side" aria-label="Danh sách đội hình">
      <div className="lu-detail">
        {focus ? (() => {
          const p = getPlayer(focus), role = focusSlot >= 0 ? slots[focusSlot].role : null, penalty = role ? playerPenalty(p, role) : 0, price = marketQuote(focus).price, buff = buffs.get(focus.uid);
          return <>
            <div className="lu-detail-text">
              <p className="lu-detail-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></p>
              <p className="lu-detail-ovr">{role && <><span className={`pos-${positionGroup(role)}`}>{slots[focusSlot].label}</span><strong className={penalty ? 'is-off' : ''}>{shownOvr(focus, role)}</strong></>}{(!role || penalty > 0) && <><span className={`pos-${positionGroup(p.pos)}`}>{p.pos}</span><strong>{ovr(focus) + (buff?.ovrBonus ?? 0)}</strong></>}</p>
              <p className="lu-detail-meta">{p.club !== p.nation && <>{p.club}<i/></>}{p.nation}{p.flag && <img src={flagImageUrl(p.flag)} alt=""/>}</p>
              {penalty > 0 && <p className="lu-detail-warn">Đá trái vị trí sở trường ({p.pos}): −{penalty} OVR</p>}
              {/* Cùng thông tin như bảng Thông tin cầu thủ: lương, chiều cao, cân nặng, thể hình, hai chân (người dùng 2026-11-24). */}
              {(() => { const phys = physicalOf(p.id); return <p className="lu-detail-phys">Lương <Wage card={focus}/>{phys && <>
                <i/>{phys.height}cm{phys.weight > 0 && <><i/>{phys.weight}kg</>}{phys.body && <><i/>{phys.body}</>}
                {phys.left + phys.right > 0 && <span className="lu-detail-feet"><Foot side="left" value={phys.left} main={phys.left >= phys.right}/><Foot side="right" value={phys.right} main={phys.right >= phys.left}/></span>}</>}</p>; })()}
            </div>
            <div className="lu-detail-face"><Face card={focus} className="lu-face"/><img className="lu-detail-level squad-level-img" src={levelBadge(focus.level)} alt={`+${focus.level}`}/></div>
          </>;
        })() : <div className="lu-detail-empty">
          {squad.length ? <p>{pickedSlot !== null ? `Vị trí ${slots[pickedSlot].label} đang trống. Chọn một cầu thủ ở danh sách Thay thế để đưa vào sân.` : 'Chưa có cầu thủ trên sân. Bấm Tối ưu ĐH để tự xếp, hoặc chọn từng vị trí.'}</p>
            : <p>Đội hình riêng chưa có cầu thủ. Thêm cầu thủ ở Đăng kí cầu thủ (nút Vào ĐH) rồi quay lại để xếp đội hình.</p>}
          <button onClick={onManage}><Users size={15}/>Đăng kí cầu thủ</button>
        </div>}
      </div>
      {focus && (() => {
        const p = getPlayer(focus), overall = focusSlot >= 0 ? shownOvr(focus, slots[focusSlot].role) : buffs.get(focus.uid)?.finalOvr ?? ovr(focus);
        return <div className="lu-sum" role="group" aria-label={`Chỉ số ${p.name}`}>{summaryStats(p, overall).map(s => <div key={s.name}><span>{s.name}</span><b style={ovrStyle(s.value)}>{s.value}</b></div>)}</div>;
      })()}
      <div className="lu-cols" role="row"><span>Vị trí</span><span>Tên cầu thủ</span><span>Lương</span><span>OVR</span><span>Thẻ</span></div>
      <div className="lu-rows" role="table" aria-label="Cầu thủ đá chính và dự bị">
        {slots.map((slot, i) => row({ slot: i }, starters[i], slot.label, slot.role))}
        <div className="lu-subhead" role="row" {...(dragging && 'slot' in dragging && set.slots[dragging.slot] ? { onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => { e.preventDefault(); const slot = (dragging as { slot: number }).slot; onUpdate(s => placeCard(s, index, slot, null)); setDragging(null); } } : {})}>Thay thế<small>{subs.length}</small></div>
        {subs.length ? subs.map(card => row({ uid: card.uid }, card, getPlayer(card).pos, null)) : <p className="lu-subs-empty">{squad.length ? 'Mọi cầu thủ trong đội hình riêng đều đang đá chính.' : 'Chưa có cầu thủ dự bị.'}</p>}
      </div>
    </aside>
    {compare && <ComparePanel a={compare[0]} b={compare[1]} levelBadge={levelBadge} seasonShort={seasonShort} onClose={() => setCompare(null)}/>}
  </section>;
}
