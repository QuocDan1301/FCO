import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronRight, Coins, Gift, History, Info, Layers3, Maximize2, PackageOpen, Plus, Search, Settings2, Shield, ShoppingBag, Sparkles, Trophy, X, Zap } from 'lucide-react';
import { MAX_LEVEL, TIERS, UPGRADE_LEVELS, buyPacks, claimDaily, dayKey, getPackOpeningCost, getPackStock, getPlayer, initialSave, isPackAvailable, money, openPacks, openSelectedPacks, ovr, packs, players, random, seasons, STORAGE_KEY, uid, upgrade, upgradeInfo, validateSave } from './game';
import { emptyBridge, recordOutcome, type ManualOutcome, type UpgradeRole } from './upgrade/engine';
import { BridgeLab, BridgeStatus } from './UpgradeBridge';
import type { Card, Entry, Pack, Save } from './game';
import PackOpening from './cinema/PackOpening';
import ViewportPages from './ViewportPages';
import PackStage from './cinema/PackStage';
import { GATE_CROSS, OPENING_CUES, OPENING_ENTRY, OPENING_RESULT, openingPhase } from './cinema/timeline';
import { unlockCinemaAudio } from './cinema/audio';
import { AUDIO_ENABLED, UNLIMITED_COINS } from './config';
import TransferMarket from './TransferMarket';
import Inventory from './Inventory';
import PackShop from './PackShop';
import BackgroundMusic from './BackgroundMusic';
import { Flag } from './flags';
import { buyPlayer, sellPlayer, marketQuote, formatMarketPrice, compareMarketPrices, MARKET_FEE_PERCENT } from './market';
import type { MarketTrade } from './market';
import { asset } from './asset';


const cardSortOptions = [
  { value: 'ovr', label: 'OVR: cao → thấp' },
  { value: 'ovr-asc', label: 'OVR: thấp → cao' },
  { value: 'name', label: 'Tên: A → Z' },
  { value: 'name-desc', label: 'Tên: Z → A' },
  { value: 'position', label: 'Vị trí: A → Z' },
  { value: 'position-desc', label: 'Vị trí: Z → A' },
  { value: 'level', label: 'Cấp thẻ: cao → thấp' },
  { value: 'level-asc', label: 'Cấp thẻ: thấp → cao' },
  { value: 'new', label: 'Mới nhận' },
  { value: 'season', label: 'Theo mùa giải' },
] as const;
type CardSort = typeof cardSortOptions[number]['value'];

function compareCards(a: Card, b: Card, sort: CardSort) {
  const playerA = getPlayer(a), playerB = getPlayer(b);
  const byName = playerA.name.localeCompare(playerB.name, 'vi');
  let order = 0;
  switch (sort) {
    case 'ovr': order = ovr(b) - ovr(a); break;
    case 'ovr-asc': order = ovr(a) - ovr(b); break;
    case 'name': order = byName; break;
    case 'name-desc': order = -byName; break;
    case 'position': order = playerA.pos.localeCompare(playerB.pos); break;
    case 'position-desc': order = playerB.pos.localeCompare(playerA.pos); break;
    case 'level': order = b.level - a.level; break;
    case 'level-asc': order = a.level - b.level; break;
    case 'new': order = b.received - a.received; break;
    case 'season': order = seasons[playerA.tier].localeCompare(seasons[playerB.tier], 'vi'); break;
  }
  return order || ovr(b) - ovr(a) || byName || b.level - a.level || b.received - a.received || a.uid.localeCompare(b.uid);
}

function CardSortSelect({ id, value, onChange }: { id: string; value: CardSort; onChange: (value: CardSort) => void }) {
  return <label className="card-sort" htmlFor={id}><span>Sắp xếp theo</span><select id={id} value={value} onChange={e => onChange(e.target.value as CardSort)}>{cardSortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

const historyDetail = (entry: Entry) => (entry.type === 'upgrade' ? entry.detail.replace(/ · Tỷ lệ [0-9.,]+%/g, '') : entry.detail).replace(/(\d{1,3}(?:[.,]\d{3})+|\d{7,})(?=\s*(?:BP|xu))/g, value => money(Number(value.replace(/[.,]/g, ''))));

type View = 'packs' | 'upgrade' | 'collection' | 'inventory' | 'history' | 'market' | 'shop';
type Animation = { id: string; kind: 'pack'; cards: Card[]; pack: Pack; quick: boolean } | { id: string; kind: 'upgrade'; card: Card; success: boolean; before: number; droppedLevel: number | null; restoredLevel: number | null };
const preview = (id: number): Card => ({ uid: `preview-${id}`, playerId: id, level: 1, received: 0 });
let audioContext: AudioContext | undefined;
function playSound(kind: 'charge' | 'success' | 'fail' | 'click', enabled: boolean) {
  if (!AUDIO_ENABLED || !enabled) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const context = audioContext;
    if (kind === 'success') {
      const buffer = context.createBuffer(1, context.sampleRate * .65, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 3);
      const noise = context.createBufferSource(); noise.buffer = buffer;
      const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 220;
      const gain = context.createGain(); gain.gain.value = .55;
      noise.connect(lowpass); lowpass.connect(gain); gain.connect(context.destination); noise.start();
    }
    const notes = kind === 'success' ? [261.6, 329.6, 392, 523.2] : kind === 'fail' ? [150, 110, 65] : kind === 'charge' ? [65, 98, 130, 196] : [440];
    notes.forEach((frequency, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const t = context.currentTime + i * 0.12;
      osc.type = kind === 'charge' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain); gain.connect(context.destination);
      osc.start(t); osc.stop(t + 1);
    });
  } catch { /* Âm thanh không khả dụng không làm gián đoạn trò chơi. */ }
}


