import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, EyeOff, Gift, RefreshCw, Trophy, X } from 'lucide-react';
import { money } from './game';
import type { Card } from './game';
import { asset } from './asset';
import { findPack } from './event';
import { bilacRewardText, isJackpot, shortBp, summarizeBilac } from './bilac';
import PackImage from './PackImage';
import RollingNumber from './RollingNumber';
import CtpDraft from './CtpDraft';
import { mini as miniPrize } from './jackpot';
import type { BilacReward, CtpConfig, CtpDraftResult, CtpTop, CtpMilestone, CtpPending, CtpPendingResult, CtpResult, CtpReward, CtpState, ServerJackpot } from './wallet-state';
import { CTP_RULES, ctpAvailable, ctpPath, ctpPrice } from './ctp';
import VoucherCard from './VoucherCard';
import { voucherName } from './stp';
import { marketNow } from './market';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import './vqtg.css'; // khung Shop Đổi Vé (vq-shop / vq-ms / vq-choose) dùng chung cho Quà tích lũy
import { CTP_RAILS, CTP_CARD_W, type CtpPrize } from './ctp-prizes';
import { CTP_LAYOUT } from './ctp-layout';
import './ctp.css';

// Sự kiện Cờ tỷ phú (2026-11-22, đang dựng). Màn đầu = bàn cờ, VỪA MỘT MÀN như ảnh mẫu người dùng gửi (mẫu hiện hàng 79–944 của nền
// loop 1920 × 1080): --u = min(rộng / 1760, cao / 865) (bỏ 80 px đá mỗi mép); mỗi tầng là .ctp-canvas giữ đúng hệ toạ độ ảnh nền (1920 × u) căn giữa, phần dư hai
// bên phủ bằng chính nền tầng đó làm mờ. Toạ độ / cỡ đo từ ảnh mẫu (src/ctp-layout.ts + ctp.css). Cuộn xuống: 3 tầng nền còn lại nối liền.
// Cách chơi do máy chủ quyết (fco_ctp_play, 202611220001_fco_ctp.sql); trang chỉ diễn: xúc xắc, quân đi từng ô, sáng thẻ quà trúng.
// Khi EVENT_CTP_ENABLED = false chỉ admin vào được (máy chủ cũng chỉ cho admin chơi khi fco_ctp_state.open = false).
// Mọi tầng dùng CHUNG tỉ lệ --u (vừa một màn cho bàn cờ) và xếp liền nhau thành một cột rộng 1920 × u để vân nền nối khít.
// Tầng bàn cờ bỏ 79 hàng trên (như ảnh mẫu) và hiện tới hết đáy ảnh (hàng 1080) để nối đúng sang tầng 2.
export const CTP_LAYERS = [
  { id: 'board', file: 'bg-1-board.webp', h: 1080, skip: 79 },
  // Tầng 2 + 3 dựng chung một khối cao theo nội dung (Quà tích lũy), nền 2 → 3 nối liền như ảnh gốc; bảng quà bắt đầu ngay dưới
  // chỗ đá của tầng 2 hết (~hàng 330) nên nằm sát bàn chơi.
  { id: 'lottery', file: 'bg-2.webp', h: 1225, skip: 0 },
  { id: 'accumulated', file: 'bg-3.webp', h: 2389, skip: 0 },
  // Tầng 4 (Tuyển chọn) nối dài thêm 460 hàng đá (chính đáy ảnh lật ngược) để chứa hàng ô thẻ + nút như ảnh mẫu.
  { id: 'players', file: 'bg-4.webp', h: 1242, skip: 0, extra: 460 },
] as const;
const A = (file: string) => `${import.meta.env.BASE_URL}assets/ctp/${file}`;
const TILE = { normal: 'block.webp', mini: 'tile-mini.webp', special: 'tile-special.webp', ultimate: 'tile-ultimate.webp', lucky: 'tile-lucky.webp' } as const;
const NAME = { normal: '', mini: 'Mini Prize', special: 'Special', ultimate: 'Ultimate Prize', lucky: 'Lucky' } as const;
// Toạ độ px của ảnh nền 1920 × 1080 → % trong khung.
const px = (x: number, y: number, extra: CSSProperties = {}) => ({ left: `${x / 19.2}%`, top: `${y / 10.8}%`, ...extra }) as CSSProperties;

// Ô thường nằm ngang qua đường đi như ảnh mẫu: ảnh block có cạnh dài chéo lên phải, nên 2 cạnh chạy chéo lên phải (ô 8–13: trái → trên,
// 22–27: phải → dưới) dùng ảnh lật ngang.
const CTP_FLIP = (c: { n: number; kind: string }) => c.kind === 'normal' && ((c.n > 7 && c.n < 14) || (c.n > 21 && c.n < 28));

// Hộp quà cam nơ đỏ ở khung chúc mừng (tự vẽ).
function GiftBox() {
  return <svg className="ctp-giftbox" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 13c-3-7-11-8-11-3 0 3 5 3 11 3zm0 0c3-7 11-8 11-3 0 3-5 3-11 3z" fill="#e4202a" stroke="#8a0d12" strokeWidth="1.2"/>
    <rect x="6" y="19" width="28" height="18" rx="2" fill="#f28a1a" stroke="#8a3d05" strokeWidth="1.2"/>
    <rect x="4" y="13" width="32" height="8" rx="2" fill="#ffa53a" stroke="#8a3d05" strokeWidth="1.2"/>
    <rect x="17" y="13" width="6" height="24" fill="#e4202a"/>
    <path d="M6 22h28" stroke="#c8640a" strokeWidth="1"/>
    <path d="M9 15h8M9 24v10" stroke="#ffd59a" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/>
  </svg>;
}

const prizeName = (p: CtpPrize) => 'bp' in p ? `${p.bp.toLocaleString('vi-VN')} BP` : 'fc' in p ? `${money(p.fc)} FC` : findPack(p.pack)?.name ?? p.pack;

// Một thẻ quà đứng trên kệ: BP / FC = thẻ có số ở góc tối (như Bi Lắc / VQTG), gói = ảnh gói. Tên hiện khi trỏ chuột.
function ShelfCard({ prize, at, hit }: { prize: CtpPrize; at: [number, number]; hit: boolean }) {
  const name = prizeName(prize);
  let art;
  if ('bp' in prize) art = <><img src={asset('/assets/event/bp-card.webp')} alt="" draggable={false}/><b>{shortBp(prize.bp)}</b></>;
  else if ('fc' in prize) art = <><img src={asset('/assets/bilac/fc-card.webp')} alt="" draggable={false}/><b>{money(prize.fc)}</b></>;
  else { const pack = findPack(prize.pack); art = pack ? <PackImage pack={pack}/> : <Gift aria-hidden="true"/>; }
  return <span className={`ctp-prize is-${'bp' in prize ? 'bp' : 'fc' in prize ? 'fc' : 'pack'}${hit ? ' is-hit' : ''}`} style={{ left: `${at[0]}%`, top: `${at[1]}%` }} data-tip={name} aria-label={name} tabIndex={0}>{art}</span>;
}

