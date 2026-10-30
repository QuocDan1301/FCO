import { useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { ArrowDownToLine, Eraser, Search, Sparkles, Users } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { marketQuote } from './market';
import { FORMATIONS, LINEUP_NAMES, SQUAD_WAGE_CAP, clearLineup, getLineups, lineupSummary, optimizeLineup, placeCard, positionGroup, positionPenalty, selectLineup, setFormation, slotOvr, squadCards } from './squad';
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
};
// Ô đang chọn: một vị trí trên sân (kể cả ô trống) hoặc một cầu thủ dự bị.
type Pick = { slot: number } | { uid: string };
const same = (a: Pick, b: Pick) => 'slot' in a ? 'slot' in b && a.slot === b.slot : 'uid' in b && a.uid === b.uid;
const groupOrder = { fw: 0, mf: 1, df: 2, gk: 3 };

// Sân phối cảnh: toạ độ sân (0–100) chiếu lên hình thang hẹp dần về phía khung thành đối phương.
const TOP = .74;
const depth = (y: number) => TOP + (1 - TOP) * y / 100;
const project = (x: number, y: number): [number, number] => [50 + (x - 50) * .92 * depth(y), 3 + y * .86];
const path = (points: [number, number][], close = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${project(x, y).map(n => n.toFixed(2)).join(' ')}`).join('') + (close ? 'Z' : '');
const box = (x0: number, y0: number, x1: number, y1: number) => path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
const arc = (cx: number, cy: number, rx: number, ry: number, from = 0, to = 360) => path(Array.from({ length: 41 }, (_, i) => { const a = (from + (to - from) * i / 40) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }));
const PITCH_LINES = [box(0, 0, 100, 100), path([[0, 50], [100, 50]]), arc(50, 50, 15, 9.5), box(20, 0, 80, 16), box(36, 0, 64, 6), box(20, 84, 80, 100), box(36, 94, 64, 100), arc(50, 11, 12, 8, 42, 138), arc(50, 89, 12, 8, 222, 318)].join('');
const STRIPES = Array.from({ length: 10 }, (_, i) => box(0, i * 10, 100, i * 10 + 10));

const Face = ({ card, className }: { card: Card; className: string }) => { const p = getPlayer(card); return <span className={className}><img src={p.cardFace || p.image || asset('/assets/silhouette.svg')} alt="" loading="lazy" draggable={false}/></span>; };
const colorName = (c: AppliedBuff) => c.kind === 'upgrade' ? `Cấp +${c.minLevel}` : `${c.kind === 'club' ? 'CLB' : 'QG'} ${c.key}`;
const Wage = ({ card }: { card: Card }) => <span className="squad-wage"><b>{getPlayer(card).wage ?? 0}</b></span>;

// Màn Đội hình: chọn bộ A/B/C và sơ đồ, xếp 11 cầu thủ của đội hình riêng lên sân; bấm (hoặc kéo) hai ô để đổi chỗ.
export default function LineupBoard({ save, onUpdate, onDetail, onManage, levelBadge, seasonShort }: Props) {
  const lineups = getLineups(save), index = lineups.active, set = lineups.sets[index], slots = FORMATIONS[set.formation];
  const squad = squadCards(save), byUid = new Map(squad.map(c => [c.uid, c]));
  const starters = set.slots.map(uid => uid ? byUid.get(uid) ?? null : null);
  const playing = new Set(set.slots.filter(Boolean));
  const subs = squad.filter(c => !playing.has(c.uid)).sort((a, b) => groupOrder[positionGroup(getPlayer(a).pos)] - groupOrder[positionGroup(getPlayer(b).pos)] || ovr(b) - ovr(a));
  const summary = lineupSummary(save, set), buffs = new Map(summary.colors.players.map(r => [r.playerId, r]));
  // OVR hiển thị của cầu thủ đá chính = OVR theo vị trí + team color; chú thích ghi rõ phần trừ / cộng.
  const shownOvr = (card: Card, role: string) => buffs.get(card.uid)?.finalOvr ?? slotOvr(card, role);
  const ovrNote = (card: Card, role: string) => { const p = getPlayer(card), penalty = positionPenalty(p.pos, role), buff = buffs.get(card.uid); return [penalty ? `Đá trái vị trí (${p.pos}): −${penalty}` : '', ...(buff?.applied ?? []).map(c => `Team color ${colorName(c)}: +${c.ovr}`)].filter(Boolean).join(' · ') || undefined; };
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
    const value = card ? role ? shownOvr(card, role) : ovr(card) : null, off = !!(card && role && positionPenalty(p!.pos, role));
    return <button key={'slot' in target ? `s${target.slot}` : target.uid} role="row" className={`lu-row ${isPicked(target) ? 'is-picked' : ''} ${card ? '' : 'is-empty'}`} onClick={() => choose(target)} {...dragProps(target, !!card)} aria-pressed={isPicked(target)} aria-label={card ? `${label} · ${p!.name} · OVR ${value}` : `${label} · trống`}>
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
      <div className="lu-colors" aria-label="Team color đang kích hoạt"><small>Team color</small>{summary.colors.active.length ? summary.colors.active.map(c => <span key={`${c.kind}-${c.key}`} className={`lu-color kind-${c.kind}`} title={`${c.members.length} cầu thủ · mốc ${c.tier} · +${c.ovr} OVR cho ${c.beneficiaries.length} cầu thủ (mỗi cầu thủ chỉ nhận team color CLB / quốc gia mạnh nhất)`}>{colorName(c)}<i>{c.members.length}</i><b>+{c.ovr}</b></span>) : <span className="lu-colors-none">Chưa kích hoạt · cần từ 3 cầu thủ cùng CLB / quốc gia hoặc 5 thẻ từ +3</span>}</div>
      <div className="lu-pitch" onClick={e => { if (e.target === e.currentTarget) setPick(null); }}>
        <svg className="lu-pitch-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {STRIPES.map((d, i) => <path key={i} d={d} className={i % 2 ? 'lu-stripe-b' : 'lu-stripe-a'}/>)}
          <path d={PITCH_LINES} className="lu-lines"/>
        </svg>
        {slots.map((slot, i) => {
          const card = starters[i], p = card && getPlayer(card), [left, top] = project(slot.x, slot.y), target = { slot: i };
          const value = card ? shownOvr(card, slot.role) : 0, off = !!(p && positionPenalty(p.pos, slot.role)), bonus = card ? buffs.get(card.uid)?.ovrBonus ?? 0 : 0;
          return <button key={`${set.formation}-${i}`} className={`lu-token pos-${positionGroup(slot.role)} ${card ? '' : 'is-empty'} ${isPicked(target) ? 'is-picked' : ''} ${dragging && !same(dragging, target) ? 'is-drop' : ''}`} style={{ left: `${left}%`, top: `${top}%`, '--k': depth(slot.y) } as CSSProperties}
            onClick={() => choose(target)} {...dragProps(target, !!card)} aria-pressed={isPicked(target)} aria-label={card ? `${slot.label}: ${p!.name}, OVR ${value}` : `${slot.label}: trống`}>
            {card ? <>
              <span className="lu-token-top" title={ovrNote(card, slot.role)}><Wage card={card}/><Face card={card} className="lu-face"/>{bonus > 0 && <i className="lu-buff">+{bonus}</i>}<strong className={off ? 'is-off' : ''}>{value}</strong></span>
              <span className="lu-token-name"><b className={`squad-season season-tag-${p!.tier}`}>{seasonShort(p!.tier)}</b>{p!.name}</span>
            </> : <>
              <span className="lu-token-top"><span className="lu-face lu-face-empty">+</span></span>
              <span className="lu-token-name">{slot.label}</span>
            </>}
          </button>;
        })}
        <div className="lu-pitch-actions">
          <button onClick={() => run(s => clearLineup(s, index))} disabled={!summary.filled} title="Đưa cả 11 cầu thủ về dự bị"><Eraser size={16}/>Làm trống</button>
          <button className="lu-optimize" onClick={() => run(s => optimizeLineup(s, index))} disabled={!squad.length} title="Xếp 11 cầu thủ có OVR theo vị trí cao nhất"><Sparkles size={16}/>Tối ưu ĐH</button>
        </div>
      </div>
      <p className="lu-hint">{pick ? 'Chọn vị trí hoặc cầu thủ khác để đổi chỗ · Esc để bỏ chọn' : 'Bấm một cầu thủ rồi bấm vị trí / cầu thủ khác để đổi chỗ, hoặc kéo thả.'}</p>
    </div>

    <aside className="lu-side" aria-label="Danh sách đội hình">
      <div className="lu-detail">
        {focus ? (() => {
          const p = getPlayer(focus), role = focusSlot >= 0 ? slots[focusSlot].role : null, penalty = role ? positionPenalty(p.pos, role) : 0, price = marketQuote(focus).price, buff = buffs.get(focus.uid);
          return <>
            <div className="lu-detail-text">
              <p className="lu-detail-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></p>
              <p className="lu-detail-ovr">{role && <><span className={`pos-${positionGroup(role)}`}>{slots[focusSlot].label}</span><strong className={penalty ? 'is-off' : ''}>{shownOvr(focus, role)}</strong></>}{(!role || penalty > 0) && <><span className={`pos-${positionGroup(p.pos)}`}>{p.pos}</span><strong>{ovr(focus)}</strong></>}</p>
              <p className="lu-detail-meta">{p.club}{p.flag && <><img src={flagImageUrl(p.flag)} alt=""/>{p.nation}</>}</p>
              {penalty > 0 && <p className="lu-detail-warn">Đá trái vị trí sở trường ({p.pos}): −{penalty} OVR</p>}
              {!!buff?.applied.length && <p className="lu-detail-colors">Team color: {buff.applied.map(c => `${colorName(c)} +${c.ovr}`).join(' · ')}</p>}
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
            <Face card={focus} className="lu-detail-face"/>
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
