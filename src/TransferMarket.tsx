import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, UIEvent } from 'react';
import { ArrowRight, ChevronDown, History, Search, Sparkles, Eye } from 'lucide-react';
import { getPlayer, MAX_LEVEL, money, ovr, players, seasons } from './game';
import type { Card, Save } from './game';
import { marketQuote, compareMarketPrices, formatMarketPrice, nextPriceChange, saleTaxPercent, isTradeLocked, TRADE_LOCKED } from './market';
import { usePricePeriod } from './use-price-period';
import type { MarketTrade } from './market';
import { asset } from './asset';
import { PositionBadge, SeasonBadge } from './badges';
import { positionGroup } from './squad';


type Props = {
  save: Save;
  free: boolean;
  onTrade: (trade: MarketTrade) => void;
  onHistory: () => void;
  onOpenPacks: () => void;
  renderCard: (card: Card) => ReactNode;
  levelBadge: (level: number) => string;
  // Mở Thông tin cầu thủ (giá, sự nghiệp CLB, chỉ số) của thẻ đang xem.
  onDetail?: (card: Card) => void;
  loadTopViewed?: () => Promise<{ id: number; views: number }[]>;
};
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();


// Bộ so sánh tiếng Việt tạo một lần + tên đã chuẩn hoá theo cầu thủ: localeCompare('vi') tạo collator mỗi lần gọi nên sắp xếp 479 cầu thủ rất chậm.
const collator = new Intl.Collator('vi');
const normalizedNames = new Map<number, string>();
const normalizedName = (id: number, name: string) => { let value = normalizedNames.get(id); if (value === undefined) { value = normalize(name); normalizedNames.set(id, value); } return value; };
// Thứ tự tuyến khi sắp theo vị trí: tiền đạo → tiền vệ → hậu vệ → thủ môn.
const lineOrder = { fw: 0, mf: 1, df: 2, gk: 3 };
// Danh sách cuộn: dựng dần từng đợt khi cuộn gần cuối, vì dựng cả gần 4.000 dòng một lúc sẽ rất chậm.
const LIST_BATCH = 40, LOAD_MARGIN = 300;
const marketCard = (playerId: number, level: number): Card => ({ uid: `market-${playerId}-${level}`, playerId, level, received: 0 });
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
  ];
  return spotlightCache = picks.filter((pick): pick is [string, string, Card] => !!pick[2]).map(([label, hint, card]) => ({ label, hint, card }));
}

// Ô 3 Tâm điểm: thẻ được mở Thông tin nhiều nhất 7 ngày (máy chủ đếm, fco_top_viewed).
// Lưu 10 phút trong bộ nhớ để mở TTCN nhiều lần không hỏi lại máy chủ.
// rows giữ cả số lượt xem để hiện trên ô Tâm điểm (người dùng 2026-11-14).
let viewedCache: { at: number; rows: { id: number; views: number }[] } | null = null;
const VIEWED_TTL = 10 * 60_000, EMPTY_TTL = 30_000; // chưa có dữ liệu thì chỉ nhớ 30 giây
/** Vừa gửi lượt xem lên máy chủ: lần mở TTCN sau hỏi lại. */
export const forgetTopViewed = () => { viewedCache = null; if (typeof window !== 'undefined') window.dispatchEvent(new Event('fco-views-sent')); };

