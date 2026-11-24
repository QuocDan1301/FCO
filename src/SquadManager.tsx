import { useMemo, useState } from 'react';
import { ovrStyle } from './ovr-color';
import type { MouseEvent } from 'react';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, ArrowRight, ChevronDown, ChevronsDown, ChevronsUp, LayoutGrid, Lock, LockOpen, Search, Settings, ShoppingCart, Trash2 } from 'lucide-react';
import { INVENTORY_CARD_CAP, getPlayer, money, ovr } from './game';
import type { Card, Player, Save, Tier } from './game';
import { isTradeLocked, marketQuote } from './market';
import { activeTeamColors, getLineups, isLocked, positionGroup, setCards, squadSummary, teamColorDetails, SQUAD_LIMIT, SQUAD_RESERVE_MAX, SQUAD_SUBS_MAX, SQUAD_WAGE_CAP } from './squad';
import { teamColorName } from './teamColor';
import type { BuffResult } from './teamColor';
import { clubLogo } from './teamLogos';
import { flagImageUrl } from './flags';
import { asset } from './asset';
import './squad.css';
import Progressive from './Progressive';
import { faceOf } from './portraits';

type Props = {
  save: Save;
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
  onReserve: (uid: string, on: boolean) => void;
  onSelectSet: (index: number) => void;
  onSwap: (a: string, b: string) => boolean | void;
  onDetail: (card: Card) => void;
  onDelete: (uid: string) => void;
  onSell: (card: Card) => void;
  onUpgrade: (uid: string) => void;
  onLock: (uid: string) => void;
  onLineup: () => void;
  onBulkSell: () => void;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
};
type SortKey = 'position' | 'name' | 'wage' | 'ovr' | 'level' | 'price';
type Line = 'all' | 'fw' | 'mf' | 'df' | 'gk';
const groupOrder = { gk: 0, df: 1, mf: 2, fw: 3 };
const viCollator = new Intl.Collator('vi');
const price = (card: Card) => marketQuote(card).price;
const priceText = (card: Card) => { const p = price(card); return p === null ? 'Chưa có giá' : money(p); };
const fold = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const lines = [['all', 'Tất cả'], ['fw', 'FW'], ['mf', 'MF'], ['df', 'DF'], ['gk', 'GK']] as const;
// Một hằng số cho logo (mothe.html nhúng ảnh theo từng chỗ ghi đường dẫn, logo nặng ~1,6 MB).
const FCO_LOGO = asset('/assets/fco-vip-logo-v2.png');

function compare(a: Card, b: Card, key: SortKey) {
  const pa = getPlayer(a), pb = getPlayer(b);
  switch (key) {
    case 'position': return groupOrder[positionGroup(pa.pos)] - groupOrder[positionGroup(pb.pos)] || pa.pos.localeCompare(pb.pos);
    case 'name': return viCollator.compare(pa.name, pb.name);
    case 'wage': return (pa.wage ?? 0) - (pb.wage ?? 0);
    case 'ovr': return ovr(a) - ovr(b);
    case 'level': return a.level - b.level;
    case 'price': return (price(a) ?? -1) - (price(b) ?? -1);
  }
}
// Bánh răng / chạm vào hàng: đưa focus vào hàng để hiện thanh thao tác (Safari không focus nút khi bấm).
const focusRow = (event: MouseEvent<HTMLElement>) => event.currentTarget.closest<HTMLElement>('.squad-row')?.focus();