// 8 dải kệ màu: 5 quà mỗi dải (src/ctp-prizes.ts, từ quaracctp.xlsx). Thẻ xa (trên) vẽ trước để thẻ gần đè đúng phối cảnh.
// hit = món vừa sút trúng (sáng lên).
function Shelf({ hit }: { hit: Hit }) {
  const cards = CTP_RAILS.flatMap(rail => rail.prizes.map((prize, i) => ({ key: `${rail.id}-${i}`, rail: rail.id, slot: i, prize, at: rail.at[i] })));
  return <div className="ctp-shelf" aria-label="Quà trên kệ" style={{ '--card-w': CTP_CARD_W } as CSSProperties}>{cards.sort((a, b) => a.at[1] - b.at[1]).map(c =>
    <ShelfCard key={c.key} prize={c.prize} at={c.at} hit={!!hit && hit.rail === c.rail && hit.slot === c.slot}/>)}</div>;
}

type Hit = { rail: string; slot: number } | null;
// Xúc xắc: idle = đứng (hiện số vừa lắc), wait = quay liên tục chờ máy chủ, settle = quay chậm dần nhiều vòng rồi dừng.
type Spin = 'idle' | 'wait' | 'settle';
const SETTLE_MS = 800;
// Tên màu 8 dải kệ (Thẻ Khí Vận chọn bỏ 3 màu).
const RAIL_NAMES: Record<string, string> = { orange: 'Cam', green: 'Xanh lá', red: 'Đỏ', purple: 'Tím', yellow: 'Vàng', cyan: 'Xanh ngọc', white: 'Trắng', pink: 'Hồng' };
const RAIL_COLORS: Record<string, string> = { orange: '#ff8a1c', green: '#5fd62a', red: '#f0281e', purple: '#9b30ff', yellow: '#ffe81a', cyan: '#19e0e0', white: '#f4f4f4', pink: '#ff2fe0' };
// Mô tả 2 thẻ (người dùng gửi 2026-11-22), hiện khi trỏ chuột / chạm vào thẻ ở khung "Sử dụng cho lần tiếp theo".
const CARD_INFO = {
  chance: { name: 'Thẻ Cơ Hội', file: 'card-star.webp', text: ['Nhận ở mốc quà tích lũy 200 điểm.', 'Khi dùng thẻ này hệ thống sẽ quay cho bạn 2 lần và bạn có thể chọn xem mình thích quà ở lần quay nào.', 'Ví dụ: nếu bạn quay 50 lượt, hệ thống sẽ cho bạn xem Bộ quà A và Bộ quà B, mỗi bộ 50 món. Bạn được chọn 1 trong 2 bộ quà.', 'Mẹo: dùng cùng lúc Thẻ Cơ Hội + Thẻ Khí Vận để loại bỏ 3 màu quà không thích và chọn đúng bộ quà bạn muốn nhận!'] },
  luck: { name: 'Thẻ Khí Vận', file: 'card-heart.webp', text: ['Nhận ở mốc quà tích lũy 450 điểm.', 'Khi dùng thẻ này bạn sẽ được bỏ ra 3 màu (bộ quà) mà bạn không thích cho lượt quay kế tiếp.', 'Ví dụ: nếu bạn chọn bỏ các quà ở 3 màu (Vàng, Trắng, Xanh ngọc) thì khi quay hệ thống chỉ ra quà ở các màu còn lại (Hồng, Cam, Đỏ, Xanh lá, Tím).', 'Mẹo: dùng cùng lúc Thẻ Cơ Hội + Thẻ Khí Vận để loại bỏ 3 loại quà không thích và được chọn đúng bộ quà bạn muốn nhận!'] },
} as const;
type CardUse = { chance: boolean; luck: string[] | null };
// Quả bóng đang bay: từ chân quân (ô vừa dừng) tới giữa thẻ quà trúng trên kệ (% khung nền). key đổi mỗi cú sút để chạy lại hoạt cảnh.
type Kick = { from: [number, number]; to: [number, number]; key: number } | null;
const KICK_MS = 560;
const cellAt = (n: number): [number, number] => n ? CTP_LAYOUT.cells[n - 1].at : START;
// Tâm thẻ quà = đáy thẻ (rail.at) nhích lên nửa chiều cao thẻ (64 px nền).
const cardAt = (rail: string, slot: number): [number, number] | null => { const r = CTP_RAILS.find(x => x.id === rail); return r ? [r.at[slot][0], r.at[slot][1] - 32 / 10.8] : null; };
const TONES = ['green', 'blue', 'orange', 'red'] as const;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Ô 0 = chỗ đứng lúc đầu cạnh biển BẮT ĐẦU (ảnh mẫu: tâm quân 786, 809 → chân 95 % cao 112 px = 860, cộng 4,6 px CSS nâng lên = 864). Chưa chơi lượt nào
// (đứng ô 28, 0 điểm) thì quân đứng đây; đã đi rồi quay về ô 28 thì đứng trên ô Lucky.
const START: [number, number] = [786 / 19.2, 864 / 10.8];
const startToken = (ctp: CtpState | null) => !ctp || (ctp.pos === 28 && ctp.points === 0) ? 0 : ctp.pos;

// Ảnh nhỏ một món quà trong bảng kết quả.
function RewardArt({ reward }: { reward: CtpReward }) {
  if ('voucher' in reward) return <VoucherCard pct={reward.voucher} className="ctp-r-voucher"/>;
  if ('ctpCard' in reward) return <span className="ctp-r-card"><img src={A(reward.ctpCard === 'chance' ? 'card-star.webp' : 'card-heart.webp')} alt=""/></span>;
  if ('ctpBadge' in reward) return <span className="ctp-r-card"><img src={A('badge-card-v1.webp')} alt=""/></span>;
  if (isJackpot(reward)) return <span className="ctp-r-jp"><Trophy aria-hidden="true"/></span>;
  if ('bp' in reward) return <span className="ctp-r-card"><img src={asset('/assets/event/bp-card.webp')} alt=""/><b>{shortBp(reward.bp)}</b></span>;
  if ('fc' in reward) return <span className="ctp-r-card"><img src={asset('/assets/bilac/fc-card.webp')} alt=""/><b>{money(reward.fc)}</b></span>;
  const pack = findPack(reward.pack);
  return pack ? <PackImage pack={pack}/> : <span className="ctp-r-jp"><Gift aria-hidden="true"/></span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  // Portal ra body: trang dùng container-type nên position:fixed bên trong bị giới hạn trong khung trang.
  return createPortal(<div className="ctp-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="ctp-dialog" onClick={e => e.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" className="ctp-x" onClick={onClose} aria-label="Đóng"><X/></button></header>
      {children}
    </div>
  </div>, document.body);
}

type ResultView = { title: string; rewards: CtpReward[]; notes: string[] };

// Khung tên khi trỏ chuột / chạm / Tab vào một món quà có data-tip (chỉ hiện tên, không thêm gì).
function useCtpTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip ?? '', x: r.left + r.width / 2, y: r.top });
    };
    const hide = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      const to = (e as MouseEvent).relatedTarget as Element | null;
      if (el && (!to || !el.contains(to))) setTip(null);
    };
    document.addEventListener('mouseover', show); document.addEventListener('focusin', show);
    document.addEventListener('mouseout', hide); document.addEventListener('focusout', hide);
    const clear = () => setTip(null);
    document.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('mouseover', show); document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', hide); document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', clear, true);
    };
  }, []);
  return tip && tip.text ? createPortal(<span className="ctp-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</span>, document.body) : null;
}

// Tên một món quà (kể cả phiếu thuế, Thẻ Cơ Hội / Khí Vận, Huy Hiệu Tuyển Chọn).
const ctpRewardText = (r: CtpReward) => 'voucher' in r ? `${voucherName(r.voucher)}${r.count > 1 ? ` x ${r.count}` : ''}`
  : 'ctpCard' in r ? `${r.ctpCard === 'chance' ? 'Thẻ Cơ Hội' : 'Thẻ Khí Vận'}${r.count > 1 ? ` x ${r.count}` : ''}`
  : 'ctpBadge' in r ? `Huy Hiệu Tuyển Chọn${r.ctpBadge > 1 ? ` x ${r.ctpBadge}` : ''}` : bilacRewardText(r);

