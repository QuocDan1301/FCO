import { useMemo, useRef, useState } from 'react';
import { usePageCapacity } from './ViewportPages';
import type { ReactNode } from 'react';
import { Layers, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, History, Info, Search, Sparkles } from 'lucide-react';
import { getPlayer, MAX_LEVEL, money, ovr, players, seasons } from './game';
import type { Card, Save } from './game';
import { MARKET_FEE_PERCENT, marketQuote, compareMarketPrices, formatMarketPrice, PRICE_AS_OF } from './market';
import type { MarketTrade } from './market';
import { asset } from './asset';
import { PositionBadge, SeasonBadge } from './badges';
import { positionGroup } from './squad';


type Props = {
  save: Save;
  free: boolean;
  onTrade: (trade: MarketTrade) => void;
  onHistory: () => void;
  onBulkSell: () => void;
  onOpenPacks: () => void;
  renderCard: (card: Card) => ReactNode;
  levelBadge: (level: number) => string;
};
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();


// Bộ so sánh tiếng Việt tạo một lần + tên đã chuẩn hoá theo cầu thủ: localeCompare('vi') tạo collator mỗi lần gọi nên sắp xếp 479 cầu thủ rất chậm.
const collator = new Intl.Collator('vi');
const normalizedNames = new Map<number, string>();
const normalizedName = (id: number, name: string) => { let value = normalizedNames.get(id); if (value === undefined) { value = normalize(name); normalizedNames.set(id, value); } return value; };
// Thứ tự tuyến khi sắp theo vị trí: tiền đạo → tiền vệ → hậu vệ → thủ môn.
const lineOrder = { fw: 0, mf: 1, df: 2, gk: 3 };
const marketCard = (playerId: number, level: number): Card => ({ uid: `market-${playerId}-${level}`, playerId, level, received: 0 });
const priceDate = PRICE_AS_OF.split('-').reverse().join('/');
// Các khoá sắp xếp giảm dần (mũi tên xuống ở tiêu đề cột).
const DESCENDING = new Set(['price-desc', 'ovr', 'level', 'wage-desc', 'name-desc', 'position-desc']);
// Thẻ có giá 0 trong bảng giá Excel là thẻ chưa được định giá thật: vẫn mua / bán được nhưng hiện mờ, kèm nhãn.
const isUnpriced = (quote: ReturnType<typeof marketQuote>) => quote.available && quote.price === 0;

// Tâm điểm thị trường: 3 thẻ +1 tự chọn từ dữ liệu (không trùng cầu thủ), tính một lần vì danh sách cầu thủ / bảng giá cố định.
type Spotlight = { label: string; hint: string; card: Card };
let spotlightCache: Spotlight[] | null = null;
function spotlights() {
  if (spotlightCache) return spotlightCache;
  const base = players.map(p => marketCard(p.id, 1)), used = new Set<number>();
  const take = (list: Card[]) => { const card = list.find(c => !used.has(c.playerId)); if (card) used.add(card.playerId); return card; };
  const picks: [string, string, Card | undefined][] = [
    ['OVR cao nhất', 'Chỉ số tổng cao nhất thị trường', take([...base].sort((a, b) => ovr(b) - ovr(a)))],
    ['Giá trị cao nhất', 'Thẻ đắt giá nhất ở cấp +1', take([...base].sort((a, b) => compareMarketPrices(a, b, true)))],
    ['Ngôi sao Việt Nam', 'Tuyển thủ Việt Nam OVR cao nhất', take(base.filter(c => getPlayer(c).nation === 'Việt Nam').sort((a, b) => ovr(b) - ovr(a)))],
  ];
  return spotlightCache = picks.filter((pick): pick is [string, string, Card] => !!pick[2]).map(([label, hint, card]) => ({ label, hint, card }));
}

