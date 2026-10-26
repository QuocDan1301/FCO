import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronsUp, Lock, LockOpen, Search, Settings, ShoppingCart, Trash2, Zap } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Player, Save, Tier } from './game';
import { marketQuote } from './market';
import { isLocked, positionGroup, squadCards, squadSummary, SQUAD_LIMIT, SQUAD_WAGE_CAP } from './squad';
import { getTeamLogo } from './teamLogos';
import { flagImageUrl } from './flags';
import { asset } from './asset';
import './squad.css';

type Props = {
  save: Save;
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
  onDetail: (card: Card) => void;
  onDelete: (uid: string) => void;
  onSell: (card: Card) => void;
  onUpgrade: (uid: string) => void;
  onLock: (uid: string) => void;
  levelBadge: (level: number) => string;
  seasonShort: (tier: Tier) => string;
};
type SortKey = 'position' | 'name' | 'wage' | 'ovr' | 'level' | 'price';
type Line = 'all' | 'fw' | 'mf' | 'df' | 'gk';
const groupOrder = { gk: 0, df: 1, mf: 2, fw: 3 };
const price = (card: Card) => marketQuote(card).price;
const priceText = (card: Card) => { const p = price(card); return p === null ? 'Chưa có giá' : money(p); };
const fold = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const lines = [['all', 'Tất cả'], ['fw', 'FW'], ['mf', 'MF'], ['df', 'DF'], ['gk', 'GK']] as const;
// Một hằng số cho logo (mothe.html nhúng ảnh theo từng chỗ ghi đường dẫn, logo nặng ~1,6 MB).
const FCO_LOGO = asset('/assets/fco-vip-logo.png');

