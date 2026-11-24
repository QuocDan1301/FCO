import { useEffect, useMemo, useRef, useState } from 'react';
import { physicalOf } from './physical';
import { faceOf, personKey } from './portraits';
import { ovrStyle } from './ovr-color';
import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import LevelPicker from './LevelPicker';
import { getPlayer, money, ovr, players, seasons } from './game';
import type { Card, Player } from './game';
import { seasonShort } from './badges';
import { LINEUP_BONUS, NOT_CLUBS, playerClubs, playerPositions, positionGroup, slotOvr } from './squad';
import { PRICE_EPOCH, PRICE_PERIOD_MS, formatMarketPrice, marketNow, priceAt } from './market';
import { playerStats, summaryStats } from './player-stats';
import { flagImageUrl } from './flags';
import { goldSlotOpen, goldSlotsFor, goldTraitIcon, goldTraitName, goldTraitOf } from './gold-traits';
import { careerOf } from './career';
import { baseTraitDesc, baseTraitIcon, baseTraitName, extraOf } from './player-extra';
import type { GoldSlot } from './gold-traits';
import GoldExtraPicker from './GoldExtraPicker';
import './player-detail.css';

type Props = {
  card: Card;
  // Phần OVR cộng thêm (team color + đội hình riêng), giống trên thẻ.
  bonus?: number;
  maxLevel: number;
  levelBadge: (level: number) => string;
  renderCard: (card: Card) => ReactNode;
  onUpgrade?: () => void;
  onClose: () => void;
  // Miniface (ảnh mặt trên sân / dòng): lựa chọn hiện tại của cầu thủ này (null = mặc định) và hàm đổi. Không truyền = không cho đổi.
  miniface?: { value: string | null; onChoose: (value: string | null) => void };
  // Tên bộ đội hình đang dùng (A / B / C), hiện cạnh các dòng đặc điểm bổ sung; không truyền = không hiện.
  lineupName?: string;
  // Cầu thủ thuộc bộ đội hình đang dùng: cấp độ ⑤ chính là +LINEUP_BONUS "vào đội hình" (người dùng 2026-11-24), nên mặc định ⑤ và bonus đã gồm trong `bonus`; còn lại ① (+0).
  inLineup?: boolean;
  // CSA vàng thêm (+7 / +11) của thẻ mình; không truyền = chỉ xem.
  onGold?: (slot: GoldSlot, trait: string | null) => Promise<void> | void;
};