export default function TransferMarket({ save, free, onTrade, onBulkSell, onHistory, onOpenPacks, renderCard, levelBadge }: Props) {
  const [mode, setMode] = useState<'buy' | 'sell' | 'spotlight'>('buy');
  const listRef = useRef<HTMLDivElement>(null);
  const { capacity: pageSize } = usePageCapacity(listRef, 10000, 48);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [season, setSeason] = useState('');
  const [buyLevel, setBuyLevel] = useState('1');
  const [sellLevel, setSellLevel] = useState('');
  // Mặc định giá cao → thấp: vừa mở TTCN là thấy các siêu sao đắt giá nhất.
  const [sort, setSort] = useState('price-desc');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  // Cấp chọn nhanh ở panel chi tiết (chỉ khi mua): xem giá / mua thẻ đang chọn ở cấp khác mà không đổi bộ lọc chung.
  const [panelLevel, setPanelLevel] = useState<number | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [unavailableOnly, setUnavailableOnly] = useState(false);
  const buying = mode !== 'sell';
  const filtered = useMemo(() => {
  const cards: Card[] = buying ? players.map(p => marketCard(p.id, Number(buyLevel))) : save.cards;
  const needle = normalize(query);
  return cards.filter(c => {
    const p = getPlayer(c);
    return normalizedName(p.id, p.name).includes(needle) && (!position || p.pos === position) && (!season || p.tier === season) && (buying || !sellLevel || c.level === Number(sellLevel)) && (!unavailableOnly || !marketQuote(c).available);
  }).sort((a, b) => {
    const pa = getPlayer(a), pb = getPlayer(b);
    const byName = collator.compare(pa.name, pb.name);
    switch (sort) {
      case 'price': return compareMarketPrices(a, b) || byName;
      case 'price-desc': return compareMarketPrices(a, b, true) || byName;
      case 'ovr': return ovr(b) - ovr(a) || byName;
      case 'ovr-asc': return ovr(a) - ovr(b) || byName;
      case 'name': return byName;
      case 'name-desc': return -byName;
      case 'position': return lineOrder[positionGroup(pa.pos)] - lineOrder[positionGroup(pb.pos)] || pa.pos.localeCompare(pb.pos) || ovr(b) - ovr(a) || byName;
      case 'position-desc': return lineOrder[positionGroup(pb.pos)] - lineOrder[positionGroup(pa.pos)] || pb.pos.localeCompare(pa.pos) || ovr(b) - ovr(a) || byName;
      case 'wage-desc': return (pb.wage ?? 0) - (pa.wage ?? 0) || ovr(b) - ovr(a) || byName;
      case 'wage': return (pa.wage ?? 0) - (pb.wage ?? 0) || ovr(b) - ovr(a) || byName;
      case 'level': return b.level - a.level || ovr(b) - ovr(a) || byName;
      case 'level-asc': return a.level - b.level || ovr(b) - ovr(a) || byName;
      default: return 0;
    }
  });
  }, [buying, buyLevel, save.cards, query, position, season, sellLevel, unavailableOnly, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find(c => c.uid === selectedId) || visible[0];
  const panelCard = selected && buying && panelLevel && panelLevel !== selected.level ? marketCard(selected.playerId, panelLevel) : selected;
  const quote = panelCard && marketQuote(panelCard);
  const reset = () => { setQuery(''); setPosition(''); setSeason(''); setSellLevel(''); setBuyLevel('1'); setSort('price-desc'); setUnavailableOnly(false); setPage(0); setPanelLevel(null); };
  const switchMode = (next: typeof mode) => { setMode(next); setPage(0); setPanelLevel(null); };
  const select = (card: Card) => { setSelectedId(card.uid); setPanelLevel(null); };
  // Từ tâm điểm sang danh sách mua, lọc đúng cầu thủ đó ở +1.
  const viewInList = (card: Card) => { reset(); setMode('buy'); setQuery(getPlayer(card).name); setSelectedId(card.uid); };
  const canBuy = (card: Card, cardQuote = marketQuote(card)) => cardQuote.available && (free || save.balance >= cardQuote.price);
  // Tiêu đề cột bấm để sắp xếp (kiểu bảng Quản lí CT): bấm lần đầu theo khoá thứ nhất, bấm lại đảo chiều.
  const column = ([first, second]: [string, string], label: string, align = '') => { const on = sort === first || sort === second, desc = DESCENDING.has(sort);
    return <button className={`market-col ${align} ${on ? 'on' : ''}`} aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'} onClick={() => { setSort(sort === first ? second : first); setPage(0); }}>{label}{on && <ChevronDown size={12} className={desc ? '' : 'up'}/>}</button>; };

  return <section className="workspace market-workspace" aria-labelledby="market-title">
    <div className="page-heading market-heading">
      <div><h1 id="market-title">Thị trường chuyển nhượng</h1><p>Tìm mảnh ghép tiếp theo cho bộ sưu tập của bạn.</p></div>
      <div className="market-head-actions">
        <div className="market-balance" aria-label={`Số dư khả dụng ${free ? 'vô hạn' : money(save.balance)} BP`}><span>Số dư khả dụng</span><b>{free ? '∞' : money(save.balance)}<small>BP</small></b></div>
        <button className="market-rules" aria-describedby="market-rules-tip"><Info size={15}/><span>Quy tắc giá{free ? ' & Chế độ thử' : ''}</span>
          <span className="market-rules-tip" id="market-rules-tip" role="tooltip">Giá +1 từ Excel ngày {priceDate} · +2–+13 theo mô hình nâng cấp · Phí bán {MARKET_FEE_PERCENT}%.{free && <><br/>Chế độ thử đang bật: mua và bán thẻ không thay đổi số dư.</>}</span>
        </button>
        <button className="text-action" onClick={onBulkSell}><Layers size={16}/>Bán hàng loạt</button><button className="text-action" onClick={onHistory}><History size={16}/>Lịch sử giao dịch<ArrowRight size={15}/></button>
      </div>
    </div>
    <div className="market-tabs" role="group" aria-label="Loại giao dịch"><button aria-pressed={mode === 'buy'} onClick={() => switchMode('buy')}>Mua cầu thủ<span>{players.length}</span></button><button aria-pressed={mode === 'sell'} onClick={() => switchMode('sell')}>Bán cầu thủ<span>{save.cards.length}</span></button><button className="market-tab-spotlight" aria-pressed={mode === 'spotlight'} onClick={() => switchMode('spotlight')}><Sparkles size={14}/>Tâm điểm</button></div>
    {mode === 'spotlight' ? <div className="market-spotlight">{spotlights().map((spot, i) => {
      const player = getPlayer(spot.card), spotQuote = marketQuote(spot.card);
      return <article className={`spotlight-item spotlight-${i}`} key={spot.label}>
        <header><span className="spotlight-rank">{i + 1}</span><div><h3>{spot.label}</h3><small>{spot.hint}</small></div></header>
        <div className="spotlight-card">{renderCard(spot.card)}</div>
        <div className="spotlight-info"><b>{player.name}</b><span className="market-badges"><PositionBadge pos={player.pos}/><SeasonBadge tier={player.tier}/><img className="market-level-img" src={levelBadge(1)} alt="+1"/><span className="spotlight-ovr">OVR <b>{ovr(spot.card)}</b></span></span></div>
        <div className={`spotlight-price${isUnpriced(spotQuote) ? ' is-unpriced' : ''}`}><span>Giá +1{isUnpriced(spotQuote) && <small>Chưa định giá</small>}</span><b>{formatMarketPrice(spotQuote.price)}</b></div>
        <div className="spotlight-actions"><button className="secondary-button" onClick={() => viewInList(spot.card)}>Xem chi tiết</button><button className="market-primary" disabled={!canBuy(spot.card, spotQuote)} onClick={() => onTrade({ kind: 'buy', card: spot.card })}>Mua<ArrowRight size={15}/></button></div>
      </article>;
    })}</div> : <>
    <div className={`market-filters ${filtersExpanded ? 'filters-open' : ''}`}>
      <div className="search-field"><Search size={17}/><input aria-label="Tìm cầu thủ trên thị trường" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/></div>
      <button className="market-filter-toggle" aria-expanded={filtersExpanded} aria-controls="market-filter-fields" onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? 'Ẩn bộ lọc' : 'Bộ lọc'}<span>{[position, season, !buying && sellLevel, buying && buyLevel !== '1' ? buyLevel : ''].filter(Boolean).length || ''}</span></button>
      <div className="market-filter-fields" id="market-filter-fields"><label>Vị trí<select aria-label="Vị trí trên thị trường" value={position} onChange={e => { setPosition(e.target.value); setPage(0); }}><option value="">Mọi vị trí</option>{[...new Set(players.map(p => p.pos))].sort().map(pos => <option key={pos}>{pos}</option>)}</select></label>
      <label>Mùa thẻ<select aria-label="Mùa thẻ trên thị trường" value={season} onChange={e => { setSeason(e.target.value); setPage(0); }}><option value="">Mọi mùa thẻ</option>{Object.entries(seasons).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{buying ? 'Cấp thẻ muốn mua' : 'Cấp thẻ'}<select aria-label="Cấp thẻ trên thị trường" value={buying ? buyLevel : sellLevel} onChange={e => { buying ? setBuyLevel(e.target.value) : setSellLevel(e.target.value); setPage(0); setPanelLevel(null); }}>{!buying && <option value="">Mọi cấp thẻ</option>}{Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label>
      <label>Sắp xếp theo<select aria-label="Sắp xếp thị trường" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="price-desc">Giá: cao → thấp</option><option value="price">Giá: thấp → cao</option><option value="ovr">OVR: cao → thấp</option><option value="ovr-asc">OVR: thấp → cao</option><option value="name">Tên: A → Z</option><option value="name-desc">Tên: Z → A</option><option value="position">Vị trí: tiền đạo → thủ môn</option><option value="position-desc">Vị trí: thủ môn → tiền đạo</option><option value="wage-desc">Lương: cao → thấp</option><option value="wage">Lương: thấp → cao</option><option value="level">Cấp thẻ: cao → thấp</option><option value="level-asc">Cấp thẻ: thấp → cao</option></select></label></div>
    </div>
    <div className="market-count"><label className="market-unavailable-filter"><input type="checkbox" checked={unavailableOnly} onChange={event => { setUnavailableOnly(event.target.checked); setPage(0); }}/>Chỉ thẻ chưa có giá</label><span role="status">{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} / ${filtered.length} thẻ` : '0 thẻ phù hợp'}</span><button className="text-action" onClick={reset}>Đặt lại bộ lọc</button></div>
    {visible.length ? <div className="market-layout"><div className="market-list-panel">
      <div className="market-columns">{column(['position', 'position-desc'], 'Vị trí')}<span/>{column(['name', 'name-desc'], 'Tên cầu thủ')}{column(['wage-desc', 'wage'], 'Lương', 'is-center')}{column(['ovr', 'ovr-asc'], 'OVR', 'is-center')}{column(['level', 'level-asc'], 'Thẻ', 'is-center')}{column(['price-desc', 'price'], buying ? 'Giá' : 'Nhận sau phí', 'is-end')}<span/></div>
      <div ref={listRef} className="market-list">{visible.map(card => {
        const player = getPlayer(card), rowQuote = marketQuote(card), unpriced = isUnpriced(rowQuote), shown = buying ? rowQuote.price : rowQuote.proceeds;
        const canAfford = rowQuote.available && (!buying || free || save.balance >= rowQuote.price);
        const note = !rowQuote.available ? 'Chưa có giá' : unpriced ? 'Chưa định giá' : !canAfford ? 'Chưa đủ số dư' : '';
        // Hàng kiểu bảng Quản lí CT: vị trí (vạch màu tuyến) · ảnh thẻ · mùa + tên · lương · OVR · cấp thẻ · giá · thao tác; bấm hàng để xem chi tiết.
        return <article className={`market-row ${selected.uid === card.uid ? 'is-selected' : ''}`} key={card.uid} onClick={() => select(card)}>
          <span className={`squad-pos pos-${positionGroup(player.pos)}`}>{player.pos}</span>
          <span className="market-face"><img src={player.cardFace || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></span>
          <button className="market-player" aria-label={`Xem ${player.name} +${card.level}`} aria-pressed={selected.uid === card.uid} onClick={event => { event.stopPropagation(); select(card); }}><SeasonBadge tier={player.tier}/><b>{player.name}</b></button>
          <span className="squad-wage" aria-label={`Lương ${player.wage ?? 0}`}>{player.wage ?? 0}</span>
          <strong className="market-ovr">{ovr(card)}</strong>
          <span className="market-level"><img src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
          <div className={`market-price${unpriced || !rowQuote.available ? ' is-unpriced' : ''}`} title={rowQuote.reason || [formatMarketPrice(shown), rowQuote.liquidityNote, `Bảng giá ngày ${priceDate}`].filter(Boolean).join(' · ')}><b>{shown === null ? '—' : money(shown)}</b>{note && <small>{note}</small>}</div>
          <button className="market-row-action" disabled={!canAfford} aria-label={`${buying ? 'Mua' : 'Bán'} ${player.name} +${card.level}`} onClick={event => { event.stopPropagation(); onTrade({ kind: buying ? 'buy' : 'sell', card }); }}>{buying ? 'Mua' : 'Bán'}<ArrowRight size={14}/></button>
        </article>;
      })}</div>
      <div className="market-pagination"><button aria-label="Trang thị trường trước" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/>Trước</button><span>Trang {currentPage + 1} / {pageCount}</span><button aria-label="Trang thị trường sau" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Sau<ChevronRight size={16}/></button></div>
    </div><aside className="market-preview" aria-label="Cầu thủ đang xem"><div className="market-preview-card">{renderCard(panelCard)}</div><h2>{getPlayer(panelCard).name}</h2>
      <div className="market-preview-badges"><PositionBadge pos={getPlayer(panelCard).pos}/><SeasonBadge tier={getPlayer(panelCard).tier}/><span className="market-preview-ovr">OVR <b>{ovr(panelCard)}</b></span><img className="market-level-img" src={levelBadge(panelCard.level)} alt={`+${panelCard.level}`}/></div>
      {buying && <div className="market-grades" role="group" aria-label="Chọn nhanh cấp thẻ muốn mua">{Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(level => <button key={level} aria-pressed={panelCard.level === level} aria-label={`Xem giá +${level}`} onClick={() => setPanelLevel(level)}><img className="market-level-img" src={levelBadge(level)} alt=""/></button>)}</div>}
      <dl><div><dt>Giá thẻ</dt><dd className={isUnpriced(quote) ? 'is-unpriced' : undefined}>{formatMarketPrice(quote.price)}{isUnpriced(quote) && <small> · Chưa định giá</small>}</dd></div>{!buying && <div><dt>Phí bán {MARKET_FEE_PERCENT}%</dt><dd>−{formatMarketPrice(quote.fee)}</dd></div>}<div className="market-total"><dt>{buying ? 'Thanh toán' : 'Bạn nhận'}</dt><dd>{formatMarketPrice(buying ? quote.price : quote.proceeds)}</dd></div></dl>
      <button className="market-primary" disabled={!quote.available || (buying && !free && save.balance < (quote.price ?? Infinity))} onClick={() => onTrade({ kind: buying ? 'buy' : 'sell', card: panelCard })}>{buying ? 'Mua cầu thủ' : 'Bán cầu thủ'}<ArrowRight size={16}/></button>
      <small>{!quote.available ? quote.reason : [quote.liquidityNote, panelCard.level === 1 ? `Giá gốc từ Excel ngày ${priceDate}.` : 'Giá mô phỏng từ giá +1 và hệ số nâng cấp.', quote.insuranceFee === null ? '' : `Bảo hiểm lên +${panelCard.level + 1}: ${formatMarketPrice(quote.insuranceFee)} (${Math.round(quote.insuranceRate * 100)}% giá thẻ).`].filter(Boolean).join(' ')}</small></aside></div> : <div className="empty-state market-empty"><Search size={32}/><h2>{!buying && !save.cards.length ? 'Kho cầu thủ đang trống' : 'Không tìm thấy cầu thủ'}</h2><p>{!buying && !save.cards.length ? 'Mở gói hoặc mua cầu thủ để bổ sung vào kho.' : 'Thử đổi tên, vị trí, mùa thẻ hoặc cấp thẻ.'}</p><button className="secondary-button" onClick={!buying && !save.cards.length ? onOpenPacks : reset}>{!buying && !save.cards.length ? 'Mở gói cầu thủ' : 'Đặt lại bộ lọc'}</button></div>}
    </>}
  </section>;
}
