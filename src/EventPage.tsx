import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Gift, History, X } from 'lucide-react';
import { money, random } from './game';
import type { Pack, Save } from './game';
import { EVENT_LEVELS, EVENT_MILESTONES, EVENT_MISSIONS, EVENT_PLAYS, eventLevel, eventRound, eventState, findPack, milestoneAvailable, missionProgress, rewardLabel } from './event';
import type { EventGiftEntry, EventLogEntry, EventReward } from './event';
import { asset } from './asset';
import { JACKPOT_TICK_MS, loadJackpot, mini, saveJackpot, tickJackpot } from './jackpot';
import type { JackpotWin } from './jackpot';
import './event.css';

const img = (name: string) => asset(`/assets/event/${name}.webp`);
const DESIGN_W = 1440, DESIGN_H = 800;
// Phù thủy: FLY_MS bay vào / bay đi, mỗi lần thả phép CAST_MS, tối đa CAST_MAX lần (chơi 10+ lượt chỉ thả 10 lần).
// WAND = chỗ phép bắt đầu (px trong sân khấu, dưới chân phù thủy đang lơ lửng giữa vạc); phép rơi vào thẻ quà, cao hơn đáy hũ CAST_TARGET_Y.
const FLY_MS = 700, CAST_MS = 480, CAST_MAX = 10, WAND = { x: 425, y: 95 }, CAST_TARGET_Y = 150;
// Chỗ đặt 8 hũ trên mặt vạc (px trong sân khấu 820×540): x = giữa hũ, y = đáy hũ; hũ đáy thấp hơn (gần người xem) vẽ đè lên.
// Mặt tím của vạc là elip tâm (409, 255), bán trục 444 × 145 — đáy mọi hũ nằm trong elip này. art = ảnh hũ jar-<art>.
const JAR_SPOTS = [{ x: 80, y: 222, art: 8 }, { x: 283, y: 183, art: 7 }, { x: 532, y: 190, art: 6 }, { x: 690, y: 228, art: 5 }, { x: 722, y: 336, art: 4 }, { x: 550, y: 390, art: 3 }, { x: 322, y: 394, art: 2 }, { x: 105, y: 342, art: 1 }];

type PlayOutcome = { hits: { level: number; jar: number }[]; rewards: EventReward[]; points: number; levelBefore: number; levelAfter: number; jackpotWins?: JackpotWin[]; jackpotPaid?: number };
const COACH_NAME = 'HLV';
// Popup Lịch sử nhận quà: tab đang mở; fresh = số dòng mới nhất vừa nhận (được làm nổi), note = dòng tóm tắt lượt vừa chơi.
type HistoryView = { tab: 'received' | 'milestone'; fresh: number; note?: string };

// Huy hiệu cấp trên ảnh gói, giống PackArt trong App.tsx: gói +1 không gắn; gói nhiều cấp xếp chồng, cấp cao nhất ở trước.
const packBadges = (pack: Pack) => {
  const [min, max] = pack.levels ?? [1, 1];
  return max > 1 ? Array.from({ length: max - min + 1 }, (_, i) => ({ level: min + i, behind: max - min - i, stack: max - min })) : [];
};

// Thẻ quà (trong miệng hũ và bảng kết quả): ảnh gói như trong game, hoặc thẻ BP / FC ghi số ở góc tối; sáng phía sau.
// Số gói ghi ở góc khi nhiều hơn 1.
function JarPrize({ reward, large = false }: { reward: EventReward; large?: boolean }) {
  const pack = 'pack' in reward ? findPack(reward.pack) : undefined;
  return <div className={`ev-prize ${large ? 'large' : ''}`}>
    {pack ? <span className="ev-pack"><img src={pack.back} alt=""/>{packBadges(pack).map(({ level, behind, stack }) => <img key={level} className="pack-level-badge" style={{ '--behind': behind, '--stack': stack } as CSSProperties} src={asset(`/assets/levels/lv-${level}.webp`)} alt=""/>)}</span> : 'fc' in reward ? <span className="ev-bp-card ev-fc-card"><img src={img('fc-card')} alt=""/><b>{money(reward.fc)}</b></span> : <span className="ev-bp-card"><img src={img('bp-card')} alt=""/><b>{'bp' in reward && (reward.bp < 1_000_000 ? `${reward.bp / 1000}K` : money(reward.bp))}</b></span>}
    {'count' in reward && reward.count > 1 && <b className="ev-prize-count">×{reward.count}</b>}
  </div>;
}