// Ảnh nhỏ một món quà trong khung mốc (cùng khung / cỡ với Shop Đổi Vé VQTG: .vq-thumb trong .vq-bundle).
function CtpThumb({ reward }: { reward: CtpReward }) {
  const name = ctpRewardText(reward);
  let art: ReactNode; let count = 0;
  if ('voucher' in reward) { art = <VoucherCard pct={reward.voucher}/>; count = reward.count; }
  else if ('ctpCard' in reward) { art = <span className="vq-card"><img src={A(reward.ctpCard === 'chance' ? 'card-star.webp' : 'card-heart.webp')} alt=""/></span>; count = reward.count; }
  else if ('ctpBadge' in reward) { art = <span className="vq-card"><img src={A('badge-card-v1.webp')} alt=""/></span>; count = reward.ctpBadge; }
  else if (isJackpot(reward)) art = <span className="vq-thumb-jp"><Trophy aria-hidden="true"/></span>;
  else if ('fc' in reward) art = <span className="vq-card"><img src={asset('/assets/bilac/fc-card.webp')} alt=""/><b>{money(reward.fc)}</b></span>;
  else if ('bp' in reward) art = <span className="vq-bp"><img src={asset('/assets/vqtg/bp.webp')} alt=""/><b>{shortBp(reward.bp)}</b></span>;
  else { const pack = findPack(reward.pack); art = pack ? <PackImage pack={pack}/> : <span className="vq-thumb-missing"><Gift aria-hidden="true"/></span>; count = reward.count; }
  const tip = 'pack' in reward ? findPack(reward.pack)?.name ?? reward.pack : name;
  return <span className="vq-thumb" tabIndex={0} data-tip={tip} aria-label={name}>{art}{count > 1 && <em>x{count}</em>}</span>;
}

// Đua top 2 đợt (fco_ctp_top): bảng giống Đua top VQTG (vq-race-*), nút chọn đợt, đồng hồ theo giờ máy chủ (marketNow).
const pad2 = (n: number) => String(n).padStart(2, '0');
const vnTime = (ms: number) => { const d = new Date(ms + 7 * 3600e3); return `${d.getUTCHours()}h ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`; };
function CtpRace({ top }: { top: CtpTop }) {
  const [now, setNow] = useState(() => marketNow());
  useEffect(() => { const id = setInterval(() => setNow(marketNow()), 1000); return () => clearInterval(id); }, []);
  const current = top.rounds.find(r => !r.ended && now < r.endsAt) ?? top.rounds.at(-1);
  const [pick, setPick] = useState<number | null>(null);
  const r = top.rounds.find(x => x.round === (pick ?? current?.round)) ?? current;
  if (!r) return null;
  const started = now >= r.startsAt, target = started ? r.endsAt : r.startsAt, left = Math.max(0, target - now), sec = Math.floor(left / 1000);
  const rows = [1, 2, 3, 4, 5].map(rank => ({ rank, row: r.top.find(x => x.rank === rank) ?? null, rewards: r.rewards?.find(x => x.rank === rank)?.rewards ?? [], note: r.rewards?.find(x => x.rank === rank)?.note ?? '' }));
  return <section className="vq-race ctp-race" aria-label="Đua top nhận quà hot">
    <h2 className="vq-race-title"><img src={asset('/assets/vqtg/title-race.webp')} alt="Đua top nhận quà hot" width={1400} height={411}/></h2>
    <div className="ctp-race-tabs" role="tablist">{top.rounds.map(x => <button key={x.round} type="button" role="tab" aria-selected={x.round === r.round} className={x.round === r.round ? 'is-on' : ''} onClick={() => setPick(x.round)}>
      Đợt {x.round}<small>{vnTime(x.startsAt)} → {vnTime(x.endsAt)}</small></button>)}</div>
    <div className={`vq-race-clock ${r.ended || (started && !left) ? 'ended' : ''}`} role="timer" aria-live="off">
      {!r.ended && left ? <><small>{started ? 'Kết thúc sau' : 'Bắt đầu sau'}</small><b>{Math.floor(sec / 86400)}</b><em>ngày</em><b>{pad2(Math.floor(sec / 3600) % 24)}:{pad2(Math.floor(sec / 60) % 60)}:{pad2(sec % 60)}</b></>
        : <small>{r.ended ? `Đợt ${r.round} đã kết thúc · máy chủ đã chốt bảng` : `Đợt ${r.round} đã kết thúc · đang chốt bảng`}</small>}
    </div>
    <p className="vq-race-sub">5 HLV có nhiều điểm tích lũy nhất trong đợt {r.round} ({vnTime(r.startsAt)} → {vnTime(r.endsAt)}) nhận quà theo hạng; máy chủ tự chốt lúc hết giờ. Chỉ tính điểm kiếm được trong đợt, bằng điểm thì ai đạt số điểm đó trước xếp trên.</p>
    <div className="vq-race-table" role="table">
      <div className="vq-race-row head" role="row"><span role="columnheader">Hạng</span><span role="columnheader">HLV</span><span role="columnheader">Điểm</span><span role="columnheader">Phần quà</span></div>
      {rows.map(({ rank, row, rewards, note }) => <div key={rank} role="row" className={`vq-race-row r${rank} ${row?.mine ? 'mine' : ''}`}>
        <span role="cell" className="vq-race-rank"><b>{rank}</b></span>
        <span role="cell" className="vq-race-name">{row ? <>{clubLogoUrl(row.club) && <img src={clubLogoUrl(row.club)!} alt=""/>}<span className={nameEffectClass(row.effect).trim() || undefined}>{row.name}</span>{row.mine && <em>Bạn</em>}</> : <i>Chưa có</i>}</span>
        <span role="cell" className="vq-race-tickets">{row ? money(row.points) : '—'}</span>
        <span role="cell" className="vq-race-gifts">{rewards.length ? <span className="vq-bundle">{rewards.map((x, j) => <CtpThumb key={j} reward={x}/>)}</span> : <i className="vq-race-soon">{note || 'Quà sẽ cập nhật'}</i>}</span>
      </div>)}
    </div>
    <p className="vq-race-me">Bạn: <b>{money(r.me.points)} điểm</b> trong đợt {r.round} · {r.me.rank ? <>hạng <b>{money(r.me.rank)}</b></> : 'chưa có hạng'}</p>
  </section>;
}

const QUICK_MIN = 2, QUICK_MAX = 100; // máy chủ nhận tối đa 100 lượt mỗi lần (fco_ctp_claim)

