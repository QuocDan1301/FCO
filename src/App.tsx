import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowBigUp, ArrowLeftRight, ArrowRight, Bell, Check, CircleHelp, CirclePlus, House, ShieldPlus, ChevronDown, ChevronRight, Coins, Gift, History, Info, Layers3, Maximize2, PackageOpen, PackagePlus, Plus, Search, Settings2, Shield, ShoppingBag, Sparkles, Trophy, X, Zap } from 'lucide-react';
import { DAILY_FC, MAX_LEVEL, TIERS, UPGRADE_LEVELS, buyPacks, random, shopPacks, claimDaily, defaultDraft, openDraft, dayKey, defaultUnopened, PACK_LEVELS, getPackOpeningCost, getPackStock, getPlayer, initialSave, isPackAvailable, money, openPacks, openSelectedPacks, ovr, packs, players, seasons, STORAGE_KEY, uid, upgrade, upgradeInfo, validateSave } from './game';
import SquadManager from './SquadManager';
import TargetPicker, { DEFAULT_PICKER_VIEW } from './TargetPicker';
import UpgradeProtection from './UpgradeProtection';
import './upgrade-bridge.css';
import './daily-gift.css';
import UpgradeConfirm from './UpgradeConfirm';
import ReadyTunnel from './ReadyTunnel';
import { activeProtection, protectionApplies, protectionCost, setProtection, upgradeWithProtection } from './insurance';
import { evaluateRestore, fodderRestore, restoreApplies } from './restore';
import { autoPickMaterials } from './autoPick';
import { watchName } from './nameMarquee';
import { addToSquad, isLocked, releaseCard, removeFromSquad, toggleLock } from './squad';
import type { Card, Entry, Pack, Save, Tier } from './game';
import PackOpening from './cinema/PackOpening';
import ViewportPages from './ViewportPages';
import PackStage from './cinema/PackStage';
import { GATE_CROSS, OPENING_CUES, OPENING_ENTRY, OPENING_RESULT, openingPhase } from './cinema/timeline';
import { unlockCinemaAudio } from './cinema/audio';
import { AUDIO_ENABLED, UNLIMITED_COINS } from './config';
import TransferMarket from './TransferMarket';
import UpgradeMarket from './UpgradeMarket';
import LineupBoard from './LineupBoard';
import DraftPicker, { DraftSummary } from './DraftPicker';
import Inventory from './Inventory';
import PackShop from './PackShop';
import PackPreview from './PackPreview';
import BackgroundMusic from './BackgroundMusic';
import type { MusicType } from './BackgroundMusic';
import RollingMoney, { UpgradePriceChange } from './RollingMoney';
import { Flag } from './flags';
import { buyPlayer, sellPlayer, sellCards, marketQuote, formatMarketPrice, compareMarketPrices, MARKET_FEE_PERCENT } from './market';
import type { MarketTrade, SellItem } from './market';
import SellDialog from './SellDialog';
import { prefetchImages } from './preload';
import { getTeamLogo } from './teamLogos';
import { asset } from './asset';
import LiveTicker from './LiveTicker';
import { posGroup, seasonShort } from './badges';
import EventPage from './EventPage';
import { grantJackpot, loadJackpot, rollJackpot, saveJackpot, tickJackpot } from './jackpot';
import { EVENT_PLAYS, claimMilestone, claimMission, playEvent } from './event';


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

// Lịch sử lưu từ trước khi bỏ tiền xu vẫn ghi "xu": hiển thị theo đơn vị duy nhất BP.
const historyDetail = (entry: Entry) => (entry.type === 'upgrade' ? entry.detail.replace(/ · Tỷ lệ [0-9.,]+%/g, '') : entry.detail).replace(/(^|[\s(])xu(?=$|[\s·.,)])/g, '$1BP').replace(/(\d{1,3}(?:[.,]\d{3})+|\d{7,})(?=\s*BP)/g, value => money(Number(value.replace(/[.,]/g, ''))));

type View = 'packs' | 'upgrade' | 'collection' | 'lineup' | 'inventory' | 'history' | 'market' | 'shop' | 'event';
type Animation = { id: string; kind: 'pack'; cards: Card[]; pack: Pack; quick: boolean } | { id: string; kind: 'upgrade'; card: Card; success: boolean; before: number; droppedLevel: number | null; restoredLevel: number | null; shielded?: boolean };
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

// Huy hiệu cấp thẻ +1 → +13; đường dẫn viết đầy đủ để bản mothe.html nhúng được ảnh.
const levelBadges = [asset('/assets/levels/lv-1.webp'), asset('/assets/levels/lv-2.webp'), asset('/assets/levels/lv-3.webp'), asset('/assets/levels/lv-4.webp'), asset('/assets/levels/lv-5.webp'), asset('/assets/levels/lv-6.webp'), asset('/assets/levels/lv-7.webp'), asset('/assets/levels/lv-8.webp'), asset('/assets/levels/lv-9.webp'), asset('/assets/levels/lv-10.webp'), asset('/assets/levels/lv-11.webp'), asset('/assets/levels/lv-12.webp'), asset('/assets/levels/lv-13.webp')];
const levelBadge = (level: number) => levelBadges[Math.min(levelBadges.length, Math.max(1, level)) - 1];
// Trang quản trị gói chỉ có khi chạy npm run dev: bản build thay import.meta.env.DEV bằng false nên bỏ hẳn mã trang này.
const PackAdmin = import.meta.env.DEV ? lazy(() => import('./admin/PackAdmin')) : null;

function PlayerCard({ card, className = '', compact = false }: { card: Card; className?: string; compact?: boolean }) {
  const player = getPlayer(card);
  const cardTeam = player.tier === 'eternal' || player.tier === 'prime' || player.tier === 'vietnam' ? player.nation : player.club;
  const [failed, setFailed] = useState(false);
  const theme = card.level >= 5 ? 'enhanced' : card.level > 1 ? 'upgraded' : player.tier;
  const sheen = player.tier === 'eternal' || player.tier === 'prime' ? <span className={`itm-sheen ${player.cardFace ? 'itm-sheen-masked' : ''}`} aria-hidden="true" style={{ '--itm-sheen-mask': player.cardFace ? `url("${player.cardFace}")` : undefined, '--itm-sheen-delay': `${-(player.id % 11) * .47}s` } as CSSProperties}><span className="itm-sheen-streak"/></span> : null;
  // Thẻ có ảnh mặt trước riêng: OVR và cấp thẻ vẽ đè lên ảnh để đổi theo mỗi lần nâng cấp; tên vẽ lại bằng chữ (tên in trên ảnh đã xoá).
  if (player.cardFace) return <div data-level={card.level} className={`player-card face-art season-${player.tier} face-${player.id} ${compact ? 'compact' : ''} ${className}`} aria-label={`${player.name}, OVR ${ovr(card)}, ${player.pos}, ${seasons[player.tier]}, cộng ${card.level}`}>
    <img className="face-art-img" src={player.cardFace} alt="" loading={compact ? 'lazy' : 'eager'}/>{sheen}<strong className="face-art-ovr">{ovr(card)}</strong><img className="face-art-level" src={levelBadge(card.level)} alt={`+${card.level}`}/><span className="face-art-name" ref={watchName} aria-hidden="true"><b>{player.name}</b></span>
  </div>;
  return <div className={`player-card ${theme} ${compact ? 'compact' : ''} ${className}`} aria-label={`${player.name}, OVR ${ovr(card)}, ${player.pos}, ${seasons[player.tier]}, cộng ${card.level}`}>
    <div className="card-inside"><div className="card-etching"/><div className="card-topline">{seasons[player.tier]}<span>◆</span></div><div className="card-rating"><strong>{ovr(card)}</strong><span>{player.pos}</span><Flag code={player.flag}/><div className="club-mini" title={cardTeam}>{player.tier === 'eternal' ? player.flag : cardTeam.slice(0, 2).toUpperCase()}</div></div>
      <img className={`player-photo ${!player.image || failed ? 'placeholder-photo' : ''}`} src={failed || !player.image ? asset('/assets/silhouette.svg') : player.image} onError={() => setFailed(true)} alt={player.image && !failed ? player.name : `Hình đại diện ${player.name}`} loading={compact ? 'lazy' : 'eager'}/>
      <div className="season-crest">{player.tier === 'eternal' ? 'TM' : player.tier === 'prime' ? 'IP' : player.tier === 'vietnam' ? 'VN' : player.tier === 'prm' ? 'PRM' : player.tier === 'mdl' ? 'MDL' : player.tier === 'amb' ? 'FCA' : player.tier === 'uc' ? 'UC' : player.tier === 'wg' ? 'WG' : player.tier === 'ut' ? 'UT' : player.tier === 'cu' ? 'CU' : player.tier === 'gru' ? 'GRU' : player.tier === 'rtn' ? 'RTN' : player.tier === 'dc' ? 'DC' : player.tier === 'cc' ? 'CC' : player.tier === 'bld' ? 'BLD' : player.tier === 'wb' ? 'WB' : player.tier === 'spt' ? 'SPT' : player.tier === 'bdo' ? 'BDO' : player.tier === 'hw23' ? '23HW' : player.tier === 'ep24' ? '24EP' : player.tier === 'ptg' ? 'PTG' : player.tier === 'le' ? 'LE' : player.tier === 'hg' ? 'HG' : player.tier === 'spl' ? 'SPL' : player.tier === 'ln' ? 'LN' : player.tier === 'fa' ? 'FA' : player.tier === 'lol' ? 'LOL' : player.tier === 'cap' ? 'CAP' : player.tier === 'boe21' ? 'E21' : player.tier === 'btb' ? 'BTB' : player.tier === 'ebs' ? 'EBS' : player.tier === 'juventus' ? 'JUVE' : player.tier === 'jnm' ? 'JNM' : player.tier === 'stellar' ? 'TT' : 'N7'}</div>
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
  // Gói có cấp gắn huy hiệu cấp lên ảnh gói: cấp cao nhất ở trước, mỗi cấp thấp hơn lùi một bậc phía sau (lệch lên trên, sang phải),
  // cấp thấp nhất sau cùng — gói +2~+4 là +4 trước, +3 rồi +2 phía sau; gói cấp cố định (26TS +5) chỉ một huy hiệu. Gói ra +1 không gắn.
  const [minLevel, maxLevel] = pack.levels ?? PACK_LEVELS;
  const badgeLevels = maxLevel > 1 ? Array.from({ length: maxLevel - minLevel + 1 }, (_, i) => minLevel + i) : [];
  return <div className={`pack-art ${pack.color} ${pack.back ? 'tm-back' : ''} ${small ? 'small' : ''}`} aria-hidden="true"><div className="pack-side"/><div className="pack-face">{pack.back && <img className="tm-back-img" src={pack.back} alt=""/>}{badgeLevels.map(level => <img key={level} className="pack-level-badge" style={{ '--behind': maxLevel - level, '--stack': maxLevel - minLevel } as CSSProperties} src={levelBadge(level)} alt=""/>)}<div className="pack-shine"/><span className="pack-art-name">FCO VIP</span><div className="pack-emblem"><Trophy strokeWidth={1}/></div><b>{pack.short}</b><span>{pack.range}</span><div className="pack-art-bottom">HUYỀN THOẠI</div></div></div>;
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

// Mốc "đã xem" của thanh dock (lưu riêng, ngoài bản lưu game): history = thời điểm hoạt động mới nhất đã thấy ở Lịch sử,
// packs = số gói trong kho lúc mở Vật phẩm. Chấm xanh / số trên chuông chỉ hiện khi có thứ mới hơn mốc này.
const readSeen = (key: string) => {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); if (Number.isFinite(value?.history) && Number.isFinite(value?.packs)) return { history: value.history as number, packs: value.packs as number }; } catch { /* Coi như chưa xem gì. */ }
  return { history: 0, packs: 0 };
};