const stamp = (time: number) => { const d = new Date(time), p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };
// Tên quà trong lịch sử: BP ghi đủ số (28,000,000 BP), gói ghi tên gói kèm số lượng.
const historyName = (reward: EventReward) => 'bp' in reward ? `${reward.bp.toLocaleString('en-US')} BP` : 'fc' in reward ? `${reward.fc.toLocaleString('en-US')} FC` : `Gói ${findPack(reward.pack)?.name ?? reward.pack}${reward.count > 1 ? ` x ${reward.count}` : ''}`;

// Một dòng quà theo lượt chơi: bí ngô cấp, hũ đã trúng kèm điểm, thẻ quà, tên quà và giờ nhận.
// Quà mốc (milestone) thay bí ngô + hũ bằng bí ngô quà tích lũy và số điểm của mốc.
function LogRow({ entry, milestone, fresh = false }: { entry: { time: number; reward: EventReward; level?: number; jar?: number; points?: number }; milestone?: number; fresh?: boolean }) {
  return <article className={fresh ? 'fresh' : undefined}>
    {milestone === undefined ? <>
      <span className="ev-history-level"><img src={img('pumpkin-icon')} alt=""/><b>CẤP {(entry.level ?? 0) + 1}</b></span>
      <span className="ev-history-jar"><img src={img(`jar-${JAR_SPOTS[entry.jar ?? 0]?.art ?? 1}`)} alt=""/><b>{entry.points} ĐIỂM</b></span>
    </> : <span className="ev-history-milestone"><img src={img('gift-mid')} alt=""/><b>MỐC {money(EVENT_MILESTONES[milestone]?.points ?? 0)} ĐIỂM</b></span>}
    <JarPrize reward={entry.reward}/>
    <div><strong>{historyName(entry.reward)}</strong><small>{stamp(entry.time)} - <em>Thành công</em></small></div>
  </article>;
}

// Bảng Chúc mừng sau mỗi lần chơi / nhận quà mốc: chỉ quà của lần đó (không phải cả lịch sử).
type Won = { entries: EventLogEntry[]; milestone?: number; note?: string };
function WonPopup({ won, onClose }: { won: Won; onClose: () => void }) {
  return <div className="ev-modal" role="dialog" aria-modal="true" aria-label="Chúc mừng" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ev-history ev-won" style={{ backgroundImage: `url(${img('popup')})` }}>
      <h2>Chúc mừng</h2>
      <p className="ev-won-sub">Bạn đã nhận được</p>
      {won.note && <p className="ev-history-note">{won.note}</p>}
      <div className={`ev-won-list ${won.entries.length === 1 ? 'single' : ''}`}><div className="ev-history-grid">{won.entries.map((entry, i) => <LogRow key={i} entry={entry} milestone={won.milestone}/>)}</div></div>
      <button className="ev-won-close" onClick={onClose}>Đóng</button>
    </div>
  </div>;
}

// Tên quà kèm số lượng trong popup chọn quà mốc: "Gói X x 1", "4,000,000 BP x 1".
const giftName = (reward: EventReward) => 'pack' in reward ? `Gói ${findPack(reward.pack)?.name ?? reward.pack} x ${reward.count}` : `${historyName(reward)} x 1`;

// Bộ quà của một mốc (gói + thẻ BP) xếp chồng nhẹ như ảnh mẫu.
// tip: trỏ chuột vào bộ quà hiện khung tối liệt kê từng quà trong nhóm (tên gói kèm số lượng, số BP).
function Bundle({ rewards, large = false, tip = false }: { rewards: EventReward[]; large?: boolean; tip?: boolean }) {
  return <span className={`ev-bundle ${large ? 'large' : ''}`}>{rewards.map((reward, i) => <JarPrize key={i} reward={reward}/>)}{tip && <span className="ev-bundle-tip" role="tooltip">{rewards.map((reward, i) => <span key={i}>{giftName(reward)}</span>)}</span>}</span>;
}