type RowActions = { onMove: () => void; onReserve?: () => void; onSwap?: () => void; onSelect?: () => void; onDetail: () => void; onDelete: () => void; onSell: () => void; onUpgrade: () => void; onLock: () => void };
type RowProps = { card: Card; lineup: boolean; sub?: boolean; reserve?: boolean; selected?: boolean; locked: boolean; count?: number; color?: BuffResult } & RowActions & Pick<Props, 'levelBadge' | 'seasonShort'>;
// Ảnh chân dung: mặt thẻ đầy đủ được phóng to, cắt vào phần đầu – vai (squad.css); bấm để xem cả thẻ.
// Ảnh chân dung (mini face): chỉ để nhìn, bấm vào không mở thông tin cầu thủ (người dùng 2026-11-23); xem thông tin bằng nút kính lúp ở thanh thao tác. Bấm vào ảnh là chọn hàng.
const Face = ({ player }: { player: Player; onDetail?: () => void }) => <div className={`squad-face${faceOf(player).portrait ? ' is-portrait' : ''}`} aria-hidden="true"><img src={faceOf(player).src || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></div>;
const Wage = ({ player }: { player: Player }) => <span className="squad-wage" aria-label={`Lương ${player.wage ?? 0}`}><b>{player.wage ?? 0}</b></span>;
function Name({ player, locked, count, seasonShort }: { player: Player; locked: boolean; count?: number; seasonShort: Props['seasonShort'] }) {
  return <span className="squad-name"><b className={`squad-season season-tag-${player.tier}`}>{seasonShort(player.tier)}</b><strong>{player.name}</strong>{count && count > 1 ? <em className="squad-dup" aria-label={`${count} thẻ giống nhau`}>×{count}</em> : null}{locked && <Lock size={13} className="squad-lock-mark" aria-label="Đã khóa"/>}</span>;
}

// Ổ khoá đặc kiểu mẫu: thân chữ nhật bo góc có lỗ khoá, quai dày; mở khoá thì quai hở một bên.
const PadlockIcon = ({ open }: { open: boolean }) => <svg viewBox="0 0 24 24" aria-hidden="true">
  <path d={open ? 'M8 11V7.4a4 4 0 0 1 7.6-1.8' : 'M8 11V7.4a4 4 0 0 1 8 0V11'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
  <path fillRule="evenodd" d="M4 13a2.2 2.2 0 0 1 2.2-2.2h11.6A2.2 2.2 0 0 1 20 13v7.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 20.6zM12 14.2a1.9 1.9 0 0 1 .95 3.55V20h-1.9v-2.25A1.9 1.9 0 0 1 12 14.2z" fill="currentColor"/>
</svg>;

function Row({ card, lineup, sub, reserve, selected, locked, count, color, levelBadge, seasonShort, ...act }: RowProps) {
  const p = getPlayer(card), group = positionGroup(p.pos), unpriced = price(card) === null;
  // Cầu thủ đang đá chính: OVR đã cộng team color; rê chuột vào số để xem cộng từ đâu.
  const shownOvr = ovr(card) + (color?.ovrBonus ?? 0);
  const ovrNote = color?.applied.length ? [`OVR thẻ ${ovr(card)}`, ...color.applied.map(c => `${teamColorName(c)} +${c.ovr}`)].join(' · ') : undefined;
  // Rê chuột (hoặc chạm / Tab / bấm bánh răng) thì thanh thao tác phủ lên phần chỉ số bên phải.
  const tradeLocked = isTradeLocked(card);
  // Cầu thủ đá chính và Thay thế không có nút Rời ĐH: chỉ đổi vị trí với cầu thủ khác (nút Thay thế đứng ở chỗ nút Rời ĐH). Dự bị và cầu thủ trong kho vẫn có nút riêng.
  const canLeave = !lineup || !!reserve;
  const actions = <span className="squad-hover" role="cell" onClick={e => { if ((e.target as HTMLElement).closest('button')) e.stopPropagation(); }}>
    <button className="squad-act" onClick={act.onSell} disabled={locked || tradeLocked} title={tradeLocked ? 'Khóa giao dịch' : locked ? 'Thẻ đang khóa' : 'Bán ở TTCN'} aria-label={`Bán ${p.name}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7"/><circle cx="10" cy="20.2" r="1.4" fill="currentColor"/><circle cx="18" cy="20.2" r="1.4" fill="currentColor"/><path d="M13.5 12.6V3.8" strokeWidth="2.8"/><path d="m9.4 7.8 4.1-4.6 4.1 4.6" strokeWidth="2.8"/></svg></button>
    <button className="squad-act-upgrade" onClick={act.onUpgrade} title="Đập thẻ ngay" aria-label={`Đập thẻ ${p.name}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 22 11.6H16.4V14H7.6v-2.4H2z"/><rect x="7.6" y="15.2" width="8.8" height="2.8" rx=".4"/><rect x="7.6" y="19.2" width="8.8" height="2.8" rx=".4"/></svg></button>
    <button onClick={act.onLock} className={locked ? 'on' : ''} title={locked ? 'Mở khóa' : 'Khóa'} aria-label={`${locked ? 'Mở khóa' : 'Khóa'} ${p.name}`} aria-pressed={locked}><PadlockIcon open={!locked}/></button>
    <button onClick={act.onDetail} title="Thông tin" aria-label={`Thông tin ${p.name}`}><Search size={17} strokeWidth={3}/></button>
    <button onClick={act.onDelete} disabled={locked} title={locked ? 'Thẻ đang khóa' : 'Xóa cầu thủ'} aria-label={`Xóa ${p.name}`}><Trash2 size={17} strokeWidth={2.6}/></button>
    {act.onReserve && <button className="squad-act" onClick={act.onReserve} title={reserve ? 'Chuyển lên Thay thế' : 'Chuyển xuống Dự bị'} aria-label={`${reserve ? 'Chuyển lên Thay thế' : 'Chuyển xuống Dự bị'} ${p.name}`}>{reserve ? <ChevronsUp size={18} strokeWidth={2.8}/> : <ChevronsDown size={18} strokeWidth={2.8}/>}</button>}
    {act.onSwap && <button className={canLeave ? 'squad-swap' : 'squad-move squad-swap'} onClick={act.onSwap} title="Đổi vị trí với cầu thủ đang chọn" aria-label={`Thay thế bằng ${p.name}: đổi vị trí với cầu thủ đang chọn`}><ArrowLeftRight size={17} strokeWidth={2.6}/><span>Thay thế</span></button>}
    {canLeave && <button className="squad-move" onClick={act.onMove} aria-label={lineup ? `Đưa ${p.name} ra khỏi đội hình` : `Đưa ${p.name} vào đội hình`}>{lineup ? <><span>Rời ĐH</span><ArrowRight size={16}/></> : <><ArrowLeft size={16}/><span>Vào ĐH</span></>}</button>}
  </span>;
  const className = `squad-row ${lineup ? 'squad-row-lineup' : 'squad-row-bench'} ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''}`;
  // Đội hình chính: 2 tầng kiểu FC Online — cụm vị trí (Chọn · vị trí · phong độ / bánh răng), ảnh, tên + (Lương · OVR · Thẻ), giá.
  if (lineup) return <div className={className} role="row" tabIndex={0} aria-selected={!!selected} aria-label={`${p.name}, OVR ${shownOvr}`} onClick={act.onSelect} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); act.onSelect?.(); } }}>
    <span className={`squad-pos pos-${group}`} role="cell"><small>{reserve ? 'Dự bị' : sub ? 'Thay thế' : 'ĐH chính'}</small><b>{p.pos}</b><span className="squad-pos-icons"><svg className="squad-form" viewBox="0 0 24 25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Phong độ tốt"><path d="m21 7-9-4-9 4"/><path d="m21 12.5-9-4-9 4"/><path d="m21 18-9-4-9 4"/><path d="m21 23.5-9-4-9 4"/></svg></span></span>
    <Face player={p} onDetail={act.onDetail}/>
    <div className="squad-info" role="cell">
      <Name player={p} locked={locked} seasonShort={seasonShort}/>
      <span className="squad-stats">
        <span aria-label="Lương"><Wage player={p}/></span>
        <span title={ovrNote} aria-label="OVR"><strong className="squad-ovr" style={ovrStyle(shownOvr)}>{shownOvr}</strong></span>
        <span aria-label="Thẻ"><img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
      </span>
    </div>
    <span className="squad-price-block" role="cell"><small>Giá</small><b className={`squad-price ${unpriced ? 'is-unpriced' : ''}`}>{priceText(card)}</b></span>
    {actions}
  </div>;
  // Kho cầu thủ: 1 hàng mảnh (~44px) để thấy 11–12 cầu thủ cùng lúc.
  return <div className={className} role="row" tabIndex={0} aria-label={`${p.name}, OVR ${ovr(card)}`}>
    <span aria-hidden="true"/>
    <span className={`squad-pos pos-${group}`} role="cell"><b>{p.pos}</b></span>
    <Face player={p} onDetail={act.onDetail}/>
    <span className="squad-name-cell" role="cell"><Name player={p} locked={locked} count={count} seasonShort={seasonShort}/></span>
    <span className="squad-stat" role="cell"><Wage player={p}/></span>
    <strong className="squad-stat squad-ovr" role="cell" style={ovrStyle(ovr(card))}>{ovr(card)}</strong>
    <span className="squad-stat squad-level" role="cell"><img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
    <span className={`squad-stat squad-price ${unpriced ? 'is-unpriced' : ''}`} role="cell">{priceText(card)}</span>
    {actions}
  </div>;
}
// Quản lí CT: bên trái là đội hình riêng, bên phải là các cầu thủ đang sở hữu chưa vào đội.
export default function SquadManager({ save, onAdd, onRemove, onReserve, onSelectSet, onSwap, onDetail, onDelete, onSell, onUpgrade, onLock, onLineup, onBulkSell, levelBadge, seasonShort }: Props) {
  const [confirm, setConfirm] = useState<Card | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'price', desc: true });
  const [query, setQuery] = useState('');
  const [line, setLine] = useState<Line>('all');
  const [merge, setMerge] = useState(false);
  // Cầu thủ đang chọn (bấm vào hàng): rê chuột sang cầu thủ khác sẽ hiện nút Thay thế để hai người đổi vị trí.
  const [selected, setSelected] = useState<string | null>(null);
  // Mỗi bộ A / B / C là một đội riêng: mọi danh sách dưới đây là của bộ đang chọn (bộ chưa có ai thì để trống).
  const lineupSets = getLineups(save), activeSet = lineupSets.sets[lineupSets.active];
  const squad = setCards(save, activeSet);
  const summary = squadSummary(squad);
  const inSquad = new Set(squad.map(c => c.uid));
  // Lọc theo tên (đếm số thẻ mỗi tuyến cho nút lọc) rồi theo tuyến; gộp thẻ trùng thì mỗi cặp cầu thủ + cấp còn 1 hàng, ưu tiên bản chưa khóa.
  const searched = useMemo(() => {
    const q = fold(query.trim());
    return save.cards.filter(c => !inSquad.has(c.uid) && (!q || fold(getPlayer(c).name).includes(q)));
  }, [save.cards, save.squad, save.lineups, query]);
  const lineCounts = useMemo(() => {
    const counts = { all: searched.length, fw: 0, mf: 0, df: 0, gk: 0 };
    for (const c of searched) counts[positionGroup(getPlayer(c).pos)]++;
    return counts;
  }, [searched]);
  const available = useMemo(() => {
    const sorted = searched.filter(c => line === 'all' || positionGroup(getPlayer(c).pos) === line)
      .sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key) || ovr(b) - ovr(a) || b.level - a.level);
    if (!merge) return sorted.map(card => ({ card, count: 1 }));
    const groups = new Map<string, Card[]>();
    for (const c of sorted) { const key = `${c.playerId}:${c.level}`; groups.set(key, [...(groups.get(key) ?? []), c]); }
    return [...groups.values()].map(group => ({ card: group.find(c => !isLocked(save, c.uid)) ?? group[0], count: group.length }));
  }, [searched, line, sort, merge, save.locked]);
  const colorDetails = useMemo(() => teamColorDetails(save), [save.cards, save.squad, save.lineups]);
  // Đội hình chính = các cầu thủ đang xếp trên sân ở bộ đội hình đang chọn; phần còn lại là Thay thế (dự bị). Lương chỉ tính cho đội hình chính.
  const playing = new Set(activeSet.slots.filter((uid): uid is string => !!uid));
  const reserveIds = new Set(activeSet.reserve ?? []);
  // Thứ tự hiển thị theo vị trí thật: ĐH chính theo ô trên sân, Dự bị theo danh sách Dự bị, Thay thế theo thứ tự đăng ký. Đổi vị trí hai cầu thủ đổi luôn chỗ của họ trong danh sách.
  const byId = new Map(squad.map(c => [c.uid, c] as const));
  const starters = activeSet.slots.flatMap(uid => { const c = uid ? byId.get(uid) : undefined; return c ? [c] : []; });
  const subs = (activeSet.subs ?? []).flatMap(uid => { const c = byId.get(uid); return c ? [c] : []; });
  const reserves = (activeSet.reserve ?? []).flatMap(uid => { const c = byId.get(uid); return c ? [c] : []; });
  const startersWage = squadSummary(starters).wage;
  const lineupPlayers = squad.map(getPlayer);
  // Huy hiệu màu đội: CLB / quốc gia của team color đang kích hoạt; chưa kích hoạt thì lấy logo / quốc tịch nhiều nhất trong đội hình.
  const colors = useMemo(() => activeTeamColors(save), [save.cards, save.squad, save.lineups]);
  // Chỉ hiện huy hiệu của team color có người nhận; chưa có team color nào thì hiện logo FCO VIP.
  const teamLogo = colors.club ? clubLogo(colors.club) ?? FCO_LOGO : undefined;
  const nation = colors.nation ? lineupPlayers.find(p => p.nation === colors.nation)?.flag : undefined;
  const overCap = startersWage > SQUAD_WAGE_CAP;
  const header = (key: SortKey, label: string) => <button className={`squad-col ${sort.key === key ? 'on' : ''}`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}>{label}{sort.key === key && <ChevronDown size={12} className={sort.desc ? '' : 'up'}/>}</button>;
  const segments = [['fw', 'FW'], ['mf', 'MF'], ['df', 'DF'], ['gk', 'GK']] as const;
  // Hàng trong bảng đội hình: bấm để chọn; có cầu thủ khác đang chọn thì hiện nút Thay thế (đổi vị trí hai người).
  const lineRow = (c: Card) => ({ ...rowProps(c), selected: selected === c.uid, onSelect: () => setSelected(s => s === c.uid ? null : c.uid), ...(selected && selected !== c.uid && squad.some(x => x.uid === selected) ? { onSwap: () => { if (selected && onSwap(selected, c.uid) !== false) setSelected(null); } } : {}) });
  const rowProps = (c: Card) => ({ levelBadge, seasonShort, locked: isLocked(save, c.uid), onDetail: () => onDetail(c), onDelete: () => setConfirm(c), onSell: () => onSell(c), onUpgrade: () => onUpgrade(c.uid), onLock: () => onLock(c.uid) });
  return <section className="workspace squad-workspace" aria-labelledby="squad-title">
    <div className="squad-panel squad-left">
      <header className="squad-head squad-head-lineup">
        <div className="squad-title"><h1 id="squad-title">Đội hình chính</h1><p>Đội xếp hạng</p></div>
        <div className="squad-sets" role="group" aria-label="Bộ đội hình">{(['A', 'B', 'C'] as const).map((k, i) => <button key={k} type="button" className={lineupSets.active === i ? 'on' : undefined} aria-pressed={lineupSets.active === i} onClick={() => { setSelected(null); onSelectSet(i); }}>{k}</button>)}</div>
        <div className="squad-meter">
          {/* 4 ô tuyến rộng theo số cầu thủ từng tuyến; tuyến chưa có ai thì ẩn. */}
          <div className="squad-bar" aria-label={`FW ${summary.counts.fw}, MF ${summary.counts.mf}, DF ${summary.counts.df}, GK ${summary.counts.gk}, tối đa ${SQUAD_LIMIT}`}>
            {segments.map(([key, label]) => <span key={key} className={`seg-${key}`} style={{ flexGrow: summary.counts[key] }}><i>{label}</i><b>{summary.counts[key]}</b></span>)}
            <span className="seg-rest" style={{ flexGrow: Math.max(0, SQUAD_LIMIT - summary.size) }}><em>MAX</em></span>
          </div>
          <strong className="squad-size">{summary.size}<small>/{SQUAD_LIMIT}</small></strong>
          <span className={`squad-wage-total ${overCap ? 'is-over' : ''}`} title={overCap ? `Vượt mức lương ${startersWage - SQUAD_WAGE_CAP}` : 'Lương chỉ tính đội hình chính, không tính thay thế'}>{overCap && <AlertTriangle size={15} aria-label="Vượt mức lương"/>}Lương <strong className={overCap ? 'over-cap' : startersWage > SQUAD_WAGE_CAP * .95 ? 'near-cap' : ''}>{startersWage}<small>/{SQUAD_WAGE_CAP}</small></strong></span>
        </div>
      </header>
      <div className="squad-list" role="table" aria-label="Cầu thủ trong đội hình">
        {squad.length ? <>
          <div className="squad-section-bar squad-section-sub">ĐH chính<small>{starters.length}/11</small></div>
          {starters.map(c => <Row key={c.uid} card={c} lineup color={colorDetails.get(c.uid)} onMove={() => onRemove(c.uid)} {...lineRow(c)}/>)}
          {!starters.length && <p className="squad-empty">Chưa xếp cầu thủ nào vào đội hình chính. Dùng tab Đội hình để xếp.</p>}
          {subs.length > 0 && <div className="squad-section-bar squad-section-sub">Thay thế<small>{subs.length}/{SQUAD_SUBS_MAX}</small></div>}
          {subs.map(c => <Row key={c.uid} card={c} lineup sub color={colorDetails.get(c.uid)} onMove={() => onRemove(c.uid)} onReserve={() => onReserve(c.uid, true)} {...lineRow(c)}/>)}
          {reserves.length > 0 && <div className="squad-section-bar squad-section-sub">Dự bị<small>{reserves.length}/{SQUAD_RESERVE_MAX}</small></div>}
          {reserves.map(c => <Row key={c.uid} card={c} lineup sub reserve color={colorDetails.get(c.uid)} onMove={() => onRemove(c.uid)} onReserve={() => onReserve(c.uid, false)} {...lineRow(c)}/>)}
        </>
          : <p className="squad-empty">Bộ {'ABC'[lineupSets.active]} chưa có cầu thủ nào.<br/>Chọn Vào ĐH ở cầu thủ đang sở hữu (khung bên phải) để thêm vào bộ này.</p>}
      </div>
    </div>
    <div className="squad-panel squad-right">
      <header className="squad-head squad-head-owned">
        <div className="squad-title"><h2>Cầu thủ</h2><p>Chỉ những cầu thủ đã đăng ký mới có thể thi đấu. Vui lòng đăng ký cầu thủ.</p></div>
        <div className="squad-owned"><span>Cầu thủ của tôi</span><strong>{save.cards.length}<small> /{INVENTORY_CARD_CAP}</small></strong></div>
      </header>
      <div className="squad-columns" role="row"><span/>{header('position', 'Vị trí')}<span/>{header('name', 'Tên cầu thủ')}{header('wage', 'Lương')}{header('ovr', 'OVR')}{header('level', 'Thẻ')}{header('price', 'Giá')}</div>
      <div className="squad-list" role="table" aria-label="Cầu thủ đang sở hữu">
        {available.length ? <Progressive items={available.map(({ card: c, count }) => <Row key={c.uid} card={c} lineup={false} count={count} onMove={() => onAdd(c.uid)} {...rowProps(c)}/>)}/>
          : <p className="squad-empty">{query || line !== 'all' ? 'Không tìm thấy cầu thủ.' : 'Mọi cầu thủ đều đã ở trong đội hình.'}</p>}
      </div>
    </div>
    {confirm && <div className="squad-confirm" role="dialog" aria-modal="true" aria-labelledby="squad-confirm-title" onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
      <div className="squad-confirm-box">
        <h3 id="squad-confirm-title">Xóa cầu thủ?</h3>
        <p><b>{getPlayer(confirm).name} +{confirm.level}</b> sẽ bị xóa khỏi kho và không nhận lại BP. Không thể hoàn tác.</p>
        <div><button className="secondary-button" onClick={() => setConfirm(null)} autoFocus>Hủy</button><button className="squad-confirm-delete" onClick={() => { onDelete(confirm.uid); setConfirm(null); }}><Trash2 size={16}/>Xóa</button></div>
      </div>
    </div>}
  </section>;
}