const DAY = 86_400_000, HISTORY_DAYS = 14;
const dayLabel = (at: number) => new Date(at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric' });

// Lịch sử giá: mỗi kỳ 5 giờ một điểm, 14 ngày gần nhất (không trước lúc bắt đầu giá dao động).
export function priceHistory(card: Pick<Card, 'playerId' | 'level'>, now = marketNow()) {
  const from = Math.max(PRICE_EPOCH, now - HISTORY_DAYS * DAY), out: { at: number; price: number }[] = [];
  for (let at = PRICE_EPOCH + Math.ceil((from - PRICE_EPOCH) / PRICE_PERIOD_MS) * PRICE_PERIOD_MS; at <= now; at += PRICE_PERIOD_MS) {
    const price = priceAt(card, at + 1);
    if (price !== null) out.push({ at, price });
  }
  const current = priceAt(card, now);
  if (current !== null && (!out.length || out[out.length - 1].at < now)) out.push({ at: now, price: current });
  return out;
}

function PriceChart({ points }: { points: { at: number; price: number }[] }) {
  const W = 400, H = 170, L = 8, R = 362, T = 22, B = 140;
  const prices = points.map(p => p.price), max = Math.max(...prices), min = Math.min(...prices), span = max - min || max * .1 || 1;
  const t0 = points[0].at, t1 = points[points.length - 1].at, tw = t1 - t0 || 1;
  const xy = points.map(p => [L + (p.at - t0) / tw * (R - L), B - (p.price - min) / span * (B - T)] as const);
  const peak = prices.indexOf(max), last = xy.length - 1;
  // Mốc ngày dưới trục: 5 điểm chia đều, bỏ ngày trùng (khoảng ngắn hơn 5 ngày).
  const seen = new Set<string>(), ticks = Array.from({ length: 5 }, (_, i) => t0 + tw * i / 4).filter(at => { const k = dayLabel(at); if (seen.has(k)) return false; seen.add(k); return true; });
  return <svg className="pd-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Giá từ ${money(min)} đến ${money(max)} BP`}>
    {[0, 1 / 3, 2 / 3].map(f => <line key={f} x1={L} x2={R + 14} y1={T + (B - T) * f} y2={T + (B - T) * f} className="pd-grid"/>)}
    {/* Trục dạng chữ L (người dùng 2026-11-24): trục dọc bên trái và trục ngày phía dưới. */}
    <path d={`M${L} ${T - 12}V${B}H${R + 14}`} className="pd-axis" fill="none"/>
    <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} className="pd-line"/>
    <circle cx={xy[peak][0]} cy={xy[peak][1]} r="3" className="pd-dot"/>
    <text x={Math.min(R - 30, Math.max(L + 30, xy[peak][0]))} y={xy[peak][1] - 8} className="pd-label" textAnchor="middle">{money(max)}</text>
    {last !== peak && prices[last] !== max && <><circle cx={xy[last][0]} cy={xy[last][1]} r="3" className="pd-dot is-now"/>
      <text x={Math.min(R - 30, xy[last][0])} y={Math.min(H - 22, xy[last][1] + 16)} className="pd-label" textAnchor="middle">{money(prices[last])}</text></>}
    {(() => { const lo = prices.indexOf(min); return lo !== peak && lo !== last ? <text x={Math.min(R - 30, Math.max(L + 30, xy[lo][0]))} y={Math.min(H - 22, xy[lo][1] + 16)} className="pd-label" textAnchor="middle">{money(min)}</text> : null; })()}
    <text x={R + 12} y={H - 4} className="pd-tick" textAnchor="start">Ngày</text>
    {ticks.map(at => { const x = L + (at - t0) / tw * (R - L); return <text key={at} x={x} y={H - 4} className="pd-tick" textAnchor={x < L + 20 ? 'start' : x > R - 20 ? 'end' : 'middle'}>{dayLabel(at)}</text>; })}
  </svg>;
}

// Logo CLB ở góc phải thẻ: thẻ có teamLogo dùng luôn, không có thì lấy logo của thẻ khác cùng tên CLB (dựng một lần khi cần).
let clubLogos: Map<string, string> | null = null;
const clubLogoOf = (p: Player): string | null => p.teamLogo ?? (clubLogos ??= new Map(players.flatMap(x => x.teamLogo && x.club ? [[x.club, x.teamLogo] as [string, string]] : []))).get(p.club) ?? null;

// Hình bàn chân theo ảnh người dùng gửi (2026-11-24): bàn chân xanh lá nguyên khối, chấm trắng nhỏ ở mũi (chỉ chân thuận), số điểm trắng lớn ở giữa; chân phải lật ngang.
// Chân thuận màu xanh lá, chân còn lại màu xám.
export function Foot({ side, value, main }: { side: 'left' | 'right'; value: number; main: boolean }) {
  const flip = side === 'right' ? 'translate(18 0) scale(-1 1)' : undefined;
  return <svg className={`pd-foot${main || value === 5 ? ' is-main' : ''}`} viewBox="0 0 18 35" role="img" aria-label={`Chân ${side === 'left' ? 'trái' : 'phải'} ${value}`}>
    <g transform={flip}>
      <path d="M8 1.5C4 1.5 1.5 5 1.8 9.5c.2 3.5 1.7 6 2 9.5.2 3.5 1 6 1.7 9C6.2 31 8 33.5 11 33.5c3.5 0 5.2-2.5 5-6-.2-3-2-5.5-2.2-9-.2-4 2.2-6.5 2.2-10 0-4-3.5-7-8-7z"/>
      {main && <circle className="pd-foot-dot" cx="9" cy="5.5" r="1.2"/>}
    </g>
    <text x="9" y="23" textAnchor="middle">{value}</text>
  </svg>;
}