// Quà tích lũy: điểm tích lũy (không bị trừ), đủ điểm là nhận; mốc thường nhận lại mỗi vòng, mốc đặc biệt 1 lần (fco_ctp_claim).
// Khung giống Shop Đổi Vé VQTG: mốc 1 lựa chọn trong dải viền vàng (shop-first), mốc nhiều lựa chọn trong khung đá (shop-wrap).
function CtpShop({ config, ctp, busy, onClaim }: { config: CtpConfig; ctp: CtpState | null; busy: boolean; onClaim: (m: CtpMilestone) => void }) {
  const points = ctp?.points ?? 0, claimed = ctp?.claimed ?? [], paid = !!ctp?.paid, round = Math.max(1, config.round);
  const state = (m: CtpMilestone) => {
    const left = ctpAvailable(points, m, claimed, config.milestones, round, paid);
    return { left, done: !left && (claimed[m.idx] ?? 0) > 0 };
  };
  const normal = config.milestones.filter(m => !m.special);
  const singles = normal.filter(m => m.options.length === 1), multi = normal.filter(m => m.options.length > 1), special = config.milestones.filter(m => m.special);
  const single = (m: CtpMilestone, label: string) => { const { left, done } = state(m);
    return <div key={m.idx} className={`vq-ms ${left ? 'is-ready' : ''} ${done ? 'is-done' : ''}`}>
      {m.paidOnly && <em className="vq-ms-note">Chỉ nhận bằng lượt chơi trả FC</em>}
      <div className="vq-bundle">{m.options[0].map((r, j) => <CtpThumb key={j} reward={r}/>)}{done && <i className="vq-ms-check" aria-label="Đã nhận"><Check/></i>}</div>
      <button type="button" className="vq-ms-btn" disabled={busy || !left} onClick={() => onClaim(m)}>{left ? `Nhận · ${label}` : label}</button>
    </div>; };
  return <section className="vq-shop ctp-shop" aria-label="Quà tích lũy">
    <div className="vq-shop-a">
      {/* Đầu bảng theo ảnh mẫu: tiêu đề, 1 dòng mô tả, thanh Tổng điểm (nâu) + Số vòng / Điểm còn thiếu (kem). */}
      <header className="ctp-shop-head">
        <h2 className="ctp-shop-title">Quà tích lũy</h2>
        <p>Chỉ cần tích lũy đủ điểm bạn sẽ nhận được những phần quà tương ứng</p>
        <div className="ctp-shop-bar">
          <b>Tổng điểm hiện có: <em>{money(points)}</em></b>
          <span><span>Số vòng tích lũy: <em>{money(Math.floor(points / round))}</em></span><span>Số điểm cần để hoàn thành vòng tiếp theo: <em>{money(round - (points % round))}</em></span></span>
        </div>
      </header>
      <div className="vq-shop-singles">{singles.map(m => single(m, `${money(m.points)} điểm`))}</div>
    </div>
    <div className="vq-shop-b"><div className="vq-shop-grid">{multi.map(m => { const { left, done } = state(m);
      return <div key={m.idx} className={`vq-ms multi ${left ? 'is-ready' : ''} ${done ? 'is-done' : ''}`}>
        <small className="vq-ms-count">Số lần có thể chọn quà: <b>{left}</b></small>
        <div className="vq-ms-opts">{m.options.map((opt, i) => <div key={i} className="vq-bundle">{opt.map((r, j) => <CtpThumb key={j} reward={r}/>)}</div>)}
          {done && <i className="vq-ms-check" aria-label="Đã nhận"><Check/></i>}</div>
        <button type="button" className="vq-ms-btn" disabled={busy || !left} onClick={() => onClaim(m)}>{left >= QUICK_MIN ? `Chọn nhanh · ${money(left)} lượt` : `${money(m.points)} điểm (chọn 1 trong ${m.options.length})`}</button>
      </div>; })}</div></div>
    {special.length > 0 && <div className="ctp-special">
      <h3 className="ctp-shop-title is-sub">Mốc tích lũy đặc biệt</h3>
      <p>Mở khoá khi tổng điểm đủ mốc và đã nhận ít nhất 1 quà mốc thường. Mỗi mốc nhận 1 lần.</p>
      <div className="vq-shop-singles">{special.map(m => single(m, `${money(m.points)} điểm`))}</div>
    </div>}
  </section>;
}

