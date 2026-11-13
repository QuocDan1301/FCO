import { useRef, useState } from 'react';
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ArrowDownToLine, Eraser, RefreshCw, RotateCcw, Search, Sparkles, Users } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { marketQuote } from './market';
import { benchBuff, FORMATIONS, LINEUP_NAMES, SQUAD_WAGE_CAP, clearLineup, getLineups, lineupSlots, lineupSummary, moveSlot, optimizeLineup, placeCard, playerPenalty, positionGroup, resetPositions, selectLineup, setFormation, slotOvr, squadCards, zoneAt } from './squad';
import type { Zone } from './squad';
import { teamColorName as colorNameOf } from './teamColor';
import type { AppliedBuff } from './teamColor';
import { flagImageUrl } from './flags';
import { asset } from './asset';
import './squad.css';
import './lineup.css';

type Props = {
  save: Save;
  onUpdate: (update: (state: Save) => Save) => void;
  onDetail: (card: Card) => void;
  onManage: () => void;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
  renderCard: (card: Card) => ReactNode;
};
// Ô đang chọn: một vị trí trên sân (kể cả ô trống) hoặc một cầu thủ dự bị.
type Pick = { slot: number } | { uid: string };
const same = (a: Pick, b: Pick) => 'slot' in a ? 'slot' in b && a.slot === b.slot : 'uid' in b && a.uid === b.uid;
const groupOrder = { fw: 0, mf: 1, df: 2, gk: 3 };

