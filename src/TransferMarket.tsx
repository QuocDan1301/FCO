import { useEffect, useMemo, useRef, useState } from 'react';
import { ovrStyle } from './ovr-color';
import type { ReactNode, UIEvent } from 'react';
import { ArrowRight, ChevronDown, Search, Star } from 'lucide-react';
import { getPlayer, INVENTORY_CARD_CAP, MAX_LEVEL, money, ovr, players, seasons } from './game';
import type { Card, Save, Tier } from './game';
import { goldTraitOf } from './gold-traits';
import { marketQuote, compareMarketPrices, formatMarketPrice, nextPriceChange, saleTaxPercent, isTradeLocked, TRADE_LOCKED, SELL_BAND_PERCENT } from './market';
import { usePricePeriod } from './use-price-period';
import type { MarketTrade } from './market';
import { asset } from './asset';
import { SeasonBadge, seasonShort } from './badges';
import { getLineups, membersOf, positionGroup, SQUAD_LIMIT } from './squad';
import TeamColorPicker, { matchesTeamColor } from './TeamColorPicker';
import SearchPicker, { normalizeSearch } from './SearchPicker';
import type { PickerOption } from './SearchPicker';
import { faceOf } from './portraits';
import MarketDetail from './MarketDetail';
import MarketOrders from './MarketOrders';
import MarketHome from './MarketHome';
import { physicalOf } from './physical';
import { Foot } from './PlayerDetail';
import MarketAdvanced, { EMPTY_ADV, advCount, matchAdv } from './MarketAdvanced';
import type { Adv } from './MarketAdvanced';
import type { BookLevel, MarketPending, MyOrder } from './inventory-server';


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
  // Chợ giữa người chơi (migration 202611170002): sổ lệnh theo cầu thủ, lịch sử chuyển nhượng, huỷ lệnh, hỏi nhận phần chờ.
  loadBook?: (playerId: number) => Promise<BookLevel[]>;
  loadMine?: () => Promise<MyOrder[]>;
  onCancelOrder?: (orderId: number) => Promise<boolean>;
  onRefreshClaims?: () => void | Promise<void>;
  // Lịch sử chuyển nhượng › Bán lại: mở cửa sổ Bán hàng loạt sau khi huỷ lệnh bán đã chọn.
  onRelist?: () => void;
  // Đã đăng nhập nhưng kho chưa chạy trên máy chủ (bản game khác dữ liệu đã đồng bộ): vẫn hiện tab Lịch sử chuyển nhượng kèm lời nhắc này.
  ordersNotice?: string;
  // Phần chờ nhận (thẻ mua được / BP bán được) và nút nhận (migration 202611170011).
  pending?: MarketPending;
  // Cầu thủ yêu thích (Save.favorites) và hàm bật / tắt ngôi sao ở từng dòng.
  favorites?: number[];
  onFavorite?: (playerId: number) => void;
  onTake?: (kind: 'buy' | 'sell') => Promise<boolean>;
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

// Ô 3 Tâm điểm: thẻ được mở Thông tin nhiều nhất 7 ngày (máy chủ đếm, fco_top_viewed).
// Lưu 10 phút trong bộ nhớ để mở TTCN nhiều lần không hỏi lại máy chủ.
// rows giữ cả số lượt xem để hiện trên ô Tâm điểm (người dùng 2026-11-14).
let viewedCache: { at: number; rows: { id: number; views: number }[] } | null = null;
const VIEWED_TTL = 10 * 60_000, EMPTY_TTL = 30_000; // chưa có dữ liệu thì chỉ nhớ 30 giây
/** Vừa gửi lượt xem lên máy chủ: lần mở TTCN sau hỏi lại. */
export const forgetTopViewed = () => { viewedCache = null; if (typeof window !== 'undefined') window.dispatchEvent(new Event('fco-views-sent')); };