function Board({ fc, effects, jackpot, ctp, token, rolled, spin, hit, kick, busy, refreshing, use, onUse, onBuy, onMission, onRules, onRefresh }: {
  fc: number; effects: boolean; jackpot: ServerJackpot; ctp: CtpState | null; token: number; rolled: number | null; spin: Spin; hit: Hit; kick: Kick; busy: boolean; refreshing: boolean;
  use: CardUse; onUse: (kind: 'chance' | 'luck', on: boolean) => void;
  onBuy: (count: number, mode: 'fc' | 'free') => void; onMission: () => void; onRules: () => void; onRefresh: () => void;
}) {
  const pot = jackpot.pot, latest = jackpot.feed.find(w => w.kind === 'special'), mini = jackpot.feed.find(w => w.kind === 'mini');
  const L = CTP_LAYOUT, cell = (n: number) => L.cells[n - 1].at;
  const free = ctp?.free ?? 0, firstDone = ctp?.firstDone ?? true;
  const missionDot = ctp?.mission === 'ready';
  return <>
    <Shelf hit={hit}/>
    <img className="ctp-frame" src={A('board-frame.webp')} alt="" draggable={false} style={{ left: `${L.frame[0]}%`, top: `${L.frame[1]}%`, width: `${L.frame[2]}%` }}/>
    {/* Ô xa (trên) vẽ trước để ô gần đè lên đúng phối cảnh. */}
    {[...L.cells].sort((a, b) => a.at[1] - b.at[1]).map(c => <img key={c.n} className={`ctp-cell is-${c.kind}${CTP_FLIP(c) ? ' is-flip' : ''}${token && c.n === token ? ' is-here' : ''}`} src={A(TILE[c.kind])} alt={NAME[c.kind] || `Ô ${c.n}`}
      style={{ left: `${c.at[0]}%`, top: `${c.at[1]}%`, width: `${c.kind === 'normal' ? L.tileW : L.cornerW}%` }} draggable={false}/>)}
    {effects && [7, 14, 21, 28].map(n => <img key={n} className="ctp-light" src={A('light.webp')} alt="" style={{ left: `${cell(n)[0]}%`, top: `${cell(n)[1]}%`, width: `${L.cornerW * .8}%` }} draggable={false}/>)}
    {/* Như Bi Lắc: Ultimate Prize = Giải Đặc Biệt (cả quỹ Jackpot FC chung), Mini Prize = Giải Phụ (1/10 quỹ, FC). */}
    <span className="ctp-jackpot is-mini" style={px(590, 509)} title="Mini Prize · 1/10 quỹ Jackpot FC"><RollingNumber value={miniPrize({ pot })}/> FC</span>
    <span className="ctp-jackpot" style={px(1320, 506)} title="Ultimate Prize · Giải Đặc Biệt (quỹ FC chung)"><RollingNumber value={pot}/> FC</span>
    <span className="ctp-lucky" style={px(955, 729)} title="Dừng ô Lucky với số lắc lớn hơn số này: +2 lượt miễn phí, không thì +1">Số may mắn: {ctp?.lucky ?? '—'}</span>
    {/* Xúc xắc trống (ảnh người dùng gửi) + số vẽ trên mặt trước như xúc xắc cũ; lắc: quay nhiều vòng rồi số mới hiện lên. */}
    <span className={`ctp-dice ${effects && spin === 'idle' ? 'is-float' : ''} ${spin === 'wait' ? 'is-spin' : spin === 'settle' ? 'is-settle' : ''}`} style={px(962, 520)}
      role="img" aria-label={spin === 'idle' ? `Xúc xắc: ${rolled ?? 6}` : 'Xúc xắc đang quay'}>
      <img src={A('dice-blank-v1.webp')} alt="" draggable={false}/>
      {spin === 'idle' && <b key={`${rolled ?? 6}-${token}`} className="ctp-dice-num" aria-live="polite">{rolled ?? 6}</b>}
    </span>
    <div className="ctp-score" style={px(843, 606)}><small>Điểm<br/>hiện có</small><b>{money(ctp?.points ?? 0)}</b></div>
    <img className="ctp-player" src={A('player.webp')} alt="Quân cờ của bạn" style={{ left: `${(token ? cell(token) : START)[0]}%`, top: `${(token ? cell(token) : START)[1]}%` }} draggable={false}/>
    {kick && <span key={kick.key} className="ctp-ball" aria-hidden="true" style={{ '--x0': `${kick.from[0]}%`, '--y0': `${kick.from[1]}%`, '--x1': `${kick.to[0]}%`, '--y1': `${kick.to[1]}%`, '--ms': `${KICK_MS}ms` } as CSSProperties}>
      <img src={A('ball.webp')} alt="" draggable={false}/></span>}
    {/* Logo Tỷ Phú 2.0 sinh động: bồng bềnh, quầng vàng phập phồng, vệt sáng lướt qua chữ (chỉ trong hình logo), sao lấp lánh. */}
    <span className={`ctp-logo ${effects ? 'is-live' : ''}`} style={{ ...px(1350.5, 80), '--logo': `url(${A('title.webp')})` } as CSSProperties}>
      <img className="ctp-title" src={A('title.webp')} alt="Tỷ Phú 2.0" draggable={false}/>
      {effects && <><i className="ctp-logo-sheen" aria-hidden="true"/>
        {[[14, 30, 0], [47, 8, .7], [86, 22, 1.4], [72, 70, 2.1], [24, 78, 2.8], [58, 46, 1.1]].map(([x, y, d]) =>
          <i key={`${x}-${y}`} className="ctp-logo-star" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}/>)}</>}
    </span>
    {/* Tin trúng mới nhất từ bảng tin Jackpot chung: 1 Giải Đặc Biệt (Ultimate) + 1 Giải Phụ (Mini). */}
    <div className="ctp-feed" style={px(110, 154)} aria-label="Người trúng giải mới nhất" aria-live="polite">
      {latest ? <p><GiftBox/><span>Chúc mừng HLV <b>{latest.mine ? 'Bạn' : latest.name}</b> đã trúng Ultimate Prize {money(latest.amount)} FC</span></p>
        : <p><GiftBox/><span>Ultimate Prize: chưa có HLV trúng.</span></p>}
      {mini ? <p><GiftBox/><span>Chúc mừng HLV <b>{mini.mine ? 'Bạn' : mini.name}</b> đã trúng Mini Prize {money(mini.amount)} FC</span></p>
        : <p><GiftBox/><span>Mini Prize: chưa có HLV trúng.</span></p>}
    </div>
    {/* Thẻ Cơ Hội (ngôi sao) / Khí Vận (trái tim): làm cùng mốc tích lũy ở bước sau. */}
    <section className="ctp-panel ctp-cards" style={px(275, 674)} aria-label="Sử dụng cho lần tiếp theo">
      <h3>Sử dụng cho lần tiếp theo</h3>
      <div className="ctp-card-row">{(['chance', 'luck'] as const).map(kind => { const info = CARD_INFO[kind], qty = ctp?.cards?.[kind] ?? 0, on = kind === 'chance' ? use.chance : !!use.luck;
        return <div key={kind} className="ctp-card">
          <span className="ctp-card-art" tabIndex={0} aria-describedby={`ctp-tip-${kind}`}>
            <img src={A(info.file)} alt={info.name} draggable={false}/>
            <span className="ctp-card-tip" role="tooltip" id={`ctp-tip-${kind}`}><b>{info.name}</b>{info.text.map(t => <span key={t}>{t}</span>)}</span>
          </span>
          <span className="ctp-qty">Số lượng: {qty}</span>
          <label className={`ctp-radio ${qty < 1 ? 'is-off' : ''}`} title={qty < 1 ? `Chưa có ${info.name} — nhận ở mốc quà tích lũy ${kind === 'chance' ? '200' : '450'} điểm` : undefined}>Có <input type="radio" name={`ctp-use-${kind}`} checked={on} disabled={busy || qty < 1} onChange={() => onUse(kind, true)}/></label>
          <label className="ctp-radio">Không <input type="radio" name={`ctp-use-${kind}`} checked={!on} disabled={busy} onChange={() => onUse(kind, false)}/></label>
          {kind === 'luck' && use.luck && <span className="ctp-ex">Bỏ: {use.luck.map(r => RAIL_NAMES[r]).join(', ')}</span>}
        </div>; })}</div>
    </section>
    <section className="ctp-panel ctp-play" style={px(1235, 727)} aria-label="Chơi Cờ tỷ phú">
      <div className="ctp-balances"><span>FC có: {money(fc)} FC</span>
        <button type="button" className={`ctp-refresh ${refreshing ? 'is-spin' : ''}`} aria-label="Tải lại số FC" title="Tải lại số FC" onClick={onRefresh} disabled={refreshing || busy}><RefreshCw/></button></div>
      <div className="ctp-play-row">
        <button type="button" className="ctp-mission" onClick={onMission} disabled={!ctp}>Nhiệm vụ{missionDot && <i className="ctp-dot" aria-label="Có lượt miễn phí chờ nhận"/>}</button>
        <button type="button" className="ctp-rules" onClick={onRules}><BookOpen aria-hidden="true"/>Luật chơi</button>
      </div>
      <p className="ctp-free">Số lượt chơi miễn phí: {free}{ctp?.pending ? ' · có bộ quà chờ chọn' : ''}</p>
      <div className="ctp-buy">{CTP_RULES.prices.map((p, i) => {
        const useFree = p.count === 1 && free > 0;
        const price = ctpPrice(p.count, firstDone);
        return <button key={p.count} type="button" className={`ctp-go is-${TONES[i]}`} disabled={busy || !ctp || (!useFree && fc < price)}
          title={useFree ? `Dùng 1 lượt miễn phí (còn ${free})` : `${money(price)} FC · ${p.count} lượt`} onClick={() => onBuy(p.count, useFree ? 'free' : 'fc')}>
          <b>{useFree ? 'MIỄN PHÍ' : `${money(price)}FC`}</b><small>{p.count} lần</small></button>;
      })}</div>
    </section>
  </>;
}

type Props = {
  preview?: boolean; fc?: number; ctp?: CtpState | null; loadJackpot?: () => Promise<ServerJackpot>;
  onPlay?: (count: number, mode: 'fc' | 'free', chance?: boolean, exclude?: string[] | null) => Promise<CtpResult | CtpPendingResult | null>; onMission?: (action: 'accept' | 'claim') => Promise<void>; onRefresh?: () => Promise<void>;
  loadConfig?: () => Promise<CtpConfig>; onClaim?: (index: number, choices: number[]) => Promise<CtpReward[] | null>;
  loadPending?: () => Promise<CtpPending | null>; onPick?: (choice: number) => Promise<CtpResult | null>;
  onDraft?: (ids: number[]) => Promise<CtpDraftResult | null>; renderCard?: (card: Card) => ReactNode; loadTop?: () => Promise<CtpTop>;
};

const MISSION_TEXT = { none: 'Chưa nhận', accepted: 'Đã nhận · chờ thắng 1 trận GLXH', ready: 'Đã thắng · bấm nhận lượt', done: 'Đã nhận lượt hôm nay' } as const;

