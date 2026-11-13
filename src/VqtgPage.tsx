import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Coins, Gift, RefreshCw, Trophy, X } from 'lucide-react';
import { asset } from './asset';
import { money } from './game';
import { findPack } from './event';
import PackImage from './PackImage';
import { bilacRewardText, isJackpot, shortBp, summarizeBilac } from './bilac';
import {
  VQTG_BOARD, VQTG_INFO, VQTG_QUADS, VQTG_RULES, VQTG_SPECIAL, VQTG_WHEEL, tokenPoint,
  miniJackpotBp, raceCountdown, rollTickets, vqtgAvailable, vqtgPath, vqtgPickAllowed, wheelAngle, type VqtgTile,
} from './vqtg';
import { voucherName } from './stp';
import { marketNow } from './market';
import VoucherCard from './VoucherCard';
import type { BilacReward, ServerJackpot, VqtgConfig, VqtgMilestone, VqtgMiniWin, VqtgPlay, VqtgResult, VqtgReward, VqtgState, VqtgTop } from './wallet-state';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import './vqtg.css';

// Sự kiện Vòng Quanh Thế Giới: lắc xúc xắc (vòng quay 1–6), quân đi quanh đường đua 16 ô và nhận quà ô dừng.
// Máy chủ quyết định số lắc, ô và quà (fco_vqtg_play); trang này chỉ diễn hoạt cảnh và hiển thị. Nền bàn là ảnh bàn chơi
// (assets/vqtg/board.webp); quà, quỹ, vòng quay và quân đặt lên theo toạ độ đo trên ảnh (src/vqtg.ts).
type Props = {
  fc: number; vqtg: VqtgState | null; loadConfig: () => Promise<VqtgConfig>; loadTop: () => Promise<VqtgTop>; loadJackpot: () => Promise<ServerJackpot>;
  onPlay: (count: number, mode: 'fc' | 'free', pick?: number) => Promise<VqtgResult | null>;
  onClaim: (index: number, choice: number | null) => Promise<VqtgReward[] | null>;
  onRefresh: () => Promise<void>; onHistory: () => void;
};
const EFFECTS_KEY = 'fco-vqtg-effects';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** 1 đơn vị bàn cờ (bàn rộng VQTG_BOARD.w đơn vị) theo bề ngang bàn. */
const U = (v: number) => `${(v * 100) / VQTG_BOARD.w}cqw`;
// Khung thông tin khi trỏ chuột / chạm / Tab vào một món quà (mọi nơi trong trang: bàn cờ, Shop Đổi Vé, Đua top, hộp chọn quà).
// Vẽ cố định theo màn hình (portal vào body) nên không bị khung nào cắt.
type Tip = { reward: VqtgReward; el: HTMLElement; x: number; top: number; bottom: number };
type ShowTip = (reward: VqtgReward | null, el?: HTMLElement) => void;
const TipContext = createContext<ShowTip>(() => {});

// Ảnh nhỏ một món quà: gói (ảnh gói), BP / FC (thẻ BP / FC ghi số), quỹ. Tên hiện khi trỏ chuột / chạm / Tab.
const rewardText = (r: VqtgReward) => 'voucher' in r ? `${voucherName(r.voucher)}${r.count > 1 ? ` x ${r.count}` : ''}` : bilacRewardText(r);

function Thumb({ reward }: { reward: VqtgReward }) {
  const onTip = useContext(TipContext);
  const name = rewardText(reward);
  let art;
  if ('voucher' in reward) art = <VoucherCard pct={reward.voucher}/>;
  else if (isJackpot(reward)) art = <span className="vq-thumb-jp"><Trophy aria-hidden="true"/></span>;
  else if ('fc' in reward) art = <span className="vq-card"><img src={asset('/assets/bilac/fc-card.webp')} alt=""/><b>{money(reward.fc)}</b></span>;
  else if ('bp' in reward) art = <span className="vq-bp"><img src={asset('/assets/vqtg/bp.webp')} alt=""/><b>{shortBp(reward.bp)}</b></span>;
  else { const pack = findPack(reward.pack); art = pack ? <PackImage pack={pack}/> : <span className="vq-thumb-missing"><Gift aria-hidden="true"/></span>; }
  const count = 'pack' in reward && reward.count > 1 ? reward.count : 0;
  const show = (e: { currentTarget: HTMLElement }) => onTip(reward, e.currentTarget), hide = () => onTip(null);
  return <span className="vq-thumb" tabIndex={0} aria-label={name} onMouseEnter={show} onFocus={show} onMouseLeave={hide} onBlur={hide}
    onTouchStart={show}>
    {art}{count > 0 && <em>x{count}</em>}</span>;
}

