import { useRef, useState } from 'react';
import { usePageCapacity } from './ViewportPages';
import type { ReactNode } from 'react';
import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight, History, Search } from 'lucide-react';
import { getPlayer, MAX_LEVEL, money, ovr, players, seasons } from './game';
import type { Card, Save } from './game';
import { MARKET_FEE_PERCENT, marketQuote, compareMarketPrices, formatMarketPrice, PRICE_AS_OF } from './market';
import type { MarketTrade } from './market';
import { asset } from './asset';


type Props = {
  save: Save;
  free: boolean;
  onTrade: (trade: MarketTrade) => void;
  onHistory: () => void;
  onOpenPacks: () => void;
  renderCard: (card: Card) => ReactNode;
};
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();


export default function TransferMarket({ save, free, onTrade, onHistory, onOpenPacks, renderCard }: Props) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const listRef = useRef<HTMLDivElement>(null);
  const { capacity: pageSize } = usePageCapacity(listRef, 10000, 76);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [season, setSeason] = useState('');
  const [buyLevel, setBuyLevel] = useState('1');
  const [sellLevel, setSellLevel] = useState('');
  const [sort, setSort] = useState('price');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [unavailableOnly, setUnavailableOnly] = useState(false);
  const buying = mode === 'buy';
  const cards: Card[] = buying ? players.map(p => ({ uid: `market-${p.id}-${buyLevel}`, playerId: p.id, level: Number(buyLevel), received: 0 })) : save.cards;
  const filtered = cards.filter(c => {
    const p = getPlayer(c);
    return normalize(p.name).includes(normalize(query)) && (!position || p.pos === position) && (!season || p.tier === season) && (buying || !sellLevel || c.level === Number(sellLevel)) && (!unavailableOnly || !marketQuote(c).available);
  }).sort((a, b) => {
    const pa = getPlayer(a), pb = getPlayer(b);
    const byName = pa.name.localeCompare(pb.name, 'vi');
    switch (sort) {
      case 'price': return compareMarketPrices(a, b) || byName;
      case 'price-desc': return compareMarketPrices(a, b, true) || byName;
      case 'ovr': return ovr(b) - ovr(a) || byName;
      case 'ovr-asc': return ovr(a) - ovr(b) || byName;
      case 'name': return byName;
      case 'name-desc': return -byName;
      case 'position': return pa.pos.localeCompare(pb.pos) || ovr(b) - ovr(a) || byName;
      case 'level': return b.level - a.level || ovr(b) - ovr(a) || byName;
      case 'level-asc': return a.level - b.level || ovr(b) - ovr(a) || byName;
      default: return 0;
    }
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find(c => c.uid === selectedId) || visible[0];
  const quote = selected && marketQuote(selected);
  const reset = () => { setQuery(''); setPosition(''); setSeason(''); setSellLevel(''); setBuyLevel('1'); setSort('price'); setUnavailableOnly(false); setPage(0); };

  return <section className="workspace market-workspace" aria-labelledby="market-title">
    <div className="page-heading market-heading"><div><h1 id="market-title">Thị trường chuyển nhượng</h1><p>Tìm mảnh ghép tiếp theo cho bộ sưu tập của bạn.</p></div><button className="text-action" onClick={onHistory}><History size={16}/>Lịch sử giao dịch<ArrowRight size={15}/></button></div>
    <div className="market-summary"><p><ArrowLeftRight size={17}/><span className="market-summary-long">Giá BP theo bảng giá cập nhật ngày {PRICE_AS_OF.split('-').reverse().join('/')} · Mua bán mô phỏng; phí bán {MARKET_FEE_PERCENT}%.</span><span className="market-summary-short">Bảng giá · {PRICE_AS_OF.split('-').reverse().join('/')} · Phí bán {MARKET_FEE_PERCENT}%.</span></p><div><span>Số dư khả dụng</span><strong>{free ? '∞' : money(save.balance)} <small>BP</small></strong></div></div>
    {free && <p className="market-test-note">Chế độ thử đang bật: mua và bán thẻ không thay đổi số dư.</p>}
    <div className="market-tabs" role="group" aria-label="Loại giao dịch"><button aria-pressed={buying} onClick={() => { setMode('buy'); setPage(0); }}>Mua cầu thủ<span>{players.length}</span></button><button aria-pressed={!buying} onClick={() => { setMode('sell'); setPage(0); }}>Bán cầu thủ<span>{save.cards.length}</span></button></div>
    <div className={`market-filters ${filtersExpanded ? 'filters-open' : ''}`}>
      <div className="search-field"><Search size={17}/><input aria-label="Tìm cầu thủ trên thị trường" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/></div>
      <button className="market-filter-toggle" aria-expanded={filtersExpanded} aria-controls="market-filter-fields" onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? 'Ẩn bộ lọc' : 'Bộ lọc'}<span>{[position, season, !buying && sellLevel, buying && buyLevel !== '1' ? buyLevel : ''].filter(Boolean).length || ''}</span></button>
      <div className="market-filter-fields" id="market-filter-fields"><label>Vị trí<select aria-label="Vị trí trên thị trường" value={position} onChange={e => { setPosition(e.target.value); setPage(0); }}><option value="">Mọi vị trí</option>{[...new Set(players.map(p => p.pos))].sort().map(pos => <option key={pos}>{pos}</option>)}</select></label>
      <label>Mùa thẻ<select aria-label="Mùa thẻ trên thị trường" value={season} onChange={e => { setSeason(e.target.value); setPage(0); }}><option value="">Mọi mùa thẻ</option>{Object.entries(seasons).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{buying ? 'Cấp thẻ muốn mua' : 'Cấp thẻ'}<select aria-label="Cấp thẻ trên thị trường" value={buying ? buyLevel : sellLevel} onChange={e => { buying ? setBuyLevel(e.target.value) : setSellLevel(e.target.value); setPage(0); }}>{!buying && <option value="">Mọi cấp thẻ</option>}{Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label>
      <label>Sắp xếp theo<select aria-label="Sắp xếp thị trường" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="price">Giá: thấp → cao</option><option value="price-desc">Giá: cao → thấp</option><option value="ovr">OVR: cao → thấp</option><option value="ovr-asc">OVR: thấp → cao</option><option value="name">Tên: A → Z</option><option value="name-desc">Tên: Z → A</option><option value="position">Vị trí: A → Z</option><option value="level">Cấp thẻ: cao → thấp</option><option value="level-asc">Cấp thẻ: thấp → cao</option></select></label></div>
    </div>
    <div className="market-count"><label className="market-unavailable-filter"><input type="checkbox" checked={unavailableOnly} onChange={event => { setUnavailableOnly(event.target.checked); setPage(0); }}/>Chỉ thẻ chưa có giá</label><span role="status">{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} / ${filtered.length} thẻ` : '0 thẻ phù hợp'}</span><button className="text-action" onClick={reset}>Đặt lại bộ lọc</button></div>
    {visible.length ? <div className="market-layout"><div className="market-list-panel">
      <div className="market-table-heading" aria-hidden="true"><span>Cầu thủ</span><span>OVR</span><span>{buying ? 'Giá mua' : 'Nhận sau phí'}</span><span/></div>
      <div ref={listRef} className="market-list">{visible.map(card => {
        const player = getPlayer(card), rowQuote = marketQuote(card);
        const canAfford = rowQuote.available && (!buying || free || save.balance >= rowQuote.price);
        return <article className={`market-row ${selected.uid === card.uid ? 'is-selected' : ''}`} key={card.uid}>
          <button className="market-player" aria-label={`Xem ${player.name} +${card.level}`} aria-pressed={selected.uid === card.uid} onClick={() => setSelectedId(card.uid)}><img src={player.cardFace || asset('/assets/silhouette.svg')} alt="" loading="lazy"/><span><b>{player.name}</b><small>{player.pos} · {seasons[player.tier]} · +{card.level}</small></span></button>
          <strong className="market-ovr">{ovr(card)}</strong><div className="market-price" title={rowQuote.reason || `Bảng giá ngày ${PRICE_AS_OF.split('-').reverse().join('/')}`}><b>{formatMarketPrice(buying ? rowQuote.price : rowQuote.proceeds)}</b><small>{rowQuote.available ? (!canAfford ? 'Chưa đủ số dư' : 'Giá theo bảng giá') : 'Chưa cập nhật được mức thẻ này'}</small></div>
          <button className="market-row-action" disabled={!canAfford} aria-label={`${buying ? 'Mua' : 'Bán'} ${player.name} +${card.level}`} onClick={() => onTrade({ kind: mode, card })}>{buying ? 'Mua' : 'Bán'}<ArrowRight size={14}/></button>
        </article>;
      })}</div>
      <div className="market-pagination"><button aria-label="Trang thị trường trước" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/>Trước</button><span>Trang {currentPage + 1} / {pageCount}</span><button aria-label="Trang thị trường sau" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Sau<ChevronRight size={16}/></button></div>
    </div><aside className="market-preview" aria-label="Cầu thủ đang xem"><div className="market-preview-card">{renderCard(selected)}</div><h2>{getPlayer(selected).name}</h2><p>{getPlayer(selected).pos} · OVR {ovr(selected)} · +{selected.level}</p><dl><div><dt>Giá thẻ</dt><dd>{formatMarketPrice(quote.price)}</dd></div>{!buying && <div><dt>Phí bán {MARKET_FEE_PERCENT}%</dt><dd>−{formatMarketPrice(quote.fee)}</dd></div>}<div className="market-total"><dt>{buying ? 'Thanh toán' : 'Bạn nhận'}</dt><dd>{formatMarketPrice(buying ? quote.price : quote.proceeds)}</dd></div></dl><button className="market-primary" disabled={!quote.available || (buying && !free && save.balance < (quote.price ?? Infinity))} onClick={() => onTrade({ kind: mode, card: selected })}>{buying ? 'Mua cầu thủ' : 'Bán cầu thủ'}<ArrowRight size={16}/></button><small>{!quote.available ? quote.reason : `Giá giao dịch ghi nhận trong 30 ngày, dữ liệu ${PRICE_AS_OF.split('-').reverse().join('/')}.`}</small></aside></div> : <div className="empty-state market-empty"><Search size={32}/><h2>{!buying && !save.cards.length ? 'Kho cầu thủ đang trống' : 'Không tìm thấy cầu thủ'}</h2><p>{!buying && !save.cards.length ? 'Mở gói hoặc mua cầu thủ để bổ sung vào kho.' : 'Thử đổi tên, vị trí, mùa thẻ hoặc cấp thẻ.'}</p><button className="secondary-button" onClick={!buying && !save.cards.length ? onOpenPacks : reset}>{!buying && !save.cards.length ? 'Mở gói cầu thủ' : 'Đặt lại bộ lọc'}</button></div>}
  </section>;
}