// Sân phối cảnh: toạ độ sân (0–100) chiếu lên hình thang hẹp dần về phía khung thành đối phương.
const TOP = .74;
export const depth = (y: number) => TOP + (1 - TOP) * y / 100;
export const project = (x: number, y: number): [number, number] => [50 + (x - 50) * .92 * depth(y), 3 + y * .86];
// Ngược lại: điểm trên khung sân (%) về toạ độ sân, để biết con trỏ đang ở vùng vị trí nào.
const unproject = (px: number, py: number): [number, number] => { const y = (py - 3) / .86; return [50 + (px - 50) / (.92 * depth(y)), y]; };
const path = (points: [number, number][], close = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${project(x, y).map(n => n.toFixed(2)).join(' ')}`).join('') + (close ? 'Z' : '');
const box = (x0: number, y0: number, x1: number, y1: number) => path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
const arc = (cx: number, cy: number, rx: number, ry: number, from = 0, to = 360) => path(Array.from({ length: 41 }, (_, i) => { const a = (from + (to - from) * i / 40) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }));
const PITCH_LINES = [box(0, 0, 100, 100), path([[0, 50], [100, 50]]), arc(50, 50, 15, 9.5), box(20, 0, 80, 16), box(36, 0, 64, 6), box(20, 84, 80, 100), box(36, 94, 64, 100), arc(50, 11, 12, 8, 42, 138), arc(50, 89, 12, 8, 222, 318),
  arc(0, 0, 2.4, 1.6, 0, 90), arc(100, 0, 2.4, 1.6, 90, 180), arc(0, 100, 2.4, 1.6, 270, 360), arc(100, 100, 2.4, 1.6, 180, 270)].join('');
const PITCH_SPOTS = [arc(50, 50, .75, .55), arc(50, 11, .6, .45), arc(50, 89, .75, .55)].join('');
// Thảm cỏ rộng hơn đường biên một chút để sân có khoảng lề như sân thật.
const EDGE: [number, number, number, number] = [-4, -3, 104, 103];
const TURF = box(...EDGE);
// Sọc cắt cỏ theo chiều ngang, thêm sọc dọc rất nhạt để thành ô bàn cờ; đều theo phối cảnh.
const STRIPES = Array.from({ length: 10 }, (_, i) => box(EDGE[0], i * 10, EDGE[2], i * 10 + 10));
const STRIPES_DOWN = Array.from({ length: 5 }, (_, i) => box(i * 20 + 5, EDGE[1], i * 20 + 15, EDGE[3]));
const [FRONT_LEFT, FRONT_Y] = project(EDGE[0], EDGE[3]), [FRONT_RIGHT] = project(EDGE[2], EDGE[3]);
// Mặt trước của thảm cỏ, tạo cảm giác sân có độ dày.
const FRONT_FACE = `M${FRONT_LEFT.toFixed(2)} ${FRONT_Y.toFixed(2)}H${FRONT_RIGHT.toFixed(2)}V${(FRONT_Y + 2.6).toFixed(2)}H${FRONT_LEFT.toFixed(2)}Z`;
const goal = (y: number, lift: number) => { const [x0, py] = project(44, y), [x1] = project(56, y); return { frame: `M${x0.toFixed(2)} ${py.toFixed(2)}V${(py + lift).toFixed(2)}H${x1.toFixed(2)}V${py.toFixed(2)}`, net: Array.from({ length: 7 }, (_, i) => { const x = x0 + (x1 - x0) * (i + 1) / 8; return `M${x.toFixed(2)} ${py.toFixed(2)}V${(py + lift).toFixed(2)}`; }).join('') + `M${x0.toFixed(2)} ${(py + lift / 2).toFixed(2)}H${x1.toFixed(2)}` }; };
const GOAL_TOP = goal(0, -2.2), GOAL_BOTTOM = goal(100, 2.2);
// Sân tĩnh dựng một lần: lớp vùng kéo nằm ở SVG riêng nên kéo cầu thủ không vẽ lại cỏ và bộ lọc độ hạt.
export const PITCH_ART = <svg className="lu-pitch-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <clipPath id="lu-turf-clip"><path d={TURF}/></clipPath>
    <radialGradient id="lu-floodlight" cx="50%" cy="34%" r="62%"><stop offset="0" stopColor="#fff6c8" stopOpacity=".3"/><stop offset=".55" stopColor="#fff6c8" stopOpacity=".07"/><stop offset="1" stopColor="#fff6c8" stopOpacity="0"/></radialGradient>
    <radialGradient id="lu-vignette" cx="50%" cy="48%" r="72%"><stop offset=".55" stopColor="#031006" stopOpacity="0"/><stop offset="1" stopColor="#031006" stopOpacity=".62"/></radialGradient>
    <linearGradient id="lu-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#04140a" stopOpacity=".34"/><stop offset=".5" stopColor="#04140a" stopOpacity="0"/></linearGradient>
    <linearGradient id="lu-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c5a1e"/><stop offset="1" stopColor="#0d1f0a"/></linearGradient>
    <filter id="lu-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4 2.6" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .9 .9 .9 0 -1"/></filter>
  </defs>
  <path d={FRONT_FACE} fill="url(#lu-front)"/>
  <path d={TURF} className="lu-turf"/>
  {STRIPES.map((d, i) => <path key={i} d={d} className={i % 2 ? 'lu-stripe-b' : 'lu-stripe-a'}/>)}
  {STRIPES_DOWN.map((d, i) => <path key={i} d={d} className="lu-stripe-down"/>)}
  <g clipPath="url(#lu-turf-clip)">
    <rect x="-5" y="0" width="110" height="100" filter="url(#lu-grain)" className="lu-grain"/>
    <rect x="0" y="0" width="100" height="100" fill="url(#lu-floodlight)"/>
    <rect x="0" y="0" width="100" height="100" fill="url(#lu-depth)"/>
    <rect x="0" y="0" width="100" height="100" fill="url(#lu-vignette)"/>
  </g>
  <path d={PITCH_LINES} className="lu-lines-glow"/>
  <path d={PITCH_LINES} className="lu-lines"/>
  <path d={PITCH_SPOTS} className="lu-spots"/>
  {[GOAL_TOP, GOAL_BOTTOM].map((g, i) => <g key={i}><path d={g.net} className="lu-goal-net"/><path d={g.frame} className="lu-goal"/></g>)}
</svg>;

export const Face = ({ card, className }: { card: Card; className: string }) => { const p = getPlayer(card); return <span className={className}><img src={p.cardFace || p.image || asset('/assets/silhouette.svg')} alt="" loading="lazy" draggable={false}/></span>; };
const colorName = (c: AppliedBuff) => colorNameOf(c);
export const Wage = ({ card }: { card: Card }) => <span className="squad-wage"><b>{getPlayer(card).wage ?? 0}</b></span>;

// Màn Đội hình: chọn bộ A/B/C và sơ đồ, xếp 11 cầu thủ của đội hình riêng lên sân; bấm (hoặc kéo) hai ô để đổi chỗ.
export default function LineupBoard({ save, onUpdate, onDetail, onManage, levelBadge, seasonShort, renderCard }: Props) {
  const lineups = getLineups(save), index = lineups.active, set = lineups.sets[index], slots = lineupSlots(set);
  const squad = squadCards(save), byUid = new Map(squad.map(c => [c.uid, c]));
  const starters = set.slots.map(uid => uid ? byUid.get(uid) ?? null : null);
  const playing = new Set(set.slots.filter(Boolean));
  const subs = squad.filter(c => !playing.has(c.uid)).sort((a, b) => groupOrder[positionGroup(getPlayer(a).pos)] - groupOrder[positionGroup(getPlayer(b).pos)] || ovr(b) - ovr(a));
  // Dự bị cũng có +5 vì nằm trong đội hình riêng (benchBuff), chỉ không có team color.
  const summary = lineupSummary(save, set), buffs = new Map([...subs.map(c => [c.uid, benchBuff(c)] as const), ...summary.colors.players.map(r => [r.playerId, r] as const)]);
  // OVR hiển thị của cầu thủ đá chính = OVR theo vị trí + team color; chú thích ghi rõ phần trừ / cộng.
  const shownOvr = (card: Card, role: string) => buffs.get(card.uid)?.finalOvr ?? slotOvr(card, role);
  const ovrNote = (card: Card, role: string) => { const p = getPlayer(card), penalty = playerPenalty(p, role), buff = buffs.get(card.uid); return [penalty ? `Đá trái vị trí (${p.pos}): −${penalty}` : '', ...(buff?.applied ?? []).map(c => `Team color ${colorName(c)}: +${c.ovr}`)].filter(Boolean).join(' · ') || undefined; };
  const [pick, setPick] = useState<Pick | null>(null);
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
    if (!pick || same(pick, target)) { setPick(pick ? null : target); return; }
    setPick(combine(pick, target) ? null : target);
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
  const run = (update: (state: Save) => Save) => { setPick(null); onUpdate(update); };

  // Thẻ đang xem ở khung thông tin: ô / dự bị đang chọn, mặc định cầu thủ đầu tiên trên sân.
  const pickedSlot = pick && 'slot' in pick ? pick.slot : null;
  const focus = pick ? ('slot' in pick ? starters[pick.slot] : byUid.get(pick.uid) ?? null) : starters.find(Boolean) ?? null;
  const focusSlot = focus ? set.slots.indexOf(focus.uid) : -1;
  const isPicked = (target: Pick) => !!pick && same(pick, target);
  const overCap = summary.wage > SQUAD_WAGE_CAP;

  const row = (target: Pick, card: Card | null, label: string, role: string | null) => {
    const p = card && getPlayer(card), group = positionGroup(role ?? p?.pos ?? 'CM');
    const value = card ? role ? shownOvr(card, role) : buffs.get(card.uid)?.finalOvr ?? ovr(card) : null, off = !!(card && role && playerPenalty(p!, role));
    return <button key={'slot' in target ? `s${target.slot}` : target.uid} data-lu-pick={'slot' in target ? `s:${target.slot}` : `u:${target.uid}`} role="row" className={`lu-row ${isPicked(target) ? 'is-picked' : ''} ${card ? '' : 'is-empty'}`} onClick={() => choose(target)} {...dragProps(target, !!card)} aria-pressed={isPicked(target)} aria-label={card ? `${label} · ${p!.name} · OVR ${value}` : `${label} · trống`}>
      <span className={`lu-pos pos-${group}`} role="cell">{label}</span>
      <span className="squad-name" role="cell">{p ? <><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></> : <em>Trống</em>}</span>
      <span role="cell">{card && <Wage card={card}/>}</span>
      <strong className={`lu-row-ovr ${off ? 'is-off' : ''}`} role="cell" title={card && role ? ovrNote(card, role) : undefined}>{value ?? ''}</strong>
      <span role="cell">{card && <img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/>}</span>
    </button>;
  };

  return <section className="workspace lineup-workspace" aria-labelledby="lineup-title" onKeyDown={e => { if (e.key === 'Escape') setPick(null); }}>
    <div className="lu-main">
      <header className="lu-bar">
        <h1 id="lineup-title" className="sr-only">Sắp xếp đội hình</h1>
        <div className="lu-field"><small>Đội hình</small><div className="lu-sets" role="group" aria-label="Chọn bộ đội hình">{LINEUP_NAMES.map((name, i) => <button key={name} aria-pressed={i === index} onClick={() => switchSet(i)}>{name}</button>)}</div></div>
        <label className="lu-field"><small>Sơ đồ</small><select value={set.formation} onChange={e => run(s => setFormation(s, index, e.target.value))}>{Object.keys(FORMATIONS).map(key => <option key={key} value={key}>{key}</option>)}</select></label>
        <div className="lu-stats">
          <div><small>OVR đội</small><strong>{summary.ovr || '—'}</strong></div>
          <div><small>Giá trị ĐH</small><strong>{money(summary.value)}</strong></div>
          <div className={overCap ? 'is-over' : ''} title={overCap ? `Vượt mức lương ${summary.wage - SQUAD_WAGE_CAP}` : undefined}><small>Tổng lương</small><strong>{summary.wage}<small>/{SQUAD_WAGE_CAP}</small></strong></div>
        </div>
      </header>
      <div className="lu-colors" aria-label="Team color đang kích hoạt"><small>Team color</small>{summary.colors.active.length ? summary.colors.active.map(c => <span key={`${c.kind}-${c.key}`} className={`lu-color kind-${c.kind}`} title={`+${c.ovr} OVR cho ${c.beneficiaries.length} cầu thủ · nhóm có ${c.members.length} cầu thủ, đạt cấp ${c.tier} (mỗi cầu thủ chỉ nhận team color CLB / quốc gia mạnh nhất, cộng thêm team color cấp thẻ)`}>{colorName(c)}<i>{c.beneficiaries.length}</i><b>+{c.ovr}</b></span>) : <span className="lu-colors-none">Chưa kích hoạt · cần từ 3 cầu thủ cùng CLB / quốc gia hoặc 3 thẻ từ +3</span>}</div>
      <div className={`lu-pitch ${move ? 'is-moving' : ''}`} ref={pitchRef} onClick={e => { if (e.target === e.currentTarget) setPick(null); }}>
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
            onClick={() => { if (justDragged.current) { justDragged.current = false; return; } choose(target); }} {...dragProps(target, false)} {...(card ? tokenPointer(i) : {})} aria-pressed={isPicked(target)} aria-label={card ? `${slot.label}: ${p!.name}, OVR ${value}` : `${slot.label}: trống`}>
            {moving ? <span className="lu-token-top"><span className="lu-face lu-face-ghost"><img src={asset('/assets/silhouette.svg')} alt="" draggable={false}/></span></span> : card ? <>
              <span className="lu-token-top"><Wage card={card}/><Face card={card} className="lu-face"/><strong className={off ? 'is-off' : ''}>{value}</strong></span>
              {/* OVR trên sân đã gồm mọi phần cộng / trừ; rê chuột (cảm ứng: chạm chọn) để xem từng phần. */}
              {(off || applied.length > 0) && <span className="lu-token-tip" role="tooltip">
                <span><i>OVR thẻ</i><b>{ovr(card)}</b></span>
                {off && <span className="is-minus"><i>Trái vị trí ({p!.pos})</i><b>−{penalty}</b></span>}
                {applied.map(c => <span key={`${c.kind}-${c.key}`} className="is-plus"><i>{colorName(c)}</i><b>+{c.ovr}</b></span>)}
                <span className="is-total"><i>OVR {slot.label}</i><b>{value}</b></span>
              </span>}
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
          {set.custom && <button onClick={() => run(s => resetPositions(s, index))} title="Đưa mọi cầu thủ về đúng vị trí của sơ đồ"><RotateCcw size={16}/>Về sơ đồ</button>}
          <button onClick={() => run(s => clearLineup(s, index))} disabled={!summary.filled} title="Đưa cả 11 cầu thủ về dự bị"><Eraser size={16}/>Làm trống</button>
          <button className="lu-optimize" onClick={() => run(s => optimizeLineup(s, index))} disabled={!squad.length} title="Xếp 11 cầu thủ có OVR theo vị trí cao nhất"><Sparkles size={16}/>Tối ưu ĐH</button>
        </div>
      </div>
      <p className="lu-hint">{pick ? 'Chọn vị trí hoặc cầu thủ khác để đổi chỗ · Esc để bỏ chọn' : 'Kéo cầu thủ tới bất cứ đâu trên sân để đổi vị trí, thả lên người khác để đổi chỗ. Hoặc bấm hai cầu thủ để đổi chỗ.'}</p>
    </div>

    <aside className="lu-side" aria-label="Danh sách đội hình">
      <div className="lu-detail">
        {focus ? (() => {
          const p = getPlayer(focus), role = focusSlot >= 0 ? slots[focusSlot].role : null, penalty = role ? playerPenalty(p, role) : 0, price = marketQuote(focus).price, buff = buffs.get(focus.uid);
          return <>
            <div className="lu-detail-text">
              <p className="lu-detail-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></p>
              <p className="lu-detail-ovr">{role && <><span className={`pos-${positionGroup(role)}`}>{slots[focusSlot].label}</span><strong className={penalty ? 'is-off' : ''}>{shownOvr(focus, role)}</strong></>}{(!role || penalty > 0) && <><span className={`pos-${positionGroup(p.pos)}`}>{p.pos}</span><strong>{ovr(focus) + (buff?.ovrBonus ?? 0)}</strong></>}</p>
              <p className="lu-detail-meta">{p.club}{p.flag && <><img src={flagImageUrl(p.flag)} alt=""/>{p.nation}</>}</p>
              {penalty > 0 && <p className="lu-detail-warn">Đá trái vị trí sở trường ({p.pos}): −{penalty} OVR</p>}
              {!!buff?.applied.length && <p className="lu-detail-colors">Cộng OVR: {buff.applied.map(c => `${colorName(c)} +${c.ovr}`).join(' · ')}</p>}
              <dl className="lu-detail-stats">
                <div><dt>Lương</dt><dd><Wage card={focus}/></dd></div>
                <div><dt>Thẻ</dt><dd><img className="squad-level-img" src={levelBadge(focus.level)} alt={`+${focus.level}`}/></dd></div>
                <div><dt>Giá</dt><dd>{price === null ? '—' : money(price)}</dd></div>
              </dl>
              <div className="lu-detail-actions">
                <button onClick={() => onDetail(focus)}><Search size={15}/>Xem thẻ</button>
                {focusSlot >= 0 && <button onClick={() => run(s => placeCard(s, index, focusSlot, null))}><ArrowDownToLine size={15}/>Ra dự bị</button>}
              </div>
            </div>
            <div className="lu-detail-face">{renderCard(focus)}</div>
          </>;
        })() : <div className="lu-detail-empty">
          {squad.length ? <p>{pickedSlot !== null ? `Vị trí ${slots[pickedSlot].label} đang trống. Chọn một cầu thủ ở danh sách Thay thế để đưa vào sân.` : 'Chưa có cầu thủ trên sân. Bấm Tối ưu ĐH để tự xếp, hoặc chọn từng vị trí.'}</p>
            : <p>Đội hình riêng chưa có cầu thủ. Thêm cầu thủ ở Quản lý CT (nút Vào ĐH) rồi quay lại để xếp đội hình.</p>}
          <button onClick={onManage}><Users size={15}/>Quản lý CT</button>
        </div>}
      </div>
      <div className="lu-cols" role="row"><span>Vị trí</span><span>Tên cầu thủ</span><span>Lương</span><span>OVR</span><span>Thẻ</span></div>
      <div className="lu-rows" role="table" aria-label="Cầu thủ đá chính và dự bị">
        {slots.map((slot, i) => row({ slot: i }, starters[i], slot.label, slot.role))}
        <div className="lu-subhead" role="row" {...(dragging && 'slot' in dragging && set.slots[dragging.slot] ? { onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => { e.preventDefault(); const slot = (dragging as { slot: number }).slot; onUpdate(s => placeCard(s, index, slot, null)); setDragging(null); } } : {})}>Thay thế<small>{subs.length}</small></div>
        {subs.length ? subs.map(card => row({ uid: card.uid }, card, getPlayer(card).pos, null)) : <p className="lu-subs-empty">{squad.length ? 'Mọi cầu thủ trong đội hình riêng đều đang đá chính.' : 'Chưa có cầu thủ dự bị.'}</p>}
      </div>
    </aside>
  </section>;
}