function compare(a: Card, b: Card, key: SortKey) {
  const pa = getPlayer(a), pb = getPlayer(b);
  switch (key) {
    case 'position': return groupOrder[positionGroup(pa.pos)] - groupOrder[positionGroup(pb.pos)] || pa.pos.localeCompare(pb.pos);
    case 'name': return pa.name.localeCompare(pb.name, 'vi');
    case 'wage': return (pa.wage ?? 0) - (pb.wage ?? 0);
    case 'ovr': return ovr(a) - ovr(b);
    case 'level': return a.level - b.level;
    case 'price': return (price(a) ?? -1) - (price(b) ?? -1);
  }
}
// Giá trị xuất hiện nhiều nhất trong đội hình (logo đội / quốc tịch cho cụm huy hiệu team color).
function mostCommon(players: Player[], pick: (player: Player) => string | undefined) {
  const counts = new Map<string, number>();
  for (const player of players) { const key = pick(player); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
// Bánh răng / chạm vào hàng: đưa focus vào hàng để hiện thanh thao tác (Safari không focus nút khi bấm).
const focusRow = (event: MouseEvent<HTMLElement>) => event.currentTarget.closest<HTMLElement>('.squad-row')?.focus();

type RowActions = { onMove: () => void; onDetail: () => void; onDelete: () => void; onSell: () => void; onUpgrade: () => void; onLock: () => void };
type RowProps = { card: Card; lineup: boolean; locked: boolean; count?: number } & RowActions & Pick<Props, 'levelBadge' | 'seasonShort'>;
// Ảnh chân dung: mặt thẻ đầy đủ được phóng to, cắt vào phần đầu – vai (squad.css); bấm để xem cả thẻ.
const Face = ({ player, onDetail }: { player: Player; onDetail: () => void }) => <button className="squad-face" onClick={onDetail} aria-label={`Xem thẻ ${player.name}`} tabIndex={-1}><img src={player.cardFace || player.image || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></button>;
const Wage = ({ player }: { player: Player }) => <span className="squad-wage" aria-label={`Lương ${player.wage ?? 0}`}><b>{player.wage ?? 0}</b></span>;
function Name({ player, locked, count, seasonShort }: { player: Player; locked: boolean; count?: number; seasonShort: Props['seasonShort'] }) {
  return <span className="squad-name"><b className={`squad-season season-tag-${player.tier}`}>{seasonShort(player.tier)}</b><strong>{player.name}</strong>{count && count > 1 ? <em className="squad-dup" aria-label={`${count} thẻ giống nhau`}>×{count}</em> : null}{locked && <Lock size={13} className="squad-lock-mark" aria-label="Đã khóa"/>}</span>;
}

function Row({ card, lineup, locked, count, levelBadge, seasonShort, ...act }: RowProps) {
  const p = getPlayer(card), group = positionGroup(p.pos), unpriced = price(card) === null;
  // Rê chuột (hoặc chạm / Tab / bấm bánh răng) thì thanh thao tác phủ lên phần chỉ số bên phải.
  const actions = <span className="squad-hover" role="cell">
    <button onClick={act.onLock} className={locked ? 'on' : ''} title={locked ? 'Mở khóa' : 'Khóa'} aria-label={`${locked ? 'Mở khóa' : 'Khóa'} ${p.name}`} aria-pressed={locked}>{locked ? <Lock size={16}/> : <LockOpen size={16}/>}</button>
    <button onClick={act.onDetail} title="Thông tin" aria-label={`Thông tin ${p.name}`}><Search size={16}/></button>
    <button onClick={act.onDelete} disabled={locked} title={locked ? 'Thẻ đang khóa' : 'Xóa cầu thủ'} aria-label={`Xóa ${p.name}`}><Trash2 size={16}/></button>
    <button className="squad-act" onClick={act.onSell} disabled={locked} title={locked ? 'Thẻ đang khóa' : 'Bán ở TTCN'} aria-label={`Bán ${p.name}`}><ShoppingCart size={15}/><span>Bán</span></button>
    <button className="squad-act squad-act-upgrade" onClick={act.onUpgrade} title="Đập thẻ ngay" aria-label={`Đập thẻ ${p.name}`}><Zap size={15}/><span>Đập thẻ</span></button>
    <button className="squad-move" onClick={act.onMove} aria-label={lineup ? `Đưa ${p.name} ra khỏi đội hình` : `Đưa ${p.name} vào đội hình`}>{lineup ? <><span>Rời ĐH</span><ArrowRight size={16}/></> : <><ArrowLeft size={16}/><span>Vào ĐH</span></>}</button>
  </span>;
  const className = `squad-row ${lineup ? 'squad-row-lineup' : 'squad-row-bench'} ${locked ? 'is-locked' : ''}`;
  // Đội hình chính: 2 tầng kiểu FC Online — cụm vị trí (Chọn · vị trí · phong độ / bánh răng), ảnh, tên + (Lương · OVR · Thẻ), giá.
  if (lineup) return <div className={className} role="row" tabIndex={0} aria-label={`${p.name}, OVR ${ovr(card)}`}>
    <span className={`squad-pos pos-${group}`} role="cell"><small>Chọn</small><b>{p.pos}</b><span className="squad-pos-icons"><ChevronsUp size={14} className="squad-form" aria-label="Phong độ tốt"/><button className="squad-gear" onClick={focusRow} aria-label={`Thao tác ${p.name}`} title="Thao tác"><Settings size={12}/></button></span></span>
    <Face player={p} onDetail={act.onDetail}/>
    <div className="squad-info" role="cell">
      <Name player={p} locked={locked} seasonShort={seasonShort}/>
      <span className="squad-stats">
        <span><small>Lương</small><Wage player={p}/></span>
        <span><small>OVR</small><strong className="squad-ovr">{ovr(card)}</strong></span>
        <span><small>Thẻ</small><img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
      </span>
    </div>
    <span className="squad-price-block" role="cell"><small>Giá</small><b className={`squad-price ${unpriced ? 'is-unpriced' : ''}`}>{priceText(card)}</b></span>
    {actions}
  </div>;
  // Kho cầu thủ: 1 hàng mảnh (~44px) để thấy 11–12 cầu thủ cùng lúc.
  return <div className={className} role="row" tabIndex={0} aria-label={`${p.name}, OVR ${ovr(card)}`}>
    <button className="squad-gear" onClick={focusRow} aria-label={`Thao tác ${p.name}`} title="Thao tác"><Settings size={13}/></button>
    <span className={`squad-pos pos-${group}`} role="cell"><b>{p.pos}</b></span>
    <Face player={p} onDetail={act.onDetail}/>
    <span className="squad-name-cell" role="cell"><Name player={p} locked={locked} count={count} seasonShort={seasonShort}/></span>
    <span className="squad-stat" role="cell"><Wage player={p}/></span>
    <strong className="squad-stat squad-ovr" role="cell">{ovr(card)}</strong>
    <span className="squad-stat squad-level" role="cell"><img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
    <span className={`squad-stat squad-price ${unpriced ? 'is-unpriced' : ''}`} role="cell">{priceText(card)}</span>
    {actions}
  </div>;
}
// Quản lí CT: bên trái là đội hình riêng, bên phải là các cầu thủ đang sở hữu chưa vào đội.
export default function SquadManager({ save, onAdd, onRemove, onDetail, onDelete, onSell, onUpgrade, onLock, levelBadge, seasonShort }: Props) {
  const [confirm, setConfirm] = useState<Card | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'price', desc: true });
  const [query, setQuery] = useState('');
  const [line, setLine] = useState<Line>('all');
  const [merge, setMerge] = useState(false);
  const squad = squadCards(save);
  const summary = squadSummary(squad);
  const inSquad = new Set(squad.map(c => c.uid));
  // Lọc theo tên (đếm số thẻ mỗi tuyến cho nút lọc) rồi theo tuyến; gộp thẻ trùng thì mỗi cặp cầu thủ + cấp còn 1 hàng, ưu tiên bản chưa khóa.
  const searched = useMemo(() => {
    const q = fold(query.trim());
    return save.cards.filter(c => !inSquad.has(c.uid) && (!q || fold(getPlayer(c).name).includes(q)));
  }, [save.cards, save.squad, query]);
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
  const lineup = [...squad].sort((a, b) => groupOrder[positionGroup(getPlayer(b).pos)] - groupOrder[positionGroup(getPlayer(a).pos)]);
  const lineupPlayers = squad.map(getPlayer);
  const teamLogo = mostCommon(lineupPlayers, getTeamLogo), nation = mostCommon(lineupPlayers, p => p.flag);
  const overCap = summary.wage > SQUAD_WAGE_CAP;
  const header = (key: SortKey, label: string) => <button className={`squad-col ${sort.key === key ? 'on' : ''}`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}>{label}{sort.key === key && <ChevronDown size={12} className={sort.desc ? '' : 'up'}/>}</button>;
  const segments = [['fw', 'FW'], ['mf', 'MF'], ['df', 'DF'], ['gk', 'GK']] as const;
  const rowProps = (c: Card) => ({ levelBadge, seasonShort, locked: isLocked(save, c.uid), onDetail: () => onDetail(c), onDelete: () => setConfirm(c), onSell: () => onSell(c), onUpgrade: () => onUpgrade(c.uid), onLock: () => onLock(c.uid) });
  return <section className="workspace squad-workspace" aria-labelledby="squad-title">
    <div className="squad-panel squad-left">
      <header className="squad-head squad-head-lineup">
        <div className="squad-title"><h1 id="squad-title">Đội hình chính</h1><p>Đội bóng riêng của bạn</p></div>
        <div className="squad-crests" title="Màu đội: logo đội và quốc tịch xuất hiện nhiều nhất trong đội hình">
          <span className="squad-crest"><img src={teamLogo ?? FCO_LOGO} alt={teamLogo ? 'Logo đội nhiều cầu thủ nhất' : 'FCO VIP'}/></span>
          <span className="squad-crest squad-crest-flag">{nation ? <img src={flagImageUrl(nation)} alt={`Quốc tịch ${nation}`}/> : <img src={FCO_LOGO} alt="FCO VIP"/>}</span>
        </div>
        <div className="squad-meter">
          {/* 4 ô tuyến rộng theo số cầu thủ từng tuyến; tuyến chưa có ai thì ẩn. */}
          <div className={`squad-bar ${summary.size ? '' : 'is-empty'}`} aria-label={`FW ${summary.counts.fw}, MF ${summary.counts.mf}, DF ${summary.counts.df}, GK ${summary.counts.gk}`}>
            {summary.size ? segments.map(([key, label]) => <span key={key} className={`seg-${key}`} style={{ flexGrow: summary.counts[key] }}><i>{label}</i><b>{summary.counts[key]}</b></span>) : <span className="seg-empty">Trống</span>}
          </div>
          <strong className="squad-size">{summary.size}<small>/{SQUAD_LIMIT}</small></strong>
          <span className={`squad-wage-total ${overCap ? 'is-over' : ''}`} title={overCap ? `Vượt mức lương ${summary.wage - SQUAD_WAGE_CAP}` : undefined}>{overCap && <AlertTriangle size={15} aria-label="Vượt mức lương"/>}Lương <strong className={overCap ? 'over-cap' : summary.wage > SQUAD_WAGE_CAP * .95 ? 'near-cap' : ''}>{summary.wage}<small>/{SQUAD_WAGE_CAP}</small></strong></span>
        </div>
      </header>
      <div className="squad-list" role="table" aria-label="Cầu thủ trong đội hình">
        {lineup.length ? lineup.map(c => <Row key={c.uid} card={c} lineup onMove={() => onRemove(c.uid)} {...rowProps(c)}/>)
          : <p className="squad-empty">Chưa có cầu thủ trong đội hình.<br/>Chọn Vào ĐH ở cầu thủ đang sở hữu để thêm vào đội hình.</p>}
      </div>
    </div>
    <div className="squad-panel squad-right">
      <header className="squad-head">
        <h2>Cầu thủ</h2>
        <label className="squad-search"><Search size={15}/><input aria-label="Tìm cầu thủ theo tên" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="squad-owned"><span>Cầu thủ của tôi</span><strong>{save.cards.length}</strong></div>
      </header>
      <div className="squad-tools">
        <div className="squad-lines" role="group" aria-label="Lọc theo tuyến">{lines.map(([key, label]) => <button key={key} className={`line-${key}`} aria-pressed={line === key} onClick={() => setLine(key)}>{label}<small>{lineCounts[key]}</small></button>)}</div>
        <label className="squad-merge"><input type="checkbox" checked={merge} onChange={e => setMerge(e.target.checked)}/><span aria-hidden="true"/>Gộp thẻ trùng</label>
      </div>
      <div className="squad-columns" role="row"><span/>{header('position', 'Vị trí')}<span/>{header('name', 'Tên cầu thủ')}{header('wage', 'Lương')}{header('ovr', 'OVR')}{header('level', 'Thẻ')}{header('price', 'Giá')}</div>
      <div className="squad-list" role="table" aria-label="Cầu thủ đang sở hữu">
        {available.length ? available.map(({ card: c, count }) => <Row key={c.uid} card={c} lineup={false} count={count} onMove={() => onAdd(c.uid)} {...rowProps(c)}/>)
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