// Các mức OVR cho bộ lọc OVR: từ OVR +1 thấp nhất tới OVR +13 cao nhất trong danh sách cầu thủ.
const MARKET_OVRS = (() => { let lo = Infinity, hi = 0; for (const p of players) { lo = Math.min(lo, ovr({ playerId: p.id, level: 1 })); hi = Math.max(hi, ovr({ playerId: p.id, level: MAX_LEVEL })); } return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); })();

// Ô gõ-để-chọn ở bộ lọc: mùa thẻ (kèm huy hiệu mùa, tìm theo tên đầy đủ / tên viết tắt) và OVR (gõ số).
let seasonOptionsCache: PickerOption[] | null = null;
const seasonOptions = () => seasonOptionsCache ??= (() => {
  const count = new Map<string, number>(); for (const p of players) count.set(p.tier, (count.get(p.tier) ?? 0) + 1);
  return (Object.entries(seasons) as [Tier, string][]).map(([id, name]) => ({
    value: id, label: name, key: normalizeSearch(`${name} ${seasonShort(id)} ${id}`), hint: money(count.get(id) ?? 0), icon: <SeasonBadge tier={id}/>,
  }));
})();
const OVR_OPTIONS: PickerOption[] = MARKET_OVRS.map(o => ({ value: String(o), label: String(o), key: String(o) }));

// Tô xanh chữ đang gõ trong tên gợi ý (lần khớp đầu tiên, không phân biệt hoa thường / dấu).
function highlight(name: string, query: string): ReactNode {
  const needle = normalize(query);
  if (!needle) return name;
  const flat = [...name].map(ch => normalize(ch) || ch.toLowerCase()).join('');
  if (flat.length !== name.length) return name;
  const at = flat.indexOf(needle);
  return at < 0 ? name : <>{name.slice(0, at)}<mark>{name.slice(at, at + needle.length)}</mark>{name.slice(at + needle.length)}</>;
}