// Nội dung khung thông tin: chỉ tên món quà (tên gói / số BP / FC / phiếu).
function TipBody({ reward }: { reward: VqtgReward }) {
  return <b>{'bp' in reward ? `${reward.bp.toLocaleString('vi-VN')} BP` : rewardText(reward)}</b>;
}

const boxStyle = (b: { x: number; y: number; w: number; h: number; rot: number }) =>
  ({ left: U(b.x), top: U(b.y), width: U(b.w), height: U(b.h), transform: `translate(-50%,-50%) rotate(${b.rot}deg)` }) as CSSProperties;

// Một ô trên ảnh bàn: ô quà đặt 4 món lên 4 ô màu; ô đặc biệt ghi số lượt Chỉ định / quỹ BP / quỹ FC lên chỗ trống của ảnh.
function TileBody({ tile, pot, pool, picks, canPick, onPick }: {
  tile: VqtgTile; pot: number; pool: number; picks: number; canPick: boolean; onPick: () => void;
}) {
  const quads = VQTG_QUADS[tile.idx];
  if (tile.kind === 'reward' && quads) return <>{tile.rewards.slice(0, 4).map((reward, i) => {
    // Món quà luôn dựng thẳng (không xoay theo ô): cỡ vừa ô màu đã xoay (cạnh ÷ (|cos| + |sin|)), cho lấn nhẹ để không quá nhỏ.
    const [x, y, side] = quads.q[i], a = (quads.rot * Math.PI) / 180, size = side * Math.max(0.8, 0.98 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))));
    return <span key={i} className="vq-quad" style={{ left: U(x), top: U(y), width: U(size), height: U(size), transform: 'translate(-50%,-50%)' }}>
      <Thumb reward={reward}/></span>;
  })}</>;
  const sp = VQTG_SPECIAL[tile.idx as 6 | 10 | 14];
  if (!sp) return null;
  if (tile.kind === 'pick') return <>
    <span className="vq-sp-text pick" style={boxStyle(sp.text)}>Chỉ định: <b>{picks}</b></span>
    <button type="button" className="vq-sp-hit" style={boxStyle(sp.hit)} disabled={!canPick} onClick={onPick}
      aria-label={`Chỉ định: còn ${picks} lượt${canPick ? ', bấm để sử dụng' : ''}`} title={canPick ? 'Dùng lượt Chỉ định' : 'Dừng ở ô này để nhận lượt Chỉ định'}/>
  </>;
  return <span className="vq-sp-text" style={boxStyle(sp.text)}>
    <small>{tile.kind === 'bp' ? 'BP có thể nhận:' : 'FC có thể nhận:'}</small><b>{(tile.kind === 'bp' ? pool : pot).toLocaleString('vi-VN')}</b></span>;
}