export default function TransferMarket({ save, free, onTrade, onHistory, onOpenPacks, renderCard, levelBadge, onDetail, loadTopViewed }: Props) {
  // Vừa vào TTCN là thấy Tâm điểm.
  const [mode, setMode] = useState<'buy' | 'sell' | 'spotlight'>('spotlight');
  const [viewedRows, setViewedRows] = useState<{ id: number; views: number }[]>(() => viewedCache?.rows ?? []);
  // Hỏi lại khi mở trang / mở tab Tâm điểm, và ngay sau khi game vừa gửi lượt xem lên máy chủ (đang đứng ở TTCN vẫn cập nhật).
  const [viewsTick, setViewsTick] = useState(0);
  useEffect(() => {
    const bump = () => setViewsTick(t => t + 1);
    window.addEventListener('fco-views-sent', bump);
    return () => window.removeEventListener('fco-views-sent', bump);
  }, []);
  useEffect(() => {
    if (!loadTopViewed || (viewedCache && Date.now() - viewedCache.at < (viewedCache.rows.length ? VIEWED_TTL : EMPTY_TTL))) return;
    let alive = true;
    loadTopViewed().then(rows => { viewedCache = { at: Date.now(), rows }; if (alive) setViewedRows(rows); }).catch(() => { /* để trống, thử lại lần sau */ });
    return () => { alive = false; };
  }, [loadTopViewed, viewsTick, mode]);
  const spots = (() => {
    // Đúng thẻ nhiều lượt xem nhất (kể cả trùng ô 1–2 hay mùa khóa giao dịch — nút Mua tự khóa); chỉ bỏ id không còn trong game.
    const base = spotlights();
    const top = viewedRows.find(row => players.some(p => p.id === row.id));
    return top ? [...base, { label: 'Được xem nhiều nhất', hint: 'Thẻ HLV mở xem nhiều nhất 7 ngày qua', card: marketCard(top.id, 1), views: top.views }] : base;
  })();
  const viewedPending = spots.length < 3;
  const listRef = useRef<HTMLDivElement>(null);
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
  const period = usePricePeriod();
  const nextChange = new Date(nextPriceChange()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const filtered = useMemo(() => {
  const cards: Card[] = buying ? players.map(p => marketCard(p.id, Number(buyLevel))) : save.cards;
  const needle = normalize(query);
  return cards.filter(c => {
    const p = getPlayer(c);
    return normalizedName(p.id, p.name).includes(needle) && (!position || p.pos === position) && (!season || p.tier === season) && (buying || !sellLevel || c.level === Number(sellLevel)) && (!unavailableOnly || !marketQuote(c).available);
  }).sort((a, b) => {
    const pa = getPlayer(a), pb = getPlayer(b);
    const byName = () => collator.compare(pa.name, pb.name);
    switch (sort) {
      case 'price': return compareMarketPrices(a, b) || byName();
      case 'price-desc': return compareMarketPrices(a, b, true) || byName();
      case 'ovr': return ovr(b) - ovr(a) || byName();
      case 'ovr-asc': return ovr(a) - ovr(b) || byName();
      case 'name': return byName();
      case 'name-desc': return -byName();
      case 'position': return lineOrder[positionGroup(pa.pos)] - lineOrder[positionGroup(pb.pos)] || pa.pos.localeCompare(pb.pos) || ovr(b) - ovr(a) || byName();
      case 'position-desc': return lineOrder[positionGroup(pb.pos)] - lineOrder[positionGroup(pa.pos)] || pb.pos.localeCompare(pa.pos) || ovr(b) - ovr(a) || byName();
      case 'wage-desc': return (pb.wage ?? 0) - (pa.wage ?? 0) || ovr(b) - ovr(a) || byName();
      case 'wage': return (pa.wage ?? 0) - (pb.wage ?? 0) || ovr(b) - ovr(a) || byName();
      case 'level': return b.level - a.level || ovr(b) - ovr(a) || byName();
      case 'level-asc': return a.level - b.level || ovr(b) - ovr(a) || byName();
      default: return 0;
    }
  });
  }, [buying, buyLevel, save.cards, query, position, season, sellLevel, unavailableOnly, sort, period]);
  const visible = filtered.slice(0, (page + 1) * LIST_BATCH);
  const loadMore = (event: UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (visible.length < filtered.length && list.scrollHeight - list.scrollTop - list.clientHeight < LOAD_MARGIN) setPage(current => current + 1);
  };
  // Đổi bộ lọc, cách sắp xếp hay tab thì danh sách mới bắt đầu lại từ đầu.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [mode, query, position, season, buyLevel, sellLevel, unavailableOnly, sort]);
  const selected = visible.find(c => c.uid === selectedId) || visible[0];
  const panelCard = selected && buying && panelLevel && panelLevel !== selected.level ? marketCard(selected.playerId, panelLevel) : selected;
  const taxPercent = saleTaxPercent(save);
  const quote = panelCard && marketQuote(panelCard, taxPercent);
  const reset = () => { setQuery(''); setPosition(''); setSeason(''); setSellLevel(''); setBuyLevel('1'); setSort('price-desc'); setUnavailableOnly(false); setPage(0); setPanelLevel(null); };
  const switchMode = (next: typeof mode) => { setMode(next); setPage(0); setPanelLevel(null); };
  const select = (card: Card) => { setSelectedId(card.uid); setPanelLevel(null); };
  // Từ tâm điểm sang danh sách mua, lọc đúng cầu thủ đó ở +1.
  const viewInList = (card: Card) => { reset(); setMode('buy'); setQuery(getPlayer(card).name); setSelectedId(card.uid); };
  const canBuy = (card: Card, cardQuote = marketQuote(card)) => !isTradeLocked(card) && cardQuote.available && (free || save.balance >= cardQuote.price);
  // Tiêu đề cột bấm để sắp xếp (kiểu bảng Quản lí CT): bấm lần đầu theo khoá thứ nhất, bấm lại đảo chiều.
  const column = ([first, second]: [string, string], label: string, align = '') => { const on = sort === first || sort === second, desc = DESCENDING.has(sort);
    return <button className={`market-col ${align} ${on ? 'on' : ''}`} aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'} onClick={() => { setSort(sort === first ? second : first); setPage(0); }}>{label}{on && <ChevronDown size={12} className={desc ? '' : 'up'}/>}</button>; };

  return <section className="workspace market-workspace" aria-labelledby="market-title">
    <div className="page-heading market-heading">
      <div><h1 id="market-title">Thị trường chuyển nhượng</h1><p>Tìm mảnh ghép tiếp theo cho bộ sưu tập của bạn.</p></div>
      <div className="market-head-actions">
        <button className="text-action" onClick={onHistory}><History size={16}/>Lịch sử giao dịch<ArrowRight size={15}/></button>
      </div>
    </div>
    <div className="market-tabs" role="group" aria-label="Loại giao dịch"><button className="market-tab-spotlight" aria-pressed={mode === 'spotlight'} onClick={() => switchMode('spotlight')}><Sparkles size={14}/>Tâm điểm</button><button aria-pressed={mode === 'buy'} onClick={() => switchMode('buy')}>Mua cầu thủ<span>{players.length}</span></button><button aria-pressed={mode === 'sell'} onClick={() => switchMode('sell')}>Bán cầu thủ<span>{save.cards.length}</span></button></div>
    {mode === 'spotlight' ? <div className="market-spotlight">{spots.map((spot, i) => {
      const player = getPlayer(spot.card), spotQuote = marketQuote(spot.card);
      return <article className={`spotlight-item spotlight-${i}`} key={spot.label}>
        <header><span className="spotlight-rank">{i + 1}</span><div><h3>{spot.label}</h3><small>{spot.hint}</small></div></header>
        <div className="spotlight-card">{renderCard(spot.card)}{'views' in spot && typeof spot.views === 'number' && <span className="spotlight-views" title="Số lượt HLV mở xem thẻ này trong 7 ngày qua"><Eye size={14} aria-hidden="true"/>{spot.views.toLocaleString('vi-VN')} lượt xem</span>}</div>
        <div className="spotlight-info"><b>{player.name}</b><span className="market-badges"><PositionBadge pos={player.pos}/><SeasonBadge tier={player.tier}/><img className="market-level-img" src={levelBadge(1)} alt="+1"/><span className="spotlight-ovr">OVR <b>{ovr(spot.card)}</b></span></span></div>
        <div className={`spotlight-price${isUnpriced(spotQuote) ? ' is-unpriced' : ''}`}><span>Giá +1{isUnpriced(spotQuote) && <small>Chưa định giá</small>}</span><b>{formatMarketPrice(spotQuote.price)}</b></div>
        <div className="spotlight-actions"><button className="secondary-button" onClick={() => onDetail ? onDetail(spot.card) : viewInList(spot.card)}>Xem chi tiết</button><button className="market-primary" disabled={!canBuy(spot.card, spotQuote)} onClick={() => onTrade({ kind: 'buy', card: spot.card })}>Mua<ArrowRight size={15}/></button></div>
      </article>;
    })}{viewedPending && <article className="spotlight-item spotlight-2 spotlight-empty">
        <header><span className="spotlight-rank">3</span><div><h3>Được xem nhiều nhất</h3><small>Thẻ HLV mở xem nhiều nhất 7 ngày qua</small></div></header>
        <div className="spotlight-card spotlight-wait"><p>Đang thống kê lượt xem…<br/><small>Mở <b>Thông tin cầu thủ</b> của bất kỳ thẻ nào để góp lượt xem; ô này cập nhật sau khoảng 1 phút.</small></p></div>
      </article>}</div> : <>
    <div className={`market-filters ${filtersExpanded ? 'filters-open' : ''}`}>
      <div className="search-field"><Search size={17}/><input aria-label="Tìm cầu thủ trên thị trường" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/></div>
      <button className="market-filter-toggle" aria-expanded={filtersExpanded} aria-controls="market-filter-fields" onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? 'Ẩn bộ lọc' : 'Bộ lọc'}<span>{[position, season, !buying && sellLevel, buying && buyLevel !== '1' ? buyLevel : ''].filter(Boolean).length || ''}</span></button>
      <div className="market-filter-fields" id="market-filter-fields"><label>Vị trí<select aria-label="Vị trí trên thị trường" value={position} onChange={e => { setPosition(e.target.value); setPage(0); }}><option value="">Mọi vị trí</option>{[...new Set(players.map(p => p.pos))].sort().map(pos => <option key={pos}>{pos}</option>)}</select></label>
      <label>Mùa thẻ<select aria-label="Mùa thẻ trên thị trường" value={season} onChange={e => { setSeason(e.target.value); setPage(0); }}><option value="">Mọi mùa thẻ</option>{Object.entries(seasons).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{buying ? 'Cấp thẻ muốn mua' : 'Cấp thẻ'}<select aria-label="Cấp thẻ trên thị trường" value={buying ? buyLevel : sellLevel} onChange={e => { buying ? setBuyLevel(e.target.value) : setSellLevel(e.target.value); setPage(0); setPanelLevel(null); }}>{!buying && <option value="">Mọi cấp thẻ</option>}{Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label>
      <label>Sắp xếp theo<select aria-label="Sắp xếp thị trường" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="price-desc">Giá: cao → thấp</option><option value="price">Giá: thấp → cao</option><option value="ovr">OVR: cao → thấp</option><option value="ovr-asc">OVR: thấp → cao</option><option value="name">Tên: A → Z</option><option value="name-desc">Tên: Z → A</option><option value="position">Vị trí: tiền đạo → thủ môn</option><option value="position-desc">Vị trí: thủ môn → tiền đạo</option><option value="wage-desc">Lương: cao → thấp</option><option value="wage">Lương: thấp → cao</option><option value="level">Cấp thẻ: cao → thấp</option><option value="level-asc">Cấp thẻ: thấp → cao</option></select></label></div>
    </div>
    <div className="market-count"><label className="market-unavailable-filter"><input type="checkbox" checked={unavailableOnly} onChange={event => { setUnavailableOnly(event.target.checked); setPage(0); }}/>Chỉ thẻ chưa có giá</label><span role="status">{filtered.length ? `${money(filtered.length)} thẻ` : '0 thẻ phù hợp'}</span><button className="text-action" onClick={reset}>Đặt lại bộ lọc</button></div>
    {visible.length ? <div className="market-layout"><div className="market-list-panel">
      <div className="market-columns">{column(['position', 'position-desc'], 'Vị trí')}<span/>{column(['name', 'name-desc'], 'Tên cầu thủ')}{column(['wage-desc', 'wage'], 'Lương', 'is-center')}{column(['ovr', 'ovr-asc'], 'OVR', 'is-center')}{column(['level', 'level-asc'], 'Thẻ', 'is-center')}{column(['price-desc', 'price'], buying ? 'Giá' : 'Nhận sau phí', 'is-end')}<span/><span/></div>
      <div ref={listRef} className="market-list" onScroll={loadMore}>{visible.map(card => {
        const player = getPlayer(card), rowQuote = marketQuote(card, taxPercent), unpriced = isUnpriced(rowQuote), shown = buying ? rowQuote.price : rowQuote.proceeds;
        const tradeLocked = isTradeLocked(card);
        const canAfford = !tradeLocked && rowQuote.available && (!buying || free || save.balance >= rowQuote.price);
        const note = tradeLocked ? 'Khóa giao dịch' : !rowQuote.available ? 'Chưa có giá' : unpriced ? 'Chưa định giá' : !canAfford ? 'Chưa đủ số dư' : '';
        // Hàng kiểu bảng Quản lí CT: vị trí (vạch màu tuyến) · ảnh thẻ · mùa + tên · lương · OVR · cấp thẻ · giá · thao tác; bấm hàng để xem chi tiết.
        return <article className={`market-row ${selected.uid === card.uid ? 'is-selected' : ''}`} key={card.uid} onClick={() => select(card)}>
          <span className={`squad-pos pos-${positionGroup(player.pos)}`}>{player.pos}</span>
          <span className="market-face"><img src={player.cardFace || asset('/assets/silhouette.svg')} alt="" loading="lazy"/></span>
          <button className="market-player" aria-label={`Xem ${player.name} +${card.level}`} aria-pressed={selected.uid === card.uid} onClick={event => { event.stopPropagation(); select(card); }}><SeasonBadge tier={player.tier}/><b>{player.name}</b></button>
          <span className="squad-wage" aria-label={`Lương ${player.wage ?? 0}`}>{player.wage ?? 0}</span>
          <strong className="market-ovr">{ovr(card)}</strong>
          <span className="market-level"><img src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
          <div className={`market-price${unpriced || !rowQuote.available ? ' is-unpriced' : ''}`} title={rowQuote.reason || [formatMarketPrice(shown), rowQuote.liquidityNote, `Giá đổi lúc ${nextChange}`].filter(Boolean).join(' · ')}><b>{shown === null ? '—' : money(shown)}</b>{note && <small>{note}</small>}</div>
          {onDetail ? <button type="button" className="market-row-info" title="Thông tin cầu thủ" aria-label={`Thông tin ${player.name} +${card.level}`} onClick={event => { event.stopPropagation(); onDetail(card); }}><Search size={17}/></button> : <span/>}
          <button className="market-row-action" disabled={!canAfford} aria-label={`${buying ? 'Mua' : 'Bán'} ${player.name} +${card.level}`} onClick={event => { event.stopPropagation(); onTrade({ kind: buying ? 'buy' : 'sell', card }); }}>{buying ? 'Mua' : 'Bán'}<ArrowRight size={14}/></button>
        </article>;
      })}</div>
    </div><aside className="market-preview" aria-label="Cầu thủ đang xem">{onDetail ? <button type="button" className="market-preview-card is-link" onClick={() => onDetail(panelCard)} aria-label={`Thông tin ${getPlayer(panelCard).name}`}>{renderCard(panelCard)}</button> : <div className="market-preview-card">{renderCard(panelCard)}</div>}<h2>{getPlayer(panelCard).name}</h2>
      <div className="market-preview-badges"><PositionBadge pos={getPlayer(panelCard).pos}/><SeasonBadge tier={getPlayer(panelCard).tier}/><span className="market-preview-ovr">OVR <b>{ovr(panelCard)}</b></span><img className="market-level-img" src={levelBadge(panelCard.level)} alt={`+${panelCard.level}`}/></div>
      {buying && <div className="market-grades" role="group" aria-label="Chọn nhanh cấp thẻ muốn mua">{Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(level => <button key={level} aria-pressed={panelCard.level === level} aria-label={`Xem giá +${level}`} onClick={() => setPanelLevel(level)}><img className="market-level-img" src={levelBadge(level)} alt=""/></button>)}</div>}
      <dl><div><dt>Giá thẻ</dt><dd className={isUnpriced(quote) ? 'is-unpriced' : undefined}>{formatMarketPrice(quote.price)}{isUnpriced(quote) && <small> · Chưa định giá</small>}</dd></div>{!buying && <><div><dt>Phí bán {quote.feePercent}%</dt><dd>−{formatMarketPrice(quote.fee)}</dd></div><div className="market-total"><dt>Bạn nhận</dt><dd>{formatMarketPrice(quote.proceeds)}</dd></div></>}</dl>
      <button className="market-primary" disabled={isTradeLocked(panelCard) || !quote.available || (buying && !free && save.balance < (quote.price ?? Infinity))} onClick={() => onTrade({ kind: buying ? 'buy' : 'sell', card: panelCard })}>{buying ? 'Mua cầu thủ' : 'Bán cầu thủ'}<ArrowRight size={16}/></button>
      <small>{isTradeLocked(panelCard) ? TRADE_LOCKED : !quote.available ? quote.reason : [quote.liquidityNote, quote.insuranceFee === null ? '' : `Bảo hiểm lên +${panelCard.level + 1}: ${formatMarketPrice(quote.insuranceFee)} (${Math.round(quote.insuranceRate * 100)}% giá thẻ).`].filter(Boolean).join(' ')}</small></aside></div> : <div className="empty-state market-empty"><Search size={32}/><h2>{!buying && !save.cards.length ? 'Kho cầu thủ đang trống' : 'Không tìm thấy cầu thủ'}</h2><p>{!buying && !save.cards.length ? 'Mở gói hoặc mua cầu thủ để bổ sung vào kho.' : 'Thử đổi tên, vị trí, mùa thẻ hoặc cấp thẻ.'}</p><button className="secondary-button" onClick={!buying && !save.cards.length ? onOpenPacks : reset}>{!buying && !save.cards.length ? 'Mở gói cầu thủ' : 'Đặt lại bộ lọc'}</button></div>}
    </>}
  </section>;
}
