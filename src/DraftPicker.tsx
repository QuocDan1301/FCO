import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Pencil, Search, X } from 'lucide-react';
import { draftCandidates, draftSize, money, ovr, PACK_LEVELS, seasons } from './game';
import type { Pack, Player, Tier } from './game';
import { marketQuote } from './market';
import { NOT_CLUBS, positionGroup } from './squad';
import { asset } from './asset';
import './draft.css';

type Props = {
  pack: Pack;
  initial: number[];
  seasonShort: (tier: Tier) => string;
  onConfirm: (playerIds: number[]) => void;
  onLeave: () => void;
};
const RESULT_LIMIT = 200;
const POSITIONS = ['ST', 'CF', 'LW', 'RW', 'CAM', 'LM', 'RM', 'CM', 'CDM', 'LWB', 'RWB', 'LB', 'RB', 'CB', 'GK'];
const fold = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const Face = ({ player }: { player: Player }) => <span className="squad-face dr-face"><img src={player.cardFace || player.image || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></span>;
const Wage = ({ player }: { player: Player }) => <span className="squad-wage"><b>{player.wage ?? 0}</b></span>;
const priceOrder = (level: number) => (a: Player, b: Player) => (marketQuote({ playerId: b.id, level }).price ?? -1) - (marketQuote({ playerId: a.id, level }).price ?? -1) || ovr({ playerId: b.id, level }) - ovr({ playerId: a.id, level }) || a.id - b.id;

// Gói chỉ định trong hầm: lọc mọi cầu thủ hợp lệ của gói (mùa = ô "Giải", CLB = ô "Đội", vị trí, tên) và giữ đúng N người ở
// "Cầu thủ đã chọn" (sẵn N người giá cao nhất; nút Chuyển đưa qua / đưa lại). Bấm Chọn là chốt luôn: về màn hầm có ảnh gói,
// bảng DraftSummary và nút Mở một vật phẩm — mở gói nhận ngẫu nhiên 1 trong N người (openDraft).
export default function DraftPicker({ pack, initial, seasonShort, onConfirm, onLeave }: Props) {
  const candidates = draftCandidates(pack), size = draftSize(pack), level = (pack.levels ?? PACK_LEVELS)[1];
  const byId = useMemo(() => new Map(candidates.map(p => [p.id, p])), [candidates]);
  const [picked, setPicked] = useState<number[]>(() => initial.filter(id => byId.has(id)).slice(0, size));
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState<Tier | ''>('');
  const [club, setClub] = useState('');
  const [pos, setPos] = useState('');
  const [searched, setSearched] = useState(false);
  const [warning, setWarning] = useState('');

  const card = (p: Player) => ({ playerId: p.id, level });
  const priceText = (p: Player) => { const v = marketQuote(card(p)).price; return v === null ? '—' : money(v); };
  const byPrice = priceOrder(level);
  const chosen = picked.map(id => byId.get(id)!).sort(byPrice);
  const chosenSet = new Set(picked);
  const packSeasons = [...new Set(candidates.map(p => p.tier))];
  const clubs = useMemo(() => season ? [...new Set(candidates.filter(p => p.tier === season && p.club && !NOT_CLUBS.has(p.club)).map(p => p.club))].sort((a, b) => a.localeCompare(b, 'vi')) : [], [candidates, season]);
  const positions = POSITIONS.filter(p => candidates.some(c => c.pos === p));
  const filtering = searched || !!query.trim() || !!season || !!pos;
  const results = useMemo(() => {
    if (!filtering) return [];
    const q = fold(query.trim());
    return candidates.filter(p => (!q || fold(p.name).includes(q)) && (!season || p.tier === season) && (!club || p.club === club) && (!pos || p.pos === pos)).sort(byPrice);
  }, [candidates, filtering, query, season, club, pos]);

  const toggle = (id: number) => {
    if (chosenSet.has(id)) { setPicked(list => list.filter(x => x !== id)); setWarning(''); return; }
    if (picked.length >= size) { setWarning(`Đã đủ ${size} cầu thủ. Hãy chuyển một người ra khỏi danh sách bên phải rồi chọn lại.`); return; }
    setPicked(list => [...list, id]); setWarning('');
  };
  const full = picked.length === size;

  return <div className="draft" role="region" aria-label={`Chọn cầu thủ cho ${pack.name}`}>
    <section className="dr-panel dr-search">
      <form className="dr-searchbar" onSubmit={e => { e.preventDefault(); setSearched(true); }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nhập tên người chơi" aria-label="Tìm cầu thủ theo tên"/>
        <button type="submit" aria-label="Tìm cầu thủ"><Search size={22}/></button>
      </form>
      <div className="dr-filters">
        <select aria-label="Giải (mùa thẻ)" value={season} onChange={e => { setSeason(e.target.value as Tier | ''); setClub(''); }}><option value="">Giải</option>{packSeasons.map(t => <option key={t} value={t}>{seasons[t]}</option>)}</select>
        <select aria-label="Đội" value={club} disabled={!season} onChange={e => setClub(e.target.value)}><option value="">Đội</option>{clubs.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Vị trí" value={pos} onChange={e => setPos(e.target.value)}><option value="">Vị trí</option>{positions.map(p => <option key={p} value={p}>{p}</option>)}</select>
      </div>
      {filtering ? <>
        <div className="dr-cols dr-result-cols" role="row"><span>Vị trí</span><span/><span>Tên cầu thủ</span><span>Lương</span><span>OVR</span><span>Giá</span><span/></div>
        <div className="dr-rows" role="table" aria-label="Kết quả tìm cầu thủ">
          {results.slice(0, RESULT_LIMIT).map(p => { const on = chosenSet.has(p.id); return <div key={p.id} role="row" className={`dr-row dr-result-row ${on ? 'is-on' : ''}`} aria-label={`${p.pos} ${p.name}, OVR ${ovr(card(p))}${on ? ', đã chọn' : ''}`}>
            <span className={`dr-pos pos-${positionGroup(p.pos)}`}>{p.pos}</span><Face player={p}/>
            <span className="squad-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></span>
            <span className="dr-center"><Wage player={p}/></span><b className="dr-ovr">{ovr(card(p))}</b><span className="dr-price">{priceText(p)}</span>
            <span className="dr-mark" aria-hidden="true">{on && <Check size={16}/>}</span>
            {!on && <button className="dr-move" onClick={() => toggle(p.id)} aria-label={`Chuyển ${p.name} sang danh sách đã chọn`}>Chuyển<ArrowRight size={20} strokeWidth={3}/></button>}
          </div>; })}
          {!results.length && <p className="dr-empty">Không tìm thấy cầu thủ phù hợp.</p>}
          {results.length > RESULT_LIMIT && <p className="dr-empty">Hiện {RESULT_LIMIT} / {results.length} kết quả. Lọc thêm để thu hẹp.</p>}
        </div>
      </> : <div className="dr-placeholder"><span>Tìm cầu thủ</span><small>{candidates.length} cầu thủ phù hợp với gói · nhập tên, chọn mùa / đội / vị trí rồi bấm tìm</small></div>}
    </section>
    <aside className="dr-panel dr-chosen" aria-label="Cầu thủ đã chọn">
      <header className="dr-chosen-head"><h3>Cầu thủ đã chọn</h3><strong className={full ? '' : 'is-short'}>{picked.length}<small>/{size}</small></strong></header>
      <div className="dr-cols dr-chosen-cols" role="row"><span>Vị trí</span><span/><span>Tên cầu thủ</span><span>Lương</span><span>OVR</span></div>
      <div className="dr-rows" role="table">
        {chosen.map(p => <div key={p.id} role="row" className="dr-row dr-chosen-row" aria-label={`${p.pos} ${p.name}, OVR ${ovr(card(p))}`}>
          <span className={`dr-pos pos-${positionGroup(p.pos)}`}>{p.pos}</span><Face player={p}/>
          <span className="squad-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></span>
          <span className="dr-center"><Wage player={p}/></span><b className="dr-ovr">{ovr(card(p))}</b>
          <button className="dr-move" onClick={() => toggle(p.id)} aria-label={`Chuyển ${p.name} ra khỏi danh sách đã chọn`}><ArrowLeft size={20} strokeWidth={3}/>Chuyển</button>
        </div>)}
        {!chosen.length && <p className="dr-empty">Chưa chọn cầu thủ nào.</p>}
      </div>
    </aside>
    <footer className="dr-foot">
      <p className={warning ? 'is-warning' : ''} aria-live="polite">{warning || 'Nếu bạn muốn chọn một cầu thủ khác hãy bỏ chọn cầu thủ đã chọn và chọn lại.'}</p>
      <button className="dr-leave" onClick={onLeave}>Rời<X size={18} strokeWidth={2.6}/></button>
      <button className="dr-go" disabled={!full} onClick={() => onConfirm(picked)} title={!full ? `Cần chọn đủ ${size} cầu thủ` : undefined}>Chọn<ArrowRight size={20} strokeWidth={2.6}/></button>
    </footer>
  </div>;
}

// Màn hầm sau khi chốt danh sách: bảng bên phải liệt kê N cầu thủ sẽ mở (giá cao trước); ảnh gói và nút mở do màn hầm (App) vẽ.
export function DraftSummary({ pack, ids, seasonShort, onEdit }: { pack: Pack; ids: number[]; seasonShort: (tier: Tier) => string; onEdit: () => void }) {
  const level = (pack.levels ?? PACK_LEVELS)[1], byId = new Map(draftCandidates(pack).map(p => [p.id, p]));
  const card = (p: Player) => ({ playerId: p.id, level });
  const list = ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []).sort(priceOrder(level));
  const tiers = [...new Set(list.map(p => p.tier))].map(t => seasons[t]).join(', ');
  return <>
    <div className="dr-shade" aria-hidden="true"/>
    <aside className="dr-summary" aria-label={`Danh sách cầu thủ của ${pack.name}`}>
      <h3>{pack.name}</h3>
      <p>Bạn có thể chỉ định {list.length} cầu thủ mùa {tiers} (+{level})</p>
      <div className="dr-summary-head"><span>Tên cầu thủ</span><button className="dr-edit" onClick={onEdit}><Pencil size={13}/>Sửa danh sách</button><strong>{list.length} người</strong></div>
      <div className="dr-rows" role="table">
        {list.map(p => <div key={p.id} role="row" className="dr-row dr-sum-row" aria-label={`${p.pos} ${p.name}, OVR ${ovr(card(p))}`}>
          <span className={`dr-pos pos-${positionGroup(p.pos)}`}>{p.pos}</span><Face player={p}/>
          <span className="squad-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></span>
          <span className="dr-center"><Wage player={p}/></span><b className="dr-ovr">{ovr(card(p))}</b>
        </div>)}
      </div>
    </aside>
  </>;
}