// Popup Lịch sử nhận quà (mở bằng nút Lịch sử nhận quà): tab Quà nhận được (từng lượt: cấp, hũ trúng, quà) và Quà tích lũy (bảng quà mốc).
function HistoryPopup({ view, log, gifts, onTab, onClose }: { view: HistoryView; log: EventLogEntry[]; gifts: EventGiftEntry[]; onTab: (tab: HistoryView['tab']) => void; onClose: () => void }) {
  return <div className="ev-modal" role="dialog" aria-modal="true" aria-label="Lịch sử nhận quà" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ev-history" style={{ backgroundImage: `url(${img('popup')})` }}>
      <button className="ev-close" aria-label="Đóng" onClick={onClose}><X size={20}/></button>
      <h2>Lịch sử nhận quà</h2>
      {view.note && <p className="ev-history-note">{view.note}</p>}
      <div className="ev-history-tabs" role="tablist">{([['received', 'Quà nhận được'], ['milestone', 'Quà tích lũy']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={view.tab === tab} className={view.tab === tab ? 'active' : undefined} onClick={() => onTab(tab)}>{label}</button>)}</div>
      {view.tab === 'received'
        ? log.length ? <div className="ev-history-grid">{log.map((entry, i) => <LogRow key={`${entry.time}-${i}`} entry={entry} fresh={i < view.fresh}/>)}</div> : <p className="ev-history-empty">Chưa có quà nào. Hãy chơi để nhận quà!</p>
        : gifts.length ? <div className="ev-history-table"><table><thead><tr><th>STT</th><th>Tên VP</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
            <tbody>{gifts.map((gift, i) => <tr key={`${gift.time}-${i}`} className={i < view.fresh ? 'fresh' : undefined}><td>{i + 1}</td><td>{gift.rewards.map(historyName).join(' & ')} · Mốc {money(EVENT_MILESTONES[gift.milestone]?.points ?? 0)} điểm</td><td><em>Thành công</em></td><td>{stamp(gift.time)}</td></tr>)}</tbody></table></div>
          : <p className="ev-history-empty">Chưa nhận quà tích lũy nào.</p>}
    </div>
  </div>;
}

// Trang sự kiện Nâng Cấp Siêu Sao: sân khấu 8 hũ quà theo cấp, khung chơi (miễn phí / FC) và quà tích lũy theo mốc điểm.
export default function EventPage({ save, free, onPlay, onClaim, onMission }: { save: Save; free: boolean; onPlay: (count: number, mode: 'fc' | 'free') => PlayOutcome | null; onClaim: (index: number, choice: number | null) => EventReward[] | null; onMission: (id: string) => boolean }) {
  const event = eventState(save), level = eventLevel(event.points);
  const [viewLevel, setViewLevel] = useState(level);
  // Mốc chọn 1 trong 3 đang mở popup chọn quà (chỉ số trong EVENT_MILESTONES).
  const [picking, setPicking] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [won, setWon] = useState<Won | null>(null);
  const [missions, setMissions] = useState(false);
  // Hiệu ứng sau khi chơi: phù thủy bay từ trái vào giữa vạc (in), lần lượt thả phép xuống hũ trúng (cast, tối đa
  // CAST_MAX lần), rồi bay đi (out) và hiện Lịch sử nhận quà. step = lần thả phép đang chạy.
  const [cast, setCast] = useState<{ jars: number[]; step: number; phase: 'in' | 'cast' | 'out' } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finish = useRef<() => void>(() => {});
  // Mỗi phần là một khung cố định DESIGN_W × DESIGN_H, thu phóng đều cho vừa vùng hiển thị (không xếp lại bố cục).
  const page = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  // Giải Đặc Biệt: quỹ chung mô phỏng, cập nhật mỗi JACKPOT_TICK_MS (quỹ tăng, bot săn giải); lượt chơi của mình xử lý ở App.
  const [jackpot, setJackpot] = useState(() => loadJackpot());
  useEffect(() => {
    const update = () => { const next = tickJackpot(loadJackpot(), Date.now(), random); saveJackpot(next); setJackpot(next); };
    update();
    const id = setInterval(update, JACKPOT_TICK_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / DESIGN_W, el.clientHeight / DESIGN_H));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setViewLevel(level), [level]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);
  useEffect(() => { if (!history && !missions && !won && picking === null) return; const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setHistory(null); setMissions(false); setWon(null); setPicking(null); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [history, missions, won, picking]);

  const next = EVENT_LEVELS[level + 1];
  const progress = next ? (event.points - EVENT_LEVELS[level].points) / (next.points - EVENT_LEVELS[level].points) : 1;
  const shown = EVENT_LEVELS[viewLevel];
  const round = eventRound(event.points);
  // Trạng thái hiển thị một mốc: ready = còn lượt nhận, done = đã nhận hết ở vòng này, còn lại là chưa tới.
  const msState = (i: number) => milestoneAvailable(save, i) > 0 ? 'ready' : event.points >= EVENT_MILESTONES[i].points ? 'done' : 'locked';
  const missionsReady = EVENT_MISSIONS.filter(m => !event.missions.includes(m.id) && missionProgress(save, m) >= m.goal).length;

  const play = (count: number, mode: 'fc' | 'free') => {
    if (cast) return;
    const outcome = onPlay(count, mode);
    if (!outcome) return;
    const time = Date.now(), entries = outcome.hits.map((hit, i) => ({ time, ...hit, points: EVENT_LEVELS[hit.level].jars[hit.jar].points, reward: outcome.rewards[i] }));
    setJackpot(loadJackpot());
    const jackpotNote = (outcome.jackpotPaid ? ` · +${money(outcome.jackpotPaid)} FC vào Giải Đặc Biệt` : '') + (outcome.jackpotWins ?? []).map(w => ` · Trúng ${w.kind === 'special' ? 'Giải Đặc Biệt' : 'Giải Mini Đặc Biệt'} +${money(w.amount)} FC!`).join('');
    const show = () => setWon({ entries, note: `${count > 1 ? `${count} lượt chơi · ` : ''}+${outcome.points} điểm tích lũy${jackpotNote}${outcome.levelAfter > outcome.levelBefore ? ` · Lên cấp ${outcome.levelAfter + 1}!` : ''}` });
    clearTimers();
    setViewLevel(outcome.levelBefore);
    if (save.reduced) { show(); return; }
    const jars = outcome.hits.slice(0, CAST_MAX).map(h => h.jar);
    const after = (ms: number, run: () => void) => timers.current.push(setTimeout(run, ms));
    finish.current = () => { clearTimers(); setCast(null); show(); };
    setCast({ jars, step: -1, phase: 'in' });
    jars.forEach((_, step) => after(FLY_MS + step * CAST_MS, () => setCast(c => c && { ...c, step, phase: 'cast' })));
    const end = FLY_MS + jars.length * CAST_MS + 250;
    after(end, () => setCast(c => c && { ...c, step: -1, phase: 'out' }));
    after(end + FLY_MS, () => finish.current());
  };
  const claim = (index: number, choice: number | null) => {
    setPicking(null);
    const rewards = onClaim(index, choice);
    if (rewards) setWon({ entries: rewards.map(reward => ({ time: Date.now(), level: 0, jar: 0, points: 0, reward })), milestone: index });
  };

  return <section className="workspace event-page" ref={page} style={{ '--ev-scale': scale } as CSSProperties}>
    <div className="ev-screen ev-hero" style={{ backgroundImage: `url(${img('bg-stadium')})` }}><div className="ev-canvas">
      <img className="ev-logo" src={img('logo')} alt="Nâng Cấp Siêu Sao"/>
      <img className={`ev-witch ${cast ? 'away' : ''}`} src={img('witch')} alt="" aria-hidden="true"/>
      <div className="ev-jackpot">
        <div className="ev-jackpot-boxes"><div style={{ backgroundImage: `url(${img('jackpot-box')})` }}><b>{money(jackpot.pot)} FC</b></div><div style={{ backgroundImage: `url(${img('mini-box')})` }}><b>{money(mini(jackpot))} FC</b></div></div>
        {jackpot.feed.slice(0, 2).map(w => <p key={`${w.time}-${w.name}-${w.amount}`} className={`ev-jackpot-feed ${w.mine ? 'mine' : ''}`} style={{ backgroundImage: `url(${img('notice')})` }}>Chúc mừng <b>{w.name}</b><br/>đã nhận {money(w.amount)} FC</p>)}
      </div>
      <div className="ev-coach" style={{ backgroundImage: `url(${img('coach-frame')})` }}>
        <div className="ev-coach-board" style={{ backgroundImage: `url(${img('board')})` }}><b>Thông tin HLV</b><span>{COACH_NAME}</span></div>
        <div className="ev-coach-level"><img src={img('pumpkin-icon')} alt=""/><div><small>Cấp hiện tại</small><b>Cấp {level + 1}</b></div></div>
        <hr/>
        <small className="ev-coach-label">Điểm đang có</small>
        <b className="ev-coach-points">{money(event.points)}</b>
        <div className="ev-coach-bar"><i style={{ width: `${Math.min(1, progress) * 100}%` }}/></div>
        <p className="ev-coach-need">{next ? <>Cần tích thêm:<br/><b>{money(next.points - event.points)}</b> điểm để lên cấp {level + 2}</> : 'Đã đạt cấp tối đa'}</p>
        <button className="ev-history-open" onClick={() => setHistory({ tab: 'received', fresh: 0 })}><History size={15}/>Lịch sử nhận quà</button>
      </div>
        <div className="ev-stage-wrap">
          <div className="ev-stage">
            <img className="ev-pedestal" src={img('pedestal')} alt=""/>
            {cast && <>
              <img className={`ev-witch-fly ${cast.phase}`} src={img('witch')} alt="" aria-hidden="true"/>
              {cast.step >= 0 && (() => { const spot = JAR_SPOTS[cast.jars[cast.step]]; return <span key={cast.step} className="ev-spell" style={{ left: spot.x, top: spot.y - CAST_TARGET_Y, '--dx': `${WAND.x - spot.x}px`, '--dy': `${WAND.y - spot.y + CAST_TARGET_Y}px` } as CSSProperties}><i/></span>; })()}
              <button className="ev-skip" onClick={() => finish.current()}>Bỏ qua</button>
            </>}
            {shown.jars.map((jar, i) => <div key={i} className={`ev-jar ${cast?.phase === 'cast' && cast.jars[cast.step] === i ? 'hit' : ''}`} style={{ left: JAR_SPOTS[i].x, top: JAR_SPOTS[i].y, zIndex: JAR_SPOTS[i].y }}>
              <JarPrize reward={jar.reward}/>
              <img className="ev-jar-img" src={img(`jar-${JAR_SPOTS[i].art}`)} alt=""/>
              <strong>{jar.points} ĐIỂM</strong>
              <span className="ev-jar-tip" role="tooltip">{historyName(jar.reward)}</span>
            </div>)}
          </div>
          <div className="ev-levels" role="tablist" aria-label="Xem kho quà từng cấp">
            <div className="ev-level-line"><i style={{ width: `${(level + Math.min(1, progress)) / (EVENT_LEVELS.length - 1) * 100}%` }}/></div>
            {EVENT_LEVELS.map((item, i) => <button key={i} role="tab" aria-selected={viewLevel === i} className={`${i <= level ? 'open' : 'locked'} ${i === level ? 'current' : ''} ${viewLevel === i ? 'viewing' : ''}`} onClick={() => setViewLevel(i)} title={`Kho quà cấp ${i + 1} · từ ${money(item.points)} điểm`}>
              <span className="ev-level-icon"><img src={img('pumpkin-icon')} alt=""/>{i > level && <img className="ev-lock" src={img('lock')} alt=""/>}</span>CẤP {i + 1}
            </button>)}
          </div>
          <p className="ev-progress-text">{next ? <>Cấp {level + 1} · còn <b>{money(next.points - event.points)}</b> điểm để lên cấp {level + 2}</> : <>Đã đạt cấp tối đa</>}{viewLevel !== level && <> · Đang xem kho quà cấp {viewLevel + 1}</>}</p>
        </div>

        <div className="ev-side">
        <div className="ev-stats">
          <div className="ev-currency" style={{ backgroundImage: `url(${img('currency')})` }}><small>FC</small><b>{free ? '∞' : money(save.fc ?? 0)}</b></div>
          <div className="ev-currency" style={{ backgroundImage: `url(${img('currency')})` }}><small>Điểm tích lũy</small><b>{money(event.points)}</b></div>
          <div className="ev-currency" style={{ backgroundImage: `url(${img('currency')})` }}><small>Lượt miễn phí</small><b>{event.free}</b></div>
        </div>
        {free && <p className="ev-note">Chế độ thử nghiệm · Chơi bằng FC không bị trừ FC</p>}
        <div className="ev-play" style={{ backgroundImage: `url(${img('play-panel')})` }}>
          <div className="ev-play-free">
            <p>Lượt miễn phí đang có: <b>{event.free}</b></p>
            <button className="ev-btn-free" disabled={event.free < 1 || !!cast} onClick={() => play(1, 'free')}>Chơi miễn phí</button>
            <button className="ev-btn-mission" onClick={() => setMissions(true)}>Nhận nhiệm vụ{missionsReady > 0 && <i>{missionsReady}</i>}</button>
          </div>
          <div className="ev-play-buttons">{EVENT_PLAYS.map(option => <button key={option.count} onClick={() => play(option.count, 'fc')} disabled={!!cast || (!free && (save.fc ?? 0) < option.price)} className={`ev-pay-${option.frame}`} style={{ backgroundImage: `url(${img(`pay-${option.frame}`)})` }}><b>{option.price}FC</b><small>{option.count} LẦN</small></button>)}</div>
        </div>
        </div>
    </div></div>

    <div className="ev-screen ev-milestones" style={{ backgroundImage: `url(${img('bg-castle')})` }}><div className="ev-canvas">
      <img className="ev-title" src={img('title-milestone')} alt="Quà tích lũy"/>
      <p className="ev-sub">Chỉ cần tích lũy điểm đến mốc nhất định bạn sẽ nhận được các phần quà vô cùng hấp dẫn</p>
      <div className="ev-score"><b>Tổng điểm hiện tại: {money(event.points)}</b><span>Số vòng đã hoàn thành: {round.done}<br/>Số điểm cần để hoàn thành vòng tiếp theo: {money(round.next)}</span></div>
      <div className="ev-ms-top">{EVENT_MILESTONES.map((m, i) => m.options.length === 1 && <button key={m.points} className={`ev-ms-single ${msState(i)}`} disabled={milestoneAvailable(save, i) < 1} onClick={() => claim(i, null)}>
        <Bundle rewards={m.options[0]} tip/>
        <span className="ev-ms-label"><b>{money(m.points)} điểm</b>{m.once && <small>Nhận 1 lần duy nhất</small>}{milestoneAvailable(save, i) > 0 && <small>Bấm để nhận</small>}</span>
      </button>)}</div>
      <div className="ev-ms-grid">{EVENT_MILESTONES.map((m, i) => m.options.length > 1 && <div key={m.points} className={`ev-ms-pick ${msState(i)}`}>
        <div className="ev-ms-options">{m.options.map((rewards, o) => <Bundle key={o} rewards={rewards} tip/>)}</div>
        <button className="ev-ms-label" onClick={() => setPicking(i)}><b>{money(m.points)} điểm (chọn 1 trong {m.options.length})</b><small>Số lần có thể chọn quà: {milestoneAvailable(save, i)}</small></button>
      </div>)}</div>
    </div></div>

    {picking !== null && <div className="ev-modal" role="dialog" aria-modal="true" aria-label="Chọn quà tích lũy" onMouseDown={e => { if (e.target === e.currentTarget) setPicking(null); }}>
      <div className="ev-history ev-won ev-pick" style={{ backgroundImage: `url(${img('popup')})` }}>
        <button className="ev-close" aria-label="Đóng" onClick={() => setPicking(null)}><X size={20}/></button>
        <p className="ev-pick-head">Vui lòng chọn 1 trong {EVENT_MILESTONES[picking].options.length} món quà bên dưới<br/>Số lần có thể chọn quà: {milestoneAvailable(save, picking)}</p>
        <div className="ev-pick-list">{EVENT_MILESTONES[picking].options.map((rewards, o) => <div key={o} className="ev-pick-item">
          <Bundle rewards={rewards} large/>
          <p>{rewards.map(giftName).join(' & ')}</p>
          <button className="ev-won-close" disabled={milestoneAvailable(save, picking) < 1} onClick={() => claim(picking, o)}>Chọn</button>
        </div>)}</div>
      </div>
    </div>}

    {missions && <div className="ev-modal" role="dialog" aria-modal="true" aria-label="Nhiệm vụ nhận lượt miễn phí" onMouseDown={e => { if (e.target === e.currentTarget) setMissions(false); }}>
      <div className="ev-modal-panel ev-missions" style={{ backgroundImage: `url(${img('popup')})` }}>
        <button className="ev-close" aria-label="Đóng" onClick={() => setMissions(false)}><X size={20}/></button>
        <h2>Nhiệm vụ ngày</h2><p>Hoàn thành nhiệm vụ để nhận lượt chơi miễn phí. Làm mới lúc 00:00 (giờ Việt Nam).</p>
        <ul>{EVENT_MISSIONS.map(mission => { const done = event.missions.includes(mission.id), value = Math.min(mission.goal, missionProgress(save, mission)); return <li key={mission.id}>
          <div><b>{mission.title}</b><small>{value}/{mission.goal} · +{mission.free} lượt miễn phí</small></div>
          <button disabled={done || value < mission.goal} onClick={() => onMission(mission.id)}>{done ? <><Check size={14}/>Đã nhận</> : value < mission.goal ? 'Chưa xong' : 'Nhận'}</button>
        </li>; })}</ul>
      </div>
    </div>}

    {won && <WonPopup won={won} onClose={() => setWon(null)}/>}
    {history && <HistoryPopup view={history} log={event.log} gifts={event.gifts} onTab={tab => setHistory({ tab, fresh: 0 })} onClose={() => setHistory(null)}/>}
  </section>;
}