const shortPrice = (n: number | null) => n === null ? 'Chưa có giá' : money(n);
const posGroup = (pos: string) => pos === 'GK' ? 'gk' : ['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].includes(pos) ? 'def' : ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(pos) ? 'att' : 'mid';

// Huy hiệu cấp thẻ +1 → +13; đường dẫn viết đầy đủ để bản mothe.html nhúng được ảnh.
const levelBadges = [asset('/assets/levels/lv-1.png'), asset('/assets/levels/lv-2.png'), asset('/assets/levels/lv-3.png'), asset('/assets/levels/lv-4.png'), asset('/assets/levels/lv-5.png'), asset('/assets/levels/lv-6.png'), asset('/assets/levels/lv-7.png'), asset('/assets/levels/lv-8.png'), asset('/assets/levels/lv-9.png'), asset('/assets/levels/lv-10.png'), asset('/assets/levels/lv-11.png'), asset('/assets/levels/lv-12.png'), asset('/assets/levels/lv-13.png')];
const levelBadge = (level: number) => levelBadges[Math.min(levelBadges.length, Math.max(1, level)) - 1];

function PlayerCard({ card, className = '', compact = false }: { card: Card; className?: string; compact?: boolean }) {
  const player = getPlayer(card);
  const cardTeam = player.tier === 'eternal' || player.tier === 'prime' ? player.nation : player.club;
  const [failed, setFailed] = useState(false);
  const theme = card.level >= 5 ? 'enhanced' : card.level > 1 ? 'upgraded' : player.tier;
  const sheen = player.tier === 'eternal' || player.tier === 'prime' ? <span className={`itm-sheen ${player.cardFace ? 'itm-sheen-masked' : ''}`} aria-hidden="true" style={{ '--itm-sheen-mask': player.cardFace ? `url("${player.cardFace}")` : undefined, '--itm-sheen-delay': `${-(player.id % 11) * .47}s` } as CSSProperties}><span className="itm-sheen-streak"/></span> : null;
  // Thẻ có ảnh mặt trước riêng: OVR và cấp thẻ vẽ đè lên ảnh để đổi theo mỗi lần nâng cấp.
  if (player.cardFace) return <div data-level={card.level} className={`player-card face-art season-${player.tier} face-${player.id} ${compact ? 'compact' : ''} ${className}`} aria-label={`${player.name}, OVR ${ovr(card)}, ${player.pos}, ${seasons[player.tier]}, cộng ${card.level}`}>
    <img className="face-art-img" src={player.cardFace} alt="" loading={compact ? 'lazy' : 'eager'}/>{sheen}<strong className="face-art-ovr">{ovr(card)}</strong><img className="face-art-level" src={levelBadge(card.level)} alt={`+${card.level}`}/>
  </div>;
  return <div className={`player-card ${theme} ${compact ? 'compact' : ''} ${className}`} aria-label={`${player.name}, OVR ${ovr(card)}, ${player.pos}, ${seasons[player.tier]}, cộng ${card.level}`}>
    <div className="card-inside"><div className="card-etching"/><div className="card-topline">{seasons[player.tier]}<span>◆</span></div><div className="card-rating"><strong>{ovr(card)}</strong><span>{player.pos}</span><Flag code={player.flag}/><div className="club-mini" title={cardTeam}>{player.tier === 'eternal' ? player.flag : cardTeam.slice(0, 2).toUpperCase()}</div></div>
      <img className={`player-photo ${!player.image || failed ? 'placeholder-photo' : ''}`} src={failed || !player.image ? asset('/assets/silhouette.svg') : player.image} onError={() => setFailed(true)} alt={player.image && !failed ? player.name : `Hình đại diện ${player.name}`} loading={compact ? 'lazy' : 'eager'}/>
      <div className="season-crest">{player.tier === 'eternal' ? 'TM' : player.tier === 'prime' ? 'IP' : player.tier === 'stellar' ? 'TT' : 'N7'}</div>
      <div className="card-bottom"><img className="card-level" src={levelBadge(card.level)} alt={`+${card.level}`}/><strong className="player-name">{player.name}</strong><span className="card-club">{cardTeam}</span><div className="card-stats">{['Tốc độ', 'Dứt điểm', 'Chuyền'].map((s, i) => <span key={s}><b>{Math.max(60, ovr(card) - i * 3 + (player.pos === 'ST' ? 2 : 0))}</b>{s}</span>)}</div></div>
    </div>{sheen}
  </div>;
}

function Stadium({ cinematic = false, reduced = false }: { cinematic?: boolean; reduced?: boolean }) {
  return <div className={`stadium ${cinematic ? 'cinematic' : ''} ${reduced ? 'still' : ''}`} aria-hidden="true">
    <svg className="stadium-structure" viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#050a12"/><stop offset=".65" stopColor="#112335"/><stop offset="1" stopColor="#07151c"/></linearGradient><linearGradient id="stand" x2="0" y2="1"><stop stopColor="#17242e"/><stop offset="1" stopColor="#071019"/></linearGradient><radialGradient id="lamp"><stop stopColor="#e1faff" stopOpacity=".9"/><stop offset=".08" stopColor="#7cd7ff" stopOpacity=".6"/><stop offset="1" stopColor="#58aeeb" stopOpacity="0"/></radialGradient><pattern id="crowd" width="13" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#759aae" opacity=".45"/><circle cx="8" cy="6" r=".7" fill="#dfcda0" opacity=".35"/></pattern></defs>
      <rect width="1440" height="700" fill="url(#sky)"/><path d="M0 130Q720 440 1440 130V490Q720 365 0 490Z" fill="url(#stand)"/><path d="M0 180Q720 440 1440 180V475Q720 360 0 475Z" fill="url(#crowd)"/>{[0, 1, 2, 3, 4].map(i => <path key={i} d={`M0 ${180 + i * 58}Q720 ${440 - i * 6} 1440 ${180 + i * 58}`} stroke="#4d6b7c" strokeWidth="3" fill="none" opacity=".2"/>)}
      <path d="M-40 103Q720 455 1480 103" stroke="#64879a" strokeWidth="5" fill="none" opacity=".5"/><path d="M-40 112Q720 462 1480 112" stroke="#a3daf4" strokeWidth="2" fill="none" opacity=".5"/>{Array.from({ length: 24 }, (_, i) => <path key={i} d={`M${i * 64 - 20} ${100 + Math.sin(i / 23 * Math.PI) * 175}l${(12 - i) * 2} 36`} stroke="#405c70" strokeWidth="2"/>)}
      <ellipse cx="720" cy="640" rx="1000" ry="210" fill="#102325"/><path d="M0 540h1440M100 700l310-210m930 210-310-210M720 490v210" stroke="#80b7aa" strokeWidth="1" opacity=".15"/><ellipse cx="720" cy="570" rx="150" ry="35" fill="none" stroke="#87b5b0" opacity=".12"/>
      {[130, 360, 1080, 1310].map((x, i) => <g key={x}><ellipse cx={x} cy={i === 1 || i === 2 ? 220 : 130} rx="170" ry="140" fill="url(#lamp)"/><rect x={x - 34} y={i === 1 || i === 2 ? 217 : 127} width="68" height="4" rx="2" fill="#d8f8ff" opacity=".8"/></g>)}
    </svg><div className="light-beam beam-one"/><div className="light-beam beam-two"/><div className="stadium-fog"/><div className="stadium-vignette"/>
    <div className="particles">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--x': `${(i * 43 + 11) % 100}%`, '--delay': `${-i * .7}s`, '--duration': `${6 + i % 6}s` } as CSSProperties}/>)}</div>
  </div>;
}

function PackArt({ pack, small = false }: { pack: Pack; small?: boolean }) {
  // Gói ICON TM dùng mặt sau thẻ ICON The Moment (nền kem, vân vàng, áo đấu trắng).
  return <div className={`pack-art ${pack.color} ${pack.back ? 'tm-back' : ''} ${small ? 'small' : ''}`} aria-hidden="true"><div className="pack-side"/><div className="pack-face">{pack.back && <img className="tm-back-img" src={pack.back} alt=""/>}<div className="pack-shine"/><span className="pack-art-name">FCO VIP</span><div className="pack-emblem"><Trophy strokeWidth={1}/></div><b>{pack.short}</b><span>{pack.range}</span><div className="pack-art-bottom">HUYỀN THOẠI</div></div></div>;
}

function Modal({ children, onClose, onSkip, label, className = '' }: { children: ReactNode; onClose: () => void; onSkip?: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const skipRef = useRef(onSkip); skipRef.current = onSkip;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    let skippingWithSpace = false;
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ';
    const key = (e: KeyboardEvent) => {
      if (isSpace(e) && (skippingWithSpace || skipRef.current)) {
        const editing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
        if (!skippingWithSpace && (e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || editing)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat && !skippingWithSpace) {
          skippingWithSpace = true;
          skipRef.current?.();
        }
        return;
      }
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]') || []).filter(el => el.offsetParent !== null && !el.closest('[inert]'));
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (isSpace(e) && skippingWithSpace) {
        e.preventDefault();
        e.stopPropagation();
        skippingWithSpace = false;
      }
    };
    const blur = () => { skippingWithSpace = false; };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      previous?.focus();
    };
  }, []);
  return <motion.div initial={className.includes('cinema-modal') ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .32 }} className={`modal-backdrop ${className}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><motion.div initial={className.includes('cinema-modal') ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref} className="modal-panel">{children}</motion.div></motion.div>;
}

export default function App() {
  const [loadNotice] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw && !validateSave(JSON.parse(raw)) ? 'Dữ liệu cũ không hợp lệ. Đã mở bộ dữ liệu khởi đầu.' : ''; } catch { return 'Không đọc được dữ liệu đã lưu. Kiểm tra quyền lưu trữ của trình duyệt.'; } });
  // Bản lưu thô gần nhất mà tab này đã đọc hoặc ghi; khác với localStorage nghĩa là tab khác vừa ghi.
  const storedRaw = useRef<string | null>(null);
  const [save, setSave] = useState<Save>(() => { try { const raw = localStorage.getItem(STORAGE_KEY); storedRaw.current = raw; const value: unknown = raw ? JSON.parse(raw) : null; if (validateSave(value)) return value; } catch { /* Hiển thị thông báo và bộ dữ liệu khởi đầu. */ } return initialSave(); });
  const latest = useRef(save); latest.current = save;
  const busy = useRef(false);
  const [view, setView] = useState<View>('packs');
  const mainRef = useRef<HTMLElement>(null);
  const [selectedPack, setSelectedPack] = useState(packs[0]);
  const [readyPack, setReadyPack] = useState<Pack | null>(null);
  const [packPrepared, setPackPrepared] = useState(false);
  const [entryStarted, setEntryStarted] = useState(false);
  const [flipStarted, setFlipStarted] = useState(false);
  const [packSkipReady, setPackSkipReady] = useState(false);
  const [preparationId, setPreparationId] = useState(0);
  const readyAvailable = readyPack ? getPackStock(save, readyPack) : 0;
  const readyBatch = Math.min(10, readyAvailable);
  const autoBatch = useRef(false);
  const inventoryBatch = useRef<Pack[] | null>(null);
  const prepareOpening = (pack: Pack, selection?: Pack[]) => {
    if (busy.current || !isPackAvailable(pack)) return;
    inventoryBatch.current = selection ?? null;
    autoBatch.current = !!selection;
    setPreparationId(id => id + 1); setEntryStarted(false); setPackPrepared(false); setSelectedPack(pack); setReadyPack(pack);
  };
  const [toast, setToast] = useState(loadNotice);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [odds, setOdds] = useState<Pack | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);
  const [trade, setTrade] = useState<MarketTrade | null>(null);
  const tradeRef = useRef(trade); tradeRef.current = trade;
  const [tradeError, setTradeError] = useState('');
  const [animation, setAnimation] = useState<Animation | null>(null);
  const packAnimation = animation?.kind === 'pack' ? animation : null;
  const flipping = !!readyPack && !!packAnimation && flipStarted;
  const [phase, setPhase] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [targetId, setTargetId] = useState(save.cards[0]?.uid || '');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [hoveredMaterialId, setHoveredMaterialId] = useState('');
  const [role, setRole] = useState<UpgradeRole>('main'), [bridgeLab, setBridgeLab] = useState(false);
  const [matSort, setMatSort] = useState<`${'position' | 'name' | 'ovr' | 'level' | 'price'}-${'asc' | 'desc'}`>('ovr-desc');
  const [picker, setPicker] = useState<'target' | 'material' | null>(null);
  const [query, setQuery] = useState('');
  const [collectionFiltersOpen, setCollectionFiltersOpen] = useState(false);
  const [position, setPosition] = useState('');
  const [season, setSeason] = useState('');
  const [level, setLevel] = useState('');
  const [minOvr, setMinOvr] = useState('');
  const [sort, setSort] = useState<CardSort>('ovr');
  const [historyType, setHistoryType] = useState('');
  const savedTarget = save.cards.find(c => c.uid === targetId);
  const pendingUpgrade = animation?.kind === 'upgrade' && phase < (animation.restoredLevel !== null ? 4 : 3) ? animation : null;
  const target = savedTarget && pendingUpgrade?.card.uid === savedTarget.uid ? { ...savedTarget, level: pendingUpgrade.before } : savedTarget;
  const materials = materialIds.map(id => save.cards.find(c => c.uid === id)).filter((c): c is Card => !!c);
  const info = target ? upgradeInfo(target, materials) : { energy: 0, chance: 0, cost: 100000 };
  const hoveredMaterial = !animation && materials.length < 5 && !materialIds.includes(hoveredMaterialId) ? save.cards.find(card => card.uid === hoveredMaterialId && card.uid !== targetId) : undefined;
  const previewEnergy = target && target.level < MAX_LEVEL && hoveredMaterial ? upgradeInfo(target, [...materials, hoveredMaterial]).energy : info.energy;
  useEffect(() => { setHoveredMaterialId(''); }, [targetId, matSort, view]);
  const bestOwned = save.cards.length ? Math.max(...save.cards.map(ovr)) : 0;
  const [currentDay, setCurrentDay] = useState(dayKey);
  useEffect(() => { const timer = setInterval(() => setCurrentDay(dayKey()), 30000); return () => clearInterval(timer); }, []);
  const dailyClaimed = save.daily === currentDay;
  const notify = (message: string) => setToast(message);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === STORAGE_KEY && e.newValue && !busy.current) { try { const data: unknown = JSON.parse(e.newValue); if (validateSave(data)) { storedRaw.current = e.newValue; latest.current = data; setSave(data); setMaterialIds([]); } } catch { /* Bỏ qua bản lưu không hợp lệ ở cửa sổ khác. */ } } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  // Không ghi đè thay đổi của tab khác (ví dụ tab này bỏ lỡ sự kiện đồng bộ khi đang chạy hiệu ứng): tải lại bản mới nhất và bỏ thao tác này.
  const adoptStored = (raw: string | null) => {
    storedRaw.current = raw;
    try { const data: unknown = raw ? JSON.parse(raw) : null; if (validateSave(data)) { latest.current = data; setSave(data); setMaterialIds([]); } } catch { /* Bản lưu hỏng: lần ghi sau sẽ thay thế. */ }
  };
  const commit = (next: Save) => {
    let current: string | null = storedRaw.current;
    try { current = localStorage.getItem(STORAGE_KEY); } catch { /* Không đọc được thì để setItem bên dưới báo lỗi. */ }
    if (current !== storedRaw.current) { adoptStored(current); notify('Dữ liệu vừa thay đổi ở tab khác nên thao tác này chưa được lưu. Đã tải lại dữ liệu mới nhất, hãy thử lại.'); return false; }
    try { const raw = JSON.stringify(next); localStorage.setItem(STORAGE_KEY, raw); storedRaw.current = raw; latest.current = next; setSave(next); return true; }
    catch { notify('Không thể lưu dữ liệu. Hãy cho phép lưu trữ hoặc giải phóng bộ nhớ trước khi chơi tiếp.'); return false; }
  };
  const requestTrade = (pending: MarketTrade) => {
    if (busy.current) return;
    const quote = marketQuote(pending.card);
    if (!quote.available) { notify(quote.reason); return; }
    setTradeError(''); setTrade(pending);
  };
  const confirmTrade = () => {
    const pending = tradeRef.current;
    if (!pending || busy.current) return;
    busy.current = true;
    try {
      if (pending.kind === 'sell' && latest.current.cards.find(c => c.uid === pending.card.uid)?.level !== pending.card.level) throw new Error('Thẻ đã thay đổi hoặc không còn trong kho. Hãy đóng và chọn lại cầu thủ.');
      const result = pending.kind === 'buy' ? buyPlayer(latest.current, pending.card.playerId, pending.card.level, UNLIMITED_COINS) : sellPlayer(latest.current, pending.card.uid, UNLIMITED_COINS);
      if (!commit(result.state)) { setTradeError('Chưa lưu được giao dịch. Hãy kiểm tra quyền lưu trữ rồi thử lại.'); return; }
      tradeRef.current = null; setTrade(null);
      if (pending.kind === 'sell') {
        setMaterialIds(ids => ids.filter(id => id !== pending.card.uid));
        if (targetId === pending.card.uid) { setTargetId(result.state.cards[0]?.uid || ''); setMaterialIds([]); }
      }
      notify(pending.kind === 'buy' ? `Đã mua ${getPlayer(result.card).name} +${result.card.level}. Thẻ đã vào kho.` : `Đã bán ${getPlayer(result.card).name} +${result.card.level}.${UNLIMITED_COINS ? ' Chế độ thử: không đổi số dư.' : ` Nhận ${money(result.quote.proceeds)} BP.`}`);
      playSound('success', latest.current.sound);
    } catch (error) { setTradeError((error as Error).message); }
    finally { busy.current = false; }
  };
  const purchasePacks = (pack: Pack, count: number) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = buyPacks(latest.current, pack, count, UNLIMITED_COINS);
      if (commit(next)) { notify(`Đã mua ${count} ${pack.name}. Gói đã được thêm vào kho vật phẩm.`); playSound('success', latest.current.sound); }
    } catch (error) { notify((error as Error).message); }
    finally { busy.current = false; }
  };
  const receiveTestPacks = () => {
    if (!UNLIMITED_COINS || busy.current) return;
    const count = getPackStock(latest.current, selectedPack);
    if (!Number.isSafeInteger(count + 10)) return;
    if (commit({ ...latest.current, unopened: { eternal: 15, stellar: 15, origin: 15, prime: 15, ...latest.current.unopened, [selectedPack.id]: count + 10 } })) notify(`Đã nhận thêm 10 ${selectedPack.name.toLowerCase()} để thử.`);
  };
  const updateSetting = (key: 'sound' | 'reduced' | 'quick' | 'light', value: boolean) => { if (commit({ ...latest.current, [key]: value }) && key === 'sound' && value) playSound('click', true); };
  useEffect(() => {
    if (!packPrepared || !readyPack || packAnimation || !autoBatch.current) return;
    autoBatch.current = false;
    if (inventoryBatch.current) { open(readyPack, 1, inventoryBatch.current); return; }
    const batch = Math.min(10, getPackStock(latest.current, readyPack));
    if (batch >= 2 && (UNLIMITED_COINS || latest.current.balance >= getPackOpeningCost(latest.current, readyPack, batch))) open(readyPack, batch);
  }, [packPrepared, readyPack]);
  const open = (pack: Pack, count: number, selection?: Pack[]) => {
    if (busy.current || !packPrepared) return;
    busy.current = true;
    try {
      const result = selection ? openSelectedPacks(latest.current, selection, undefined, UNLIMITED_COINS) : openPacks(latest.current, pack, count, undefined, UNLIMITED_COINS);
      if (!commit(result.state)) { busy.current = false; return; }
      unlockCinemaAudio(latest.current.sound);
      setPackSkipReady(false); setFlipStarted(false); setEntryStarted(false); setSceneReady(false); setPhase(0); setAnimation({ id: uid(), kind: 'pack', cards: result.cards, pack, quick: !!latest.current.quick });
    } catch (e) { notify((e as Error).message); busy.current = false; }
  };
  useEffect(() => {
    if (!packAnimation || !readyPack) return;
    const entry = OPENING_ENTRY[packAnimation.quick ? 'quick' : 'standard'];
    const flipTimer = window.setTimeout(() => setFlipStarted(true), entry.wait);
    const cameraTimer = window.setTimeout(() => setEntryStarted(true), entry.wait + (save.reduced ? 0 : entry.flip - entry.cameraLead));
    // Chuyển sang hầm 3D khi đã đi vào hết cổng phòng chờ (màn hình trắng), đúng lúc camera 3D xuyên qua vùng sáng.
    const handoffTimer = window.setTimeout(() => setReadyPack(null), entry.wait + (save.reduced ? 0 : entry.flip + GATE_CROSS[packAnimation.quick ? 'quick' : 'standard']));
    return () => { clearTimeout(flipTimer); clearTimeout(cameraTimer); clearTimeout(handoffTimer); };
  }, [packAnimation?.id, !!readyPack, save.reduced]);
  useEffect(() => {
    if (!packAnimation || readyPack || phase < 4) return;
    if (phase > 4) { setPackSkipReady(true); return; }
    const cues = OPENING_CUES[packAnimation.quick ? 'quick' : 'standard'];
    // Chờ đến giữa nhịp vị trí để chữ đã hiện rõ trước khi cho phép bỏ qua.
    const timer = window.setTimeout(() => setPackSkipReady(true), (cues[4] - cues[3]) / 2);
    return () => clearTimeout(timer);
  }, [packAnimation?.id, packAnimation?.quick, !!readyPack, phase]);
  // Kiểm thử bắt cầu: nhập tay kết quả vào dây hoặc xóa toàn bộ trạng thái cầu, không đụng tới thẻ.
  const manualBridge = (currentLevel: number, outcome: ManualOutcome) => {
    if (busy.current) return;
    try { commit({ ...latest.current, bridge: recordOutcome(latest.current.bridge ?? emptyBridge(), currentLevel, outcome, random) }); } catch (e) { notify((e as Error).message); }
  };
  const resetBridge = () => { if (!busy.current && commit({ ...latest.current, bridge: emptyBridge() })) notify('Đã reset mô phỏng bắt cầu.'); };
  const enhance = () => {
    if (busy.current || !target) return;
    busy.current = true;
    try {
      const result = upgrade(latest.current, targetId, materialIds, undefined, UNLIMITED_COINS, { role });
      if (!commit(result.state)) { busy.current = false; return; }
      setMaterialIds([]); setPhase(0); setAnimation({ id: uid(), kind: 'upgrade', card: result.result, success: result.success, before: target.level, droppedLevel: result.droppedLevel, restoredLevel: result.restoredLevel });
      playSound('charge', latest.current.sound);
    } catch (e) { notify((e as Error).message); busy.current = false; }
  };
  const hasRecovery = animation?.kind === 'upgrade' && animation.restoredLevel !== null;
  const finalPhase = animation?.kind === 'pack' ? OPENING_RESULT : hasRecovery ? 4 : 3;
  const finished = !!animation && phase >= finalPhase;
  const showingDrop = hasRecovery && phase === 3 && !finished;
  const skip = () => setPhase(finalPhase);
  const closeAnimation = () => { if (!finished) { setReadyPack(null); skip(); return; } setAnimation(null); busy.current = false; };
  const closePackSession = () => {
    if (packAnimation && !finished && !packSkipReady) return;
    if (packAnimation) closeAnimation(); else setReadyPack(null);
  };
  useEffect(() => {
    if (!animation || (animation.kind === 'pack' && !sceneReady && !save.reduced)) return;
    const started = Date.now();
    const last = finalPhase;
    // Giảm chuyển động chỉ rút ngắn màn mở gói; nâng cấp vẫn chờ đủ các mốc trước khi hiện kết quả.
    const times = animation.kind === 'pack' ? (save.reduced ? [80] : OPENING_CUES[animation.quick ? 'quick' : 'standard']) : hasRecovery ? [1600, 2800, 3700, 4800] : [1600, 2800, 3700];
    const advance = () => {
      const elapsed = Date.now() - started + 10;
      const next = animation.kind === 'pack' ? (save.reduced ? last : openingPhase(elapsed, animation.quick)) : times.filter(at => elapsed >= at).length;
      setPhase(previous => Math.max(previous, next));
    };
    const timers = times.map(at => setTimeout(advance, at));
    document.addEventListener('visibilitychange', advance);
    return () => { timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', advance); };
  }, [animation?.id, save.reduced, sceneReady]);
  useEffect(() => { if (finished && animation?.kind === 'upgrade') playSound(!animation.success ? 'fail' : 'success', latest.current.sound); }, [finished, animation?.id]);
  const sortedCards = [...save.cards].sort((a, b) => compareCards(a, b, sort));
  const filtered = sortedCards.filter(c => {
    const p = getPlayer(c);
    return p.name.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && (!position || p.pos === position) && (!season || p.tier === season) && (!level || c.level === Number(level)) && (!minOvr || ovr(c) >= Number(minOvr));
  });
  const navItems: { id: View; label: string; icon: typeof PackageOpen }[] = [{ id: 'packs', label: 'Trang chủ', icon: PackageOpen }, { id: 'upgrade', label: 'Nâng cấp thẻ', icon: Zap }, { id: 'collection', label: 'Kho cầu thủ', icon: Layers3 }, { id: 'inventory', label: 'Kho vật phẩm', icon: PackageOpen }, { id: 'history', label: 'Lịch sử', icon: History }, { id: 'market', label: 'Thị trường', icon: ArrowLeftRight }, { id: 'shop', label: 'Shop gói', icon: ShoppingBag }];
  const switchView = (next: View) => { setView(next); mainRef.current?.scrollTo({ top: 0, behavior: 'instant' }); };
  const daily = () => { try { if (commit(claimDaily(latest.current))) { notify('Điểm danh thành công! Đã nhận 1.000.000 xu.'); playSound('success', save.sound); } } catch (e) { notify((e as Error).message); } };
  const resetFilters = () => { setQuery(''); setPosition(''); setSeason(''); setLevel(''); setMinOvr(''); setSort('ovr'); };

  return <div className={`app min-h-screen antialiased ${save.reduced ? 'reduced-motion' : ''}`}>
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); switchView('packs'); }} aria-label="FCO VIP, trang chủ"><img src={asset('/assets/mark.svg')} alt=""/><span>FCO<b>VIP</b></span></a><div className="header-tag"><span className="live-dot"/>Sân chơi của những huyền thoại</div><div className="topbar-actions"><div className="wallet"><span className="coin-icon">A</span><div><small>{UNLIMITED_COINS ? 'Chế độ thử nghiệm' : 'Số dư của bạn'}</small><b>{UNLIMITED_COINS ? '∞' : money(save.balance)} <span>xu</span></b></div></div><button className={`daily-button ${dailyClaimed ? 'claimed' : ''}`} onClick={daily} disabled={dailyClaimed}><Gift size={17}/><span>{dailyClaimed ? 'Đã điểm danh' : 'Quà mỗi ngày'}</span>{!dailyClaimed && <i/>}</button><BackgroundMusic/><button className="avatar" aria-label="Cài đặt trò chơi" onClick={() => setSettings(true)}>HLV</button></div></header>
    <nav className="main-nav" aria-label="Điều hướng chính"><div className="nav-inner">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => switchView(id)} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}><Icon size={18}/><span className="nav-full">{label}</span><span className="nav-short">{id === 'packs' ? 'Trang chủ' : id === 'upgrade' ? 'Nâng cấp' : id === 'collection' ? 'Kho thẻ' : id === 'inventory' ? 'Vật phẩm' : id === 'market' ? 'Thị trường' : id === 'shop' ? 'Shop' : 'Lịch sử'}</span>{id === 'collection' && <small>{save.cards.length}</small>}</button>)}<button className="help-link" onClick={() => setHelp(true)}><Info size={16}/><span>Hướng dẫn chơi</span></button></div></nav>
    <main ref={mainRef} className={`main-content view-${view}`}>
      {view === 'packs' && <>
        <section className="hero" aria-labelledby="hero-title"><Stadium reduced={save.reduced}/><div className="hero-content"><motion.div initial={save.reduced ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }} className="hero-copy"><div className="season-label"><span/>MÙA THẺ ICON TM</div><h1 id="hero-title">Chạm tới<br/><em>huyền thoại.</em></h1><p>Một gói cầu thủ. Vạn cảm xúc.<br/> Khoảnh khắc vĩ đại tiếp theo thuộc về bạn.</p><div className="hero-price">{selectedPack.name}<span>·</span><span className="tiny-coin">A</span>{money(selectedPack.price)} xu</div><div className="hero-facts"><span><Shield size={14}/>Hoàn toàn miễn phí</span><span><Check size={14}/>Tỷ lệ minh bạch</span></div></motion.div>
          <div className="hero-cards"><div className="hero-orbit"/><div className="hero-card-back back-left"><PlayerCard card={preview(1)}/></div><div className="hero-card-back back-right"><PlayerCard card={preview(3)}/></div><motion.div className="hero-card-front" initial={save.reduced ? false : { opacity: 0, y: 40, rotateY: -25 }} animate={{ opacity: 1, y: 0, rotateY: -8 }} transition={{ duration: 1, delay: .15 }}><PlayerCard card={preview(31)}/></motion.div><div className="card-pedestal"/><div className="featured-note"><Sparkles size={13}/>Thẻ tiêu biểu · Không đảm bảo nhận được</div></div>
        </div><div className="hero-bottom"><span><span className="live-dot"/>SẴN SÀNG CHO KHOẢNH KHẮC CỦA BẠN</span><button onClick={() => switchView('inventory')}>Kho vật phẩm<ArrowRight size={14}/></button></div></section>
        <div className="below-hero home-activity">
          <aside className="activity-sidebar"><section className="journey-panel"><div className="section-heading"><h2>Hành trình của bạn</h2><Trophy size={17}/></div><div className="journey-stats"><div><strong>{save.opened}</strong><span>Gói đã mở</span></div><div><strong>{bestOwned}</strong><span>OVR cao nhất</span></div><div><strong>{save.cards.length}</strong><span>Thẻ sở hữu</span></div></div><button className="text-action" onClick={() => switchView('collection')}>Khám phá kho cầu thủ<ArrowRight size={14}/></button></section><section className="recent-panel"><div className="section-heading"><h2>Hoạt động gần đây</h2><button className="icon-button" aria-label="Xem toàn bộ lịch sử" onClick={() => switchView('history')}><ArrowRight size={16}/></button></div>{save.history.length ? <div className="recent-list">{save.history.slice(0, 3).map(e => <div className="recent-item" key={e.id}><span className={`activity-dot ${e.success === false ? 'failure' : ''}`}/><div><b>{e.title}</b><p>{historyDetail(e)}</p><time>{new Date(e.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}</div> : <div className="activity-empty"><PackageOpen size={26}/><p>Hành trình lớn bắt đầu<br/>từ gói cầu thủ đầu tiên.</p><span>Mở một gói để tạo dấu ấn của bạn.</span></div>}</section><button className="upgrade-teaser" onClick={() => switchView('upgrade')}><Zap size={21}/><span>Biến ngôi sao thành huyền thoại<small>Khám phá nâng cấp thẻ</small></span><ArrowRight size={16}/></button></aside>
        </div>
      </>}
      {view === 'upgrade' && <section className="workspace upgrade-workspace fco-upgrade">
        <div className="fco-left">
          <div className="fco-target">
            <button className="fco-target-card" onClick={() => setPicker('target')} aria-label="Chọn thẻ cầu thủ chính">{target ? <PlayerCard card={target}/> : <span className="empty-card"><Plus size={38}/>Chọn cầu thủ</span>}</button>
            <div className="fco-stats">
              <h2>{target ? getPlayer(target).name : 'Chưa chọn cầu thủ'}</h2>
              {target && (() => { // Có phôi đưa vào thì hiện thẳng giá trị của cấp kế tiếp (màu xanh); chưa có phôi thì hiện giá trị hiện tại.
                const preview = target.level < MAX_LEVEL && materials.length > 0; const shown = preview ? { ...target, level: target.level + 1 } : target; return <dl className={preview ? 'fco-preview' : ''}>
                <div><dt>Cấp thẻ</dt><dd><img className="fco-badge" src={levelBadge(shown.level)} alt={`+${shown.level}`}/></dd></div>
                <div><dt>C.Số</dt><dd><b>{ovr(shown)}</b></dd></div>
                <div><dt>Tỷ lệ thành công</dt><dd><b>{info.chance}%</b></dd></div>
                <div><dt>Phí nâng cấp</dt><dd><b>{UNLIMITED_COINS ? 'Miễn phí' : shortPrice(info.cost)}</b></dd></div>
                <div><dt>Giá</dt><dd><b className="fco-price">{shortPrice(marketQuote(shown).price)}</b></dd></div>
              </dl>; })()}
            </div>
          </div>
          <button className="fco-change" onClick={() => setPicker('target')}>Thay đổi cầu thủ<ChevronDown size={16}/></button>
          <div className="fco-row"><span>Tăng % nâng cấp</span><div className={`fco-energy ${info.energy >= 100 ? 'is-full' : ''}`} aria-label={`Năng lượng ${info.energy}%${previewEnergy > info.energy ? ` · Xem trước ${previewEnergy}%` : ''}`} style={{ '--fco-energy': info.energy, '--fco-preview-energy': previewEnergy, '--energy-duration': save.reduced ? '0s' : '.4s' } as CSSProperties}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--energy-start': (n - 1) * 20 } as CSSProperties} className={info.energy >= n * 20 ? 'full' : info.energy > (n - 1) * 20 ? 'part' : ''}><b>{n}</b></i>)}</div></div>
          <div className="fco-row fco-used"><span>Cầu thủ sử dụng</span><div className="fco-stack">{!materials.length && <span className="fco-used-blank">Chọn cầu thủ sử dụng.<br/>Bạn có thể chứa tối đa 5 CT</span>}{Array.from({ length: 5 }, (_, n) => materials[n] ? <button key={materials[n].uid} className="fco-used-card" style={{ zIndex: n + 1, '--n': n } as CSSProperties} onClick={() => setMaterialIds(ids => ids.filter(id => id !== materials[n].uid))} aria-label={`Bỏ nguyên liệu ${getPlayer(materials[n]).name}`}><PlayerCard card={materials[n]} compact/></button> : <span key={n} className="fco-used-empty" style={{ '--n': n } as CSSProperties}/>)}</div></div>
          <BridgeStatus bridge={save.bridge ?? emptyBridge()} currentLevel={target ? target.level : null} baseRate={info.chance} role={role} onRole={setRole}/>
          <p className="fco-rule"><Info size={14}/>Thất bại: rớt cấp ngẫu nhiên; phôi trùng bảo vệ cấp tối thiểu. Nguyên liệu{UNLIMITED_COINS ? '' : ' và phí'} vẫn tiêu hao.</p>
        </div>
        <div className="fco-right">
          <div className="fco-tabs"><button className="active">Cầu thủ đang sở hữu</button><span><Zap size={14}/>{save.upgrades} lần nâng cấp</span></div>
          <div className="fco-hint"><p>Tỷ lệ thành công sẽ cao hơn khi sử dụng cầu thủ có chỉ số cao.</p><strong>{materials.length}/5</strong></div>
          <div className="fco-table" role="table">
            <div className="fco-head" role="row"><span role="columnheader">Tăng</span>{([
              ['position', 'Vị trí'], ['name', 'Tên cầu thủ'], ['ovr', 'OVR'], ['level', 'Thẻ'], ['price', 'Giá'],
            ] as const).map(([key, label]) => <span key={key} className="fco-col" role="columnheader" aria-sort={matSort === `${key}-asc` ? 'ascending' : matSort === `${key}-desc` ? 'descending' : 'none'}><button className={`fco-col-btn ${matSort.startsWith(key) ? 'on' : ''}`} data-sort={key} aria-label={`Sắp xếp ${label} ${matSort === `${key}-asc` ? 'giảm dần' : 'tăng dần'}`} onClick={() => setMatSort(current => current === `${key}-asc` ? `${key}-desc` : `${key}-asc`)}>{label}<ChevronDown size={12}/></button></span>)}<span role="columnheader"/></div>
            <div className="fco-body" role="rowgroup" aria-label="Chọn cầu thủ làm phôi nâng cấp" tabIndex={0} key={`${matSort}-${targetId}`}>{save.cards.filter(c => c.uid !== targetId).sort((a, b) => { const [key, dir] = matSort.split('-'); const comparison = key === 'name' ? getPlayer(a).name.localeCompare(getPlayer(b).name, 'vi') : key === 'position' ? getPlayer(a).pos.localeCompare(getPlayer(b).pos, 'en') : key === 'price' ? compareMarketPrices(a, b, dir === 'desc') : key === 'level' ? a.level - b.level : ovr(a) - ovr(b); return (key === 'price' || dir === 'asc' ? 1 : -1) * comparison || ovr(b) - ovr(a) || b.level - a.level; }).map(c => { const p = getPlayer(c); const picked = materialIds.includes(c.uid); const full = !picked && materialIds.length >= 5; const boost = target ? upgradeInfo(target, [c]).energy : 0; return <button key={c.uid} role="row" className={`fco-line ${picked ? 'picked' : ''}`} disabled={!target || full} onMouseEnter={() => setHoveredMaterialId(!picked && !full ? c.uid : '')} onMouseLeave={() => setHoveredMaterialId('')} onFocus={() => setHoveredMaterialId(!picked && !full ? c.uid : '')} onBlur={() => setHoveredMaterialId('')} onClick={() => { setHoveredMaterialId(''); setMaterialIds(ids => picked ? ids.filter(id => id !== c.uid) : [...ids, c.uid]); }}>
              <span className="fco-boost" aria-label={`Tăng ${boost}% năng lượng`} title={`${boost}% năng lượng · ${Number((boost / 20).toFixed(3))} vạch`}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--energy-fill': `${Math.min(100, Math.max(0, boost - (n - 1) * 20) * 5)}%` } as CSSProperties} className={boost >= n * 20 ? 'on' : boost > (n - 1) * 20 ? 'part' : ''}/>)}</span>
              <span className={`fco-pos pos-${posGroup(p.pos)}`}>{p.pos}</span>
              <span className="fco-name">{p.cardFace ? <img src={p.cardFace} alt=""/> : <Flag code={p.flag}/>}<b>{p.name}</b></span>
              <span className="fco-ovr">{ovr(c)}</span>
              <span><img className="fco-badge" src={levelBadge(c.level)} alt={`+${c.level}`}/></span>
              <span className="fco-cost">{shortPrice(marketQuote(c).price)}</span>
              <span className="fco-check">{picked && <Check size={18}/>}</span>
            </button>; })}{save.cards.length <= 1 ? <p className="fine-print">Kho chưa có thẻ nào để làm nguyên liệu.</p> : null}</div>
          </div>
          <div className="fco-actions"><button className="fco-ghost" onClick={() => setMaterialIds([])} disabled={!materials.length}><X size={15}/>Bỏ chọn</button><button className="fco-ghost" onClick={() => setBridgeLab(true)}><Settings2 size={15}/>Kiểm thử cầu</button><button className="fco-ghost" onClick={() => setHelp(true)}><Info size={15}/>Hướng dẫn</button><button className="fco-go" onClick={enhance} disabled={!target || !materials.length || (!UNLIMITED_COINS && save.balance < info.cost) || target.level >= MAX_LEVEL}>{target?.level === MAX_LEVEL ? 'Đã đạt cấp tối đa' : 'Nâng cấp'}<ArrowRight size={18}/></button></div>
        </div>
      </section>}
      {view === 'collection' && <section className="workspace"><div className="page-heading"><div><h1>Kho cầu thủ</h1><p>{save.cards.length} thẻ trong bộ sưu tập · {new Set(save.cards.map(c => c.playerId)).size}/{players.length} cầu thủ đã khám phá</p></div><button className="primary-button" onClick={() => switchView('inventory')}><Plus size={17}/>Mở thêm cầu thủ</button></div><div className={`collection-toolbar${collectionFiltersOpen ? ' filters-open' : ''}`}><div className="search-field"><Search size={17}/><input aria-label="Tìm cầu thủ theo tên" placeholder="Tìm tên cầu thủ…" value={query} onChange={e => setQuery(e.target.value)}/></div><button className="collection-filter-toggle" aria-expanded={collectionFiltersOpen} onClick={() => setCollectionFiltersOpen(open => !open)}>Bộ lọc<ChevronDown size={15}/></button><label className="sr-only" htmlFor="position">Vị trí</label><select id="position" value={position} onChange={e => setPosition(e.target.value)}><option value="">Mọi vị trí</option>{[...new Set(players.map(p => p.pos))].map(pos => <option key={pos}>{pos}</option>)}</select><label className="sr-only" htmlFor="season">Mùa giải</label><select id="season" value={season} onChange={e => setSeason(e.target.value)}><option value="">Mọi mùa giải</option>{Object.entries(seasons).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select><label className="sr-only" htmlFor="level">Cấp cộng</label><select id="level" value={level} onChange={e => setLevel(e.target.value)}><option value="">Mọi cấp cộng</option>{Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select><input className="ovr-filter" aria-label="OVR tối thiểu" type="number" min="80" max={Math.max(...players.map(p => ovr({ uid: "", playerId: p.id, level: MAX_LEVEL, received: 0 })))} placeholder="OVR từ…" value={minOvr} onChange={e => setMinOvr(e.target.value)}/><CardSortSelect id="sort" value={sort} onChange={setSort}/></div><div className="collection-count"><span>Hiển thị {filtered.length} thẻ</span><button className="text-action" onClick={resetFilters}>Đặt lại bộ lọc</button></div>{filtered.length ? <ViewportPages className="collection-grid" itemWidth={165} itemHeight={210} gap={12} resetKey={`${query}-${position}-${season}-${level}-${minOvr}-${sort}`}>{filtered.map(c => <button className="collection-card" key={c.uid} onClick={() => setDetail(c)}><div className="collection-card-art"><PlayerCard card={c} compact/></div><span className="collection-card-action"><Maximize2 size={13}/>Chi tiết thẻ</span></button>)}</ViewportPages> : <div className="empty-state"><Search size={34}/><h2>Chưa tìm thấy cầu thủ</h2><p>Thử tên khác hoặc đặt lại bộ lọc để xem bộ sưu tập.</p><button className="secondary-button" onClick={resetFilters}>Đặt lại bộ lọc</button></div>}</section>}
      {view === 'shop' && <PackShop save={save} packs={packs} free={UNLIMITED_COINS} onBuy={purchasePacks} onInventory={() => switchView('inventory')} renderArt={pack => <PackArt pack={pack}/>}/>}
      {view === 'inventory' && <Inventory save={save} packs={packs} onUse={prepareOpening} onShop={() => switchView('shop')} onUseSelected={selection => selection[0] && prepareOpening(selection[0], selection)} renderArt={pack => <PackArt pack={pack}/>} testMode={UNLIMITED_COINS} onReceiveTest={receiveTestPacks}/>}
      {view === 'market' && <TransferMarket save={save} free={UNLIMITED_COINS} onTrade={requestTrade} onHistory={() => { setHistoryType('market'); switchView('history'); }} onOpenPacks={() => switchView('inventory')} renderCard={card => <PlayerCard card={card}/>}/>}
      {view === 'history' && <section className="workspace history-workspace"><div className="page-heading"><div><h1>Dấu ấn hành trình</h1><p>Lưu tối đa 200 hoạt động gần nhất trên trình duyệt này.</p></div><select aria-label="Lọc loại lịch sử" value={historyType} onChange={e => setHistoryType(e.target.value)}><option value="">Tất cả hoạt động</option><option value="pack">Mở gói</option><option value="upgrade">Nâng cấp</option><option value="gift">Điểm danh</option><option value="market">Chuyển nhượng</option><option value="shop">Mua gói</option></select></div>{save.history.filter(e => !historyType || e.type === historyType).length ? <ViewportPages className="history-list" itemHeight={92} resetKey={historyType}>{save.history.filter(e => !historyType || e.type === historyType).map(e => <article className="history-item" key={e.id}><div className={`history-icon ${e.success === false ? 'failure' : ''}`}>{e.type === 'pack' ? <PackageOpen size={21}/> : e.type === 'gift' ? <Gift size={21}/> : e.type === 'market' ? <ArrowLeftRight size={21}/> : e.type === 'shop' ? <ShoppingBag size={21}/> : <Zap size={21}/>}</div><div><h2>{e.title}</h2><p>{historyDetail(e)}</p></div><time>{new Date(e.time).toLocaleString('vi-VN')}</time></article>)}</ViewportPages> : <div className="empty-state"><History size={38}/><h2>Trang sử đang chờ bạn</h2><p>Mở gói, nâng cấp hoặc nhận quà điểm danh để bắt đầu.</p><button className="primary-button" onClick={() => switchView('inventory')}>Kho vật phẩm<ArrowRight size={16}/></button></div>}</section>}
    </main>
    <footer><div><img src={asset('/assets/mark.svg')} alt=""/><span>Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.</span></div><span>Không tiền thật<button onClick={() => setHelp(true)}>Thông tin & nguồn ảnh</button><button aria-label="Mở cài đặt" onClick={() => setSettings(true)}><Settings2 size={15}/></button></span></footer>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Info size={18}/><span>{toast}</span><button className="icon-button" aria-label="Đóng thông báo" onClick={() => setToast('')}><X size={15}/></button></motion.div>}</AnimatePresence>
    <AnimatePresence>
      {trade && <Modal className="market-confirm" label={trade.kind === 'buy' ? 'Xác nhận mua cầu thủ' : 'Xác nhận bán cầu thủ'} onClose={() => setTrade(null)}>
        <div className="modal-heading"><h2>{trade.kind === 'buy' ? 'Xác nhận mua cầu thủ' : 'Xác nhận bán cầu thủ'}</h2><button className="icon-button" aria-label="Đóng xác nhận giao dịch" onClick={() => setTrade(null)}><X/></button></div>
        <div className="trade-player"><img src={getPlayer(trade.card).cardFace || asset('/assets/silhouette.svg')} alt=""/><div><h3>{getPlayer(trade.card).name}</h3><p>{getPlayer(trade.card).pos} · {seasons[getPlayer(trade.card).tier]} · +{trade.card.level} · OVR {ovr(trade.card)}</p></div></div>
        <dl className="trade-breakdown"><div><dt>Giá thẻ</dt><dd>{formatMarketPrice(marketQuote(trade.card).price)}</dd></div>{trade.kind === 'sell' && <div><dt>Phí bán {MARKET_FEE_PERCENT}%</dt><dd>−{formatMarketPrice(marketQuote(trade.card).fee)}</dd></div>}<div className="market-total"><dt>{trade.kind === 'buy' ? 'Thanh toán' : 'Bạn nhận'}</dt><dd>{formatMarketPrice(trade.kind === 'buy' ? marketQuote(trade.card).price : marketQuote(trade.card).proceeds)}</dd></div></dl>
        <p className="trade-note">{UNLIMITED_COINS ? 'Chế độ thử: số dư xu được giữ nguyên. ' : ''}{trade.kind === 'buy' ? 'Nhận 1 thẻ đúng cấp cộng đã chọn vào kho cầu thủ.' : 'Bán 1 thẻ đã chọn. Thẻ sẽ được chuyển khỏi kho cầu thủ.'}</p>
        {tradeError && <p className="trade-error" role="alert">{tradeError}</p>}
        <div className="trade-actions"><button className="secondary-button" onClick={() => setTrade(null)}>Hủy</button><button className="market-primary confirm-trade" onClick={confirmTrade} disabled={!marketQuote(trade.card).available || (trade.kind === 'buy' && !UNLIMITED_COINS && save.balance < (marketQuote(trade.card).price ?? Infinity))}>Xác nhận {trade.kind === 'buy' ? 'mua' : 'bán'}<Check size={17}/></button></div>
      </Modal>}
      {odds && <Modal label={`Tỷ lệ ${odds.name}`} onClose={() => setOdds(null)}><div className="modal-heading"><h2>{odds.name}</h2><button className="icon-button" onClick={() => setOdds(null)} aria-label="Đóng bảng tỷ lệ"><X/></button></div><p className="modal-description">{isPackAvailable(odds) ? `Mỗi gói nhận đúng 1 thẻ +1. Giá ${money(odds.price)} xu.` : 'Gói chưa có cầu thủ. Tính năng mở gói sẽ được bật sau khi cập nhật danh sách.'}</p><div className="odds-table">{TIERS.map((tier, i) => { const pool = players.filter(p => p.tier === tier); return <div key={tier}><span className={`rarity-dot ${tier}`}/><div><b>{seasons[tier]}</b><small>OVR {pool.length ? `${Math.min(...pool.map(p => p.ovr))}–${Math.max(...pool.map(p => p.ovr))}` : 'Chưa cập nhật'} · {pool.length} cầu thủ</small></div><strong>{odds.weights[i]}%</strong></div>; })}</div><p className="fine-print">Mỗi cầu thủ trong cùng mùa có xác suất bằng nhau: tỷ lệ mùa ÷ số cầu thủ hiện có trong mùa. Mở 10 gói là 10 lượt độc lập, không có bảo đảm thẻ hiếm. Đây là tỷ lệ của trò chơi giả lập, không phải tỷ lệ chính thức của FC Online.</p><h3 className="reward-list-title">Danh sách phần thưởng</h3><div className="reward-list">{players.filter(p => odds.weights[TIERS.indexOf(p.tier)] > 0).map(p => <div key={p.id}><span>{p.name}<small>{seasons[p.tier]}</small></span><b>{p.ovr}</b></div>)}</div><button className="primary-button modal-bottom-button" onClick={() => { setSelectedPack(odds); setOdds(null); }}>Chọn gói này<Check size={17}/></button></Modal>}
      {settings && <Modal label="Cài đặt trò chơi" onClose={() => setSettings(false)}><div className="modal-heading"><h2>Cài đặt trò chơi</h2><button className="icon-button" aria-label="Đóng cài đặt" onClick={() => setSettings(false)}><X/></button></div>{([{ key: 'sound' as const, title: 'Âm thanh', description: AUDIO_ENABLED ? 'Âm thanh điện tử khi mở gói và nâng cấp.' : 'Âm thanh đã tắt trong phiên bản này.' }, { key: 'reduced' as const, title: 'Giảm chuyển động', description: 'Bỏ hoạt cảnh dài, khói và hạt sáng chuyển động.' }, { key: 'quick' as const, title: 'Mở thẻ nhanh', description: 'Rút hoạt cảnh từ khoảng 10 giây xuống 3,5 giây.' }, { key: 'light' as const, title: 'Hiệu ứng nhẹ', description: 'Dùng đường hầm 2D nhẹ, phù hợp khi máy nóng hoặc hình chuyển động chậm.' }]).map(s => <label className="setting-row" key={s.key}><span><b>{s.title}</b><small>{s.description}</small></span><input type="checkbox" disabled={s.key === 'sound' && !AUDIO_ENABLED} checked={s.key === 'sound' ? AUDIO_ENABLED && !!save.sound : !!save[s.key]} onChange={e => updateSetting(s.key, e.target.checked)}/></label>)}<div className="storage-notice"><Shield size={20}/><p>Tiến trình được lưu trên trình duyệt này. Xóa dữ liệu trang sẽ xóa kho thẻ. Không cần đăng nhập và không có thanh toán bằng tiền thật.</p></div></Modal>}
      {bridgeLab && <Modal label="Kiểm thử bắt cầu" onClose={() => setBridgeLab(false)}><BridgeLab bridge={save.bridge ?? emptyBridge()} onManual={manualBridge} onReset={resetBridge} onClose={() => setBridgeLab(false)}/></Modal>}
      {help && <Modal label="Hướng dẫn và thông tin" onClose={() => setHelp(false)}><div className="modal-heading"><h2>Chơi theo cách của bạn</h2><button className="icon-button" aria-label="Đóng hướng dẫn" onClick={() => setHelp(false)}><X/></button></div><div className="help-content"><h3>Mở gói cầu thủ</h3><p>Bắt đầu với 15.000.000 xu và 2 thẻ tặng sẵn. Mỗi loại có sẵn 15 gói chưa mở để thử. Vào Kho vật phẩm, nhấn Dùng trên gói muốn mở, rồi nhấn Mở 1 vật phẩm hoặc mở tất cả số còn lại, tối đa 10 thẻ mỗi lượt. Mở bao nhiêu trừ bấy nhiêu gói; có thể nhận thêm 10 gói thử ở bên ngoài. Kết quả được tính theo tỷ lệ công bố và lưu trước khi hoạt cảnh bắt đầu. Bỏ qua không thay đổi kết quả.</p><h3>Nâng cấp thẻ</h3><p>Chọn thẻ chính và 1–5 nguyên liệu từ kho. Một vạch tương ứng 20% năng lượng. Với nguyên liệu bằng OVR hiện tại của thẻ chính: OVR từ 125 trở lên được 1 vạch; OVR 124 được 1,25 vạch; OVR 123 được 1,5 vạch. Mỗi OVR thấp hơn 125 tăng thêm 0,25 vạch. Phôi thấp OVR hơn thẻ chính bị giảm năng lượng theo tỷ lệ: mỗi OVR thấp hơn giảm khoảng 20,5%; thấp hơn 7 OVR còn 1/5 mức cùng OVR. Ví dụ phôi 122 đập thẻ 129 được 4% năng lượng (0,2 vạch). Phôi cao hơn thẻ chính được cộng 1,2 điểm phần trăm mỗi OVR. Năng lượng từng phôi làm tròn đến 0,1%, tối đa 100%. Thẻ trùng cầu thủ áp dụng cùng quy tắc. Tổng tối đa 5 vạch (100%).</p><p>Năng lượng nguyên liệu ảnh hưởng đến cơ hội nâng cấp. Phí = cấp cộng hiện tại × 100.000 xu.</p><div className="upgrade-rate-table">{UPGRADE_LEVELS.slice(1).map((rule, i) => <span key={i}><b>+{i + 1} → +{i + 2}</b>OVR +{rule.ovrGain}</span>)}</div><p>Thành công: tăng 1 cấp cộng; OVR tăng thêm theo bảng trên và cộng dồn từ cấp +1. Thất bại: thẻ rớt ngẫu nhiên xuống một cấp thấp hơn, tối thiểu +1. Nếu có phôi cùng cầu thủ, cấp cuối không thấp hơn cấp phôi trùng cao nhất: rớt thấp hơn thì tự phục hồi lên cấp phôi; rớt bằng hoặc cao hơn thì giữ cấp rớt. Mọi kết quả đều tiêu hao nguyên liệu và phí, trừ phí xu trong chế độ thử. Cấp tối đa +{MAX_LEVEL}.</p><h3>Thị trường chuyển nhượng</h3><p>Mua cầu thủ từ danh sách hoặc bán từng thẻ trong kho. Chọn đúng cấp thẻ trước khi xác nhận. Giá mô phỏng cố định theo OVR gốc và cấp thẻ; phí bán 5%, số xu thực nhận hiển thị trước khi bán. Thẻ và lịch sử được lưu ngay trên trình duyệt. Khi bật xu vô hạn, mua/bán không thay đổi số dư. Đây là thị trường với hệ thống trong game, không kết nối người chơi khác.</p><h3>Quà mỗi ngày</h3><p>Nhận 1.000.000 xu mỗi ngày theo giờ Việt Nam (UTC+7). Ngày mới bắt đầu lúc 00:00. Không có mua xu bằng tiền thật.</p><h3>Dữ liệu và nguồn ảnh</h3><p>{players.length} cầu thủ mẫu, mùa giải và chỉ số do dự án đặt cho trải nghiệm giả lập. Tên CLB minh họa giai đoạn sự nghiệp, không đại diện đội hình hiện tại. Khung thẻ, huy hiệu, hình đại diện và sân vận động được thiết kế riêng.</p><p>Ảnh <a href="https://commons.wikimedia.org/wiki/File:Lionel_Messi_WC2022.jpg" target="_blank" rel="noreferrer">Lionel Messi WC2022</a> — Hossein Zohrevand / Tasnim News Agency, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Ảnh được cắt và áp dụng mặt nạ hiển thị; phần ảnh biến đổi theo giấy phép gốc. Cầu thủ chưa có ảnh dùng hình đại diện do dự án vẽ.</p><p>Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.</p></div></Modal>}
      {detail && <Modal className="detail-modal" label="Chi tiết cầu thủ" onClose={() => setDetail(null)}><div className="modal-heading"><h2>Chi tiết cầu thủ</h2><button className="icon-button" aria-label="Đóng chi tiết" onClick={() => setDetail(null)}><X/></button></div><div className="detail-card"><PlayerCard card={detail}/></div><div className="detail-data"><span>Quốc tịch<b><Flag code={getPlayer(detail).flag}/>{getPlayer(detail).nation}</b></span><span>{['eternal', 'prime'].includes(getPlayer(detail).tier) ? 'Đội tuyển' : 'CLB minh họa'}<b>{['eternal', 'prime'].includes(getPlayer(detail).tier) ? getPlayer(detail).nation : getPlayer(detail).club}</b></span><span>Mùa giải<b>{seasons[getPlayer(detail).tier]}</b></span><span>Cấp cộng<b>+{detail.level} / +{MAX_LEVEL}</b></span></div><button className="primary-button" disabled={detail.level >= MAX_LEVEL} onClick={() => { setTargetId(detail.uid); setMaterialIds([]); setDetail(null); switchView('upgrade'); }}><Zap size={18}/>Nâng cấp cầu thủ này</button></Modal>}
      {picker && <Modal className="picker-modal" label={picker === 'target' ? 'Chọn thẻ chính' : 'Chọn nguyên liệu'} onClose={() => setPicker(null)}><div className="modal-heading"><h2>{picker === 'target' ? 'Chọn thẻ chính' : `Chọn nguyên liệu (${materialIds.length}/5)`}</h2><button className="icon-button" aria-label="Đóng chọn cầu thủ" onClick={() => setPicker(null)}><X/></button></div><p className="modal-description">{picker === 'target' ? `Chọn thẻ dưới +${MAX_LEVEL} để bắt đầu nâng cấp.` : 'Thẻ đã chọn sẽ bị tiêu hao. Năng lượng tính theo OVR hiện tại, kể cả khi trùng cầu thủ.'}</p><CardSortSelect id="picker-sort" value={sort} onChange={setSort}/><ViewportPages className="picker-list" itemHeight={58} resetKey={`${picker}-${sort}`}>{sortedCards.filter(c => picker === 'target' ? c.level < MAX_LEVEL : c.uid !== targetId).map(c => <button className={`picker-row ${materialIds.includes(c.uid) && picker === 'material' ? 'selected' : ''}`} key={c.uid} disabled={picker === 'material' && materialIds.length >= 5 && !materialIds.includes(c.uid)} onClick={() => { if (picker === 'target') { setTargetId(c.uid); setMaterialIds([]); setPicker(null); } else setMaterialIds(ids => ids.includes(c.uid) ? ids.filter(id => id !== c.uid) : [...ids, c.uid]); }}><span className={`picker-ovr ${getPlayer(c).tier}`}>{ovr(c)}</span><span className="picker-name"><b>{getPlayer(c).name}</b><small>{getPlayer(c).pos} · {seasons[getPlayer(c).tier]} · +{c.level}</small></span>{picker === 'material' ? <span className="picker-check">{materialIds.includes(c.uid) && <Check size={16}/>}</span> : <ChevronRight size={17}/>}</button>)}{!save.cards.filter(c => picker === 'target' ? c.level < MAX_LEVEL : c.uid !== targetId).length && <p className="fine-print">Chưa có thẻ phù hợp. Hãy mở thêm gói cầu thủ.</p>}</ViewportPages>{picker === 'material' && <button className="primary-button modal-bottom-button" onClick={() => setPicker(null)}>Xác nhận {materialIds.length} nguyên liệu<Check size={18}/></button>}</Modal>}
      {(readyPack || packAnimation) && <Modal key="pack-session" className={`cinema-modal ${readyPack ? 'pack-ready-modal' : finished ? 'is-finished' : ''} ${flipping ? 'is-flipping' : ''}`} label={readyPack ? 'Chuẩn bị mở thẻ' : 'Mở gói cầu thủ'} onClose={closePackSession} onSkip={packAnimation && !finished && packSkipReady ? closeAnimation : undefined}>
        <PackStage preparationId={preparationId} pack={(readyPack || packAnimation!.pack)} cards={packAnimation?.cards} phase={phase} playing={!!packAnimation && (!readyPack || entryStarted)} quick={packAnimation?.quick ?? !!save.quick} reduced={save.reduced} light={!!save.light} onPrepared={() => setPackPrepared(true)} onReady={() => setSceneReady(true)}/>
        {readyPack ? <div className={`ready-screen ${save.reduced ? 'flip-reduced' : ''}`} style={{ '--flip-duration': `${OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip / 1000}s`, '--tunnel-delay': `${Math.max(0, (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip - OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].cameraLead - 260) / 1000)}s`, '--glitch-delay': `${OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .74 / 1000}s`, '--glitch-duration': `${(OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) / 1000}s`, '--dive-at': `${(OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch - (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) * .25) / 1000}s`, '--dive-duration': `${(GATE_CROSS[packAnimation?.quick ? 'quick' : 'standard'] - OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch + (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) * .25) / 1000}s` } as CSSProperties}>
          <Stadium cinematic reduced={save.reduced}/>
          <div className="ready-tunnel" aria-hidden="true">
            <svg className="rt-shell" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="rtBg" x2="0" y2="1"><stop stopColor="#2b2d30"/><stop offset="1" stopColor="#141518"/></linearGradient>
                <linearGradient id="rtWallL" x2="1"><stop stopColor="#0f6f61"/><stop offset=".35" stopColor="#19e0b0"/><stop offset=".75" stopColor="#0b3d3a"/><stop offset="1" stopColor="#0a1517"/></linearGradient>
                <linearGradient id="rtWallR" x1="1" x2="0"><stop stopColor="#0f6f61"/><stop offset=".35" stopColor="#19e0b0"/><stop offset=".75" stopColor="#0b3d3a"/><stop offset="1" stopColor="#0a1517"/></linearGradient>
                <linearGradient id="rtCeil" x2="0" y2="1"><stop stopColor="#0d4f49"/><stop offset="1" stopColor="#0b1a1d"/></linearGradient>
                <linearGradient id="rtFloor" x2="0" y2="1"><stop stopColor="#1d2125"/><stop offset="1" stopColor="#30343a"/></linearGradient>
                <linearGradient id="rtDoor" x2="0" y2="1"><stop stopColor="#0c1114"/><stop offset=".6" stopColor="#141a1e"/><stop offset="1" stopColor="#262b30"/></linearGradient>
                <pattern id="rtGrid" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><path d="M1.2 0H0V1.2" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth=".12"/></pattern>
              </defs>
              <rect width="100" height="100" fill="url(#rtBg)"/>
              <polygon points="7,14 93,14 61,33 39,33" fill="url(#rtCeil)"/>
              <polygon points="6,80 39,66 61,66 94,80 100,100 0,100" fill="url(#rtFloor)"/>
              <polygon points="7,14 39,33 39,66 6,80" fill="url(#rtWallL)"/>
              <polygon points="93,14 61,33 61,66 94,80" fill="url(#rtWallR)"/>
              <polygon points="7,14 39,33 39,66 6,80" fill="url(#rtGrid)"/>
              <polygon points="93,14 61,33 61,66 94,80" fill="url(#rtGrid)"/>
              <rect x="39" y="33" width="22" height="33" fill="#0d1416"/>
              <rect x="41.4" y="36" width="17.2" height="30" fill="url(#rtDoor)"/>
              <g className="rt-neon" fill="none">
                <polyline points="5.5,90 6.6,12.5 93.4,12.5 94.5,90"/>
                <polyline points="7,86 7.9,15.5 92.1,15.5 93,86"/>
                <rect x="39.6" y="33.6" width="20.8" height="32.4"/>
                <rect x="41.4" y="36" width="17.2" height="30"/>
                <line x1="41.4" y1="66" x2="21" y2="100"/><line x1="58.6" y1="66" x2="79" y2="100"/>
              </g>
            </svg>
            {flipping && !save.reduced && <span className="rt-gate-light"/>}
            {(['left', 'right'] as const).map(side => <div key={side} className={`rt-led rt-led-${side}`}><img src={asset('/assets/mark.svg')} alt=""/><b>FCO VIP</b></div>)}
            {(['left', 'right'] as const).map(side => <span key={side} className={`rt-slogan rt-slogan-${side}`}>Mọi huyền thoại bắt đầu từ đây</span>)}
          </div>
          <div className="ready-header"><h2 className="ready-title">{readyPack.name} đang mở</h2>{!packAnimation && <button className="ready-close" onClick={closePackSession} aria-label={flipping ? 'Bỏ qua' : 'Đóng'} aria-keyshortcuts={flipping ? "Space" : undefined} title={flipping ? "Bỏ qua (phím cách)" : 'Đóng'}>{flipping && <span>Bỏ qua</span>}<X size={34} strokeWidth={2.4}/></button>}</div>
          <div className="ready-count"><span>Số gói sở hữu</span><b>SL:{readyAvailable}</b></div>
          <div className="ready-content">
            <div className="ready-art"><div className={`ready-flip ${readyPack.back ? 'tm-flip' : ''}`} style={readyPack.back ? { '--tm-mask': `url("${readyPack.back}")` } as CSSProperties : undefined} aria-hidden="true"><div className="flip-face flip-front"><PackArt pack={readyPack}/></div><div className="flip-face flip-back"><img src={asset('/assets/mark.svg')} alt=""/><span>FCO VIP</span><strong>{readyPack.short}</strong><i>VINH QUANG ĐANG CHỜ</i></div>{flipping && !save.reduced && <div className="ready-glitch" aria-hidden="true"><i/></div>}</div><span className="ready-art-halo"/></div>
            <div className="ready-actions" style={{ visibility: packAnimation ? 'hidden' : undefined }} aria-hidden={!!packAnimation} inert={!!packAnimation}>
              <button className="ready-open ready-open-one" onClick={() => open(readyPack, 1)} disabled={!packPrepared || !!animation || readyAvailable < 1 || (!UNLIMITED_COINS && save.balance < getPackOpeningCost(save, readyPack, 1))}>Mở 1 vật phẩm</button>
              <button className="ready-open ready-open-batch" onClick={() => open(readyPack, readyBatch)} disabled={!packPrepared || !!animation || readyBatch < 2 || (!UNLIMITED_COINS && save.balance < getPackOpeningCost(save, readyPack, readyBatch))}>{readyBatch > 0 ? `Mở ${readyBatch} vật phẩm` : 'Hết vật phẩm'}</button>
              <button className="ready-leave" onClick={closePackSession}>Rời<X size={18} strokeWidth={2.6}/></button>
            </div>
            <p className="ready-note" aria-live="polite"><Shield size={13}/>{packAnimation && !flipStarted ? 'Đang chuẩn bị mở…' : !packPrepared ? 'Đang chuẩn bị sân khấu…' : readyAvailable === 0 ? 'Đã hết gói. Quay lại để nhận thêm gói thử.' : readyAvailable === 1 ? 'Còn 1 gói. Nhấn Mở 1 vật phẩm để mở gói cuối cùng.' : inventoryBatch.current ? 'Mỗi lượt tối đa 150 thẻ · Mở bao nhiêu, trừ bấy nhiêu.' : 'Mỗi lượt tối đa 10 thẻ · Mở bao nhiêu, trừ bấy nhiêu.'}</p>
            <p className="ready-cost">{UNLIMITED_COINS ? 'Xu vô hạn · Miễn phí thử' : readyBatch > 1 ? `Mở 1: ${money(getPackOpeningCost(save, readyPack, 1))} xu · Mở ${readyBatch}: ${money(getPackOpeningCost(save, readyPack, readyBatch))} xu` : getPackOpeningCost(save, readyPack, 1) === 0 ? 'Gói đã thanh toán · Không thu thêm phí mở' : `Phí mở 1 gói có sẵn: ${money(readyPack.price)} xu`}</p>
          </div>
          
        </div> : packAnimation && <PackOpening key={packAnimation.id} canSkip={packSkipReady} cards={packAnimation.cards} pack={packAnimation.pack} phase={phase} quick={packAnimation.quick} reduced={save.reduced} light={!!save.light} sound={save.sound} sceneReady={sceneReady || packPrepared} onSound={() => { unlockCinemaAudio(!save.sound); updateSetting('sound', !save.sound); }} onLight={() => updateSetting('light', !save.light)} onClose={closeAnimation} onAgain={() => { busy.current = false; setAnimation(null); prepareOpening(packAnimation.pack); }} onAgainMany={() => { busy.current = false; setAnimation(null); prepareOpening(packAnimation.pack); autoBatch.current = true; }} onSave={() => { closeAnimation(); switchView('collection'); }} onTrade={() => { closeAnimation(); switchView('market'); }} stock={getPackStock(save, packAnimation.pack)} renderCard={(card, compact) => <PlayerCard card={card} compact={compact}/>} renderFlag={(code, large) => <Flag code={code} large={large}/>} />}
      </Modal>}
      {animation?.kind === 'upgrade' && <Modal className={`cinema-modal ${finished ? 'is-finished' : ''} ${!animation.success && finished ? 'is-failure' : ''}`} label="Kết quả nâng cấp" onClose={closeAnimation} onSkip={!finished ? closeAnimation : undefined}><Stadium cinematic reduced={save.reduced}/><div className="cinema-top"><span><img src={asset('/assets/mark.svg')} alt=""/>FCO VIP</span><button className="secondary-button" onClick={closeAnimation} aria-keyshortcuts={!finished ? "Space" : undefined} title={!finished ? "Bỏ qua (phím cách)" : undefined}>{finished ? 'Đóng' : 'Bỏ qua'}{finished ? <X size={16}/> : <ChevronRight size={16}/>}</button></div>
        <div className={`upgrade-cinema upgrade-phase-${phase} ${finished || showingDrop ? (animation.success ? 'success' : 'failed') : 'is-pending'}`}><div className="upgrade-energy-ring"/>{!finished && <div className="material-dissolve">{Array.from({ length: 20 }, (_, i) => <i key={i} style={{ '--angle': `${i * 18}deg`, '--delay': `${i % 7 * .13}s` } as CSSProperties}/>)}</div>}{finished && animation.success && <div className="reveal-burst"/>}<motion.div animate={!save.reduced && phase === 1 ? { x: [-3, 4, -6, 4, -3, 0] } : { x: 0 }} transition={{ repeat: phase === 1 ? Infinity : 0, duration: .18 }} className="upgrade-reveal-card"><PlayerCard card={finished ? animation.card : { ...animation.card, level: showingDrop ? animation.droppedLevel! : animation.before }}/></motion.div><div className="upgrade-result-copy" aria-live="polite">{showingDrop ? <><span className="result-season">ĐANG PHỤC HỒI BẰNG PHÔI TRÙNG</span><h2>Thẻ rớt về +{animation.droppedLevel}</h2><p>Phôi cùng cầu thủ sẽ phục hồi thẻ lên +{animation.restoredLevel}.</p></> : finished ? <><span className="result-season">{animation.success ? 'VƯỢT QUA GIỚI HẠN' : hasRecovery ? 'ĐÃ PHỤC HỒI BẰNG PHÔI TRÙNG' : 'CHƯA THỂ BỨT PHÁ'}</span><h2>{animation.success ? 'Nâng cấp thành công!' : 'Nâng cấp thất bại'}</h2><div className="result-level">+{animation.before}<ArrowRight size={22}/>{hasRecovery && <><span>+{animation.droppedLevel}</span><ArrowRight size={22}/></>}<b>+{animation.card.level}</b></div><p>{animation.success ? 'Cấp cộng mới đã được lưu. Ngôi sao của bạn vừa tỏa sáng hơn.' : ((hasRecovery ? `Thẻ rớt về +${animation.droppedLevel} và được phục hồi lên +${animation.restoredLevel} bằng phôi cùng cầu thủ. ` : `Thẻ rớt về +${animation.card.level}. `) + (UNLIMITED_COINS ? 'Nguyên liệu đã tiêu hao; không trừ xu trong chế độ thử.' : 'Nguyên liệu và phí đã tiêu hao.'))}</p><small>Kết quả đã được lưu vào lịch sử</small><button className="primary-button" onClick={closeAnimation}>Trở về lò luyện<ArrowRight size={17}/></button></> : <><h2>{phase === 0 ? 'Năng lượng đang hội tụ…' : phase === 1 ? 'Vượt qua giới hạn…' : 'Khoảnh khắc quyết định.'}</h2><p>{phase === 2 ? 'Hít thở. Và chờ điều kỳ diệu.' : 'Những ngôi sao đang tiếp thêm sức mạnh.'}</p></>}</div></div>
      </Modal>}
    </AnimatePresence>
  </div>;
}