type AppProps = { storage?: Pick<Storage, 'getItem' | 'setItem'>; storageKey?: string; accountName?: string; syncStatus?: string; onLogout?: () => void; onDeleteAccount?: () => void; signingOut?: boolean };

export default function App({ storage = localStorage, storageKey = STORAGE_KEY, accountName, syncStatus, onLogout, onDeleteAccount, signingOut = false }: AppProps = {}) {
  const seenKey = `${storageKey}:seen`;
  const [loadNotice] = useState(() => { try { const raw = storage.getItem(storageKey); return raw && !validateSave(JSON.parse(raw)) ? 'Dữ liệu cũ không hợp lệ. Đã mở bộ dữ liệu khởi đầu.' : ''; } catch { return 'Không đọc được dữ liệu đã lưu. Kiểm tra quyền lưu trữ của trình duyệt.'; } });
  // Bản lưu thô gần nhất mà tab này đã đọc hoặc ghi; khác với localStorage nghĩa là tab khác vừa ghi.
  const storedRaw = useRef<string | null>(null);
  // Kết quả đập thẻ đã lưu nhưng chưa đưa vào state: màn đập thẻ che kín App nên hoãn vẽ lại (rất nặng) tới khi đóng màn đó.
  const pendingSave = useRef<Save | null>(null);
  const [save, setSave] = useState<Save>(() => { try { const raw = storage.getItem(storageKey); storedRaw.current = raw; const value: unknown = raw ? JSON.parse(raw) : null; if (validateSave(value)) return value; } catch { /* Hiển thị thông báo và bộ dữ liệu khởi đầu. */ } return initialSave(); });
  const latest = useRef(save); latest.current = pendingSave.current ?? save;
  // Lưu các thay đổi chuyển đổi bản lưu ngay khi mở trang, trước thao tác đầu tiên.
  useEffect(() => {
    try {
      const raw = storedRaw.current, migrated = JSON.stringify(latest.current);
      if (raw !== null && raw !== migrated && storage.getItem(storageKey) === raw) {
        storage.setItem(storageKey, migrated); storedRaw.current = migrated;
      }
    } catch { /* Vẫn cho chơi; commit sẽ báo lỗi nếu lần lưu tiếp theo thất bại. */ }
  }, []);
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
  // Mở lại từ màn kết quả: số gói tự mở ngay khi sân khấu chuẩn bị xong (không bấm lại ở màn chuẩn bị), và lượt đó rút ngắn chờ trước khi lật gói.
  const againCount = useRef(0), fastEntry = useRef(false), fastEntryId = useRef<string | null>(null);
  // Ảnh thẻ không tải trước khi vào game: tải sẵn ảnh thẻ vừa rút lúc bắt đầu mở gói, hầm chạy vài giây là đủ để về kịp màn lật thẻ.
  const prefetchCards = (cards: Card[]) => prefetchImages(cards.flatMap(card => { const p = getPlayer(card); return [p.cardFace, getTeamLogo(p)]; }));
  const prepareOpening = (pack: Pack, selection?: Pack[]) => {
    if (busy.current || !isPackAvailable(pack)) return;
    inventoryBatch.current = selection ?? null;
    autoBatch.current = !!selection;
    prefetchImages([pack.back, pack.tunnel]);
    setPreparationId(id => id + 1); setDraftIds(null); setEntryStarted(false); setPackPrepared(false); setSelectedPack(pack); setReadyPack(pack);
  };
  const [toast, setToast] = useState(loadNotice);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [musicType, setMusicType] = useState<MusicType>(() => {
    try { return localStorage.getItem('fco-background-music-type') === 'instrumental' ? 'instrumental' : 'vocals'; }
    catch { return 'vocals'; }
  });
  const changeMusicType = (value: MusicType) => {
    setMusicType(value);
    try { localStorage.setItem('fco-background-music-type', value); } catch { /* Vẫn đổi nhạc khi trình duyệt không cho lưu. */ }
  };
  // Mở thẳng trang quản trị bằng địa chỉ #quan-tri (chỉ khi chạy npm run dev).
  const [adminOpen, setAdminOpen] = useState(() => import.meta.env.DEV && location.hash.startsWith('#quan-tri'));
  const [upgradeMusicActive, setUpgradeMusicActive] = useState(false);
  // Xem trước gói ở Shop (top cầu thủ) cùng số lượng đang chọn ở khung gói đó.
  const [packPreview, setPackPreview] = useState<{ pack: Pack; count: number } | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);
  // Gói chỉ định: danh sách N cầu thủ đã chọn lần trước của từng gói (mở lại gói cùng loại thì giữ danh sách).
  const draftMemory = useRef(new Map<string, number[]>());
  // Danh sách đã chốt ở lượt mở gói chỉ định hiện tại (null = đang lập danh sách trong DraftPicker).
  const [draftIds, setDraftIds] = useState<number[] | null>(null);
  const [trade, setTrade] = useState<MarketTrade | null>(null);
  const tradeRef = useRef(trade); tradeRef.current = trade;
  const [tradeError, setTradeError] = useState('');
  const [animation, setAnimation] = useState<Animation | null>(null);
  const packAnimation = animation?.kind === 'pack' ? animation : null;
  const flipping = !!readyPack && !!packAnimation && flipStarted;
  const [phase, setPhase] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [hoveredMaterialId, setHoveredMaterialId] = useState('');
  // Tab bên phải màn nâng cấp: phôi trong kho, mua cầu thủ, mua hàng loạt.
  const [matTab, setMatTab] = useState<'owned' | 'buy' | 'bulk'>('owned');
  const [matSort, setMatSort] = useState<`${'position' | 'name' | 'ovr' | 'level' | 'price'}-${'asc' | 'desc'}`>('ovr-desc');
  const [picker, setPicker] = useState<'target' | 'material' | null>(null);
  // Danh sách đổ xuống chọn thẻ chính; mở ngay dưới nút "Thay đổi cầu thủ".
  const [targetOpen, setTargetOpen] = useState(false), changeRef = useRef<HTMLButtonElement>(null);
  const [pickerView, setPickerView] = useState(DEFAULT_PICKER_VIEW);
  // Ảnh chụp thẻ chính và phôi lúc mở màn xác nhận, để màn vẫn hiện đúng sau khi đập xong (phôi đã bị tiêu hao).
  const [protectOpen, setProtectOpen] = useState(false), [confirm, setConfirm] = useState<{ target: Card; materials: Card[] } | null>(null);
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
  const info = target ? upgradeInfo(target, materials) : { energy: 0, bars: 0, chance: 0, cost: 100000 };
  const hoveredMaterial = !animation && info.energy < 100 && materials.length < 5 && !materialIds.includes(hoveredMaterialId) ? save.cards.find(card => card.uid === hoveredMaterialId && card.uid !== targetId) : undefined;
  const previewEnergy = target && target.level < MAX_LEVEL && hoveredMaterial ? upgradeInfo(target, [...materials, hoveredMaterial]).energy : info.energy;
  const toggleMaterial = (uid: string) => {
    setHoveredMaterialId('');
    setMaterialIds(ids => {
      if (ids.includes(uid)) return ids.filter(id => id !== uid);
      const current = ids.map(id => save.cards.find(c => c.uid === id)).filter((c): c is Card => !!c);
      if (!target || ids.length >= 5 || upgradeInfo(target, current).energy >= 100 || isLocked(save, uid)) return ids;
      return [...ids, uid];
    });
  };
  // Chọn tự động: thay lựa chọn hiện tại bằng bộ phôi rẻ nhất đủ 5 vạch (bỏ thẻ khóa và thẻ trong đội hình).
  const autoPick = () => {
    if (!target || target.level >= MAX_LEVEL) return;
    setHoveredMaterialId('');
    const picked = autoPickMaterials(target, save.cards.filter(c => c.uid !== targetId && !save.squad?.includes(c.uid) && !isLocked(save, c.uid)));
    if (!picked.ids.length) { notify('Không có thẻ nào dùng làm phôi được.'); return; }
    setMaterialIds(picked.ids);
    if (picked.energy < 100) notify(`Kho chưa đủ phôi để đạt 5 vạch · đã chọn bộ nạp nhiều nhất (${picked.energy}%).`);
  };
  useEffect(() => { setHoveredMaterialId(''); }, [targetId, matSort, view]);
  const bestOwned = save.cards.length ? Math.max(...save.cards.map(ovr)) : 0;
  const [currentDay, setCurrentDay] = useState(dayKey);
  useEffect(() => { const timer = setInterval(() => setCurrentDay(dayKey()), 30000); return () => clearInterval(timer); }, []);
  const dailyClaimed = save.daily === currentDay;
  // Đang ở Lịch sử / Vật phẩm thì dời mốc đã xem tới hiện tại; ở màn khác chỉ hạ mốc gói khi kho giảm (mở gói) để lần nhận gói sau vẫn báo.
  // Như danh sách Kho vật phẩm: không đếm gói chưa mở bán (chưa có cầu thủ).
  const packTotal = packs.filter(isPackAvailable).reduce((sum, pack) => sum + getPackStock(save, pack), 0);
  const latestEntry = save.history.reduce((latest, entry) => Math.max(latest, entry.time), 0);
  const [seen, setSeen] = useState(() => readSeen(seenKey));
  const nextSeen = { history: view === 'history' ? Math.max(seen.history, latestEntry) : seen.history, packs: view === 'inventory' ? packTotal : Math.min(seen.packs, packTotal) };
  if (nextSeen.history !== seen.history || nextSeen.packs !== seen.packs) setSeen(nextSeen);
  useEffect(() => { try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch { /* Không lưu được thì chỉ nhớ trong phiên này. */ } }, [seen]);
  const unseenCount = save.history.filter(entry => entry.time > seen.history).length;
  // Trang chủ: nút "Mở gói ngay" mở gói của mùa đang giới thiệu (ICON TM); tin Live lấy từ lịch sử thật + mẹo.
  const featuredPack = packs.find(pack => pack.id === 'eternal') ?? selectedPack;
  const tickerMessages = useMemo(() => {
    const news = save.history.slice(0, 8).flatMap(entry => {
      if (entry.type === 'upgrade' && entry.success) { const step = entry.detail.match(/→ \+(\d+)/); return [`🔥 [Hệ thống] Chúc mừng HLV vừa nâng cấp thành công ${entry.title.replace('Thành công · ', '')}${step ? ` lên +${step[1]}` : ''}!`]; }
      if (entry.type === 'pack') { const [name, rating] = entry.detail.split(' · '); return [`🎁 [Mở gói] HLV vừa nhận ${name}${rating?.startsWith('OVR') ? ` (${rating})` : ''} từ ${entry.title.replace(/^Mở /, '')}.`]; }
      return [];
    }).slice(0, 3);
    return [
      ...news,
      UNLIMITED_COINS ? '✨ [Mẹo] Bạn đang ở Chế độ thử nghiệm với số BP vô hạn, hãy thoải mái trải nghiệm tại TTCN và Nâng cấp thẻ.' : '✨ [Mẹo] Bán thẻ dư tại TTCN để có thêm BP nâng cấp.',
      '💡 [Mẹo] Phôi cùng mùa từ +5 cho cơ hội khôi phục cấp khi đập thẻ thất bại.',
      '🎯 [Mẹo] Bấm "Chọn tự động" ở màn nâng cấp để có bộ phôi rẻ nhất đủ 5 vạch.',
      ...(dailyClaimed ? [] : [`🎁 [Quà] Điểm danh mỗi ngày nhận ngay ${money(DAILY_FC)} FC ở hộp quà trên thanh trên cùng.`]),
    ];
  }, [save.history, dailyClaimed]);
  const notify = (message: string) => setToast(message);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === storageKey && !busy.current) { try { const raw = storage.getItem(storageKey); if (!raw) return; const data: unknown = JSON.parse(raw); if (validateSave(data)) { storedRaw.current = raw; latest.current = data; setSave(data); setMaterialIds([]); } } catch { /* Bỏ qua bản lưu không hợp lệ ở cửa sổ khác. */ } } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  // Không ghi đè thay đổi của tab khác (ví dụ tab này bỏ lỡ sự kiện đồng bộ khi đang chạy hiệu ứng): tải lại bản mới nhất và bỏ thao tác này.
  const adoptStored = (raw: string | null) => {
    storedRaw.current = raw;
    try { const data: unknown = raw ? JSON.parse(raw) : null; if (validateSave(data)) { latest.current = data; setSave(data); setMaterialIds([]); } } catch { /* Bản lưu hỏng: lần ghi sau sẽ thay thế. */ }
  };
  // deferRender: vẫn lưu localStorage ngay, nhưng giữ state ở pendingSave tới closeConfirm (không vẽ lại App giữa lúc hiệu ứng chạy).
  const commit = (next: Save, deferRender = false) => {
    let current: string | null = storedRaw.current;
    try { current = storage.getItem(storageKey); } catch { /* Không đọc được thì để setItem bên dưới báo lỗi. */ }
    if (current !== storedRaw.current) { adoptStored(current); notify('Dữ liệu vừa thay đổi ở tab khác nên thao tác này chưa được lưu. Đã tải lại dữ liệu mới nhất, hãy thử lại.'); return false; }
    try { const raw = JSON.stringify(next); storage.setItem(storageKey, raw); storedRaw.current = raw; latest.current = next; if (deferRender) pendingSave.current = next; else { pendingSave.current = null; setSave(next); } return true; }
    catch { notify('Không thể lưu dữ liệu. Hãy cho phép lưu trữ hoặc giải phóng bộ nhớ trước khi chơi tiếp.'); return false; }
  };
  // Cửa sổ Bán (SellDialog): mọi nút Bán mở tab bán lẻ của thẻ đó; nút Bán hàng loạt mở tab hàng loạt.
  const [sellOpen, setSellOpen] = useState<{ tab: 'single' | 'bulk'; uid?: string } | null>(null);
  const sellFromDialog = (items: SellItem[]) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const result = sellCards(latest.current, items, UNLIMITED_COINS);
      if (!commit(result.state)) { notify('Chưa lưu được giao dịch. Hãy kiểm tra quyền lưu trữ rồi thử lại.'); return false; }
      const ids = new Set(items.map(item => item.uid));
      setMaterialIds(list => list.filter(id => !ids.has(id)));
      if (ids.has(targetId)) { setTargetId(''); setMaterialIds([]); }
      const what = result.sold.length === 1 ? `${getPlayer(result.sold[0]).name} +${result.sold[0].level}` : `${result.sold.length} cầu thủ`;
      notify(`Đã bán ${what}.${UNLIMITED_COINS ? ' Chế độ thử: không đổi số dư.' : ` Nhận ${money(result.proceeds)} BP sau phí.`}`);
      playSound('success', latest.current.sound);
      return true;
    } catch (error) { notify((error as Error).message); return false; }
    finally { busy.current = false; }
  };
  const requestTrade = (pending: MarketTrade) => {
    if (busy.current) return;
    if (pending.kind === 'sell') { setSellOpen({ tab: 'single', uid: pending.card.uid }); return; }
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
        if (targetId === pending.card.uid) { setTargetId(''); setMaterialIds([]); }
      }
      notify(pending.kind === 'buy' ? `Đã mua ${getPlayer(result.card).name} +${result.card.level}. Thẻ đã vào kho.` : `Đã bán ${getPlayer(result.card).name} +${result.card.level}.${UNLIMITED_COINS ? ' Chế độ thử: không đổi số dư.' : ` Nhận ${money(result.quote.proceeds)} BP.`}`);
      playSound('success', latest.current.sound);
    } catch (error) { setTradeError((error as Error).message); }
    finally { busy.current = false; }
  };
  // Mua hàng loạt ở màn nâng cấp: mua đủ số lượng hoặc không mua thẻ nào (buyPlayer báo lỗi khi thiếu BP giữa chừng).
  const bulkBuy = (card: Pick<Card, 'playerId' | 'level'>, count: number) => {
    if (busy.current) return;
    try {
      let next = latest.current;
      for (let i = 0; i < count; i++) next = buyPlayer(next, card.playerId, card.level, UNLIMITED_COINS).state;
      if (!commit(next)) return;
      notify(`Đã mua ${count} × ${getPlayer(card).name} +${card.level}. Thẻ đã vào kho.`); playSound('success', latest.current.sound); setMatTab('owned');
    } catch (e) { notify((e as Error).message); }
  };
  const purchasePacks = (pack: Pack, count: number, quiet = false) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const next = buyPacks(latest.current, pack, count, UNLIMITED_COINS);
      if (!commit(next)) return false;
      if (!quiet) { notify(`Đã mua ${count} ${pack.name}. Gói đã được thêm vào kho vật phẩm.`); playSound('success', latest.current.sound); }
      return true;
    } catch (error) { notify((error as Error).message); return false; }
    finally { busy.current = false; }
  };
  // Shop "Mở ngay": mua rồi vào thẳng màn mở, tự mở đúng số gói vừa mua (như nút mở lại ở màn kết quả).
  const buyAndOpen = (pack: Pack, count: number) => { if (purchasePacks(pack, count, true)) { prepareOpening(pack); againCount.current = count; } };
  const receiveTestPacks = () => {
    if (!UNLIMITED_COINS || busy.current) return;
    const count = getPackStock(latest.current, selectedPack);
    if (!Number.isSafeInteger(count + 10)) return;
    if (commit({ ...latest.current, unopened: { ...defaultUnopened(), ...latest.current.unopened, [selectedPack.id]: count + 10 } })) notify(`Đã nhận thêm 10 ${selectedPack.name.toLowerCase()} để thử.`);
  };
  const updateSetting = (key: 'sound' | 'reduced' | 'quick' | 'light', value: boolean) => { if (commit({ ...latest.current, [key]: value }) && key === 'sound' && value) playSound('click', true); };
  useEffect(() => {
    // Gói chỉ định không tự mở: người chơi phải lập danh sách cầu thủ trước (DraftPicker).
    if (!packPrepared || !readyPack || packAnimation || readyPack.choose) return;
    if (againCount.current) {
      const count = Math.min(againCount.current, getPackStock(latest.current, readyPack));
      againCount.current = 0;
      if (count >= 1 && (UNLIMITED_COINS || latest.current.balance >= getPackOpeningCost(latest.current, readyPack, count))) { fastEntry.current = true; open(readyPack, count); }
      return;
    }
    if (!autoBatch.current) return;
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
      prefetchCards(result.cards);
      unlockCinemaAudio(latest.current.sound);
      const id = uid(); fastEntryId.current = fastEntry.current ? id : null; fastEntry.current = false;
      setPackSkipReady(false); setFlipStarted(false); setEntryStarted(false); setSceneReady(false); setPhase(0); setAnimation({ id, kind: 'pack', cards: result.cards, pack, quick: !!latest.current.quick });
    } catch (e) { notify((e as Error).message); busy.current = false; }
  };
  // Mở gói chỉ định: nhận ngẫu nhiên 1 trong N cầu thủ đã chọn, rồi chạy hiệu ứng mở gói như gói thường.
  const openDraftPack = (pack: Pack, playerIds: number[]) => {
    if (busy.current || !packPrepared) return;
    busy.current = true;
    try {
      const result = openDraft(latest.current, pack, playerIds);
      if (!commit(result.state)) { busy.current = false; return; }
      prefetchCards(result.cards);
      unlockCinemaAudio(latest.current.sound);
      fastEntryId.current = null; fastEntry.current = false;
      setPackSkipReady(false); setFlipStarted(false); setEntryStarted(false); setSceneReady(false); setPhase(0); setAnimation({ id: uid(), kind: 'pack', cards: result.cards, pack, quick: !!latest.current.quick });
    } catch (e) { notify((e as Error).message); busy.current = false; }
  };
  useEffect(() => {
    if (!packAnimation || !readyPack) return;
    const base = OPENING_ENTRY[packAnimation.quick ? 'quick' : 'standard'];
    const entry = fastEntryId.current === packAnimation.id ? { ...base, wait: 300 } : base;
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
  // Quản lí CT: thêm / bỏ cầu thủ khỏi đội hình riêng.
  // Cầu thủ trong đội hình không dùng làm phôi: đưa vào đội hình thì bỏ khỏi các phôi đang chọn.
  const addSquad = (uid: string) => { if (busy.current) return; try { if (commit(addToSquad(latest.current, uid))) setMaterialIds(ids => ids.filter(id => id !== uid)); } catch (e) { notify((e as Error).message); } };
  const removeSquad = (uid: string) => { if (!busy.current) commit(removeFromSquad(latest.current, uid)); };
  const updateLineup = (update: (state: Save) => Save) => { if (busy.current) return; try { commit(update(latest.current)); } catch (e) { notify((e as Error).message); } };
  const lockCard = (uid: string) => { if (busy.current) return; try { if (commit(toggleLock(latest.current, uid))) notify(isLocked(latest.current, uid) ? 'Đã khóa thẻ. Thẻ khóa không thể xóa, bán hay dùng làm nguyên liệu.' : 'Đã mở khóa thẻ.'); } catch (e) { notify((e as Error).message); } };
  const deleteCard = (uid: string) => {
    if (busy.current) return;
    try { if (commit(releaseCard(latest.current, uid))) { setMaterialIds(ids => ids.filter(id => id !== uid)); if (targetId === uid) setTargetId(''); notify('Đã xóa cầu thủ khỏi kho.'); } } catch (e) { notify((e as Error).message); }
  };
  // Nâng cấp một cầu thủ cụ thể (Quản lí CT / chi tiết cầu thủ): vào thẳng màn nâng cấp với thẻ đó làm thẻ chính, không sổ danh sách chọn cầu thủ.
  // Gọi sau switchView vì switchView để trống thẻ chính và mở danh sách khi mới vào màn nâng cấp.
  const upgradeCard = (uid: string) => { switchView('upgrade'); setTargetId(uid); setMaterialIds([]); setTargetOpen(false); };
  // inline: không mở màn kết quả cũ, trả kết quả về để màn xác nhận tự hiện thẻ lên / rớt ngay trên sân khấu.
  const closeConfirm = () => {
    setConfirm(null);
    const pending = pendingSave.current;
    if (pending) { pendingSave.current = null; setSave(pending); setMaterialIds([]); }
  };
  const enhance = (inline = false) => {
    if (busy.current || !target) return null;
    busy.current = true;
    try {
      const result = upgradeWithProtection(latest.current, targetId, materialIds, undefined, UNLIMITED_COINS, { role: 'main', pct: activeProtection(latest.current, target) });
      if (!commit(result.state, inline)) { busy.current = false; return null; }
      if (inline) { busy.current = false; return result; }
      // Hiệu ứng dồn năng lượng đã chạy ở màn xác nhận: vào thẳng màn kết quả (bỏ các pha đập cũ).
      setMaterialIds([]); setPhase(result.restoredLevel !== null ? 4 : 3); setAnimation({ id: uid(), kind: 'upgrade', card: result.result, success: result.success, before: target.level, droppedLevel: result.shielded ? null : result.droppedLevel, restoredLevel: result.restoredLevel, shielded: result.shielded });
      return result;
    } catch (e) { notify((e as Error).message); busy.current = false; return null; }
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
    // Giảm chuyển động chỉ rút ngắn màn mở gói; nâng cấp vào thẳng kết quả nên không có mốc nào.
    const times = animation.kind === 'pack' ? (save.reduced ? [80] : OPENING_CUES[animation.quick ? 'quick' : 'standard']) : [];
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
  // Mỗi lần vào Nâng cấp thẻ: để trống thẻ chính và phôi (không tự chọn cầu thủ), mở sẵn danh sách chọn cầu thủ.
  const switchView = (next: View) => { if (next === 'upgrade' && view !== 'upgrade') { setTargetId(''); setMaterialIds([]); setTargetOpen(true); setMatTab('owned'); setPickerView(DEFAULT_PICKER_VIEW); } setView(next); mainRef.current?.scrollTo({ top: 0, behavior: 'instant' }); };
  // Thanh dưới cuộn ngang trên điện thoại: đưa mục đang mở vào giữa khi đổi trang.
  useEffect(() => {
    const bar = document.querySelector('.app-dock-items'), active = bar?.querySelector('.active');
    if (!bar || !active) return;
    const b = bar.getBoundingClientRect(), a = active.getBoundingClientRect();
    bar.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [view]);
  // Quà mỗi ngày: bấm mở bảng xem quà (dailyOpen), bấm Nhận trong bảng mới nhận.
  const [dailyOpen, setDailyOpen] = useState(false);
  const daily = () => setDailyOpen(true);
  const claimDailyGift = () => { try { if (commit(claimDaily(latest.current))) { notify(`Điểm danh thành công! Đã nhận ${money(DAILY_FC)} FC.`); playSound('success', save.sound); } } catch (e) { notify((e as Error).message); } };
  // Lượt sự kiện: rút hũ, góp FC vào Giải Đặc Biệt và thử trúng giải (src/jackpot.ts); FC trúng thưởng cộng chung một lần lưu.
  const playEventTurns = (count: number, mode: 'fc' | 'free') => { try {
    const result = playEvent(latest.current, count, undefined, UNLIMITED_COINS, mode);
    const paid = mode === 'fc' ? EVENT_PLAYS.find(play => play.count === count)?.price ?? 0 : 0;
    const jackpot = rollJackpot(tickJackpot(loadJackpot(), Date.now(), random), count, paid, random);
    if (!commit(grantJackpot(result.state, jackpot.wins))) return null;
    saveJackpot(jackpot.jackpot);
    return { ...result, jackpotWins: jackpot.wins, jackpotPaid: paid };
  } catch (e) { notify((e as Error).message); return null; } };
  const claimEventGift = (index: number, choice: number | null) => { try { const result = claimMilestone(latest.current, index, choice); return commit(result.state) ? result.rewards : null; } catch (e) { notify((e as Error).message); return null; } };
  const claimEventMission = (id: string) => { try { if (!commit(claimMission(latest.current, id))) return false; notify('Đã nhận lượt chơi miễn phí.'); return true; } catch (e) { notify((e as Error).message); return false; } };
  const resetFilters = () => { setQuery(''); setPosition(''); setSeason(''); setLevel(''); setMinOvr(''); setSort('ovr'); };

  return <div className={`app min-h-screen antialiased ${save.reduced ? 'reduced-motion' : ''}`}>
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); switchView('packs'); }} aria-label="FCO VIP, trang chủ"><img src={asset('/assets/fco-vip-logo.png')} alt=""/><span>FCO<b>VIP</b></span></a><div className="header-tag"><span><span className="live-dot"/>Sân chơi của những huyền thoại</span><small title="Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.">Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.</small></div><div className="topbar-actions"><div className="wallet"><img className="coin-icon currency-icon" src={asset('/assets/currency-bp.png')} alt="BP"/><div><small>{UNLIMITED_COINS ? 'Chế độ thử nghiệm' : 'Số dư của bạn'}</small><b>{UNLIMITED_COINS ? '∞' : money(save.balance)} <span>BP</span></b></div></div><div className="wallet wallet-fc" title="FC dùng để chơi sự kiện Nâng Cấp Siêu Sao"><img className="coin-icon currency-icon" src={asset('/assets/currency-fc.png')} alt="FC"/><div><small>FC của bạn</small><b>{UNLIMITED_COINS ? '∞' : money(save.fc ?? 0)} <span>FC</span></b></div></div><button className={`topbar-gift ${dailyClaimed ? '' : 'has-gift'}`} onClick={daily} aria-label={dailyClaimed ? 'Quà mỗi ngày · đã điểm danh hôm nay' : `Quà mỗi ngày · nhận ${money(DAILY_FC)} FC`} title={dailyClaimed ? 'Quà mỗi ngày · đã nhận hôm nay' : `Quà mỗi ngày · nhận ${money(DAILY_FC)} FC`}><Gift size={22}/>{!dailyClaimed && <i className="topbar-gift-dot" aria-hidden="true"/>}</button><BackgroundMusic suspended={upgradeMusicActive} musicType={musicType}/><button className="avatar" aria-label="Cài đặt trò chơi" onClick={() => setSettings(true)} title={accountName ? `Huấn luyện viên ${accountName}` : undefined}>{accountName ? accountName.slice(0, 3).toUpperCase() : 'HLV'}</button></div></header>
    <main ref={mainRef} className={`main-content view-${view}`}>
      {view === 'packs' && <>
        <section className="hero" aria-labelledby="hero-title"><Stadium reduced={save.reduced}/><LiveTicker messages={tickerMessages} reduced={save.reduced}/><div className="hero-content"><motion.div initial={save.reduced ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }} className="hero-copy"><div className="season-label"><span/>MÙA THẺ ICON TM</div><h1 id="hero-title">Chạm tới<br/><em>huyền thoại.</em></h1><p className="hero-sub">Trải nghiệm mở gói và nâng cấp những mùa thẻ đỉnh cao không giới hạn.</p><div className="hero-cta"><button className="cta-gold" onClick={() => prepareOpening(featuredPack)}>MỞ GÓI NGAY</button><button className="cta-glass" onClick={() => switchView('upgrade')}>ĐẬP THẺ THỬ VẬN MAY</button></div></motion.div>
          <div className="hero-cards"><div className="hero-orbit"/><div className="hero-card-back back-left"><PlayerCard card={preview(1)}/></div><div className="hero-card-back back-right"><PlayerCard card={preview(3)}/></div><motion.div className="hero-card-front" initial={save.reduced ? false : { opacity: 0, y: 40, rotateY: -25 }} animate={{ opacity: 1, y: 0, rotateY: -8 }} transition={{ duration: 1, delay: .15 }}><PlayerCard card={preview(31)}/></motion.div><div className="card-pedestal"/><div className="featured-note"><Sparkles size={13}/>Thẻ tiêu biểu · Không đảm bảo nhận được</div></div>
        </div></section>
      </>}
      {view === 'upgrade' && <section className="workspace upgrade-workspace fco-upgrade">
        <div className="fco-left">
          <div className="fco-target">
            <button className="fco-target-card" onClick={() => setTargetOpen(open => !open)} aria-label="Chọn thẻ cầu thủ chính">{target ? <PlayerCard card={target}/> : <span className="empty-card fco-placeholder" aria-hidden="true"><img src={asset('/assets/fc-empty-card.svg')} alt=""/></span>}</button>
            <div className="fco-stats">
              <h2>{target ? getPlayer(target).name : 'Chọn cầu thủ'}</h2>
              {!target && <dl className="fco-empty-stats">{['Cấp thẻ', 'C.Số', 'Tỷ lệ thành công', 'Phí nâng cấp', 'Giá'].map(label => <div key={label}><dt>{label}</dt><dd><b>–</b></dd></div>)}</dl>}
              {target && (() => { // Có phôi đưa vào thì hiện thẳng giá trị của cấp kế tiếp (màu xanh); chưa có phôi thì hiện giá trị hiện tại.
                const preview = target.level < MAX_LEVEL && materials.length > 0; const shown = preview ? { ...target, level: target.level + 1 } : target; return <dl className={preview ? 'fco-preview' : ''}>
                <div><dt>Cấp thẻ</dt><dd><img className="fco-badge" src={levelBadge(shown.level)} alt={`+${shown.level}`}/>{preview && <span className="fco-delta">+1</span>}</dd></div>
                <div><dt>C.Số</dt><dd><b>{ovr(shown)}</b>{preview && <span className="fco-delta">+{ovr(shown) - ovr(target)}</span>}</dd></div>
                <div><dt>Tỷ lệ thành công</dt><dd><b>{info.chance}%</b></dd></div>
                <div><dt>Phí nâng cấp</dt><dd><b>{UNLIMITED_COINS ? 'Miễn phí' : shortPrice(info.cost)}</b></dd></div>
                <div><dt>Giá</dt><dd><b className="fco-price"><RollingMoney value={marketQuote(shown).price} reduced={save.reduced}/></b></dd></div>
              </dl>; })()}
            </div>
          </div>
          <button ref={changeRef} className={`fco-change ${targetOpen ? 'is-open' : ''}`} aria-expanded={targetOpen} onClick={() => setTargetOpen(open => !open)}>Thay đổi cầu thủ<ChevronDown size={16}/></button>
          {targetOpen && <TargetPicker save={save} targetId={targetId} top={changeRef.current?.offsetTop ?? 0} onPick={uid => { setTargetId(uid); setMaterialIds([]); setTargetOpen(false); }} onClose={() => setTargetOpen(false)} view={pickerView} onView={setPickerView} levelBadge={levelBadge} seasonShort={seasonShort}/>}
          {(() => { // Tăng tỉ lệ luôn hiển thị không áp dụng; khôi phục cấp thẻ = cơ hội giữ cấp khi đập xịt từ +5.
            const restore = target && restoreApplies(target) ? evaluateRestore(target, materials) : null;
            const perk = (label: ReactNode, icon: ReactNode, value: string | null, hint?: string, onClick?: () => void) => <div className={`fco-row fco-perk ${value ? 'is-on' : ''}`}><span>{label}</span>{onClick ? <button className="fco-perk-btn" title={hint} onClick={onClick}>{icon}{value ?? 'Chọn mức bảo vệ'}</button> : <b title={hint}>{icon}{value ?? 'Không áp dụng'}</b>}</div>;
            const guard = target && protectionApplies(target) ? activeProtection(save, target) : null, guardCost = target && guard ? protectionCost(target, guard) : null;
            return <>{perk('Tăng tỉ lệ nâng cấp', <ArrowBigUp size={22}/>, null)}
              {perk(<>Khôi phục cấp thẻ<i className="fco-help" title="Thẻ từ +5 đập thất bại có cơ hội khôi phục tùy loại phôi (cộng dồn, tối đa 100%): bản sao cùng mùa bằng hoặc cao hơn cấp thẻ 100%, thấp hơn 1 cấp 85% (giữ nguyên cấp), bản sao +3 trở lên 50%, +1/+2 20% (giữ tối thiểu +5); thẻ cùng mùa từ +5, OVR không thấp hơn quá 3: 100% (giữ tối thiểu cấp của phôi), thấp hơn nữa giảm dần tới 35%; thẻ cùng mùa +4 OVR không thấp hơn: 40% (giữ +5); cùng cầu thủ khác mùa từ +5, OVR không thấp hơn quá 2: 65% (giữ +5). Phôi thường không có khôi phục.">?</i></>, <CirclePlus size={20}/>, restore?.chance ? `Áp dụng ${restore.chance}% · giữ +${restore.floor}` : null, restore === null ? 'Áp dụng cho thẻ từ +5' : restore.chance ? `Thất bại: ${restore.chance}% cơ hội thẻ không rớt dưới +${restore.floor}` : 'Dùng bản sao, thẻ cùng mùa hoặc cùng cầu thủ khác mùa để có khôi phục')}
              {perk('Bảo vệ nâng cấp', <ShieldPlus size={20}/>, guard ? `Áp dụng ${guard}%${guardCost ? ` · ${shortPrice(guardCost)}` : ''}` : null, guard === null ? 'Áp dụng cho thẻ từ +8' : 'Chọn mức bảo vệ khi thất bại', guard === null ? undefined : () => setProtectOpen(true))}</>;
          })()}
          <div className="fco-row"><span>Tăng % nâng cấp<i className="fco-help" title="Mỗi vạch = 20% năng lượng. Phôi càng cao OVR càng nạp nhiều; đủ 5 vạch thì tỉ lệ đạt mức tối đa của cấp.">?</i></span><div className={`fco-energy ${info.energy >= 100 ? 'is-full' : ''}`} aria-label={`Năng lượng ${info.energy}%${previewEnergy > info.energy ? ` · Xem trước ${previewEnergy}%` : ''}`} style={{ '--fco-energy': info.energy, '--fco-preview-energy': previewEnergy, '--energy-duration': save.reduced ? '0s' : '.4s' } as CSSProperties}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--energy-start': (n - 1) * 20 } as CSSProperties} className={info.energy >= n * 20 ? 'full' : info.energy > (n - 1) * 20 ? 'part' : ''}><b>{n}</b></i>)}</div></div>
          <div className="fco-row fco-used"><span>Cầu thủ sử dụng</span><div className="fco-stack">{!materials.length && <span className="fco-used-blank">Chọn cầu thủ sử dụng.<br/>Bạn có thể chứa tối đa 5 CT</span>}{Array.from({ length: 5 }, (_, n) => materials[n] ? <button key={materials[n].uid} className="fco-used-card" style={{ zIndex: n + 1, '--n': n } as CSSProperties} onClick={() => setMaterialIds(ids => ids.filter(id => id !== materials[n].uid))} aria-label={`Bỏ nguyên liệu ${getPlayer(materials[n]).name}${target && restoreApplies(target) && fodderRestore(target, materials[n]).power > 0 ? ' · tăng cơ hội khôi phục' : ''}`}><PlayerCard card={materials[n]} compact/>{target && restoreApplies(target) && fodderRestore(target, materials[n]).power > 0 && <span className="fco-twin-mark" aria-hidden="true"><CirclePlus size={14}/></span>}</button> : <span key={n} className="fco-used-empty" style={{ '--n': n } as CSSProperties}/>)}</div></div>
        </div>
        <div className="fco-right">
          <div className="fco-tabs um-tabs" role="tablist" aria-label="Nguồn cầu thủ">{([['owned', 'Cầu thủ đang sở hữu'], ['buy', 'Mua cầu thủ'], ['bulk', 'Mua hàng loạt']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={matTab === key} className={matTab === key ? 'active' : undefined} onClick={() => setMatTab(key)}>{label}</button>)}</div>
          {matTab === 'owned' ? <><div className="fco-hint"><p>Tỷ lệ thành công sẽ cao hơn khi sử dụng cầu thủ có chỉ số cao.</p><strong>{materials.length}/5</strong></div>
          <div className="fco-table" role="table">
            <div className="fco-head" role="row"><span role="columnheader">Tăng</span>{([
              ['position', 'Vị trí'], ['name', 'Tên cầu thủ'], ['ovr', 'OVR'], ['level', 'Thẻ'], ['price', 'Giá'],
            ] as const).map(([key, label]) => <span key={key} className="fco-col" role="columnheader" aria-sort={matSort === `${key}-asc` ? 'ascending' : matSort === `${key}-desc` ? 'descending' : 'none'}><button className={`fco-col-btn ${matSort.startsWith(key) ? 'on' : ''}`} data-sort={key} aria-label={`Sắp xếp ${label} ${matSort === `${key}-asc` ? 'giảm dần' : 'tăng dần'}`} onClick={() => setMatSort(current => current === `${key}-asc` ? `${key}-desc` : `${key}-asc`)}>{label}<ChevronDown size={12}/></button></span>)}<span role="columnheader"/></div>
            <div className="fco-body" role="rowgroup" aria-label="Chọn cầu thủ làm phôi nâng cấp" tabIndex={0} key={`${matSort}-${targetId}`}>{save.cards.filter(c => c.uid !== targetId && !save.squad?.includes(c.uid)).sort((a, b) => { const [key, dir] = matSort.split('-'); const comparison = key === 'name' ? getPlayer(a).name.localeCompare(getPlayer(b).name, 'vi') : key === 'position' ? getPlayer(a).pos.localeCompare(getPlayer(b).pos, 'en') : key === 'price' ? compareMarketPrices(a, b, dir === 'desc') : key === 'level' ? a.level - b.level : ovr(a) - ovr(b); return (key === 'price' || dir === 'asc' ? 1 : -1) * comparison || ovr(b) - ovr(a) || b.level - a.level; }).map(c => { const p = getPlayer(c); const picked = materialIds.includes(c.uid); const full = !picked && (materialIds.length >= 5 || info.energy >= 100); const locked = isLocked(save, c.uid); const boost = target ? upgradeInfo(target, [c]).energy : 0; return <button key={c.uid} role="row" className={`fco-line ${picked ? 'picked' : ''}`} disabled={!target || full || locked} title={locked ? 'Thẻ đang khóa, không dùng làm nguyên liệu' : undefined} onMouseEnter={() => setHoveredMaterialId(!picked && !full ? c.uid : '')} onMouseLeave={() => setHoveredMaterialId('')} onFocus={() => setHoveredMaterialId(!picked && !full ? c.uid : '')} onBlur={() => setHoveredMaterialId('')} onClick={() => toggleMaterial(c.uid)}>
              <span className="fco-boost" aria-label={`Tăng ${boost}% năng lượng`} title={`${boost}% năng lượng · ${Number((boost / 20).toFixed(3))} vạch`}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--energy-fill': `${Math.min(100, Math.max(0, boost - (n - 1) * 20) * 5)}%` } as CSSProperties} className={boost >= n * 20 ? 'on' : boost > (n - 1) * 20 ? 'part' : ''}/>)}</span>
              <span className={`fco-pos pos-${posGroup(p.pos)}`}>{p.pos}</span>
              <span className="fco-name">{p.cardFace ? <img src={p.cardFace} alt=""/> : <Flag code={p.flag}/>}<b>{p.name}</b></span>
              <span className="fco-ovr">{ovr(c)}</span>
              <span><img className="fco-badge" src={levelBadge(c.level)} alt={`+${c.level}`}/></span>
              <span className="fco-cost">{shortPrice(marketQuote(c).price)}</span>
              <span className="fco-check">{picked && <Check size={18}/>}</span>
            </button>; })}{save.cards.length <= 1 ? <p className="fine-print">Kho chưa có thẻ nào để làm nguyên liệu.</p> : null}</div>
          </div>
          <div className="fco-actions"><button className="fco-ghost" onClick={() => setMaterialIds([])} disabled={!materials.length}><X size={15}/>Bỏ chọn</button><button className="fco-ghost" onClick={autoPick} disabled={!target || target.level >= MAX_LEVEL} title="Chọn tối đa 5 phôi đủ 5 vạch với tổng giá thấp nhất"><Sparkles size={15}/>Chọn tự động</button><button className="fco-go" onClick={() => { if (!target) return; setTargetOpen(false); setConfirm({ target, materials }); }} disabled={!target || !materials.length || (!UNLIMITED_COINS && save.balance < info.cost) || target.level >= MAX_LEVEL}>{target?.level === MAX_LEVEL ? 'Đã đạt cấp tối đa' : 'Tiếp theo'}<ArrowRight size={18}/></button></div></>
          : <UpgradeMarket mode={matTab} target={target} free={UNLIMITED_COINS} balance={save.balance} onBuy={offer => requestTrade({ kind: 'buy', card: { uid: `market-${offer.playerId}-${offer.level}`, playerId: offer.playerId, level: offer.level, received: 0 } })} onBulkBuy={bulkBuy} levelBadge={levelBadge}/>}
        </div>
      </section>}
      {view === 'collection' && <SquadManager save={save} onAdd={addSquad} onRemove={removeSquad} onDetail={setDetail} onDelete={deleteCard} onSell={card => requestTrade({ kind: 'sell', card })} onUpgrade={upgradeCard} onLock={lockCard} onLineup={() => switchView('lineup')} onBulkSell={() => setSellOpen({ tab: 'bulk' })} levelBadge={levelBadge} seasonShort={seasonShort}/>}
          {view === 'lineup' && <LineupBoard save={save} onUpdate={updateLineup} onDetail={setDetail} onManage={() => switchView('collection')} levelBadge={levelBadge} seasonShort={seasonShort}/>}
      {view === 'shop' && <PackShop save={save} packs={shopPacks} free={UNLIMITED_COINS} onBuy={(pack, count) => purchasePacks(pack, count)} onOpenNow={buyAndOpen} onPreview={(pack, count) => setPackPreview({ pack, count })} onInventory={() => switchView('inventory')} renderArt={pack => <PackArt pack={pack}/>}/>}
      {view === 'inventory' && <Inventory save={save} packs={packs} onUse={pack => prepareOpening(pack)} onShop={() => switchView('shop')} onUseSelected={selection => selection[0] && prepareOpening(selection[0], selection)} onClose={() => switchView('packs')} renderArt={pack => <PackArt pack={pack}/>} testMode={UNLIMITED_COINS} onReceiveTest={receiveTestPacks}/>}
      {view === 'market' && <TransferMarket save={save} free={UNLIMITED_COINS} onTrade={requestTrade} onBulkSell={() => setSellOpen({ tab: 'bulk' })} onHistory={() => { setHistoryType('market'); switchView('history'); }} onOpenPacks={() => switchView('inventory')} renderCard={card => <PlayerCard card={card}/>} levelBadge={levelBadge}/>}
      {view === 'event' && <EventPage save={save} free={UNLIMITED_COINS} onPlay={playEventTurns} onClaim={claimEventGift} onMission={claimEventMission}/>}
      {view === 'history' && <section className="workspace history-workspace"><div className="page-heading"><div><h1>Dấu ấn hành trình</h1><p>Lưu tối đa 200 hoạt động gần nhất trên trình duyệt này.</p></div><select aria-label="Lọc loại lịch sử" value={historyType} onChange={e => setHistoryType(e.target.value)}><option value="">Tất cả hoạt động</option><option value="pack">Mở gói</option><option value="upgrade">Nâng cấp</option><option value="gift">Điểm danh</option><option value="market">Chuyển nhượng</option><option value="shop">Mua gói</option><option value="event">Sự kiện</option></select></div>{save.history.filter(e => !historyType || e.type === historyType).length ? <ViewportPages className="history-list" itemHeight={92} resetKey={historyType}>{save.history.filter(e => !historyType || e.type === historyType).map(e => <article className="history-item" key={e.id}><div className={`history-icon ${e.success === false ? 'failure' : ''}`}>{e.type === 'pack' ? <PackageOpen size={21}/> : e.type === 'gift' ? <Gift size={21}/> : e.type === 'market' ? <ArrowLeftRight size={21}/> : e.type === 'shop' ? <ShoppingBag size={21}/> : e.type === 'event' ? <Sparkles size={21}/> : <Zap size={21}/>}</div><div><h2>{e.title}</h2><p>{historyDetail(e)}</p></div><time>{new Date(e.time).toLocaleString('vi-VN')}</time></article>)}</ViewportPages> : <div className="empty-state"><History size={38}/><h2>Trang sử đang chờ bạn</h2><p>Mở gói, nâng cấp hoặc nhận quà điểm danh để bắt đầu.</p><button className="primary-button" onClick={() => switchView('inventory')}>Kho vật phẩm<ArrowRight size={16}/></button></div>}</section>}
    </main>
      {(() => { // Thanh menu dưới kiểu FC Online, luôn hiện ở mọi màn (điều hướng chính của game): mục chữ ngăn bằng vạch mảnh, chấm xanh = có thứ mới; biểu tượng bên phải.
        const hasPacks = packTotal > 0;
        const items: { label: string; view?: View; hint?: string; dot?: boolean; onClick: () => void }[] = [
          { label: 'Quản lý CT', view: 'collection', onClick: () => switchView('collection') },
          { label: 'Đội hình', view: 'lineup', hint: 'Sắp xếp đội hình', onClick: () => switchView('lineup') },
          { label: 'Nâng cấp thẻ', view: 'upgrade', onClick: () => switchView('upgrade') },
          { label: 'TTCN', view: 'market', hint: 'Thị trường chuyển nhượng', onClick: () => switchView('market') },
          { label: 'Vật phẩm', view: 'inventory', hint: hasPacks ? 'Có gói chưa mở' : undefined, dot: packTotal > seen.packs, onClick: () => switchView('inventory') },
          { label: 'Shop', view: 'shop', onClick: () => switchView('shop') },
          { label: 'Sự kiện', view: 'event', hint: 'Nâng Cấp Siêu Sao', onClick: () => switchView('event') },
        ];
        return <nav className="app-dock" aria-label="Menu nhanh">
          <div className="app-dock-items">{items.map(item => <button key={item.label} className={item.view === view ? 'active' : undefined} aria-current={item.view === view ? 'page' : undefined} onClick={item.onClick} title={item.hint} aria-label={item.hint ? `${item.label} · ${item.hint}` : undefined}>{item.dot && <i className="app-dock-dot" aria-hidden="true"/>}{item.label}</button>)}</div>
          <div className="app-dock-icons">
            <button className={view === 'packs' ? 'active' : undefined} aria-current={view === 'packs' ? 'page' : undefined} onClick={() => switchView('packs')} aria-label="Trang chủ" title="Trang chủ"><House size={22}/></button>
            <button className="dock-optional" onClick={() => setHelp(true)} aria-label="Hướng dẫn" title="Hướng dẫn"><CircleHelp size={22}/></button>
            <button className={view === 'history' ? 'active' : undefined} onClick={() => switchView('history')} aria-label={`Lịch sử${unseenCount ? ` · ${unseenCount} hoạt động mới` : ''}`} title="Lịch sử"><Bell size={22}/>{unseenCount > 0 && <b>{unseenCount > 99 ? '99+' : unseenCount}</b>}</button>
            <button className="dock-optional" onClick={() => setSettings(true)} aria-label="Cài đặt" title="Cài đặt"><Settings2 size={22}/></button>
          </div>
        </nav>;
      })()}
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Info size={18}/><span>{toast}</span><button className="icon-button" aria-label="Đóng thông báo" onClick={() => setToast('')}><X size={15}/></button></motion.div>}</AnimatePresence>
    <AnimatePresence>
      {sellOpen && <SellDialog key={`${sellOpen.tab}-${sellOpen.uid ?? ''}`} save={save} initial={sellOpen} free={UNLIMITED_COINS} renderCard={card => <PlayerCard card={card}/>} levelBadge={levelBadge} seasonShort={seasonShort} onSell={sellFromDialog} onClose={() => setSellOpen(null)}/>}
      {trade && <Modal className="market-confirm" label={trade.kind === 'buy' ? 'Xác nhận mua cầu thủ' : 'Xác nhận bán cầu thủ'} onClose={() => setTrade(null)}>
        <div className="modal-heading"><h2>{trade.kind === 'buy' ? 'Xác nhận mua cầu thủ' : 'Xác nhận bán cầu thủ'}</h2><button className="icon-button" aria-label="Đóng xác nhận giao dịch" onClick={() => setTrade(null)}><X/></button></div>
        <div className="trade-player"><img src={getPlayer(trade.card).cardFace || asset('/assets/silhouette.svg')} alt=""/><div><h3>{getPlayer(trade.card).name}</h3><p>{getPlayer(trade.card).pos} · {seasons[getPlayer(trade.card).tier]} · +{trade.card.level} · OVR {ovr(trade.card)}</p></div></div>
        <dl className="trade-breakdown"><div><dt>Giá thẻ</dt><dd>{formatMarketPrice(marketQuote(trade.card).price)}</dd></div>{trade.kind === 'sell' && <div><dt>Phí bán {MARKET_FEE_PERCENT}%</dt><dd>−{formatMarketPrice(marketQuote(trade.card).fee)}</dd></div>}<div className="market-total"><dt>{trade.kind === 'buy' ? 'Thanh toán' : 'Bạn nhận'}</dt><dd>{formatMarketPrice(trade.kind === 'buy' ? marketQuote(trade.card).price : marketQuote(trade.card).proceeds)}</dd></div></dl>
        <p className="trade-note">{UNLIMITED_COINS ? 'Chế độ thử: số dư BP được giữ nguyên. ' : ''}{trade.kind === 'buy' ? 'Nhận 1 thẻ đúng cấp cộng đã chọn vào kho cầu thủ.' : 'Bán 1 thẻ đã chọn. Thẻ sẽ được chuyển khỏi kho cầu thủ.'}</p>
        {tradeError && <p className="trade-error" role="alert">{tradeError}</p>}
        <div className="trade-actions"><button className="secondary-button" onClick={() => setTrade(null)}>Hủy</button><button className="market-primary confirm-trade" onClick={confirmTrade} disabled={!marketQuote(trade.card).available || (trade.kind === 'buy' && !UNLIMITED_COINS && save.balance < (marketQuote(trade.card).price ?? Infinity))}>Xác nhận {trade.kind === 'buy' ? 'mua' : 'bán'}<Check size={17}/></button></div>
      </Modal>}
      {packPreview && <Modal className="pack-preview-modal" label={`Xem trước ${packPreview.pack.name}`} onClose={() => setPackPreview(null)}><PackPreview pack={packPreview.pack} count={packPreview.count} free={UNLIMITED_COINS} balance={save.fc ?? 0} onClose={() => setPackPreview(null)} onBuy={() => { if (purchasePacks(packPreview.pack, packPreview.count)) setPackPreview(null); }} onOpenNow={() => { setPackPreview(null); buyAndOpen(packPreview.pack, packPreview.count); }}/></Modal>}
      {settings && <Modal label="Cài đặt trò chơi" onClose={() => setSettings(false)}><div className="modal-heading"><h2>Cài đặt trò chơi</h2><button className="icon-button" aria-label="Đóng cài đặt" onClick={() => setSettings(false)}><X/></button></div>{([{ key: 'sound' as const, title: 'Âm thanh', description: AUDIO_ENABLED ? 'Âm thanh điện tử khi mở gói và nâng cấp.' : 'Âm thanh đã tắt trong phiên bản này.' }, { key: 'reduced' as const, title: 'Giảm chuyển động', description: 'Bỏ hoạt cảnh dài, khói và hạt sáng chuyển động.' }, { key: 'quick' as const, title: 'Mở thẻ nhanh', description: 'Rút hoạt cảnh từ khoảng 10 giây xuống 3,5 giây.' }, { key: 'light' as const, title: 'Hiệu ứng nhẹ', description: 'Dùng đường hầm 2D nhẹ, phù hợp khi máy nóng hoặc hình chuyển động chậm.' }]).map(s => <label className="setting-row" key={s.key}><span><b>{s.title}</b><small>{s.description}</small></span><input type="checkbox" disabled={s.key === 'sound' && !AUDIO_ENABLED} checked={s.key === 'sound' ? AUDIO_ENABLED && !!save.sound : !!save[s.key]} onChange={e => updateSetting(s.key, e.target.checked)}/></label>)}<label className="setting-row"><span><b>Nhạc nền</b><small>Chọn loại nhạc phát trong trò chơi.</small></span><select aria-label="Loại nhạc nền" value={musicType} onChange={e => changeMusicType(e.target.value as MusicType)}><option value="instrumental">1. Nhạc không lời</option><option value="vocals">2. Nhạc có lời</option></select></label>{accountName && <div className="account-settings"><div><strong>{accountName}</strong><small role="status">{syncStatus}</small></div>{onLogout && <button disabled={signingOut} onClick={onLogout}>{signingOut ? 'Đang đăng xuất…' : accountName === 'Khách' ? 'Đăng nhập' : 'Đăng xuất'}</button>}</div>}<div className="storage-notice"><Shield size={20}/><p>{storageKey === STORAGE_KEY ? 'Tiến trình khách được lưu trên trình duyệt này. Đăng nhập để chơi bằng tài khoản riêng trên nhiều thiết bị.' : 'Tiến trình được đồng bộ cùng tài khoản. Hãy chờ trạng thái Đã đồng bộ trước khi đóng trang hoặc chuyển thiết bị.'} Không có thanh toán bằng tiền thật.</p></div><button className="settings-help" onClick={() => { setSettings(false); setHelp(true); }}><CircleHelp size={17}/>Thông tin & nguồn ảnh<ChevronRight size={16}/></button>{import.meta.env.DEV && <button className="settings-help" onClick={() => { setSettings(false); setAdminOpen(true); }}><PackagePlus size={17}/>Quản trị gói · chỉ máy dev<ChevronRight size={16}/></button>}{onDeleteAccount && <div className="account-danger-zone"><h3>Xóa tài khoản</h3><p>Xóa vĩnh viễn tài khoản cùng toàn bộ kho thẻ và tiến trình.</p><button disabled={signingOut} onClick={() => { setSettings(false); onDeleteAccount(); }}>Xóa tài khoản</button></div>}</Modal>}
      {import.meta.env.DEV && PackAdmin && adminOpen && <Suspense fallback={null}><PackAdmin renderArt={pack => <PackArt pack={pack}/>} onClose={() => { setAdminOpen(false); history.replaceState(null, '', location.pathname + location.search); }}/></Suspense>}
      {confirm && <UpgradeConfirm onMusicActiveChange={setUpgradeMusicActive} target={confirm.target} materials={confirm.materials} energy={upgradeInfo(confirm.target, confirm.materials).energy} restore={restoreApplies(confirm.target) ? evaluateRestore(confirm.target, confirm.materials) : null} protection={protectionApplies(confirm.target) ? { pct: activeProtection(save, confirm.target), cost: protectionCost(confirm.target, activeProtection(save, confirm.target)) } : null} reduced={save.reduced} renderCard={(card, compact) => <PlayerCard card={card} compact={compact}/>} seasonShort={seasonShort} onBack={closeConfirm} onReveal={success => playSound(success ? 'success' : 'fail', latest.current.sound)} levelBadge={levelBadge} onConfirm={() => { const result = enhance(true); if (!result) { setConfirm(null); return null; } return { success: result.success, card: result.result, before: confirm.target.level, restored: result.restoredLevel !== null }; }}/>}
      {protectOpen && target && protectionApplies(target) && <Modal label="Bảo vệ nâng cấp" onClose={() => setProtectOpen(false)}><UpgradeProtection card={target} pct={save.protection?.pct ?? 0} fixed={save.protection?.fixed ?? false} balance={save.balance} free={UNLIMITED_COINS} onChange={(pct, fixed) => { try { commit(setProtection(latest.current, pct, fixed)); } catch (e) { notify((e as Error).message); } }} onClose={() => setProtectOpen(false)}/></Modal>}
      {dailyOpen && <Modal className="daily-modal" label="Quà mỗi ngày" onClose={() => setDailyOpen(false)}>
        <div className="modal-heading"><div><h2>Quà mỗi ngày</h2><p>Điểm danh mỗi ngày (giờ Việt Nam) để nhận quà bên dưới.</p></div><button className="icon-button" aria-label="Đóng" onClick={() => setDailyOpen(false)}><X/></button></div>
        <div className="daily-gift"><span className="daily-fc-card"><img src={asset('/assets/event/fc-card.webp')} alt=""/><b>{money(DAILY_FC)}</b></span><strong>{money(DAILY_FC)} FC</strong></div>
        <button className="primary-button daily-claim" disabled={dailyClaimed} onClick={() => { claimDailyGift(); setDailyOpen(false); }}>{dailyClaimed ? 'Đã nhận hôm nay · Quay lại vào ngày mai' : 'Nhận'}</button>
      </Modal>}
      {help && <Modal label="Hướng dẫn và thông tin" onClose={() => setHelp(false)}><div className="modal-heading"><h2>Chơi theo cách của bạn</h2><button className="icon-button" aria-label="Đóng hướng dẫn" onClick={() => setHelp(false)}><X/></button></div><div className="help-content"><h3>Mở gói cầu thủ</h3><p>Bắt đầu với 15.000.000 BP và 2 thẻ tặng sẵn; Kho vật phẩm trống. Mua gói trong Shop (hoặc nhận gói từ sự kiện), rồi vào Kho vật phẩm, nhấn Dùng trên gói muốn mở, nhấn Mở 1 vật phẩm hoặc mở tất cả số còn lại, tối đa 10 thẻ mỗi lượt. Mở bao nhiêu trừ bấy nhiêu gói. Mỗi gói (ALL) ra 1 thẻ +1: cầu thủ OVR càng cao so với mức thấp nhất của gói và giá +1 càng đắt thì càng hiếm (xem tỷ lệ khi bấm vào ảnh gói ở Shop). Gói có ghi khoảng cấp (ví dụ +1~+5) mới ra cấp cao hơn, mỗi cấp hiếm hơn cấp trước khoảng 3,2 lần. Kết quả được tính theo tỷ lệ công bố và lưu trước khi hoạt cảnh bắt đầu. Bỏ qua không thay đổi kết quả.</p><h3>Nâng cấp thẻ</h3><p>Chọn thẻ chính và 1–5 nguyên liệu từ kho. Một vạch tương ứng 20% năng lượng, tổng tối đa 5 vạch (100%). Mỗi cấp có một mức OVR chuẩn so với thẻ chính: +1 thấp hơn 2, +2 thấp hơn 0,5, +3 bằng OVR, +4 cao hơn 0,3, +5 cao hơn 1, +6 cao hơn 1,8, +7 cao hơn 2,5, +8 cao hơn 3,3, +9 cao hơn 4,1, +10 cao hơn 5, +11 cao hơn 6, +12 cao hơn 7. Phôi đúng mức chuẩn nạp 1 vạch; mỗi OVR cao hơn chuẩn nhân 1,28 (tối đa 2,5 vạch mỗi phôi), mỗi OVR thấp hơn chuẩn nhân 0,72; thấp hơn thẻ chính từ 6 OVR trở lên chỉ còn 0,02 vạch. Năng lượng từng phôi làm tròn đến 0,1%.</p><p>Tỷ lệ thành công = tỷ lệ tối đa của cấp × số vạch / 5. Phí = cấp cộng hiện tại × 100.000 BP.</p><div className="upgrade-rate-table">{UPGRADE_LEVELS.slice(1).map((rule, i) => <span key={i}><b>+{i + 1} → +{i + 2}</b>OVR +{rule.ovrGain} · {String(rule.chance).replace('.', ',')}%</span>)}</div><p>Thành công: tăng 1 cấp cộng; OVR tăng thêm theo bảng trên và cộng dồn từ cấp +1. Thất bại: thẻ rớt về một cấp thấp hơn theo bảng xác suất của từng cấp (đập cấp càng cao càng dễ rớt sâu, không rớt quá +8), tối thiểu +1. Thẻ từ +5 có cơ hội khôi phục tùy loại phôi, cộng dồn tối đa 100%; khôi phục thì thẻ không rớt dưới mức giữ. Bản sao (cùng cầu thủ, cùng mùa) bằng hoặc cao hơn cấp thẻ chính: 100%, thấp hơn 1 cấp: 85% (đều giữ nguyên cấp); bản sao +3 trở lên: 50%, +1/+2: 20% (giữ tối thiểu +5). Thẻ cùng mùa khác cầu thủ từ +5 có OVR không thấp hơn quá 3: 100%, thấp hơn nữa giảm dần tới 35% (giữ tối thiểu cấp của phôi, không quá cấp thẻ chính); thẻ cùng mùa +4 có OVR không thấp hơn: 40% (giữ +5). Cùng cầu thủ khác mùa từ +5 có OVR không thấp hơn quá 2: 65% (giữ +5). Phôi thường không có khôi phục. Mọi kết quả đều tiêu hao nguyên liệu và phí, trừ phí BP trong chế độ thử. Cấp tối đa +{MAX_LEVEL}.</p><h3>Thị trường chuyển nhượng</h3><p>Mua cầu thủ từ danh sách hoặc bán từng thẻ trong kho. Chọn đúng cấp thẻ trước khi xác nhận. Giá mô phỏng cố định theo OVR gốc và cấp thẻ; phí bán 5%, số BP thực nhận hiển thị trước khi bán. Thẻ và lịch sử được lưu ngay trên trình duyệt. Khi bật BP vô hạn, mua/bán không thay đổi số dư. Đây là thị trường với hệ thống trong game, không kết nối người chơi khác.</p><h3>Quà mỗi ngày</h3><p>Bấm hộp quà trên thanh trên cùng để xem quà rồi bấm Nhận: {money(DAILY_FC)} FC mỗi ngày theo giờ Việt Nam (UTC+7), dùng để chơi sự kiện Nâng Cấp Siêu Sao. Ngày mới bắt đầu lúc 00:00. Không có mua BP bằng tiền thật.</p><h3>Dữ liệu và nguồn ảnh</h3><p>{players.length} cầu thủ mẫu, mùa giải và chỉ số do dự án đặt cho trải nghiệm giả lập. Tên CLB minh họa giai đoạn sự nghiệp, không đại diện đội hình hiện tại. Khung thẻ, huy hiệu, hình đại diện và sân vận động được thiết kế riêng.</p><p>Ảnh <a href="https://commons.wikimedia.org/wiki/File:Lionel_Messi_WC2022.jpg" target="_blank" rel="noreferrer">Lionel Messi WC2022</a> — Hossein Zohrevand / Tasnim News Agency, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Ảnh được cắt và áp dụng mặt nạ hiển thị; phần ảnh biến đổi theo giấy phép gốc. Cầu thủ chưa có ảnh dùng hình đại diện do dự án vẽ.</p><p>Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.</p></div></Modal>}
      {detail && <Modal className="detail-modal" label="Chi tiết cầu thủ" onClose={() => setDetail(null)}><div className="modal-heading"><h2>Chi tiết cầu thủ</h2><button className="icon-button" aria-label="Đóng chi tiết" onClick={() => setDetail(null)}><X/></button></div><div className="detail-card"><PlayerCard card={detail}/></div><div className="detail-data"><span>Quốc tịch<b><Flag code={getPlayer(detail).flag}/>{getPlayer(detail).nation}</b></span><span>{['eternal', 'prime'].includes(getPlayer(detail).tier) ? 'Đội tuyển' : 'CLB minh họa'}<b>{['eternal', 'prime'].includes(getPlayer(detail).tier) ? getPlayer(detail).nation : getPlayer(detail).club}</b></span><span>Mùa giải<b>{seasons[getPlayer(detail).tier]}</b></span><span>Cấp cộng<b>+{detail.level} / +{MAX_LEVEL}</b></span></div><button className="primary-button" disabled={detail.level >= MAX_LEVEL} onClick={() => { setDetail(null); upgradeCard(detail.uid); }}><Zap size={18}/>Nâng cấp cầu thủ này</button></Modal>}
      {picker && <Modal className="picker-modal" label={picker === 'target' ? 'Chọn thẻ chính' : 'Chọn nguyên liệu'} onClose={() => setPicker(null)}><div className="modal-heading"><h2>{picker === 'target' ? 'Chọn thẻ chính' : `Chọn nguyên liệu (${materialIds.length}/5)`}</h2><button className="icon-button" aria-label="Đóng chọn cầu thủ" onClick={() => setPicker(null)}><X/></button></div><p className="modal-description">{picker === 'target' ? `Chọn thẻ dưới +${MAX_LEVEL} để bắt đầu nâng cấp.` : 'Thẻ đã chọn sẽ bị tiêu hao. Năng lượng tính theo OVR hiện tại, kể cả khi trùng cầu thủ.'}</p><CardSortSelect id="picker-sort" value={sort} onChange={setSort}/><ViewportPages className="picker-list" itemHeight={58} resetKey={`${picker}-${sort}`}>{sortedCards.filter(c => picker === 'target' ? c.level < MAX_LEVEL : c.uid !== targetId).map(c => <button className={`picker-row ${materialIds.includes(c.uid) && picker === 'material' ? 'selected' : ''}`} key={c.uid} disabled={picker === 'material' && ((materialIds.length >= 5 || info.energy >= 100) && !materialIds.includes(c.uid) || isLocked(save, c.uid))} onClick={() => { if (picker === 'target') { setTargetId(c.uid); setMaterialIds([]); setPicker(null); } else toggleMaterial(c.uid); }}><span className={`picker-ovr ${getPlayer(c).tier}`}>{ovr(c)}</span><span className="picker-name"><b>{getPlayer(c).name}</b><small>{getPlayer(c).pos} · {seasons[getPlayer(c).tier]} · +{c.level}</small></span>{picker === 'material' ? <span className="picker-check">{materialIds.includes(c.uid) && <Check size={16}/>}</span> : <ChevronRight size={17}/>}</button>)}{!save.cards.filter(c => picker === 'target' ? c.level < MAX_LEVEL : c.uid !== targetId).length && <p className="fine-print">Chưa có thẻ phù hợp. Hãy mở thêm gói cầu thủ.</p>}</ViewportPages>{picker === 'material' && <button className="primary-button modal-bottom-button" onClick={() => setPicker(null)}>Xác nhận {materialIds.length} nguyên liệu<Check size={18}/></button>}</Modal>}
      {(readyPack || packAnimation) && <Modal key="pack-session" className={`cinema-modal ${readyPack ? 'pack-ready-modal' : finished ? 'is-finished' : ''} ${flipping ? 'is-flipping' : ''}`} label={readyPack ? 'Chuẩn bị mở thẻ' : 'Mở gói cầu thủ'} onClose={closePackSession} onSkip={packAnimation && !finished && packSkipReady ? closeAnimation : undefined}>
        <PackStage preparationId={preparationId} pack={(readyPack || packAnimation!.pack)} cards={packAnimation?.cards} phase={phase} playing={!!packAnimation && (!readyPack || entryStarted)} quick={packAnimation?.quick ?? !!save.quick} reduced={save.reduced} light={!!save.light} onPrepared={() => setPackPrepared(true)} onReady={() => setSceneReady(true)}/>
        {readyPack ? <div className={`ready-screen ${save.reduced ? 'flip-reduced' : ''}`} style={{ '--flip-duration': `${OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip / 1000}s`, '--tunnel-delay': `${Math.max(0, (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip - OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].cameraLead - 260) / 1000)}s`, '--glitch-delay': `${OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .74 / 1000}s`, '--glitch-duration': `${(OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) / 1000}s`, '--dive-at': `${(OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch - (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) * .25) / 1000}s`, '--dive-duration': `${(GATE_CROSS[packAnimation?.quick ? 'quick' : 'standard'] - OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch + (OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].flip * .26 + OPENING_ENTRY[packAnimation?.quick ? 'quick' : 'standard'].glitch) * .25) / 1000}s` } as CSSProperties}>
          <Stadium cinematic reduced={save.reduced}/>
          <ReadyTunnel gateLight={flipping && !save.reduced}/>
          <div className="ready-header"><h2 className="ready-title">{readyPack.name} đang mở</h2>{!packAnimation && <button className="ready-close" onClick={closePackSession} aria-label={flipping ? 'Bỏ qua' : 'Đóng'} aria-keyshortcuts={flipping ? "Space" : undefined} title={flipping ? "Bỏ qua (phím cách)" : 'Đóng'}>{flipping && <span>Bỏ qua</span>}<X size={34} strokeWidth={2.4}/></button>}</div>
          {readyPack.choose && !packAnimation && !draftIds ? <DraftPicker key={preparationId} pack={readyPack} initial={draftMemory.current.get(readyPack.id) ?? defaultDraft(readyPack)} seasonShort={seasonShort} onConfirm={ids => { draftMemory.current.set(readyPack.id, ids); setDraftIds(ids); }} onLeave={closePackSession}/> : <>
          {readyPack.choose && draftIds && !packAnimation && <DraftSummary pack={readyPack} ids={draftIds} seasonShort={seasonShort} onEdit={() => setDraftIds(null)}/>}
          <div className="ready-count"><span>Số gói sở hữu</span><b>SL:{readyAvailable}</b></div>
          <div className="ready-content">
            <div className="ready-art"><div className={`ready-flip ${readyPack.back ? 'tm-flip' : ''}`} style={readyPack.back ? { '--tm-mask': `url("${readyPack.back}")` } as CSSProperties : undefined} aria-hidden="true"><div className="flip-face flip-front"><PackArt pack={readyPack}/></div><div className="flip-face flip-back"><img src={asset('/assets/fco-vip-opening-logo.png')} alt=""/><span>FCO VIP</span><strong>{readyPack.short}</strong><i>VINH QUANG ĐANG CHỜ</i></div>{flipping && !save.reduced && <div className="ready-glitch" aria-hidden="true"><i/></div>}</div><span className="ready-art-halo"/></div>
            <div className="ready-actions" style={{ visibility: packAnimation ? 'hidden' : undefined }} aria-hidden={!!packAnimation} inert={!!packAnimation}>
              {readyPack.choose && draftIds ? <button className="ready-open ready-open-one" onClick={() => openDraftPack(readyPack, draftIds)} disabled={!packPrepared || !!animation || readyAvailable < 1}>Mở một vật phẩm</button> : <>
              <button className="ready-open ready-open-one" onClick={() => open(readyPack, 1)} disabled={!packPrepared || !!animation || readyAvailable < 1 || (!UNLIMITED_COINS && save.balance < getPackOpeningCost(save, readyPack, 1))}>Mở 1 vật phẩm</button>
              <button className="ready-open ready-open-batch" onClick={() => open(readyPack, readyBatch)} disabled={!packPrepared || !!animation || readyBatch < 2 || (!UNLIMITED_COINS && save.balance < getPackOpeningCost(save, readyPack, readyBatch))}>{readyBatch > 0 ? `Mở ${readyBatch} vật phẩm` : 'Hết vật phẩm'}</button>
              </>}
              <button className="ready-leave" onClick={closePackSession}>Rời<X size={18} strokeWidth={2.6}/></button>
            </div>
            <p className="ready-note" aria-live="polite"><Shield size={13}/>{packAnimation && !flipStarted ? 'Đang chuẩn bị mở…' : readyPack.choose && draftIds && packPrepared && readyAvailable > 0 ? `Nhận ngẫu nhiên 1 trong ${draftIds.length} cầu thủ đã chọn.` : !packPrepared ? 'Đang chuẩn bị sân khấu…' : readyAvailable === 0 ? 'Đã hết gói. Quay lại để nhận thêm gói thử.' : readyAvailable === 1 ? 'Còn 1 gói. Nhấn Mở 1 vật phẩm để mở gói cuối cùng.' : inventoryBatch.current ? 'Mỗi lượt tối đa 150 thẻ · Mở bao nhiêu, trừ bấy nhiêu.' : 'Mỗi lượt tối đa 10 thẻ · Mở bao nhiêu, trừ bấy nhiêu.'}</p>
            <p className="ready-cost">{readyPack.choose ? 'Gói chỉ định · không thu phí mở' : UNLIMITED_COINS ? 'BP vô hạn · Miễn phí thử' : readyBatch > 1 ? `Mở 1: ${money(getPackOpeningCost(save, readyPack, 1))} BP · Mở ${readyBatch}: ${money(getPackOpeningCost(save, readyPack, readyBatch))} BP` : getPackOpeningCost(save, readyPack, 1) === 0 ? 'Gói đã thanh toán · Không thu thêm phí mở' : `Phí mở 1 gói có sẵn: ${money(readyPack.price)} BP`}</p>
          </div>
          </>}
        </div> : packAnimation && <PackOpening key={packAnimation.id} canSkip={packSkipReady} cards={packAnimation.cards} pack={packAnimation.pack} phase={phase} quick={packAnimation.quick} reduced={save.reduced} light={!!save.light} sound={save.sound} sceneReady={sceneReady || packPrepared} onSound={() => { unlockCinemaAudio(!save.sound); updateSetting('sound', !save.sound); }} onLight={() => updateSetting('light', !save.light)} onClose={closeAnimation} onAgain={() => { busy.current = false; setAnimation(null); prepareOpening(packAnimation.pack); againCount.current = 1; }} onAgainMany={() => { busy.current = false; setAnimation(null); prepareOpening(packAnimation.pack); againCount.current = 10; }} onSave={() => { closeAnimation(); switchView('collection'); }} onTrade={() => { closeAnimation(); switchView('market'); }} stock={getPackStock(save, packAnimation.pack)} renderCard={(card, compact) => <PlayerCard card={card} compact={compact}/>} renderFlag={(code, large) => <Flag code={code} large={large}/>} />}
      </Modal>}
      {animation?.kind === 'upgrade' && <Modal className={`cinema-modal ${finished ? 'is-finished' : ''} ${!animation.success && finished ? 'is-failure' : ''}`} label="Kết quả nâng cấp" onClose={closeAnimation} onSkip={!finished ? closeAnimation : undefined}><Stadium cinematic reduced={save.reduced}/><div className="cinema-top"><span><img src={asset('/assets/fco-vip-logo.png')} alt=""/>FCO VIP</span><button className="secondary-button" onClick={closeAnimation} aria-keyshortcuts={!finished ? "Space" : undefined} title={!finished ? "Bỏ qua (phím cách)" : undefined}>{finished ? 'Đóng' : 'Bỏ qua'}{finished ? <X size={16}/> : <ChevronRight size={16}/>}</button></div>
        <div className={`upgrade-cinema upgrade-phase-${phase} ${finished || showingDrop ? (animation.success ? 'success' : 'failed') : 'is-pending'}`}><div className="upgrade-energy-ring"/>{!finished && <div className="material-dissolve">{Array.from({ length: 20 }, (_, i) => <i key={i} style={{ '--angle': `${i * 18}deg`, '--delay': `${i % 7 * .13}s` } as CSSProperties}/>)}</div>}{finished && animation.success && <div className="reveal-burst"/>}<motion.div animate={!save.reduced && phase === 1 ? { x: [-3, 4, -6, 4, -3, 0] } : { x: 0 }} transition={{ repeat: phase === 1 ? Infinity : 0, duration: .18 }} className="upgrade-reveal-card"><PlayerCard card={finished ? animation.card : { ...animation.card, level: showingDrop ? animation.droppedLevel! : animation.before }}/></motion.div><div className="upgrade-result-copy" aria-live="polite">{showingDrop ? <><span className="result-season">ĐANG KHÔI PHỤC CẤP THẺ</span><h2>Thẻ rớt về +{animation.droppedLevel}</h2><p>Hiệu ứng khôi phục đưa thẻ về +{animation.restoredLevel}.</p></> : finished ? <><span className="result-season">{animation.success ? 'VƯỢT QUA GIỚI HẠN' : animation.shielded ? 'ĐÃ BẢO VỆ NÂNG CẤP' : hasRecovery ? 'ĐÃ KHÔI PHỤC CẤP THẺ' : 'CHƯA THỂ BỨT PHÁ'}</span><h2>{animation.success ? 'Nâng cấp thành công!' : 'Nâng cấp thất bại'}</h2><div className="result-level">+{animation.before}<ArrowRight size={22}/>{hasRecovery && <><span>+{animation.droppedLevel}</span><ArrowRight size={22}/></>}<b>+{animation.card.level}</b></div>{animation.success && <UpgradePriceChange key={animation.id} before={marketQuote({ ...animation.card, level: animation.before }).price} after={marketQuote(animation.card).price} reduced={save.reduced}/>}<p>{animation.success ? 'Cấp cộng mới đã được lưu. Ngôi sao của bạn vừa tỏa sáng hơn.' : ((animation.shielded ? `Bảo vệ nâng cấp đã giữ nguyên thẻ ở +${animation.card.level}. ` : hasRecovery ? `Thẻ rớt về +${animation.droppedLevel} và được khôi phục lên +${animation.restoredLevel}. ` : `Thẻ rớt về +${animation.card.level}. `) + (UNLIMITED_COINS ? 'Nguyên liệu đã tiêu hao; không trừ BP trong chế độ thử.' : 'Nguyên liệu và phí đã tiêu hao.'))}</p><small>Kết quả đã được lưu vào lịch sử</small><button className="primary-button" onClick={closeAnimation}>Trở về lò luyện<ArrowRight size={17}/></button></> : <><h2>{phase === 0 ? 'Năng lượng đang hội tụ…' : phase === 1 ? 'Vượt qua giới hạn…' : 'Khoảnh khắc quyết định.'}</h2><p>{phase === 2 ? 'Hít thở. Và chờ điều kỳ diệu.' : 'Những ngôi sao đang tiếp thêm sức mạnh.'}</p></>}</div></div>
      </Modal>}
    </AnimatePresence>
  </div>;
}