export default function TransferMarket({ save, free, onTrade, onHistory, onOpenPacks, renderCard, levelBadge, onDetail, loadTopViewed, loadBook, loadMine, onCancelOrder, onRefreshClaims, onRelist, pending, onTake, ordersNotice, favorites = [], onFavorite }: Props) {
  // Vừa vào TTCN là thấy Tâm điểm.
  const [mode, setMode] = useState<'buy' | 'sell' | 'spotlight' | 'orders'>('spotlight');
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
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  // Gợi ý tên cầu thủ khi gõ ở ô tìm (người dùng 2026-11-24): mỗi tên một dòng (gộp các mùa), tối đa 8, tên bắt đầu bằng chữ đang gõ lên trước rồi tới OVR cao.
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIndex, setSugIndex] = useState(-1);
  const suggestions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    const byName = new Map<string, { player: ReturnType<typeof getPlayer>; count: number; best: number; starts: boolean }>();
    for (const p of players) {
      const key = normalizedName(p.id, p.name);
      if (!key.includes(needle)) continue;
      const top = ovr({ playerId: p.id, level: 1 }), cur = byName.get(p.name);
      if (cur) { cur.count++; if (top > cur.best) { cur.best = top; cur.player = p; } } else byName.set(p.name, { player: p, count: 1, best: top, starts: key.startsWith(needle) });
    }
    return [...byName.values()].sort((a, b) => Number(b.starts) - Number(a.starts) || b.best - a.best).slice(0, 8);
  }, [query]);
  const [position, setPosition] = useState('');
  const [season, setSeason] = useState('');
  const [buyLevel, setBuyLevel] = useState('1');
  const [sellLevel, setSellLevel] = useState('');
  // Cấp cuối của khoảng cấp thẻ ở bảng Nâng cao (''= bằng cấp đầu khi mua, = không giới hạn khi bán).
  const [levelMax, setLevelMax] = useState('');
  // Lọc OVR (người dùng 2026-11-15): OVR của thẻ ở cấp đang xem (mua: cấp muốn mua; bán: cấp thẻ trong kho); '' = không giới hạn.
  const [ovrMin, setOvrMin] = useState('');
  const [ovrMax, setOvrMax] = useState('');
  const [teamColor, setTeamColor] = useState('');
  // Bộ lọc nâng cao (MarketAdvanced) và 3 chỗ lưu tìm kiếm (localStorage, chỉ trên máy này).
  const [adv, setAdv] = useState<Adv>(EMPTY_ADV);
  const [slot, setSlot] = useState(0);
  const [favOnly, setFavOnly] = useState(false);
  // Cầu thủ của tôi (người dùng 2026-11-24): 'lineup' = cầu thủ trong đội (bộ đội hình đang dùng, tối đa SQUAD_LIMIT), 'outside' = cầu thủ ngoài đội (còn lại trong kho, tối đa theo giới hạn kho).
  const [mineTab, setMineTab] = useState<'lineup' | 'outside'>('lineup');
  type Snapshot = { adv: Adv; position: string; season: string; ovrMin: string; ovrMax: string; level: string; teamColor: string };
  const [saved, setSaved] = useState<(Snapshot | null)[]>(() => { try { const raw = JSON.parse(localStorage.getItem('fco-market-saved') || '[]'); return [0, 1, 2].map(i => raw[i] && typeof raw[i] === 'object' ? { ...raw[i], adv: { ...EMPTY_ADV, ...raw[i].adv } } : null); } catch { return [null, null, null]; } });
  // Mặc định giá cao → thấp: vừa mở TTCN là thấy các siêu sao đắt giá nhất.
  const [sort, setSort] = useState('price-desc');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  // Cấp chọn nhanh ở panel chi tiết (chỉ khi mua): xem giá / mua thẻ đang chọn ở cấp khác mà không đổi bộ lọc chung.
  const [panelLevel, setPanelLevel] = useState<number | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [unavailableOnly, setUnavailableOnly] = useState(false);
  const buying = mode !== 'sell' && mode !== 'orders';
  const period = usePricePeriod();
  const nextChange = new Date(nextPriceChange()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  // Bộ đội hình đang dùng chưa có ai thì tab Đội hình chính trống nên mở thẳng tab Cầu thủ.
  const mineSet = useMemo(() => { const l = getLineups(save); return new Set(membersOf(l.sets[l.active])); }, [save.cards, save.squad, save.lineups]);
  const mineView = mineSet.size ? mineTab : 'outside';
  const inTeam = useMemo(() => save.cards.filter(c => mineSet.has(c.uid)).length, [save.cards, mineSet]);
  const filtered = useMemo(() => {
  const lo = Number(buyLevel), hi = Math.max(lo, Number(levelMax) || lo);
  const cards: Card[] = buying ? players.flatMap(p => Array.from({ length: hi - lo + 1 }, (_, i) => marketCard(p.id, lo + i))) : save.cards;
  const needle = normalize(query);
  return cards.filter(c => {
    const p = getPlayer(c);
    return normalizedName(p.id, p.name).includes(needle) && (!position || position.split(',').includes(p.pos)) && (!season || season.split(',').includes(p.tier)) && (buying || ((!sellLevel || c.level >= Number(sellLevel)) && (!levelMax || c.level <= Number(levelMax)))) && (!unavailableOnly || !marketQuote(c).available)
      && (!ovrMin || ovr(c) >= Number(ovrMin)) && (!ovrMax || ovr(c) <= Number(ovrMax)) && matchesTeamColor(p, teamColor) && matchAdv(p, adv) && (!favOnly || favorites.includes(p.id)) && (buying || (mineView === 'lineup') === mineSet.has(c.uid));
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
  }, [buying, buyLevel, levelMax, save.cards, query, position, season, sellLevel, unavailableOnly, ovrMin, ovrMax, teamColor, adv, favOnly, favorites, mineView, mineSet, sort, period]);
  const visible = filtered.slice(0, (page + 1) * LIST_BATCH);
  const loadMore = (event: UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (visible.length < filtered.length && list.scrollHeight - list.scrollTop - list.clientHeight < LOAD_MARGIN) setPage(current => current + 1);
  };
  // Đổi bộ lọc, cách sắp xếp hay tab thì danh sách mới bắt đầu lại từ đầu.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [mode, query, position, season, buyLevel, sellLevel, unavailableOnly, sort]);
  const selected = visible.find(c => c.uid === selectedId) || visible[0];
  // Cấp chọn ở bảng giá bên phải (cả mua lẫn bán): xem / mua / bán cầu thủ đang chọn ở cấp khác mà không đổi bộ lọc chung.
  const panelCard = selected && panelLevel && panelLevel !== selected.level ? marketCard(selected.playerId, panelLevel) : selected;
  const taxPercent = saleTaxPercent(save);
  const quote = panelCard && marketQuote(panelCard, taxPercent);
  const reset = () => { setQuery(''); setPosition(''); setSeason(''); setSellLevel(''); setOvrMin(''); setOvrMax(''); setTeamColor(''); setAdv(EMPTY_ADV); setBuyLevel('1'); setLevelMax(''); setSort('price-desc'); setUnavailableOnly(false); setPage(0); setPanelLevel(null); };
  const switchMode = (next: typeof mode) => { setMode(next); setFavOnly(false); setPage(0); setPanelLevel(null); };
  const select = (card: Card) => { setSelectedId(card.uid); setPanelLevel(null); };
  // Từ tâm điểm sang danh sách mua, lọc đúng cầu thủ đó ở +1.
  const viewInList = (card: Card) => { reset(); setFavOnly(false); setFiltersExpanded(false); setMode('buy'); setQuery(getPlayer(card).name); setSelectedId(card.uid); };
  // Tiêu đề cột bấm để sắp xếp (kiểu bảng Quản lí CT): bấm lần đầu theo khoá thứ nhất, bấm lại đảo chiều.
  const column = ([first, second]: [string, string], label: string, align = '') => { const on = sort === first || sort === second, desc = DESCENDING.has(sort);
    return <button className={`market-col ${align} ${on ? 'on' : ''}`} aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'} onClick={() => { setSort(sort === first ? second : first); setPage(0); }}>{label}{on && <ChevronDown size={12} className={desc ? '' : 'up'}/>}</button>; };

  // Tìm ở thanh trên: đang ở Cầu thủ phổ biến / DS của bạn thì chuyển sang danh sách mua (bỏ trống = xem tất cả cầu thủ).
  const pickSuggestion = (name: string) => { setQuery(name); setPage(0); setSugOpen(false); setSugIndex(-1); if (mode !== 'buy' && mode !== 'sell') switchMode('buy'); };
  const openSearch = () => { setSugOpen(false); setFiltersExpanded(false); if (mode !== 'buy' && mode !== 'sell') switchMode('buy'); };
  const hasOrders = !!((loadMine && onCancelOrder) || ordersNotice);
  return <section className="workspace market-workspace" aria-labelledby="market-title">
    <h1 id="market-title" className="sr-only">Thị trường chuyển nhượng</h1>
    <div className="mk-top">
      <form className="mk-search" role="search" onSubmit={e => { e.preventDefault(); openSearch(); }}>
        <input aria-label="Tìm cầu thủ trên thị trường" placeholder="Nhập tên cầu thủ" value={query} autoComplete="off" role="combobox" aria-expanded={sugOpen && suggestions.length > 0} aria-controls="mk-suggest"
          onChange={e => { setQuery(e.target.value); setPage(0); setSugOpen(true); setSugIndex(-1); }} onFocus={() => setSugOpen(true)} onBlur={() => setSugOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') setSugOpen(false);
            else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setSugOpen(true); setSugIndex(i => (i + 1) % suggestions.length); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setSugIndex(i => (i <= 0 ? suggestions.length : i) - 1); }
            else if (e.key === 'Enter' && sugOpen && sugIndex >= 0 && suggestions[sugIndex]) { e.preventDefault(); pickSuggestion(suggestions[sugIndex].player.name); }
          }}/>
        <button type="submit" className="mk-go" aria-label="Tìm"><Search size={22}/></button>
        {sugOpen && suggestions.length > 0 && <ul className="mk-suggest" id="mk-suggest" role="listbox" aria-label="Gợi ý cầu thủ">{suggestions.map((s, i) => <li key={s.player.name} role="option" aria-selected={i === sugIndex} className={i === sugIndex ? 'is-on' : undefined} onMouseDown={e => { e.preventDefault(); pickSuggestion(s.player.name); }} onMouseEnter={() => setSugIndex(i)}>
            {highlight(s.player.name, query)}</li>)}</ul>}
      </form>
      <button type="button" className={`mk-adv${filtersExpanded ? ' is-open' : ''}`} aria-expanded={filtersExpanded} aria-controls="market-filter-fields" onClick={() => { setFiltersExpanded(v => !v); if (mode === 'spotlight' || mode === 'orders') switchMode('buy'); }}>Nâng cao{advCount(adv) + (position ? 1 : 0) + (season ? 1 : 0) + (ovrMin || ovrMax ? 1 : 0) + (teamColor ? 1 : 0) > 0 && <b className="mk-adv-n">{advCount(adv) + (position ? 1 : 0) + (season ? 1 : 0) + (ovrMin || ovrMax ? 1 : 0) + (teamColor ? 1 : 0)}</b>}<i aria-hidden="true"/></button>
      <span className="mk-bal"><b>{money(save.balance)}</b> BP</span>
    </div>
    <div className="mk-tabs" role="tablist" aria-label="Thị trường">
      <button type="button" role="tab" aria-selected={mode === 'spotlight'} onClick={() => switchMode('spotlight')}>Cầu thủ phổ biến</button>
      <button type="button" role="tab" aria-selected={mode === 'sell'} onClick={() => switchMode('sell')}>Cầu thủ của tôi</button>
      <button type="button" role="tab" aria-selected={mode === 'buy' && favOnly} onClick={() => { switchMode('buy'); setFavOnly(true); }}>Cầu thủ yêu thích{favorites.length > 0 && <small className="mk-tab-n">{favorites.length}</small>}</button>
      <button type="button" role="tab" aria-selected={mode === 'orders'} disabled={!hasOrders} onClick={() => switchMode('orders')}>DS của bạn</button>
      {mode === 'buy' && !favOnly && <button type="button" role="tab" aria-selected>Danh sách tìm kiếm</button>}
    </div>
    {filtersExpanded && <MarketAdvanced adv={adv} onAdv={a => { setAdv(a); setPage(0); }} position={position} onPosition={v => { setPosition(v); setPage(0); }} positions={[...new Set(players.map(p => p.pos))].sort()}
      ovrMin={ovrMin} ovrMax={ovrMax} onOvrMin={v => { setOvrMin(v); if (v && ovrMax && Number(ovrMax) < Number(v)) setOvrMax(v); setPage(0); }} onOvrMax={v => { setOvrMax(v); setPage(0); }} ovrs={MARKET_OVRS}
      season={season} onSeason={v => { setSeason(v); setPage(0); }} seasonList={seasonOptions().map(o => ({ value: o.value, text: o.label }))}
      level={buying ? buyLevel : sellLevel} onLevel={v => { buying ? setBuyLevel(v || '1') : setSellLevel(v); if (v && levelMax && Number(levelMax) < Number(v)) setLevelMax(v); setPage(0); setPanelLevel(null); }} levelAll={!buying}
      levelMax={levelMax} onLevelMax={v => { setLevelMax(v); setPage(0); setPanelLevel(null); }} levelBadge={levelBadge}
      teamColor={teamColor} onTeamColor={v => { setTeamColor(v); setPage(0); }}
      slot={slot} onSlot={i => { setSlot(i); const s = i > 0 ? saved[i - 1] : null; if (s) { setAdv(s.adv); setPosition(s.position); setSeason(s.season); setOvrMin(s.ovrMin); setOvrMax(s.ovrMax); setTeamColor(s.teamColor); buying ? setBuyLevel(s.level || '1') : setSellLevel(s.level); setPage(0); } }}
      savedSlots={saved.map(Boolean)} onSave={() => { const snap: Snapshot = { adv, position, season, ovrMin, ovrMax, level: buying ? buyLevel : sellLevel, teamColor }; const next = saved.map((s, i) => i === slot - 1 ? snap : s); setSaved(next); try { localStorage.setItem('fco-market-saved', JSON.stringify(next)); } catch { /* không lưu được thì thôi */ } }}
      onReset={() => { reset(); }}/>}
    <div className={mode === 'spotlight' ? 'mk-body' : 'mk-pad'}>
    {mode === 'orders' && !(loadMine && onCancelOrder) && ordersNotice ? <div className="mo-empty"><p>Chưa xem được lịch sử chuyển nhượng.</p><small>{ordersNotice}</small></div> : mode === 'orders' && loadMine && onCancelOrder ? <MarketOrders load={loadMine} onCancel={onCancelOrder} onRefreshClaims={onRefreshClaims} onRelist={onRelist} pending={pending} onTake={onTake} levelBadge={levelBadge}/> : mode === 'spotlight' ? <MarketHome renderCard={renderCard} levelBadge={levelBadge} viewed={viewedRows} onOpen={card => onDetail ? onDetail(card) : viewInList(card)}/> : <>
    <div className={`market-filters ${filtersExpanded ? 'filters-open' : ''}`}>
      <div className="search-field"><Search size={17}/><input aria-label="Tìm cầu thủ trên thị trường" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/></div>
      <button className="market-filter-toggle" aria-expanded={filtersExpanded} aria-controls="market-filter-fields" onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? 'Ẩn bộ lọc' : 'Bộ lọc'}<span>{[position, season, !buying && sellLevel, buying && buyLevel !== '1' ? buyLevel : '', ovrMin || ovrMax, teamColor].filter(Boolean).length || ''}</span></button>
      <div className="market-filter-fields" id="market-filter-fields"><label>Vị trí<select aria-label="Vị trí trên thị trường" value={position} onChange={e => { setPosition(e.target.value); setPage(0); }}><option value="">Mọi vị trí</option>{[...new Set(players.map(p => p.pos))].sort().map(pos => <option key={pos}>{pos}</option>)}</select></label>
      <label>Mùa thẻ<SearchPicker value={season} onChange={v => { setSeason(v); setPage(0); }} options={seasonOptions()} ariaLabel="Mùa thẻ trên thị trường" placeholder="Gõ tên mùa…" empty="Không có mùa"/></label>
      <label>{buying ? 'Cấp thẻ muốn mua' : 'Cấp thẻ'}<select aria-label="Cấp thẻ trên thị trường" value={buying ? buyLevel : sellLevel} onChange={e => { buying ? setBuyLevel(e.target.value) : setSellLevel(e.target.value); setPage(0); setPanelLevel(null); }}>{!buying && <option value="">Mọi cấp thẻ</option>}{Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label>
      <label>OVR<span className="market-ovr"><SearchPicker numeric compact value={ovrMin} onChange={v => { setOvrMin(v); if (v && ovrMax && Number(ovrMax) < Number(v)) setOvrMax(v); setPage(0); }} options={OVR_OPTIONS} ariaLabel="OVR từ" placeholder="Từ" empty="Không có OVR"/><i aria-hidden="true">–</i><SearchPicker numeric compact value={ovrMax} onChange={v => { setOvrMax(v); if (v && ovrMin && Number(ovrMin) > Number(v)) setOvrMin(v); setPage(0); }} options={OVR_OPTIONS} ariaLabel="OVR đến" placeholder="Đến" empty="Không có OVR"/></span></label>
      <label>Team color<TeamColorPicker value={teamColor} onChange={v => { setTeamColor(v); setPage(0); }}/></label>
      <label>Sắp xếp theo<select aria-label="Sắp xếp thị trường" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="price-desc">Giá: cao → thấp</option><option value="price">Giá: thấp → cao</option><option value="ovr">OVR: cao → thấp</option><option value="ovr-asc">OVR: thấp → cao</option><option value="name">Tên: A → Z</option><option value="name-desc">Tên: Z → A</option><option value="position">Vị trí: tiền đạo → thủ môn</option><option value="position-desc">Vị trí: thủ môn → tiền đạo</option><option value="wage-desc">Lương: cao → thấp</option><option value="wage">Lương: thấp → cao</option><option value="level">Cấp thẻ: cao → thấp</option><option value="level-asc">Cấp thẻ: thấp → cao</option></select></label></div>
    </div>
    <div className="market-count"><label className="market-unavailable-filter"><input type="checkbox" checked={unavailableOnly} onChange={event => { setUnavailableOnly(event.target.checked); setPage(0); }}/>Chỉ thẻ chưa có giá</label><span role="status">{filtered.length ? `${money(filtered.length)} thẻ` : '0 thẻ phù hợp'}</span><button className="text-action" onClick={reset}>Đặt lại bộ lọc</button></div>
    {visible.length ? <div className="market-layout"><div className={`market-list-panel${buying ? '' : ' is-mine'}`}>
      {!buying && <div className="mk-seg" role="tablist" aria-label="Cầu thủ của tôi"><button type="button" role="tab" aria-selected={mineView === 'lineup'} onClick={() => { setMineTab('lineup'); setPage(0); }}>Đội hình chính</button><button type="button" role="tab" aria-selected={mineView === 'outside'} onClick={() => { setMineTab('outside'); setPage(0); }}>Cầu thủ</button></div>}
      <div className="market-columns">{column(['position', 'position-desc'], 'Vị trí')}{column(['name', 'name-desc'], 'Tên cầu thủ')}{column(['wage-desc', 'wage'], 'Lương', 'is-center')}{column(['level', 'level-asc'], 'Cấp thẻ', 'is-center')}{column(['ovr', 'ovr-asc'], 'OVR', 'is-center')}<span className="is-center">Chân thuận</span><span className="is-center">C.Số ẩn</span>{column(['price-desc', 'price'], buying ? 'Giá cầu thủ' : 'Nhận sau phí', 'is-end')}</div>
      <div ref={listRef} className="market-list" onScroll={loadMore}>{visible.map(card => {
        const player = getPlayer(card), rowQuote = marketQuote(card, taxPercent), unpriced = isUnpriced(rowQuote), shown = buying ? rowQuote.price : rowQuote.proceeds;
        const tradeLocked = isTradeLocked(card);
        // Chợ người chơi: đặt mua trước được với giá thấp tới −10% giá tham chiếu, nên chỉ cần đủ BP cho mức giá thấp nhất trong khung.
        const canAfford = !tradeLocked && rowQuote.available && (!buying || free || save.balance >= (loadBook ? Math.ceil(rowQuote.price * (100 - SELL_BAND_PERCENT) / 100) : rowQuote.price));
        const note = tradeLocked ? 'Khóa giao dịch' : !rowQuote.available ? 'Chưa có giá' : unpriced ? 'Chưa định giá' : !canAfford ? 'Chưa đủ số dư' : '';
        // Hàng kiểu bảng Quản lí CT: vị trí (vạch màu tuyến) · ảnh thẻ · mùa + tên · lương · OVR · cấp thẻ · giá · thao tác; bấm hàng để xem chi tiết.
        return <article className={`market-row ${selected.uid === card.uid ? 'is-selected' : ''}${tradeLocked || !rowQuote.available ? ' is-dim' : ''}`} key={card.uid} onClick={() => select(card)}>
          <button type="button" className={`mk-star${favorites.includes(player.id) ? ' is-on' : ''}`} aria-pressed={favorites.includes(player.id)} aria-label={favorites.includes(player.id) ? `Bỏ ${player.name} khỏi cầu thủ yêu thích` : `Thêm ${player.name} vào cầu thủ yêu thích`} title="Cầu thủ yêu thích" onClick={event => { event.stopPropagation(); onFavorite?.(player.id); }}><Star size={18} fill={favorites.includes(player.id) ? 'currentColor' : 'none'}/></button>
          <span className={`squad-pos pos-${positionGroup(player.pos)}`}>{player.pos}</span>
          <button className="market-player" aria-label={`Xem ${player.name} +${card.level}`} aria-pressed={selected.uid === card.uid} onClick={event => { event.stopPropagation(); select(card); }}><SeasonBadge tier={player.tier}/><b>{player.name}</b></button>
          <span className="squad-wage" aria-label={`Lương ${player.wage ?? 0}`}>{player.wage ?? 0}</span>
          <span className="market-level"><img src={levelBadge(card.level)} alt={`+${card.level}`}/></span>
          <strong className="market-ovr">{ovr(card)}</strong>
          {/* Cột thông tin thêm kiểu FC Online (người dùng 2026-11-24): hai chân thuận, chỉ số ẩn. */}
          <span className="market-feet">{(() => { const ph = physicalOf(player.id); return ph && ph.left + ph.right > 0 && <><Foot side="left" value={ph.left} main={ph.left >= ph.right}/><Foot side="right" value={ph.right} main={ph.right >= ph.left}/></>; })()}</span>
          <span className="market-gold-cell">{(() => { const g = goldTraitOf(player.id); return g && <img src={g.icon} alt={`Chỉ số ẩn: ${g.name}`} title={`Chỉ số ẩn: ${g.name} — ${g.desc}`} width={30} height={30}/>; })()}</span>
          {onDetail ? <button type="button" className="mk-row-btn is-info" title="Thông tin cầu thủ" aria-label={`Thông tin ${player.name}`} onClick={event => { event.stopPropagation(); onDetail(card); }}><Search size={18}/></button> : <span/>}
          <button type="button" className="mk-row-btn is-find" title="Xem tất cả các mùa của cầu thủ này" aria-label={`Tìm mọi mùa của ${player.name}`} onClick={event => { event.stopPropagation(); viewInList(card); }}>Tìm<ArrowRight size={16}/></button>
          <div className={`market-price${unpriced || !rowQuote.available ? ' is-unpriced' : ''}`} title={rowQuote.reason || [formatMarketPrice(shown), rowQuote.liquidityNote, `Giá đổi lúc ${nextChange}`].filter(Boolean).join(' · ')}><b>{shown === null ? '—' : money(shown)}</b>{note && <small>{note}</small>}</div>
        </article>;
      })}</div>
      {!buying && <div className="mk-foot"><b>{mineView === 'lineup' ? inTeam : save.cards.length - inTeam}</b> / {mineView === 'lineup' ? SQUAD_LIMIT : INVENTORY_CARD_CAP}</div>}
    </div><MarketDetail loadBook={loadBook} card={panelCard} save={save} free={free} taxPercent={taxPercent} levelBadge={levelBadge} renderCard={renderCard} onDetail={onDetail} onTrade={onTrade} onLevel={setPanelLevel}/></div> : <div className="empty-state market-empty"><Search size={32}/><h2>{!buying && !save.cards.length ? 'Kho cầu thủ đang trống' : 'Không tìm thấy cầu thủ'}</h2><p>{!buying && !save.cards.length ? 'Mở gói hoặc mua cầu thủ để bổ sung vào kho.' : 'Thử đổi tên, vị trí, mùa thẻ hoặc cấp thẻ.'}</p><button className="secondary-button" onClick={!buying && !save.cards.length ? onOpenPacks : reset}>{!buying && !save.cards.length ? 'Mở gói cầu thủ' : 'Đặt lại bộ lọc'}</button></div>}
    </>}
    </div>
  </section>;
}
