import { useMemo, useState } from 'react';
import { ArrowBigUp, ArrowLeft, ArrowRight, ChevronDown, Lock, LockOpen, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import type { Card, Save, Tier } from './game';
import { marketQuote } from './market';
import { isLocked, positionGroup, squadCards, squadSummary, SQUAD_LIMIT, SQUAD_WAGE_CAP } from './squad';
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
const groupOrder = { gk: 0, df: 1, mf: 2, fw: 3 };
const price = (card: Card) => marketQuote(card).price;
const priceText = (card: Card) => { const p = price(card); return p === null ? 'Chưa có giá' : money(p); };
const fold = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

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

type RowActions = { onMove: () => void; onDetail: () => void; onDelete: () => void; onSell: () => void; onUpgrade: () => void; onLock: () => void };
function Row({ card, inSquad, locked, levelBadge, seasonShort, ...act }: { card: Card; inSquad: boolean; locked: boolean } & RowActions & Pick<Props, 'levelBadge' | 'seasonShort'>) {
  const p = getPlayer(card), group = positionGroup(p.pos);
  // Rê chuột (hoặc chạm / Tab vào hàng) thì ẩn chỉ số, hiện thanh thao tác.
  return <div className={`squad-row ${inSquad ? 'in-squad' : ''} ${locked ? 'is-locked' : ''}`} role="row" tabIndex={0} aria-label={`${p.name}, OVR ${ovr(card)}`}>
    <span className={`squad-pos pos-${group}`} role="cell">{inSquad && <small>Chọn</small>}{p.pos}</span>
    <button className="squad-face" onClick={act.onDetail} aria-label={`Chi tiết ${p.name}`} tabIndex={-1}><img src={p.cardFace || p.image || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></button>
    <span className="squad-name" role="cell"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong>{locked && <Lock size={13} className="squad-lock-mark" aria-label="Đã khóa"/>}</span>
    <span className="squad-wage squad-stat" role="cell" aria-label={`Lương ${p.wage ?? 0}`}>{p.wage ?? 0}</span>
    <span className="squad-ovr squad-stat" role="cell">{ovr(card)}</span>
    <span className="squad-level squad-stat" role="cell"><img src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
    <span className={`squad-price squad-stat ${price(card) === null ? 'is-unpriced' : ''}`} role="cell">{priceText(card)}</span>
    <span className="squad-stat" role="cell"/>
    <span className="squad-hover" role="cell">
      <button onClick={act.onDelete} disabled={locked} title={locked ? 'Thẻ đang khóa' : 'Xóa cầu thủ'} aria-label={`Xóa ${p.name}`}><Trash2 size={18}/></button>
      <button onClick={act.onSell} disabled={locked} title={locked ? 'Thẻ đang khóa' : 'Bán'} aria-label={`Bán ${p.name}`}><ShoppingCart size={18}/></button>
      <button onClick={act.onUpgrade} title="Nâng cấp" aria-label={`Nâng cấp ${p.name}`}><ArrowBigUp size={20}/></button>
      <button onClick={act.onLock} className={locked ? 'on' : ''} title={locked ? 'Mở khóa' : 'Khóa'} aria-label={`${locked ? 'Mở khóa' : 'Khóa'} ${p.name}`} aria-pressed={locked}>{locked ? <Lock size={18}/> : <LockOpen size={18}/>}</button>
      <button onClick={act.onDetail} title="Thông tin" aria-label={`Thông tin ${p.name}`}><Search size={18}/></button>
      <button className="squad-move" onClick={act.onMove} aria-label={inSquad ? `Chuyển ${p.name} ra khỏi đội hình` : `Chuyển ${p.name} vào đội hình`}>{inSquad ? <>Chuyển<ArrowRight size={18}/></> : <><ArrowLeft size={18}/>Chuyển</>}</button>
    </span>
  </div>;
}
// Quản lí CT: bên trái là đội hình riêng, bên phải là các cầu thủ đang sở hữu chưa vào đội.
export default function SquadManager({ save, onAdd, onRemove, onDetail, onDelete, onSell, onUpgrade, onLock, levelBadge, seasonShort }: Props) {
  const [confirm, setConfirm] = useState<Card | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'price', desc: true });
  const [query, setQuery] = useState('');
  const squad = squadCards(save);
  const summary = squadSummary(squad);
  const inSquad = new Set(squad.map(c => c.uid));
  const available = useMemo(() => {
    const q = fold(query.trim());
    return save.cards.filter(c => !inSquad.has(c.uid) && (!q || fold(getPlayer(c).name).includes(q)))
      .sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key) || ovr(b) - ovr(a) || b.level - a.level);
  }, [save.cards, save.squad, query, sort]);
  const lineup = [...squad].sort((a, b) => groupOrder[positionGroup(getPlayer(b).pos)] - groupOrder[positionGroup(getPlayer(a).pos)]);
  const header = (key: SortKey, label: string) => <button className={`squad-col ${sort.key === key ? 'on' : ''}`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}>{label}{sort.key === key && <ChevronDown size={12} className={sort.desc ? '' : 'up'}/>}</button>;
  const segments = [['fw', 'FW'], ['mf', 'MF'], ['df', 'DF'], ['gk', 'GK']] as const;
  const rowProps = (c: Card) => ({ levelBadge, seasonShort, locked: isLocked(save, c.uid), onDetail: () => onDetail(c), onDelete: () => setConfirm(c), onSell: () => onSell(c), onUpgrade: () => onUpgrade(c.uid), onLock: () => onLock(c.uid) });
  return <section className="workspace squad-workspace" aria-labelledby="squad-title">
    <div className="squad-panel squad-left">
      <header className="squad-head">
        <div><h1 id="squad-title">Đội hình chính</h1><p>Đội bóng riêng của bạn</p></div>
        <div className="squad-meter">
          <div className="squad-bar" aria-label={`FW ${summary.counts.fw}, MF ${summary.counts.mf}, DF ${summary.counts.df}, GK ${summary.counts.gk}`}>
            {segments.map(([key, label]) => <span key={key} className={`seg-${key}`} style={{ flexGrow: summary.counts[key] || 0 }}><i>{label}</i><b>{summary.counts[key]}</b></span>)}
            <span className="seg-empty" style={{ flexGrow: Math.max(0, SQUAD_LIMIT - summary.size) }}>MAX</span>
          </div>
          <strong>{summary.size}<small>/{SQUAD_LIMIT}</small></strong>
          <span className="squad-wage-total">Lương <strong className={summary.wage > SQUAD_WAGE_CAP ? 'over-cap' : summary.wage > SQUAD_WAGE_CAP * .95 ? 'near-cap' : ''}>{summary.wage}<small>/{SQUAD_WAGE_CAP}</small></strong></span>
        </div>
      </header>
      <div className="squad-list" role="table" aria-label="Cầu thủ trong đội hình">
        {lineup.length ? lineup.map(c => <Row key={c.uid} card={c} inSquad onMove={() => onRemove(c.uid)} {...rowProps(c)}/>)
          : <p className="squad-empty">Chưa có cầu thủ trong đội hình.<br/>Chọn Chuyển ở cầu thủ đang sở hữu để thêm vào đội hình.</p>}
      </div>
    </div>
    <div className="squad-panel squad-right">
      <header className="squad-head">
        <h2>Cầu thủ</h2>
        <label className="squad-search"><Search size={15}/><input aria-label="Tìm cầu thủ theo tên" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="squad-owned"><span>Cầu thủ của tôi</span><strong>{save.cards.length}</strong></div>
      </header>
      <div className="squad-columns" role="row">{header('position', 'Vị trí')}<span/>{header('name', 'Tên cầu thủ')}{header('wage', 'Lương')}{header('ovr', 'OVR')}{header('level', 'Thẻ')}{header('price', 'Giá')}<span/></div>
      <div className="squad-list" role="table" aria-label="Cầu thủ đang sở hữu">
        {available.length ? available.map(c => <Row key={c.uid} card={c} inSquad={false} onMove={() => onAdd(c.uid)} {...rowProps(c)}/>)
          : <p className="squad-empty">{query ? 'Không tìm thấy cầu thủ.' : 'Mọi cầu thủ đều đã ở trong đội hình.'}</p>}
      </div>
    </div>
    {confirm && <div className="squad-confirm" role="dialog" aria-modal="true" aria-labelledby="squad-confirm-title" onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
      <div className="squad-confirm-box">
        <h3 id="squad-confirm-title">Xóa cầu thủ?</h3>
        <p><b>{getPlayer(confirm).name} +{confirm.level}</b> sẽ bị xóa khỏi kho và không nhận lại xu. Không thể hoàn tác.</p>
        <div><button className="secondary-button" onClick={() => setConfirm(null)} autoFocus>Hủy</button><button className="squad-confirm-delete" onClick={() => { onDelete(confirm.uid); setConfirm(null); }}><Trash2 size={16}/>Xóa</button></div>
      </div>
    </div>}
  </section>;
}