// Ô chọn dạng danh sách xổ xuống kiểu FC Online (người dùng 2026-11-24): nút hiện giá trị + mũi tên ▼ / ▲, danh sách nền xám đậm chữ trắng căn giữa,
// mục đang chọn nền sáng chữ tối có dấu tích xanh bên trái. Đóng khi chọn, bấm ra ngoài hoặc nhấn Esc.
function PdDrop({ label, value, head, options, onChange, className, ring }: { label: string; value: number; head: string; options: { value: number; text: string }[]; onChange: (value: number) => void; className?: string; ring?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    box.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  return <div ref={box} className={`pd-drop ${className ?? ''}${open ? ' is-open' : ''}`}>
    <button type="button" className="pd-drop-head" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${head}`} onClick={() => setOpen(o => !o)}>{ring ? <span className="pd-ring">{value}</span> : <span>{head}</span>}<i aria-hidden="true"/></button>
    {open && <ul className="pd-drop-list" role="listbox" aria-label={label}>{options.map(o => <li key={o.value} role="option" aria-selected={o.value === value} className={o.value === value ? 'is-on' : undefined} onClick={() => { onChange(o.value); setOpen(false); }}>{o.value === value && <b aria-hidden="true"><Check size={14} strokeWidth={4}/></b>}{ring ? <span className="pd-ring">{o.value}</span> : o.text}</li>)}</ul>}
  </div>;
}

// Mọi vị trí trên sân (tab Tất cả vị trí): OVR của thẻ khi đá ở từng vị trí (đã trừ đá trái vị trí, cộng team color).
// Sơ đồ vị trí (x, y theo % khung sân): ST ở trên cùng, GK ở dưới cùng, đúng bố cục mẫu của người dùng 2026-11-24.
const ROLE_SPOTS: [string, number, number][] = [['ST', 50, 6], ['LW', 17, 18], ['CF', 50, 18], ['RW', 83, 18], ['CAM', 50, 30], ['LM', 32, 42], ['CM', 50, 42], ['RM', 68, 42], ['CDM', 50, 54],
  ['LWB', 17, 67], ['CB', 50, 67], ['RWB', 83, 67], ['LB', 27, 79], ['SW', 50, 79], ['RB', 73, 79], ['GK', 50, 91]];
const ALL_ROLES = ROLE_SPOTS.map(x => x[0]);

// Thông tin cầu thủ, bố cục kiểu FC Online (người dùng 2026-11-24): trái = tên / vị trí + OVR / CLB · quốc tịch · lương, mini face,
// ô chọn mức cộng, dải 6 chỉ số tóm tắt, tab C.Số ẩn / Giá / Sự nghiệp CLB; phải = tab C.Số chung / Tất cả vị trí.
export default function PlayerDetail({ card: owned, bonus: realBonus = 0, maxLevel, levelBadge, onClose, miniface, lineupName, inLineup, onGold }: Props) {
  // Đổi mức cộng để xem (OVR, chỉ số, giá theo cấp đó); thẻ thật không đổi.
  const [level, setLevel] = useState(owned.level);
  useEffect(() => setLevel(owned.level), [owned.uid, owned.level]);
  const card = useMemo(() => level === owned.level ? owned : { ...owned, level }, [owned, level]);
  const p = getPlayer(card);
  // Hai ô xem thử (2026-11-24): Cấp độ ① / ⑤ (⑤ cộng TRAIN5_BONUS) và Team Color (-) / +1…+9; mặc định team color là phần cộng thật của thẻ trong đội hình.
  const [train, setTrain] = useState<1 | 5>(inLineup ? 5 : 1);
  useEffect(() => setTrain(inLineup ? 5 : 1), [owned.uid, inLineup]);
  const [teamColor, setTeamColor] = useState<number | null>(null);
  // Phần team color thật = bonus thật trừ +LINEUP_BONUS của người trong đội hình.
  const realTc = Math.max(0, realBonus - (inLineup ? LINEUP_BONUS : 0));
  const tc = teamColor ?? realTc;
  // Cầu thủ đang đá chính / trong đội hình và được cộng team color thật: chưa tự chọn mức thì hiện "Đội hình hiện tại" (-1) (người dùng 2026-11-24).
  const showCurrent = !!inLineup && realTc > 0, onCurrent = showCurrent && teamColor === null;
  const bonus = tc + (train === 5 ? LINEUP_BONUS : 0);
  const [tab, setTab] = useState<'hidden' | 'price' | 'career'>('hidden');
  // Tab bên phải: 'stats' = C.Số chung, 'roles' = Tất cả vị trí, hoặc một vị trí sở trường (ST, RW…) = chỉ số khi đá vị trí đó.
  const [side, setSide] = useState<string>('stats');
  const positions = playerPositions(p).slice(0, 3).map(pos => ({ pos, value: slotOvr(card, pos) + bonus }));
  const main = positions[0] ?? { pos: p.pos, value: ovr(card) + bonus };
  const stats = useMemo(() => playerStats(p, ovr(card)), [p, card]);
  // Chỉ số khi đá một vị trí sở trường (tab ST / RW…): tính theo OVR của vị trí đó.
  const posStats = useMemo(() => playerStats(p, side === 'stats' || side === 'roles' ? ovr(card) : slotOvr(card, side)), [p, card, side]);
  const summary = useMemo(() => summaryStats(p, ovr(card)), [p, card]);
  const roles = useMemo(() => new Map(ALL_ROLES.map(pos => [pos, slotOvr(card, pos) + bonus])), [card, bonus]);
  const history = useMemo(() => priceHistory(card), [card]);
  const now = priceAt(card);
  const career = careerOf(p.name), clubs = playerClubs(p), cardClub = p.club && !NOT_CLUBS.has(p.club) ? p.club : null;
  const goldTrait = goldTraitOf(p.id), extra = extraOf(p.id);
  // Tự chọn CSA vàng thêm (ô +7 / +11 theo mùa thẻ, đổi miễn phí; người dùng 2026-11-24 "thêm tự chọn chỉ số ẩn vàng cho các mùa thẻ như trước"):
  // bấm ô trong dòng "HLV đào tạo đặc điểm bổ sung" mở bảng chọn; chỉ khi xem đúng cấp thật của thẻ mình (onGold có từ App).
  const [goldOpen, setGoldOpen] = useState(false);
  useEffect(() => setGoldOpen(false), [owned.uid]);
  const canPickGold = !!onGold && level === owned.level;
  const phys = physicalOf(p.id);
  const face = faceOf(p, miniface ? { [personKey(p)]: miniface.value ?? '' } : undefined);
  return <div className="pd">
    <header className="pd-bar"><h2>Thông tin cầu thủ</h2><button className="icon-button" aria-label="Đóng chi tiết" onClick={onClose}><X/></button></header>
    <div className="pd-body">
      <section className="pd-left">
        <div className="pd-id">
          <div className="pd-id-text">
            <p className="pd-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></p>
            <p className="pd-main"><i className={`pos-${positionGroup(main.pos)}`}>{main.pos}</i><b>{main.value}</b></p>
            <p className="pd-meta pd-meta-club">{(cardClub ?? p.club) !== p.nation && <>{cardClub ?? p.club}<i/></>}{p.nation}{p.flag && <img src={flagImageUrl(p.flag)} alt=""/>}</p>
            <p className="pd-meta">Lương <span className="squad-wage"><b>{p.wage ?? 0}</b></span>{phys && <>
              <i/>{phys.height}cm<i/>{phys.weight}kg{phys.body && <><i/>{phys.body}</>}
              {/* Hai chân: chân thuận (điểm cao hơn, bằng nhau thì chân trái) tô xanh, đặt trước. */}
              <span className="pd-feet" aria-label={`Chân trái ${phys.left}, chân phải ${phys.right}`}><Foot side="left" value={phys.left} main={phys.left >= phys.right}/><Foot side="right" value={phys.right} main={phys.right >= phys.left}/></span>
            </>}</p>
          </div>
          {/* Mini face thay cho khung thẻ: ảnh miniface đang chọn, không có thì chân dung tự gán / ảnh thẻ. */}
          <div className={`pd-mini${face.portrait ? '' : ' is-card'}`}><img src={face.src} alt={p.name}/></div>
          {/* Góc trên: logo CLB như ở góc phải thẻ (người dùng 2026-11-24, thay biểu tượng chỉ số ẩn vàng); CLB chưa có logo thì để trống. */}
          {(() => { const logo = clubLogoOf(p); return logo && <img className="pd-emblem" src={logo} alt={p.club} title={p.club}/>; })()}
        </div>
        <div className="pd-pickers">
          <LevelPicker value={level} levels={Array.from({ length: maxLevel }, (_, i) => i + 1)} levelBadge={levelBadge} onChange={setLevel} tone="light"/>
          <PdDrop ring className="pd-select-train" label="Cấp độ" value={train} head={`Cấp độ ${train}`} options={[{ value: 1, text: '1' }, { value: 5, text: '5' }]} onChange={v => setTrain(v === 5 ? 5 : 1)}/>
          <PdDrop className="pd-select-tc" label="Team Color" value={onCurrent ? -1 : tc} head={onCurrent ? 'Team Color (Đội hình hiện tại)' : `Team Color (${tc > 0 ? `+${tc}` : '-'})`}
            options={[...Array.from({ length: Math.max(9, tc) + 1 }, (_, n) => ({ value: n, text: n === 0 ? '-' : `+${n}` })), ...(showCurrent ? [{ value: -1, text: 'Đội hình hiện tại' }] : [])]} onChange={v => setTeamColor(v === -1 ? null : v)}/>
        </div>
        <div className="pd-sum">{summary.map(s => <div key={s.name}><span>{s.name}</span><b style={ovrStyle(s.value + bonus)}>{s.value + bonus}</b></div>)}</div>
        <div className="pd-tabs" role="tablist" aria-label="Thông tin thêm">
          <button type="button" role="tab" aria-selected={tab === 'hidden'} onClick={() => setTab('hidden')}>C.Số ẩn</button>
          <button type="button" role="tab" aria-selected={tab === 'price'} onClick={() => setTab('price')}>Giá</button>
          <button type="button" role="tab" aria-selected={tab === 'career'} onClick={() => setTab('career')}>Sự nghiệp CLB</button>
        </div>
        {tab === 'hidden' ? (canPickGold && goldOpen ? <div className="pd-goldx-view" role="tabpanel">
          <GoldExtraPicker card={owned} player={p} onChoose={onGold!}/>
          <button type="button" className="secondary-button pd-goldx-back" onClick={() => setGoldOpen(false)}>← Quay lại thông tin</button>
        </div> : <dl className="pd-info" role="tabpanel">
          <div><dt>Ngày sinh</dt><dd>{extra?.birth ?? '—'}</dd></div>
          <div><dt>Kỹ thuật</dt><dd className="pd-stars" aria-label={extra?.skill ? `${extra.skill} sao` : 'Chưa rõ'}>{Array.from({ length: 5 }, (_, i) => <svg key={i} className={i >= 5 - (extra?.skill ?? 0) ? 'is-on' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.2 2.9 6.2 6.7.8-4.9 4.6 1.3 6.7L12 17.1l-6 3.4 1.3-6.7L2.4 9.2l6.7-.8z"/></svg>)}</dd></div>
          <div><dt>Danh tiếng</dt><dd>{extra?.reputation || '—'}</dd></div>
          <div className="pd-info-icons"><dt>Chỉ số ẩn gốc</dt><dd>{goldTrait || extra?.traits.length ? <>{goldTrait && <img src={goldTrait.icon} alt={goldTrait.name} title={`${goldTrait.name}: ${goldTrait.desc}`}/>}{extra?.traits.map(id => <img key={id} src={baseTraitIcon(id)} alt={baseTraitName(id)} title={`${baseTraitName(id)}: ${baseTraitDesc(id)}`}/>)}</> : 'Không có'}</dd></div>
          <div className="pd-info-icons"><dt>HLV đào tạo đặc điểm bổ sung</dt><dd>{lineupName && <strong className="pd-info-set">Đội hình {lineupName}</strong>}{goldSlotsFor(p.tier).map(slot => {
            const open = goldSlotOpen(p.tier, card.level, slot), id = open ? card.gold?.[slot] : undefined;
            const cell = id ? <img key={slot} src={goldTraitIcon(id)} alt={goldTraitName(id)} title={`+${slot}: ${goldTraitName(id)}`}/>
              : <span key={slot} className={`pd-slot${open ? '' : ' is-locked'}`} title={open ? `Ô +${slot} chưa chọn` : `Mở khi thẻ đạt +${slot}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 1.8h10.8L22.8 12l-5.4 10.2H6.6L1.2 12z"/>{!open && <path className="lk" d="M8.6 11h6.8v5.6H8.6zm1.5 0V9.3a1.9 1.9 0 0 1 3.8 0V11" />}</svg><em>+{slot}</em></span>;
            return canPickGold && open ? <button key={slot} type="button" className="pd-slot-btn" aria-expanded={goldOpen} title={`Chọn CSA vàng ô +${slot}`} onClick={() => setGoldOpen(o => !o)}>{cell}</button> : cell;
          })}</dd></div>
          {/* Chỉ số ẩn mới / Tạo cầu thủ: tính năng chưa có trong game, hiện ô khóa để giữ đúng bố cục mẫu (người dùng 2026-11-24). */}
          <div className="pd-info-icons"><dt>Chỉ số ẩn mới</dt><dd>{lineupName && <strong className="pd-info-set">Đội hình {lineupName}</strong>}{['is-silver', 'is-gold', 'is-silver'].map((tone, i) => tone === 'is-gold' && canPickGold
            // Ô vàng ở giữa bấm được (người dùng 2026-11-24: "nhấn vô đây để thêm chỉ số ẩn vàng"): mở bảng chọn CSA vàng thêm (+7 / +11 theo mùa thẻ).
            ? <button key={i} type="button" className="pd-slot-btn" aria-expanded={goldOpen} title="Thêm chỉ số ẩn vàng" onClick={() => setGoldOpen(o => !o)}><span className="pd-slot is-gold"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 1.8h10.8L22.8 12l-5.4 10.2H6.6L1.2 12z"/><path className="lk" d="M11 8.2h2v2.8h2.8v2H13v2.8h-2V13H8.2v-2H11z"/></svg></span></button>
            : <span key={i} className={`pd-slot is-locked ${tone}`} title="Sắp ra mắt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 1.8h10.8L22.8 12l-5.4 10.2H6.6L1.2 12z"/><path className="lk" d="M8.6 11h6.8v5.6H8.6zm1.5 0V9.3a1.9 1.9 0 0 1 3.8 0V11"/></svg></span>)}</dd></div>
          <div><dt>Tạo cầu thủ</dt><dd>Chưa mở</dd></div>
        </dl>) : tab === 'price' ? <div className="pd-price" role="tabpanel">
          {history.length > 1 ? <PriceChart points={history}/> : <p className="pd-empty">{now === null ? 'Thẻ này chưa có giá.' : 'Chưa đủ dữ liệu để vẽ biểu đồ.'}</p>}
          <p className="pd-now"><span>Giá hiện tại</span><b>{now === null ? 'Chưa có giá' : <>{money(now)}<small> BP</small></>}</b></p>
        </div> : <div className="pd-career" role="tabpanel">
          {career ? <table className="pd-career-table"><thead><tr><th>Năm</th><th>CLB</th><th>Thuê</th></tr></thead>
            <tbody>{career.map(([years, club], i) => <tr key={i}><td>{years}</td><td><b>{club}</b></td><td/></tr>)}</tbody></table>
            : clubs.length ? <ol>{clubs.map(club => <li key={club}><b>{club}</b></li>)}</ol>
            : <p className="pd-empty">Chưa có dữ liệu CLB của cầu thủ này.</p>}
        </div>}
      </section>
      <section className="pd-right" aria-label="Chỉ số">
        <div className="pd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={side === 'stats'} onClick={() => setSide('stats')}>C.Số chung</button>
          <button type="button" role="tab" aria-selected={side === 'roles'} onClick={() => setSide('roles')}>Tất cả vị trí</button>
        </div>
        {side === 'roles'
          ? <div className="pd-roles" role="img" aria-label="OVR ở từng vị trí">
            <svg viewBox="0 0 440 520" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#fff" strokeWidth="2.2" vectorEffect="non-scaling-stroke">
              <rect x="150" y="0" width="140" height="52"/><path d="M185 52a36 36 0 0 0 70 0" /><path d="M0 260H440"/><circle cx="220" cy="260" r="52"/><rect x="85" y="458" width="270" height="62"/><rect x="150" y="494" width="140" height="26"/><path d="M185 458a36 36 0 0 1 70 0"/></g></svg>
            {ROLE_SPOTS.map(([pos, x, y]) => <div key={pos} className={`pd-role-spot pos-${positionGroup(pos)}`} style={{ left: `${x}%`, top: `${y}%` }}><i>{pos}</i><b>{roles.get(pos)}</b></div>)}
          </div>
          : side === 'stats'
            ? <ul className="pd-stats">{stats.map(s => <li key={s.name}><span>{s.name}</span><b style={ovrStyle(s.value + bonus)}>{s.value + bonus}</b>{bonus > 0 ? <i>+{bonus}</i> : <i/>}</li>)}</ul>
            : <ul className="pd-stats">{posStats.map(s => <li key={s.name}><span>{s.name}</span><b style={ovrStyle(s.value + bonus)}>{s.value + bonus}</b>{bonus > 0 ? <i>+{bonus}</i> : <i/>}</li>)}</ul>}
      </section>
    </div>
  </div>;
}