export default function CtpPage({ preview = false, fc = 0, ctp = null, loadJackpot, onPlay, onMission, onRefresh, loadConfig, onClaim, loadPending, onPick, onDraft, renderCard, loadTop }: Props) {
  const [effects, setEffects] = useState(true);
  const tipBox = useCtpTip();
  const [jackpot, setJackpot] = useState<ServerJackpot>({ pot: 0, feed: [] });
  const [token, setToken] = useState(startToken(ctp));
  const [rolled, setRolled] = useState<number | null>(null);
  const [spin, setSpin] = useState<Spin>('idle');
  const [hit, setHit] = useState<Hit>(null);
  const [kick, setKick] = useState<Kick>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<ResultView | null>(null);
  const [modal, setModal] = useState<'mission' | 'rules' | null>(null);
  const animating = useRef(false);
  const [config, setConfig] = useState<CtpConfig | null>(null);
  // Bảng Đua top: tải khi vào trang, mỗi 60 giây (tab đang hiện) và sau mỗi lần điểm đổi.
  const [top, setTop] = useState<CtpTop | null>(null);
  useEffect(() => {
    if (!loadTop) return;
    let alive = true;
    const load = () => { if (document.visibilityState === 'visible') loadTop().then(t => { if (alive) setTop(t); }).catch(() => { /* lần sau */ }); };
    load(); const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [loadTop, ctp?.points]);
  const [choosing, setChoosing] = useState<CtpMilestone | null>(null);
  // Thẻ dùng cho lần bấm chơi kế tiếp; Thẻ Khí Vận mở hộp chọn 3 màu (picking) trước.
  const [use, setUse] = useState<CardUse>({ chance: false, luck: null });
  const [picking, setPicking] = useState<string[] | null>(null);
  const [pending, setPending] = useState<CtpPending | null>(null);
  const [pendingOpen, setPendingOpen] = useState(true);
  // Còn lượt Thẻ Cơ Hội chưa chọn bộ quà (vd. tải lại trang giữa chừng): lấy lại để chọn tiếp.
  useEffect(() => {
    if (!ctp?.pending || pending || !loadPending) return;
    let alive = true;
    loadPending().then(p => { if (alive && p) { setPending(p); setPendingOpen(true); } }).catch(() => { /* lần sau */ });
    return () => { alive = false; };
  }, [ctp?.pending, loadPending]);
  const onUse = (kind: 'chance' | 'luck', on: boolean) => {
    if (kind === 'chance') setUse(u => ({ ...u, chance: on }));
    else if (on) setPicking(use.luck ?? []);
    else setUse(u => ({ ...u, luck: null }));
  };
  const [quick, setQuick] = useState<number[]>([]);
  useEffect(() => {
    if (!loadConfig) return;
    let alive = true;
    loadConfig().then(c => { if (alive) setConfig(c); }).catch(() => { /* chưa chạy migration quà mốc: ẩn bảng mốc */ });
    return () => { alive = false; };
  }, [loadConfig]);
  useEffect(() => { setQuick([]); }, [choosing?.idx]);
  // Nhận quà mốc (máy chủ kiểm tra đủ điểm / số lần); mốc nhiều lựa chọn mở hộp chọn trước.
  const claim = async (m: CtpMilestone, choices: number[]) => {
    if (!onClaim || busy || !choices.length) return;
    setBusy(true);
    try {
      const rewards = await onClaim(m.idx, choices);
      if (!rewards) return;
      setChoosing(null);
      setResult({ title: `Quà mốc ${money(m.points)} điểm${choices.length > 1 ? ` × ${choices.length}` : ''}`, rewards, notes: [] });
    } finally { setBusy(false); }
  };
  const chooseLeft = choosing && config ? ctpAvailable(ctp?.points ?? 0, choosing, ctp?.claimed ?? [], config.milestones, config.round, !!ctp?.paid) : 0;
  const quickMode = chooseLeft >= QUICK_MIN, quickCap = Math.min(chooseLeft, QUICK_MAX);
  const quickTotal = quick.reduce((n, c) => n + (c || 0), 0);
  const bumpQuick = (i: number, delta: number) => setQuick(list => {
    const next = choosing ? choosing.options.map((_, k) => list[k] ?? 0) : [...list];
    const others = next.reduce((n, c, k) => n + (k === i ? 0 : c), 0);
    next[i] = Math.max(0, Math.min(next[i] + delta, quickCap - others));
    return next;
  });
  useEffect(() => { if (ctp && !animating.current) setToken(startToken(ctp)); }, [ctp?.pos, ctp?.points]);
  // Quỹ Jackpot FC chung + bảng tin trúng: 30 giây / lần như VQTG (đỡ ghi đĩa máy chủ), chỉ khi tab đang hiện. Lượt chơi tự trả quỹ mới.
  useEffect(() => {
    if (!loadJackpot) return;
    let alive = true;
    const update = () => { if (document.visibilityState === 'visible') loadJackpot().then(j => { if (alive) setJackpot(j); }).catch(() => { /* lần sau thử lại */ }); };
    update(); const id = setInterval(update, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [loadJackpot]);

  // Quân đá bóng từ ô đang đứng vào thẻ quà trúng, bóng tới nơi thì thẻ sáng.
  const shoot = async (cell: number, rail: string, slot: number) => {
    const to = cardAt(rail, slot);
    if (to) { setKick({ from: cellAt(cell), to, key: Date.now() }); await sleep(KICK_MS); setKick(null); }
    setHit({ rail, slot });
  };
  const refresh = async () => { if (!onRefresh) return; setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } };

  // Diễn lượt: 1 lượt thì lắc, đi từng ô, sáng thẻ quà (cả bước thưởng sau Special); nhiều lượt thì nhảy tới ô cuối. Tắt hiệu ứng = nhảy ngay.
  const buy = async (count: number, mode: 'fc' | 'free') => {
    if (!onPlay || busy) return;
    if (pending) { setResult(null); setPendingOpen(true); return; }  // còn bộ quà chờ chọn: mở lại hộp chọn
    setBusy(true); setHit(null); setResult(null);
    if (effects) setSpin('wait');
    const out = await onPlay(count, mode, use.chance, use.luck);
    if (!out) { setSpin('idle'); setBusy(false); return; }
    setUse({ chance: false, luck: null });  // thẻ đã dùng cho lần bấm này
    if ('pending' in out) { setSpin('idle'); setPending(out.pending); setPendingOpen(true); setBusy(false); return; }
    await perform(out, count, mode);
  };
  // Chọn bộ quà A / B của lượt dùng Thẻ Cơ Hội: diễn như nhiều lượt.
  const pick = async (choice: number) => {
    if (!onPick || !pending || busy) return;
    setBusy(true);
    const p = pending;
    const out = await onPick(choice);
    if (!out) { setBusy(false); return; }
    setPending(null);
    await perform(out, p.count, p.mode, `Bộ quà ${choice ? 'B' : 'A'}`);
  };
  // Xúc xắc quay chậm dần nhiều vòng rồi dừng, số lắc hiện lên mặt trước.
  const settle = async (n: number) => {
    if (effects) { setSpin('settle'); await sleep(SETTLE_MS); }
    setRolled(n); setSpin('idle');
    if (effects) await sleep(380);
  };
  const perform = async (out: CtpResult, count: number, mode: 'fc' | 'free', label?: string) => {
    animating.current = true;
    if (effects && count === 1) {
      for (const p of out.plays) {
        setHit(null);
        await settle(p.roll);
        for (const c of ctpPath(p.from, p.steps)) { setToken(c); await sleep(170); }
        if (p.rail !== undefined && p.slot !== undefined) { await shoot(p.to, p.rail, p.slot); await sleep(650); }
      }
    } else {
      const last = out.plays.at(-1);
      if (last) await settle(last.roll);
      setToken(out.pos);
      // Nhiều lượt: quân nhảy tới ô cuối rồi đá cú cuối (tắt hiệu ứng thì chỉ sáng thẻ).
      if (last) {
        if (last.rail !== undefined && last.slot !== undefined) { if (effects) { await sleep(200); await shoot(last.to, last.rail, last.slot); } else setHit({ rail: last.rail, slot: last.slot }); }
      }
    }
    animating.current = false;
    setJackpot(out.jackpot);
    const rewards = out.plays.flatMap(p => p.reward ? [p.reward] : []);
    const pts = out.plays.reduce((s, p) => s + p.points, 0), freeWon = out.plays.reduce((s, p) => s + (p.free ?? 0), 0);
    const specials = out.plays.filter(p => p.kind === 'special').length, lucky = out.plays.filter(p => p.kind === 'lucky').length;
    const jp = rewards.filter(isJackpot);
    const notes = [
      ...jp.map(r => `Trúng ${'jackpot' in r && r.jackpot === 'special' ? 'Ultimate Prize' : 'Mini Prize'}: ${'fc' in r ? money(r.fc) : 0} FC!`),
      `+${money(pts)} điểm`,
      ...(specials ? [`Special ${specials} lần: đi tiếp 1 bước, quà + điểm ×2`] : []),
      ...(freeWon ? [`Lucky ${lucky} lần: +${freeWon} lượt miễn phí`] : []),
      ...(out.paid ? [`−${money(out.paid)} FC`] : mode === 'free' ? [`Dùng ${count} lượt miễn phí`] : []),
    ];
    setResult({ title: label ? `${label} · ${count} lượt` : count === 1 ? `Lắc được ${out.plays[0]?.roll ?? ''}` : `Kết quả ${count} lượt`, rewards: summarizeBilac(rewards).sort((a, b) => Number(isJackpot(b)) - Number(isJackpot(a))) as CtpReward[], notes });
    setBusy(false);
  };

  const mission = ctp?.mission ?? 'none';
  return <section className={`workspace ctp-page ${effects ? '' : 'no-fx'}`} aria-label="Sự kiện Cờ tỷ phú">
    {tipBox}
    {preview && <p className="ctp-preview">Cờ tỷ phú · bản xem trước cho admin (người chơi chưa thấy)</p>}
    {CTP_LAYERS.map((layer, i) => layer.id === 'lottery' ? null : layer.id === 'accumulated' ? <div key={layer.id} className="ctp-row ctp-accumulated ctp-flow">
      {/* Cùng cách dựng các tầng khác: nền rõ rộng 1920 × u căn giữa (nối khít tầng trên), hai bên phủ nền làm mờ; cao theo nội dung. */}
      <i className="ctp-fill" aria-hidden="true" style={{ backgroundImage: `url(${A(layer.file)})` }}/>
      {/* Cột nền dựng y như .ctp-canvas của bàn cờ (thẻ img rộng 100 % cột 1920 × u): tầng 2 rồi tầng 3, thêm 1 tầng 3 dự phòng khi bảng quà dài. */}
      <div className="ctp-flow-col" aria-hidden="true">{['bg-2.webp', layer.file, layer.file].map((file, k) => <img key={k} src={A(file)} alt="" draggable={false} loading="lazy" decoding="async"/>)}</div>
      {config?.milestones.length ? <CtpShop config={config} ctp={ctp} busy={busy} onClaim={m => { if (m.options.length > 1) setChoosing(m); else void claim(m, [0]); }}/>
        : <p className="ctp-shop-empty">Quà tích lũy sắp mở.</p>}
    </div> : <div key={layer.id} className={`ctp-row ctp-${layer.id}`} style={{ '--rows': layer.h - layer.skip + ('extra' in layer ? layer.extra : 0), '--skip': layer.skip, '--h': layer.h } as CSSProperties}>
      <i className="ctp-fill" aria-hidden="true" style={{ backgroundImage: `url(${A(layer.file)})` }}/>
      <div className="ctp-canvas">
        <img className="ctp-bg" src={A(layer.file)} alt="" draggable={false} loading={i ? 'lazy' : 'eager'} decoding="async"/>
        {/* Tầng cuối (nền cầu thủ): Tuyển chọn cầu thủ bằng Huy Hiệu Tuyển Chọn. */}
        {'extra' in layer && <img className="ctp-bg ctp-bg-ext" src={A(layer.file)} alt="" draggable={false} loading="lazy" decoding="async"/>}
        {layer.id === 'players' && onDraft && <CtpDraft badges={ctp?.badges ?? 0} opened={ctp?.draftOpened ?? 0} busy={busy} onDraft={onDraft} renderCard={renderCard}/>}
        {layer.id === 'board' && <>
          <Board fc={fc} effects={effects} jackpot={jackpot} ctp={ctp} token={token} rolled={rolled} spin={spin} hit={hit} kick={kick} busy={busy} use={use} onUse={onUse} refreshing={refreshing}
            onBuy={(n, m) => void buy(n, m)} onMission={() => setModal('mission')} onRules={() => setModal('rules')} onRefresh={() => void refresh()}/>
          <button type="button" className="ctp-fx" style={px(1635, 624)} aria-pressed={!effects} onClick={() => setEffects(!effects)}><EyeOff/>{effects ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'}</button>
        </>}
      </div>
    </div>)}
    {/* Đua top dưới Tuyển chọn: nền đá nối tiếp tầng 4 (ảnh tầng 4 lật / thường xen kẽ cho liền vân), cao theo nội dung. */}
    {top && <div className="ctp-row ctp-race-row">
      <i className="ctp-fill" aria-hidden="true" style={{ backgroundImage: `url(${A('bg-4.webp')})` }}/>
      <div className="ctp-race-col" aria-hidden="true">{[true, false, true].map((flip, k) => <img key={k} className={flip ? 'is-flip' : ''} src={A('bg-4.webp')} alt="" loading="lazy" decoding="async" draggable={false}/>)}</div>
      <CtpRace top={top}/>
    </div>}
    {result && <Modal title={result.title} onClose={() => setResult(null)}>
      {result.rewards.length ? <ul className="ctp-res">{result.rewards.map((r, i) => <li key={i} className={'jackpot' in r ? 'is-jp' : ''}><RewardArt reward={r}/><span>{ctpRewardText(r)}</span></li>)}</ul>
        : <p className="ctp-empty">Lượt này không có quà.</p>}
      <ul className="ctp-notes">{result.notes.map(n => <li key={n}>{n}</li>)}</ul>
    </Modal>}
    {choosing && createPortal(<div className="vq-modal" role="dialog" aria-modal="true" aria-label={`Chọn quà mốc ${choosing.points} điểm`} onClick={() => setChoosing(null)}>
      <div className="vq-dialog vq-choose" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setChoosing(null)}><X/></button>
        <h3>Mốc {money(choosing.points)} điểm · chọn 1 trong {choosing.options.length}</h3>
        {quickMode && <p className="vq-quick-head">Chọn nhanh · còn <b>{money(chooseLeft)}</b> lượt · đã chọn <b>{quickTotal}</b>{chooseLeft > QUICK_MAX ? ` (tối đa ${QUICK_MAX} lượt mỗi lần)` : ''}</p>}
        <div className="vq-choose-list">{choosing.options.map((opt, i) => <div key={i} className={`vq-choose-opt ${quickMode ? 'is-quick' : ''}`}>
          <div className="vq-bundle">{opt.map((r, j) => <CtpThumb key={j} reward={r}/>)}</div>
          <p>{opt.map(ctpRewardText).join(' + ')}</p>
          {quickMode ? <div className="vq-quick" role="group" aria-label={`Số lượt chọn ${opt.map(ctpRewardText).join(' + ')}`}>
            <button type="button" disabled={busy || !quick[i]} onClick={() => bumpQuick(i, -1)} aria-label="Bớt 1">−</button>
            <b>{quick[i] ?? 0}</b>
            <button type="button" disabled={busy || quickTotal >= quickCap} onClick={() => bumpQuick(i, 1)} aria-label="Thêm 1">+</button>
            <button type="button" className="vq-quick-all" disabled={busy} onClick={() => setQuick(choosing.options.map((_, k) => k === i ? quickCap : 0))}>Tất cả</button>
          </div>
          : <button type="button" className="vq-ms-btn" disabled={busy} onClick={() => void claim(choosing, [i])}>Chọn</button>}
        </div>)}</div>
        {quickMode && <button type="button" className="vq-ms-btn vq-quick-go" disabled={busy || !quickTotal}
          onClick={() => void claim(choosing, quick.flatMap((n, i) => Array.from({ length: n }, () => i)))}>Nhận nhanh {quickTotal || ''} lượt</button>}
      </div>
    </div>, document.body)}
    {picking && <Modal title="Thẻ Khí Vận · chọn 3 màu muốn bỏ" onClose={() => setPicking(null)}>
      <p className="ctp-hint">Lần bấm chơi kế tiếp, cú sút chỉ trúng quà ở 5 màu còn lại. Đã chọn {picking.length}/3.</p>
      <div className="ctp-rails">{CTP_RAILS.map(r => { const on = picking.includes(r.id);
        return <button key={r.id} type="button" className={`ctp-rail ${on ? 'is-on' : ''}`} style={{ '--rail': RAIL_COLORS[r.id] } as CSSProperties} aria-pressed={on}
          disabled={!on && picking.length >= 3} onClick={() => setPicking(on ? picking.filter(x => x !== r.id) : [...picking, r.id])}>
          <i aria-hidden="true"/>{RAIL_NAMES[r.id]}{on && <X aria-hidden="true"/>}</button>; })}</div>
      <button type="button" className="ctp-btn" disabled={picking.length !== 3} onClick={() => { setUse(u => ({ ...u, luck: picking })); setPicking(null); }}>Dùng Thẻ Khí Vận · bỏ 3 màu này</button>
    </Modal>}
    {pending && pendingOpen && <Modal title={`Thẻ Cơ Hội · chọn 1 trong 2 bộ quà (${pending.count} lượt)`} onClose={() => setPendingOpen(false)}>
      {pending.exclude?.length ? <p className="ctp-hint">Thẻ Khí Vận: đã bỏ {pending.exclude.map(r => RAIL_NAMES[r] ?? r).join(', ')}.</p> : null}
      <div className="ctp-sets">{pending.outcomes.map((o, i) => {
        const rewards = summarizeBilac(o.plays.flatMap(p => p.reward ? [p.reward] : [])).sort((a, b) => Number(isJackpot(b)) - Number(isJackpot(a))) as CtpReward[];
        return <section key={i} className="ctp-set">
          <h3>Bộ quà {i ? 'B' : 'A'}</h3>
          <p>+{money(o.ptsWon)} điểm{o.freeWon ? ` · +${o.freeWon} lượt miễn phí` : ''} · dừng ô {o.pos}</p>
          {rewards.length ? <ul className="ctp-res">{rewards.map((r, j) => <li key={j} className={'jackpot' in r ? 'is-jp' : ''}><RewardArt reward={r}/><span>{ctpRewardText(r)}</span></li>)}</ul>
            : <p className="ctp-empty">Không có quà.</p>}
          <button type="button" className="ctp-btn" disabled={busy} onClick={() => void pick(i)}>Chọn bộ {i ? 'B' : 'A'}</button>
        </section>; })}</div>
      <p className="ctp-hint">Quà Ultimate / Mini Prize (nếu có) tính theo quỹ lúc bấm chọn. Đóng hộp này thì lượt vẫn chờ: bấm nút chơi bất kỳ để mở lại.</p>
    </Modal>}
    {modal === 'mission' && <Modal title="Nhiệm vụ hằng ngày" onClose={() => setModal(null)}>
      <div className="ctp-mission-box">
        <p><b>Thắng 1 trận Xếp hạng giả lập (GLXH)</b> → nhận <b>1 lượt chơi miễn phí</b>. Mỗi ngày 1 lần, làm mới lúc 0 giờ.</p>
        <p>Phải bấm <b>Nhận nhiệm vụ</b> TRƯỚC khi đá; trận thắng trước lúc nhận không được tính.</p>
        <p className={`ctp-mission-state is-${mission}`}>Trạng thái: {MISSION_TEXT[mission]}</p>
        {mission === 'none' && <button type="button" className="ctp-btn" onClick={() => void onMission?.('accept')}>Nhận nhiệm vụ</button>}
        {mission === 'ready' && <button type="button" className="ctp-btn" onClick={() => void onMission?.('claim')}>Nhận 1 lượt miễn phí</button>}
      </div>
    </Modal>}
    {modal === 'rules' && <Modal title="Luật chơi Cờ tỷ phú" onClose={() => setModal(null)}>
      <ul className="ctp-rules-list">
        <li>Mỗi lượt lắc xúc xắc 1–6 và đi số ô tương ứng; lắc ra <b>6</b> được đi thêm {CTP_RULES.maxRollBonus} ô. Điểm nhận theo số lắc: {CTP_RULES.rollPoints.map((p, i) => `${i + 1} → ${p}`).join(' · ')} điểm.</li>
        <li>Giá: lượt đầu tiên {CTP_RULES.firstPrice} FC; sau đó {CTP_RULES.prices.map(p => `${p.count} lượt ${money(p.price)} FC`).join(' · ')}.</li>
        <li><b>Ô bóng:</b> cầu thủ sút trúng ngẫu nhiên 1 phần quà trên kệ (quà càng giá trị càng khó trúng).</li>
        <li><b>Ô Special:</b> được đi tiếp ngay 1 bước, quà và điểm của bước đó nhân đôi.</li>
        <li><b>Ô Lucky:</b> 1 phần quà + lượt miễn phí: số lắc lớn hơn số may mắn đang hiện → {CTP_RULES.luckyMore} lượt, không thì {CTP_RULES.luckyLess} lượt; sau đó đổi số may mắn mới.</li>
        <li><b>Ô Ultimate Prize:</b> cơ hội nhận cả quỹ FC đang hiện; <b>ô Mini Prize:</b> cơ hội nhận 10% quỹ (trừ vào quỹ). Quỹ từ {money(CTP_RULES.jackpotMin)} FC mới nổ được; mỗi HLV trúng mỗi giải tối đa {CTP_RULES.winsPerDay} lần / 24 giờ. Quân cờ chỉ dừng ở 2 ô này khi trúng giải.</li>
        <li>Mỗi lượt chơi góp {CTP_RULES.potPerPlay} FC vào quỹ Ultimate Prize.</li>
        <li>Lượt miễn phí: ô Lucky, và nhiệm vụ ngày (thắng 1 trận GLXH sau khi bấm Nhận nhiệm vụ).</li>
      </ul>
    </Modal>}
  </section>;
}