// Vòng quay 6 số, kim cố định chỉ lên trên. Số k nằm ở góc (k − 1) × 60° theo chiều kim đồng hồ.
function Wheel({ angle, spinning, rolled }: { angle: number; spinning: boolean; rolled: number | null }) {
  const arc = (r0: number, r1: number, from: number, to: number) => {
    const p = (r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`; };
    return `M${p(r1, from)}A${r1} ${r1} 0 0 1 ${p(r1, to)}L${p(r0, to)}A${r0} ${r0} 0 0 0 ${p(r0, from)}Z`;
  };
  return <div className={`vq-wheel ${spinning ? 'is-spinning' : ''}`} style={{ left: U(VQTG_WHEEL.x), top: U(VQTG_WHEEL.y), width: U(VQTG_WHEEL.d) }}>
    <svg viewBox="0 0 100 100" className="vq-wheel-face" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
      <circle cx="50" cy="50" r="49.5" className="vq-wheel-rim"/>
      {[1, 2, 3, 4, 5, 6].map(k => <g key={k}>
        <path d={arc(21, 46, (k - 1) * 60 - 30, (k - 1) * 60 + 30)} className={`vq-slice ${k % 2 ? 'a' : 'b'} ${!spinning && rolled === k ? 'is-hit' : ''}`}/>
        <g transform={`rotate(${(k - 1) * 60} 50 50)`}>
          <text x="45" y="16.5" className={`vq-slice-no ${k % 2 ? 'a' : 'b'}`}>{k}</text>
          <image href={asset('/assets/vqtg/ticket-wheel.webp')} x="50" y="10.5" width="8.4" height="9.6"/>
          <text x="58.4" y="18.6" className={`vq-slice-tk ${k % 2 ? 'a' : 'b'}`}>x{rollTickets(k)}</text>
        </g>
      </g>)}
      {['#29b6e8', '#f2b01e', '#e2413b', '#22b46b'].map((c, i) => <path key={c} d={arc(9, 21, i * 90, i * 90 + 90)} fill={c} className="vq-ring"/>)}
    </svg>
    <svg viewBox="0 0 100 100" className="vq-needle" aria-hidden="true">
      <path d="M50 13 L54 50 L46 50 Z"/><circle cx="50" cy="50" r="8.5"/>
    </svg>
    <span className="sr-only" aria-live="polite">{rolled && !spinning ? `Lắc được ${rolled}` : ''}</span>
  </div>;
}

type ResultView = { title: string; rewards: VqtgReward[]; notes: string[] };

export default function VqtgPage({ fc, vqtg, loadConfig, loadTop, loadJackpot, onPlay, onClaim, onRefresh, onHistory }: Props) {
  const [config, setConfig] = useState<VqtgConfig | null>(null);
  const [error, setError] = useState('');
  const [jackpot, setJackpot] = useState<ServerJackpot>({ pot: 0, feed: [] });
  const [busy, setBusy] = useState(false);
  const animating = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState(vqtg?.pos ?? 0);
  const [landed, setLanded] = useState<number | null>(null);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [rolled, setRolled] = useState<number | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);
  const [received, setReceived] = useState<BilacReward[]>([]);
  const [modal, setModal] = useState<'pick' | 'guide' | 'received' | null>(null);
  const [choosing, setChoosing] = useState<VqtgMilestone | null>(null);
  const [miniFeed, setMiniFeed] = useState<VqtgMiniWin[]>([]);
  const [top, setTop] = useState<VqtgTop | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [effects, setEffects] = useState(() => { try { return localStorage.getItem(EFFECTS_KEY) !== 'off'; } catch { return true; } });
  const toggleEffects = () => setEffects(on => { try { localStorage.setItem(EFFECTS_KEY, on ? 'off' : 'on'); } catch { /* bỏ qua */ } return !on; });
  const refresh = () => { if (refreshing) return; setRefreshing(true); onRefresh().finally(() => setRefreshing(false)); };
  const showTip: ShowTip = (reward, el) => {
    if (!reward || !el) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ reward, el, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  // Cuộn trang (hoặc Tab làm trang tự cuộn) thì khung thông tin đi theo món quà; món quà ra khỏi trang thì ẩn.
  useEffect(() => {
    if (!tip) return;
    const follow = () => setTip(t => {
      if (!t) return t;
      if (!t.el.isConnected) return null;
      const r = t.el.getBoundingClientRect();
      return { ...t, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    });
    window.addEventListener('scroll', follow, true);
    return () => window.removeEventListener('scroll', follow, true);
  }, [tip?.el]);

  // Ví đổi (tải lại / máy chủ trả kết quả): đặt quân theo máy chủ, trừ khi đang diễn hoạt cảnh lượt vừa chơi.
  useEffect(() => { if (vqtg && !animating.current) setToken(vqtg.pos); }, [vqtg?.pos]);
  useEffect(() => {
    let alive = true;
    const load = () => loadConfig().then(c => { if (alive) { setConfig(c); if (c.miniFeed) setMiniFeed(c.miniFeed); } }).catch(e => { if (alive) setError((e as Error).message); });
    load(); const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [loadConfig]);
  useEffect(() => {
    let alive = true;
    const update = () => { if (document.visibilityState === 'visible') loadJackpot().then(j => { if (alive) setJackpot(j); }).catch(() => { /* lần sau thử lại */ }); };
    update(); const id = setInterval(update, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [loadJackpot]);

  // Bảng Đua top: tải khi vào trang, mỗi 30 giây (tab đang hiện) và sau mỗi lần số vé đổi.
  useEffect(() => {
    let alive = true;
    const load = () => { if (document.visibilityState === 'visible') loadTop().then(t => { if (alive) setTop(t); }).catch(() => { /* lần sau thử lại */ }); };
    load(); const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [loadTop, vqtg?.tickets]);

  // Hoạt cảnh: 1 lượt quay vòng rồi đi từng bước; 10 lượt đi nhanh qua từng lượt; 50 lượt nhảy thẳng tới ô cuối.
  const animate = async (plays: VqtgPlay[]) => {
    const last = plays.at(-1)!;
    if (!effects) { setRolled(last.roll); setToken(last.to); return; }
    if (plays.length === 1) {
      const p = plays[0];
      setRolled(p.roll); setSpinning(true); setAngle(a => wheelAngle(a, p.roll));
      await sleep(1900); setSpinning(false);
      for (const step of vqtgPath(p.from, p.roll)) { setToken(step); await sleep(260); }
      return;
    }
    if (plays.length <= 10) {
      for (const p of plays) {
        setRolled(p.roll); setAngle(a => wheelAngle(a, p.roll, 1));
        for (const step of vqtgPath(p.from, p.roll)) { setToken(step); await sleep(70); }
        setLanded(p.to); await sleep(160);
      }
      return;
    }
    setRolled(last.roll); setAngle(a => wheelAngle(a, last.roll, 2)); setToken(last.to); await sleep(700);
  };

  const play = async (count: number, mode: 'fc' | 'free', pick?: number) => {
    if (busy || !config) return;
    setBusy(true); animating.current = true; setLanded(null); setModal(null); setTip(null);
    try {
      const out = await onPlay(count, mode, pick);
      if (!out) return;
      await animate(out.plays);
      setLanded(out.plays.at(-1)!.to); setToken(out.pos); setJackpot(out.jackpot); if (out.miniFeed) setMiniFeed(out.miniFeed);
      const rewards = out.plays.map(p => p.reward).filter((r): r is BilacReward => !!r);
      setReceived(list => [...list, ...rewards]);
      const picks = out.plays.filter(p => p.pick).length, poolHits = out.plays.filter(p => p.pool).length;
      const gainedTickets = out.plays.reduce((n, p) => n + (p.tickets ?? rollTickets(p.roll)), 0);
      // Dừng ô 14 / ô 10 mà không trúng: nói rõ lý do (ô này chỉ là cơ hội trúng, không có quà an ủi).
      const missJp = out.plays.filter(p => p.kind === 'jackpot' && !p.reward).length, missMini = out.plays.filter(p => p.kind === 'bp' && !p.pool && !p.reward).length;
      const notes = [
        `+${money(gainedTickets)} vé`,
        ...(missJp ? ['Dừng ô Giải Đặc Biệt nhưng chưa trúng'] : []),
        ...(missMini ? ['Dừng ô Mini Jackpot nhưng chưa trúng'] : []),
        ...(picks ? [`+${picks} lượt Chỉ định`] : []),
        ...(poolHits ? ['Trúng Mini Jackpot (quỹ BP)!'] : []),
        ...rewards.filter(r => isJackpot(r)).map(r => `Trúng ${bilacRewardText(r)}!`),
        ...(out.paid ? [`−${money(out.paid)} FC`] : []),
      ];
      setResult({ title: count > 1 ? `Kết quả ${count} lượt · dừng ở ô ${out.pos}` : `Lắc được ${out.plays[0].roll} · ô ${out.plays[0].to}`,
        rewards: summarizeBilac(rewards).sort((a, b) => Number(isJackpot(b)) - Number(isJackpot(a))), notes });
    } finally { animating.current = false; setBusy(false); }
  };

  // Nhận quà mốc Shop Đổi Vé (máy chủ kiểm tra đủ vé / số lần); mốc nhiều lựa chọn mở hộp chọn trước.
  const claim = async (m: VqtgMilestone, choice: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const rewards = await onClaim(m.idx, choice);
      if (!rewards) return;
      setChoosing(null); setReceived(list => [...list, ...rewards.filter((r): r is BilacReward => !('voucher' in r))]);
      setResult({ title: `Quà mốc ${money(m.tickets)} vé`, rewards, notes: [] });
    } finally { setBusy(false); }
  };

  const tiles = config?.tiles ?? [];
  const price1 = config?.prices.find(p => p.count === 1)?.price ?? 0;
  const picks = vqtg?.picks ?? 0;
  const canPick = !busy && !!config && picks > 0 && fc >= price1;
  const pin = tokenPoint(token);
  // Người trúng Jackpot (FC) và Mini Jackpot (BP) là 2 người khác nhau: hiện tin mới nhất của mỗi loại.
  const latest = [jackpot.feed.find(w => w.kind === 'special'), miniFeed[0]];
  const receivedList = summarizeBilac(received).sort((a, b) => Number(isJackpot(b)) - Number(isJackpot(a)));

  const below = !!tip && tip.top < 200;
  return <TipContext.Provider value={showTip}><section className="workspace vqtg-page" aria-label="Sự kiện Vòng Quanh Thế Giới">
    <i className="vq-bg" aria-hidden="true"/>
    <aside className="vq-side">
      {/* Logo sự kiện nằm sẵn trong ảnh nền (.vq-bg); cột này chừa chỗ cho logo. */}
      <nav className="vq-tabs">
        <button type="button" onClick={() => setModal('guide')}>Hướng dẫn</button>
        <button type="button" onClick={onHistory}>Lịch sử</button>
        <button type="button" onClick={() => setModal('received')}>Quà<span className="vq-long"> nhận được</span></button>
      </nav>
      {error && <p className="vq-error" role="alert">{error}</p>}
      <div className="vq-buttons">
        {(config?.prices ?? []).map(p => <button key={p.count} type="button" className={`vq-gem p${p.count}`} disabled={busy || fc < p.price} onClick={() => void play(p.count, 'fc')}>
          {p.count} lần - {money(p.price)} FC</button>)}
        <button type="button" className="vq-gem free" disabled={busy || !config || !vqtg?.freeToday} onClick={() => void play(1, 'free')}>
          {!vqtg ? 'Đang tải…' : vqtg.freeToday ? 'Có 1 lượt m.phí - Chơi ngay' : 'Hết lượt miễn phí hôm nay'}</button>
        <button type="button" className={`vq-effects ${effects ? '' : 'off'}`} onClick={toggleEffects} aria-pressed={!effects}>{effects ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'}</button>
      </div>
    </aside>

    <div className="vq-board-wrap"><div className="vq-board" ref={boardRef}>
      <img className="vq-board-art" src={asset('/assets/vqtg/board.webp')} alt="" draggable={false}/>
      {tiles.map(tile => <TileBody key={tile.idx} tile={tile} pot={jackpot.pot} pool={miniJackpotBp(jackpot.pot)} picks={picks} canPick={canPick} onPick={() => setModal('pick')}/>)}
      {[...new Set([token, landed])].filter((i): i is number => !!i).map(i => { const p = tokenPoint(i);
        return <i key={i} className={`vq-glow ${i === landed ? 'is-landed' : ''}`} style={{ left: U(p.x), top: U(p.y) }} aria-hidden="true"/>; })}
      <Wheel angle={angle} spinning={spinning} rolled={rolled}/>
      <div className="vq-info" style={{ left: U(VQTG_INFO.x), top: U(VQTG_INFO.y), width: U(VQTG_INFO.w) }} aria-live="polite">
        <p><i>▶</i>FC có: <b>{money(fc)}</b><button type="button" className={`vq-refresh ${refreshing ? 'is-spin' : ''}`} onClick={refresh} disabled={refreshing || busy} title="Tải lại số FC" aria-label="Tải lại số FC"><RefreshCw aria-hidden="true"/></button></p>
        <p title="Mỗi lượt chơi được vé theo số lắc, dùng vé để đổi quà mốc"><i>▶</i>Vé hiện có: <b>{money(vqtg?.tickets ?? 0)}</b></p>
        <small>Trúng giải mới nhất</small>
        {latest[0] ? <p className={`win ${latest[0].mine ? 'mine' : ''}`} title="Giải Đặc Biệt"><Trophy aria-hidden="true"/><span>{latest[0].mine ? 'Bạn' : latest[0].name} · <b>{money(latest[0].amount)} FC</b></span></p>
          : <p className="hint">Dừng ô 14 để săn cả quỹ FC.</p>}
        {/* Người trúng Mini Jackpot (BP) luôn ở dòng dưới. */}
        {latest[1] ? <p className={`win mini ${latest[1].mine ? 'mine' : ''}`} title="Mini Jackpot"><Coins aria-hidden="true"/><span><em>Mini</em> {latest[1].mine ? 'Bạn' : latest[1].name} · <b>{shortBp(latest[1].amount)} BP</b></span></p>
          : <p className="hint mini"><Coins aria-hidden="true"/>Mini Jackpot: chưa có người trúng.</p>}
      </div>

      <i className={`vq-token ${busy ? 'is-moving' : ''}`} style={{ left: U(pin.x), top: U(pin.y) }} aria-label={token ? `Quân đang ở ô ${token}` : 'Quân ở ô Bắt đầu'}>
        <img src={asset('/assets/vqtg/player.webp')} alt="" draggable={false}/>
      </i>
    </div></div>

    {config?.milestones?.length ? <VqtgShop milestones={config.milestones} round={config.round ?? 1} tickets={vqtg?.tickets ?? 0} claimed={vqtg?.claimed ?? []}
      paid={!!vqtg?.paid} busy={busy} onClaim={m => { if (m.options.length > 1) setChoosing(m); else void claim(m, null); }}>{top && <VqtgRace top={top}/>}</VqtgShop> : null}

    {choosing && <div className="vq-modal" role="dialog" aria-modal="true" aria-label={`Chọn quà mốc ${choosing.tickets} vé`} onClick={() => setChoosing(null)}>
      <div className="vq-dialog vq-choose" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setChoosing(null)}><X/></button>
        <h3>Mốc {money(choosing.tickets)} vé · chọn 1 trong {choosing.options.length}</h3>
        <div className="vq-choose-list">{choosing.options.map((opt, i) => <div key={i} className="vq-choose-opt">
          <div className="vq-bundle">{opt.map((r, j) => <Thumb key={j} reward={r}/>)}</div>
          <p>{opt.map(rewardText).join(' + ')}</p>
          <button type="button" className="vq-ms-btn" disabled={busy} onClick={() => void claim(choosing, i)}>Chọn</button>
        </div>)}</div>
      </div>
    </div>}

    {modal === 'pick' && config && vqtg && <div className="vq-modal" role="dialog" aria-modal="true" aria-label="Chọn số Chỉ định" onClick={() => setModal(null)}>
      <div className="vq-dialog" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setModal(null)}><X/></button>
        <h3>Chỉ định số xúc xắc</h3>
        <p>Còn {picks} lượt Chỉ định · lượt này {money(price1)} FC. Không chọn được số dừng ở ô Mini Jackpot (ô 10) và Giải Đặc Biệt (ô 14).</p>
        <div className="vq-pick-grid">{[1, 2, 3, 4, 5, 6].map(n => {
          const ok = vqtgPickAllowed(tiles, vqtg.pos, n);
          return <button key={n} type="button" disabled={busy || !ok} onClick={() => void play(1, 'fc', n)}><b>{n}</b><small>→ ô {(vqtg.pos + n - 1) % 16 + 1}</small><small className="vq-pick-tk">+{rollTickets(n)} vé</small></button>;
        })}</div>
      </div>
    </div>}

    {modal === 'guide' && <div className="vq-modal" role="dialog" aria-modal="true" aria-label="Hướng dẫn" onClick={() => setModal(null)}>
      <div className="vq-dialog vq-guide" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setModal(null)}><X/></button>
        <h3>Hướng dẫn Vòng Quanh Thế Giới</h3>
        <ul>
          <li>Mỗi lượt quay vòng xúc xắc ra số 1–6, quân đi đúng số ô theo chiều kim đồng hồ (hết ô 16 quay về ô 1) và nhận quà ô dừng.</li>
          <li>Ô quà: nhận ngẫu nhiên 1 trong 4 món của ô; trỏ chuột / chạm vào món quà để xem tên.</li>
          <li>Ô 6 · Chỉ định: nhận 1 lượt Chỉ định. Bấm ô 6 để tự chọn số xúc xắc cho lượt sau (giá 1 lượt); không chọn được số dừng ở ô 10 và ô 14.</li>
          <li>Ô 10 · Mini Jackpot: {Math.round(VQTG_RULES.bpChance * 100)}% trúng Mini Jackpot BP. Mini Jackpot tăng theo Giải Đặc Biệt: cứ 1.000 FC quỹ Giải Đặc Biệt thì Mini Jackpot được {shortBp(miniJackpotBp(1000))} BP. Không trúng thì lượt đó không có quà.</li>
          <li>Ô 14 · Giải Đặc Biệt: cơ hội nhận cả quỹ FC chung (tăng dần khi quỹ lớn); quỹ chưa tới 10.000 FC thì quân không dừng ở ô này (xúc xắc tự lắc lại). Giải Đặc Biệt nổ thì Mini Jackpot cũng nổ cùng lúc nhưng về tay một HLV khác, cả hai về mức thấp. Không trúng thì lượt đó không có quà.</li>
          <li>Giá: {(config?.prices ?? []).map(p => `${p.count} lần ${money(p.price)} FC`).join(' · ')}. Mỗi ngày có 1 lượt miễn phí.</li>
          <li>Mỗi lượt chơi (kể cả lượt miễn phí) được vé theo số lắc: số 1 được 1 vé, số 2 / 3 / 4 được 2 vé, số 5 được 3 vé, số 6 được 6 vé (vé in cạnh số trên vòng quay). Dùng Chỉ định chọn số nhiều vé để đủ mốc nhanh hơn. Shop Đổi Vé (kéo xuống dưới bàn): đủ vé của mốc là nhận quà, vé không bị trừ; qua mốc cuối thì sang vòng mới, mỗi mốc nhận lại được. Mốc 1 vé chỉ nhận khi đã chơi lượt trả phí.</li>
          <li>Quà BP và gói vào thẳng kho; FC cộng vào ví. Xem lại ở Lịch sử → Sự kiện.</li>
        </ul>
      </div>
    </div>}

    {modal === 'received' && <div className="vq-modal" role="dialog" aria-modal="true" aria-label="Quà nhận được" onClick={() => setModal(null)}>
      <div className="vq-dialog vq-result" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setModal(null)}><X/></button>
        <h3>Quà nhận được</h3>
        {receivedList.length ? <ul className="vq-res-list">{receivedList.map((r, i) => <li key={i} className={!('voucher' in r) && isJackpot(r) ? 'jackpot' : ''}><Thumb reward={r}/><span>{rewardText(r)}</span></li>)}</ul>
          : <p className="vq-res-empty">Chưa có quà trong lần vào sự kiện này.</p>}
        <p className="vq-res-note">Quà các lần trước xem ở Lịch sử → Sự kiện.</p>
        <button type="button" className="primary-button" onClick={() => { setModal(null); onHistory(); }}>Mở Lịch sử</button>
      </div>
    </div>}

    {result && <div className="vq-modal" role="dialog" aria-modal="true" aria-label={result.title} onClick={() => setResult(null)}>
      <div className="vq-dialog vq-result" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setResult(null)}><X/></button>
        <h3>{result.title}</h3>
        {result.rewards.length ? <ul className="vq-res-list">{result.rewards.map((r, i) => <li key={i} className={!('voucher' in r) && isJackpot(r) ? 'jackpot' : ''}><Thumb reward={r}/><span>{rewardText(r)}</span></li>)}</ul>
          : <p className="vq-res-empty">Lượt này không có quà.</p>}
        {result.notes.length > 0 && <p className="vq-res-note">{result.notes.join(' · ')}</p>}
        <button type="button" className="primary-button" onClick={() => setResult(null)}>OK</button>
      </div>
    </div>}
  </section>
  {tip && createPortal(<div className={`vq-tipbox ${below ? 'below' : ''}`} role="tooltip"
    style={{ left: Math.min(Math.max(tip.x, 150), window.innerWidth - 150), top: below ? tip.bottom + 8 : tip.top - 8 }}><TipBody reward={tip.reward}/></div>, document.body)}
  </TipContext.Provider>;
}

// Shop Đổi Vé: vé tích lũy (không bị trừ), đủ vé là nhận; hết mốc cuối thì sang vòng mới, mỗi mốc nhận lại được (fco_vqtg_claim).
function VqtgShop({ milestones, round, tickets, claimed, paid, busy, onClaim, children }: {
  milestones: VqtgMilestone[]; round: number; tickets: number; claimed: number[]; paid: boolean; busy: boolean; onClaim: (m: VqtgMilestone) => void; children?: ReactNode;
}) {
  const state = (m: VqtgMilestone) => {
    const left = vqtgAvailable(tickets, m, claimed[m.idx], round, paid);
    return { left, done: !left && tickets >= m.tickets && (!m.paidOnly || paid) };
  };
  const singles = milestones.filter(m => m.options.length === 1), multi = milestones.filter(m => m.options.length > 1);
  const size = Math.max(1, round), roundNo = Math.floor(tickets / size) + 1;
  return <section className="vq-shop" aria-label="Shop Đổi Vé">
    <div className="vq-shop-a">
    <header className="vq-shop-head">
      <div>
        <h2><img src={asset('/assets/vqtg/title-shop.webp')} alt="Shop Đổi Vé" width={730} height={135}/></h2>
        <p>Mỗi lượt chơi được vé theo số lắc (số 6 được 6 vé). Tích lũy đủ số vé của mốc là nhận quà, vé không bị trừ. Qua mốc {money(round)} vé thì sang vòng mới và mỗi mốc lại nhận được thêm 1 lần.</p>
      </div>
      <div className="vq-shop-tickets"><img src={asset('/assets/vqtg/ticket.webp')} alt="" width={113} height={76}/><small>Số vé hiện tại</small><b>{money(tickets)}</b><span>Vòng {roundNo} · còn {money(size - (tickets % size))} vé</span></div>
    </header>
    <div className="vq-shop-singles">{singles.map(m => { const { left, done } = state(m);
      return <div key={m.idx} className={`vq-ms ${left ? 'is-ready' : ''} ${done ? 'is-done' : ''}`}>
        {m.paidOnly && <em className="vq-ms-note">Chỉ nhận bằng lượt quay trả phí</em>}
        <div className="vq-bundle">{m.options[0].map((r, j) => <Thumb key={j} reward={r}/>)}{done && <i className="vq-ms-check" aria-label="Đã nhận"><Check/></i>}</div>
        <button type="button" className="vq-ms-btn" disabled={busy || !left} onClick={() => onClaim(m)}>{left ? `Nhận · ${money(m.tickets)} vé` : `${money(m.tickets)} vé`}</button>
      </div>; })}</div>
    </div>
    <div className="vq-shop-b"><div className="vq-shop-grid">{multi.map(m => { const { left, done } = state(m);
      return <div key={m.idx} className={`vq-ms multi ${left ? 'is-ready' : ''} ${done ? 'is-done' : ''}`}>
        <small className="vq-ms-count">Số lần có thể chọn quà: <b>{left}</b></small>
        <div className="vq-ms-opts">{m.options.map((opt, i) => <div key={i} className="vq-bundle">{opt.map((r, j) => <Thumb key={j} reward={r}/>)}</div>)}
          {done && <i className="vq-ms-check" aria-label="Đã nhận"><Check/></i>}</div>
        <button type="button" className="vq-ms-btn" disabled={busy || !left} onClick={() => onClaim(m)}>{money(m.tickets)} vé (chọn 1 trong {m.options.length})</button>
      </div>; })}</div></div>
    {children}
  </section>;
}

// Đua top nhận quà hot: top 5 HLV nhiều vé nhất (bằng vé thì ai đạt trước đứng trên) và quà của từng hạng.
function VqtgRace({ top }: { top: VqtgTop }) {
  // Đồng hồ máy chủ (marketNow) để mọi người cùng thấy một mốc kết thúc.
  const [now, setNow] = useState(() => marketNow());
  useEffect(() => { const id = setInterval(() => setNow(marketNow()), 1000); return () => clearInterval(id); }, []);
  const cd = raceCountdown(now);
  const rows = [1, 2, 3, 4, 5].map(rank => ({ rank, row: top.top.find(r => r.rank === rank) ?? null, rewards: top.rewards.find(r => r.rank === rank)?.rewards ?? [], note: top.rewards.find(r => r.rank === rank)?.note ?? '' }));
  return <section className="vq-race" aria-label="Đua top nhận quà hot">
    <h2 className="vq-race-title"><img src={asset('/assets/vqtg/title-race.webp')} alt="Đua top nhận quà hot" width={1400} height={411}/></h2>
    <div className={`vq-race-clock ${cd.left ? '' : 'ended'}`} role="timer" aria-live="off">
      {cd.left ? <><small>{cd.started ? 'Kết thúc sau' : 'Bắt đầu 0h 13/11'}</small>{cd.started && <><b>{cd.days}</b><em>ngày</em><b>{cd.clock}</b></>}</>
        : <small>Đua top đã kết thúc · chờ trao quà</small>}
    </div>
    <p className="vq-race-sub">5 HLV có nhiều vé nhất khi sự kiện kết thúc nhận quà theo hạng. Bằng vé thì ai đạt số vé đó trước xếp trên.</p>
    <div className="vq-race-table" role="table">
      <div className="vq-race-row head" role="row"><span role="columnheader">Hạng</span><span role="columnheader">HLV</span><span role="columnheader">Số vé</span><span role="columnheader">Phần quà</span></div>
      {rows.map(({ rank, row, rewards, note }) => <div key={rank} role="row" className={`vq-race-row r${rank} ${row?.mine ? 'mine' : ''}`}>
        <span role="cell" className="vq-race-rank"><b>{rank}</b></span>
        <span role="cell" className="vq-race-name">{row ? <>{clubLogoUrl(row.club) && <img src={clubLogoUrl(row.club)!} alt=""/>}<span className={nameEffectClass(row.effect).trim() || undefined}>{row.name}</span>{row.mine && <em>Bạn</em>}</> : <i>Chưa có</i>}</span>
        <span role="cell" className="vq-race-tickets">{row ? money(row.tickets) : '—'}</span>
        <span role="cell" className="vq-race-gifts">{rewards.length ? <span className="vq-bundle">{rewards.map((r, j) => <Thumb key={j} reward={r}/>)}</span> : <i className="vq-race-soon">{note || 'Đang cập nhật'}</i>}</span>
      </div>)}
    </div>
    <p className="vq-race-me">Bạn: <b>{money(top.me.tickets)} vé</b> · {top.me.rank ? <>hạng <b>{money(top.me.rank)}</b></> : 'chưa có hạng (chơi 1 lượt để có vé)'}</p>
  </section>;
}
