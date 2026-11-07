import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Gift, RefreshCw, X } from 'lucide-react';
import { asset } from './asset';
import { money } from './game';
import { findPack } from './event';
import { bilacAvailable, bilacRewardText, bilacRound, isJackpot, shortBp, summarizeBilac } from './bilac';
import type { BilacConfig, BilacMilestone, BilacReward, BilacResult, BilacState, BilacSymbol, ServerJackpot } from './wallet-state';
import './bilac.css';

// Sự kiện Bi Lắc: mỗi lượt đá 3 quả bóng vào 5 ô; so với bảng quà bên phải (x3 / x2 / khác nhau), nhận 1 món của hàng trúng
// và cộng điểm để mở quà mốc. Máy chủ quyết định kết quả; trang này chỉ diễn hoạt cảnh và hiển thị.
type Props = {
  fc: number; bilac: BilacState | null; loadConfig: () => Promise<BilacConfig>; loadJackpot: () => Promise<ServerJackpot>;
  onPlay: (count: number, mode: 'fc' | 'free') => Promise<BilacResult | null>; onClaim: (index: number, choice: number | null) => Promise<BilacReward[] | null>;
  onRefresh: () => Promise<void>; // tải lại ví (FC + điểm Bi Lắc) từ máy chủ
};
const EFFECTS_KEY = 'fco-bilac-effects';
const POCKET_X: Record<BilacSymbol, number> = { club: 38.8, fc: 44.4, special: 50, bp: 55.6, card: 61.2 }; // % ngang của 5 ô đích (dọc mép xa của sân trong ảnh bàn)
const ORDER: BilacSymbol[] = ['club', 'fc', 'special', 'bp', 'card'];
// Cầu thủ trên 4 thanh của ảnh bàn (đo trên table-2.webp 1546×938, % theo bàn): y = tâm thanh, l/r = hai đầu thanh trong sân,
// h = chiều cao hình (cqw); men = [vị trí trên thanh, màu áo]. Thanh đi sau lưng cầu thủ, ngang eo (mép dưới áo ≈ giữa hình).
const RODS = [
  { y: 29.4, l: 33.8, r: 66.3, h: 6.6, men: [[.23, 'brown'], [.48, 'blue'], [.74, 'brown']] },
  { y: 37.1, l: 30.7, r: 69.5, h: 7.8, men: [[.16, 'yellow'], [.39, 'yellow'], [.61, 'yellow'], [.83, 'yellow']] },
  { y: 46.9, l: 27.0, r: 73.2, h: 9.3, men: [[.17, 'brown'], [.38, 'brown'], [.6, 'brown'], [.81, 'brown']] },
  { y: 58.0, l: 22.3, r: 77.6, h: 11.1, men: [[.31, 'yellow'], [.5, 'green'], [.69, 'yellow']] },
] as const;

export function SymbolIcon({ symbol, size = 'md' }: { symbol: BilacSymbol | '?'; size?: 'sm' | 'md' }) {
  // 5 ô dùng ảnh nút tròn public/assets/bilac/sym-<ô>.png (CLB, FC, Special, BP, Thẻ); ô bất kỳ vẫn là dấu '?'.
  const label: Record<string, string> = { club: 'CLB', fc: 'FC', special: 'Special', bp: 'BP', card: 'Thẻ', '?': 'Ô bất kỳ' };
  return <span className={`bl-sym bl-sym-${symbol === '?' ? 'any' : `${symbol} has-img`} ${size}`} title={label[symbol]} aria-label={label[symbol]}>
    {symbol === '?' ? <b aria-hidden="true">?</b> : <img src={asset(`/assets/bilac/sym-${symbol}.png`)} alt=""/>}</span>;
}

// compact: ô gói chỉ hiện ảnh gói, tên gói hiện khi trỏ chuột / chạm / Tab (bảng quà, quà mốc); bảng kết quả hiện đủ tên.
// Quà trúng có khớp ô quà trong hàng không: quỹ so theo loại (máy chủ gắn thêm số FC), quà khác so đủ các trường.
const rewardKey = (r: BilacReward) => JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
const sameReward = (slot: BilacReward, won: BilacReward) =>
  isJackpot(slot) || isJackpot(won) ? isJackpot(slot) && isJackpot(won) && slot.jackpot === won.jackpot : rewardKey(slot) === rewardKey(won);

function RewardChip({ reward, compact = false }: { reward: BilacReward; compact?: boolean }) {
  if (isJackpot(reward)) return <span className={`bl-chip jackpot ${reward.jackpot}`}><img className="bl-jp-icon" src={asset('/assets/bilac/sym-special.png')} alt=""/>{reward.jackpot === 'special' ? 'Giải Đặc Biệt' : 'Giải Phụ'}{'fc' in reward ? `: ${money(reward.fc)} FC` : ''}</span>;
  // FC: thẻ gói FC (ảnh fc-card.webp, góc tam giác tối đã xoá số) ghi số FC ở góc dưới phải, giống thẻ BP.
  if ('fc' in reward) return <span className={`bl-bp-card bl-fc-card ${compact ? 'compact' : ''}`} tabIndex={compact ? 0 : undefined} data-name={`${money(reward.fc)} FC`} aria-label={`${money(reward.fc)} FC`}><img src={asset('/assets/bilac/fc-card.webp')} alt=""/><b>{money(reward.fc)}</b></span>;
  // BP: thẻ BP (ảnh bp-card.webp của sự kiện, góc tam giác trống) ghi số BP ở góc dưới phải.
  if ('bp' in reward) return <span className={`bl-bp-card ${compact ? 'compact' : ''}`} tabIndex={compact ? 0 : undefined} data-name={`${shortBp(reward.bp)} BP`} aria-label={`${shortBp(reward.bp)} BP`}><img src={asset('/assets/event/bp-card.webp')} alt=""/><b>{shortBp(reward.bp)}</b></span>;
  const pack = findPack(reward.pack);
  const name = bilacRewardText(reward);
  if (compact) return <span className="bl-chip pack compact" tabIndex={0} data-name={name} aria-label={name}>{pack?.back ? <img src={pack.back} alt=""/> : <Gift size={14}/>}</span>;
  return <span className="bl-chip pack" title={name}>{pack?.back ? <img src={pack.back} alt=""/> : <Gift size={14}/>}<em>{pack?.name ?? reward.pack}</em></span>;
}

export default function BilacPage({ fc, bilac, loadConfig, loadJackpot, onPlay, onClaim, onRefresh }: Props) {
  const [config, setConfig] = useState<BilacConfig | null>(null);
  const [error, setError] = useState('');
  const [jackpot, setJackpot] = useState<ServerJackpot>({ pot: 0, feed: [] });
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<BilacSymbol[]>([]);
  const [hitRow, setHitRow] = useState('');
  const [hitReward, setHitReward] = useState<BilacReward | null>(null); // quà vừa trúng: ô đó trong Danh sách quà sáng lên
  const [result, setResult] = useState<{ title: string; rewards: BilacReward[]; note: string } | null>(null);
  const [picking, setPicking] = useState<number | null>(null); // mốc đang mở hộp chọn quà
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => { if (refreshing) return; setRefreshing(true); onRefresh().finally(() => setRefreshing(false)); };
  const [effects, setEffects] = useState(() => { try { return localStorage.getItem(EFFECTS_KEY) !== 'off'; } catch { return true; } });
  const table = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  // Cuộn ô quà vừa trúng vào tầm nhìn nếu danh sách đang bị cuộn khuất (điện thoại).
  useEffect(() => { if (hitReward) side.current?.querySelector('.bl-prize.is-won')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [hitReward]);

  useEffect(() => { loadConfig().then(setConfig).catch(e => setError((e as Error).message)); }, [loadConfig]);
  useEffect(() => {
    let alive = true;
    const update = () => { if (document.visibilityState === 'visible') loadJackpot().then(j => { if (alive) setJackpot(j); }).catch(() => { /* lần sau thử lại */ }); };
    update(); const id = setInterval(update, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [loadJackpot]);
  const toggleEffects = () => setEffects(on => { try { localStorage.setItem(EFFECTS_KEY, on ? 'off' : 'on'); } catch { /* bỏ qua */ } return !on; });

  // Diễn 3 quả bóng bay từ chân sân vào 3 ô, nảy qua các thanh rod; trả về khi bóng cuối vào ô.
  const animate = (balls: BilacSymbol[]) => new Promise<void>(resolve => {
    const host = table.current;
    if (!effects || !host || !host.animate) { resolve(); return; }
    const runs = balls.map((symbol, i) => {
      const ball = document.createElement('i'); ball.className = 'bl-ball'; host.appendChild(ball);
      const x = POCKET_X[symbol], wobble = () => (Math.random() - .5) * 26;
      const frames = [
        { left: '50%', top: '66%', transform: 'translate(-50%,-50%) scale(1)' },
        { left: `${50 + wobble() / 3}%`, top: '58%', offset: .3 },
        { left: `${50 + wobble() / 3}%`, top: '47%', offset: .58 },
        { left: `${(50 + x) / 2 + wobble() / 6}%`, top: '33%', offset: .82 },
        { left: `${x}%`, top: '20.3%', transform: 'translate(-50%,-50%) scale(.6)' },
      ];
      const run = ball.animate(frames, { duration: 1100, delay: i * 320, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
      run.onfinish = () => setLanded(prev => [...prev, symbol]);
      return run.finished.catch(() => undefined).then(() => setTimeout(() => ball.remove(), 900));
    });
    Promise.all(runs).then(() => setTimeout(resolve, 350));
  });

  const play = async (count: number, mode: 'fc' | 'free') => {
    if (busy || !config) return;
    setBusy(true); setLanded([]); setHitRow(''); setHitReward(null);
    try {
      const outcome = await onPlay(count, mode);
      if (!outcome) return;
      const first = outcome.plays[0];
      await animate(first.balls);
      setLanded(first.balls); setHitRow(first.row); setHitReward(first.reward);
      setJackpot(outcome.jackpot);
      const rewards = outcome.plays.map(p => p.reward);
      const jackpotWin = rewards.find(r => isJackpot(r) && 'fc' in r);
      setResult({ title: count > 1 ? `Kết quả ${count} lượt` : 'Kết quả lượt đá', rewards: summarizeBilac(rewards),
        note: `+${money(outcome.points)} điểm${jackpotWin ? ` · Trúng ${bilacRewardText(jackpotWin)}!` : ''}` });
    } finally { setBusy(false); }
  };
  const claim = async (index: number, choice: number | null) => {
    if (busy) return;
    setBusy(true);
    try { const rewards = await onClaim(index, choice); if (rewards) { setPicking(null); setResult({ title: `Quà tích lũy · Mốc ${money(config?.milestones[index]?.points ?? 0)} điểm`, rewards, note: '' }); } }
    finally { setBusy(false); }
  };

  const rows = config?.rows ?? [];
  const milestones = config?.milestones ?? [];
  const points = bilac?.points ?? 0;
  const roundSize = config?.round ?? milestones.at(-1)?.points ?? 1;
  const available = (i: number) => bilacAvailable(points, milestones[i], bilac?.claimed[i], roundSize);
  const msState = (i: number) => available(i) > 0 ? 'ready' : points >= milestones[i].points ? 'done' : 'locked';
  const round = bilacRound(points, roundSize);
  const bundle = (rewards: BilacReward[]) => <span className="bl-bundle">{rewards.map((r, k) => <RewardChip key={k} compact reward={r}/>)}</span>;
  const singles = milestones.map((m, i) => [m, i] as [BilacMilestone, number]).filter(([m]) => m.options.length === 1);
  const multis = milestones.map((m, i) => [m, i] as [BilacMilestone, number]).filter(([m]) => m.options.length > 1);
  const triples = useMemo(() => rows.filter(r => r.kind === 'triple'), [rows]);
  const pairs = useMemo(() => rows.filter(r => r.kind === 'pair'), [rows]);
  const mixed = rows.find(r => r.kind === 'mixed');
  const wonIndex = (row: typeof rows[number]) => hitReward && hitRow === row.id ? row.rewards.findIndex(r => sameReward(r, hitReward)) : -1;
  const rowView = (row: typeof rows[number]) => <li key={row.id} className={`bl-row ${row.kind} ${row === pairs[0] || row === mixed ? 'grp' : ''} ${hitRow === row.id ? 'is-hit' : ''}`}>
    <span className="bl-combo">{row.kind === 'mixed' ? <><SymbolIcon symbol="?" size="sm"/><b>#</b><SymbolIcon symbol="?" size="sm"/><b>#</b><SymbolIcon symbol="?" size="sm"/></>
      : <><SymbolIcon symbol={row.symbol!} size="sm"/><b>x{row.kind === 'triple' ? 3 : 2}</b>{row.kind === 'pair' && <><SymbolIcon symbol="?" size="sm"/><b>x1</b></>}</>}</span>
    <span className="bl-rewards">{row.rewards.map((r, i) => <span key={i} className={`bl-prize ${i === wonIndex(row) ? 'is-won' : ''}`}>
      <RewardChip compact reward={isJackpot(r) ? { ...r, ...(r.jackpot === 'special' ? { fc: jackpot.pot } : { fc: Math.floor(jackpot.pot / 10) }) } : r}/></span>)}</span>
    <span className="bl-points"><small>Điểm</small>+{row.points}</span>
  </li>;

  return <section className="workspace bilac-page" aria-label="Sự kiện Bi Lắc">
    <div className="bl-top">
    <div className="bl-stage">
      <div className="bl-table"><div className="bl-board" ref={table}>
        <header className="bl-pot" aria-live="polite">
          <span className="bl-pot-label">Giải Đặc Biệt</span>
          <b><img src={asset('/assets/currency-fc.png')} alt=""/>{money(jackpot.pot)} FC</b>
          <small>Giải Phụ {money(Math.floor(jackpot.pot / 10))} FC</small>
        </header>
        <div className="bl-pockets">{ORDER.map(symbol => <span key={symbol} className={`bl-pocket ${landed.includes(symbol) ? 'is-lit' : ''}`} style={{ left: `${POCKET_X[symbol]}%` }}>
          <SymbolIcon symbol={symbol}/>{landed.filter(s => s === symbol).length > 0 && <em>{landed.filter(s => s === symbol).length}</em>}</span>)}</div>
        {RODS.map((rod, r) => <div key={r} className={`bl-men r${r}`} aria-hidden="true" style={{ top: `${rod.y}%`, left: `${rod.l}%`, width: `${rod.r - rod.l}%` }}>
          {rod.men.map(([x, team], k) => <img key={k} className="bl-fig" src={asset(`/assets/bilac/man-${team}.png`)} alt="" style={{ left: `${x * 100}%`, height: `${rod.h}cqw` }}/>)}</div>)}
        <i className="bl-kicker" aria-hidden="true"/>
      </div></div>
      {/* Hàng dưới bàn: 2 khung người trúng giải gần nhất + khung FC / Tổng điểm. */}
      <div className="bl-info">
        <div className="bl-feed">{(['special', 'mini'] as const).map(kind => {
          // Ô trái: người trúng Giải Đặc Biệt gần nhất; ô phải: người trúng Giải Phụ gần nhất (trong 10 lượt trúng máy chủ giữ).
          const prize = kind === 'special' ? 'Giải Đặc Biệt' : 'Giải Phụ';
          const w = jackpot.feed.find(f => (f.kind === 'special') === (kind === 'special'));
          return w ? <p key={kind} className={w.mine ? 'mine' : ''}><Gift aria-hidden="true"/>
            <span>Chúc mừng {w.mine ? <b>bạn</b> : <>HLV <b>{w.name}</b></>} đã trúng {prize} {money(w.amount)} FC</span></p>
            : <p key={kind} className="hint"><Gift aria-hidden="true"/><span>{kind === 'special' ? 'Đá trúng 3 ô Special để nhận cả quỹ Giải Đặc Biệt.' : 'Đá trúng 2 ô Special để nhận Giải Phụ.'}</span></p>;
        })}</div>
        <div className="bl-stats">
          <span className="bl-stats-fc">FC: {money(fc)}
            <button type="button" className={`bl-refresh ${refreshing ? 'is-spin' : ''}`} onClick={refresh} disabled={refreshing || busy} title="Tải lại số FC" aria-label="Tải lại số FC"><RefreshCw aria-hidden="true"/></button></span>
          <span className="bl-stats-pts">Tổng điểm: {money(points)}</span>
        </div>
      </div>
      <div className="bl-controls">
        <div className="bl-buttons">
          <button type="button" className={`bl-effects ${effects ? '' : 'off'}`} onClick={toggleEffects} aria-pressed={!effects}>{effects ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'}</button>
          <button type="button" className="bl-play free" title="1 lượt mỗi ngày" disabled={busy || !bilac?.freeToday} onClick={() => void play(1, 'free')}>{!bilac ? 'Đang tải…' : bilac.freeToday ? 'Chơi miễn phí' : 'Hết lượt miễn phí'}</button>
          {(config?.prices ?? []).map(p => <button key={p.count} type="button" className={`bl-play p${p.count}`} disabled={busy || fc < p.price} onClick={() => void play(p.count, 'fc')}><b>{money(p.price)} FC</b><small>{p.count} lần</small></button>)}
        </div>
      </div>
    </div>
    <div className="bl-sidecol">
    <span className="bl-logo" role="img" aria-label="Bi Lắc FCO"><img src={asset('/assets/bilac/logo.webp')} alt=""/></span>
    <aside className="bl-side" ref={side}>
      <h2>Danh sách quà</h2>
      {error && <p className="bl-error" role="alert">{error}</p>}
      <ul className="bl-rows bl-rowlist">{[...triples, ...pairs, ...(mixed ? [mixed] : [])].map(rowView)}</ul>
    </aside>
    </div>
    </div>
    <section className="bl-ms" aria-label="Quà tích lũy">
      <h2 className="bl-ms-title">Quà tích lũy</h2>
      <p className="bl-ms-sub">Tích lũy điểm Bi Lắc đến mốc để nhận quà. Mỗi {money(roundSize)} điểm là một vòng mới: các mốc được nhận thêm 1 lần.</p>
      <div className="bl-ms-score"><b>Tổng điểm hiện tại: {money(points)}</b><span>Số vòng đã hoàn thành: {round.done}<br/>Số điểm cần để hoàn thành vòng tiếp theo: {money(round.next)}</span></div>
      <div className="bl-ms-top">{singles.map(([m, i]) => <button key={i} type="button" className={`bl-ms-single ${msState(i)}`} disabled={busy || available(i) < 1} onClick={() => void claim(i, null)}>
        {bundle(m.options[0])}
        <span className="bl-ms-label"><b>{money(m.points)} điểm</b>{m.once && <small>Nhận 1 lần duy nhất</small>}{available(i) > 0 && <small>Bấm để nhận</small>}</span>
      </button>)}</div>
      <div className="bl-ms-grid">{multis.map(([m, i]) => <div key={i} className={`bl-ms-pick ${msState(i)}`}>
        <div className="bl-ms-options">{m.options.map((rewards, o) => <span key={o}>{bundle(rewards)}</span>)}</div>
        <button type="button" className="bl-ms-label" onClick={() => setPicking(i)}><b>{money(m.points)} điểm (chọn 1 trong {m.options.length})</b><small>Số lần có thể chọn quà: {available(i)}</small></button>
      </div>)}</div>
    </section>
    {picking !== null && milestones[picking] && <div className="bl-result" role="dialog" aria-modal="true" aria-label="Chọn quà tích lũy" onClick={() => setPicking(null)}>
      <div className="bl-pick" onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setPicking(null)}><X/></button>
        <h3>Mốc {money(milestones[picking].points)} điểm</h3>
        <p>Chọn 1 trong {milestones[picking].options.length} phần quà · Số lần có thể chọn: {available(picking)}</p>
        <div className="bl-pick-list">{milestones[picking].options.map((rewards, o) => <div key={o} className="bl-pick-item">
          <div className="bl-result-list">{rewards.map((r, k) => <RewardChip key={k} reward={r}/>)}</div>
          <button type="button" className="primary-button" disabled={busy || available(picking) < 1} onClick={() => void claim(picking, o)}>Chọn</button>
        </div>)}</div>
      </div>
    </div>}
    {result && <div className="bl-result" role="dialog" aria-modal="true" aria-label={result.title} onClick={() => setResult(null)}>
      <div onClick={e => e.stopPropagation()}>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setResult(null)}><X/></button>
        <h3>{result.title}</h3>
        <div className="bl-result-list">{result.rewards.map((r, i) => <RewardChip key={i} reward={r}/>)}</div>
        {result.note && <p>{result.note}</p>}
        <button type="button" className="primary-button" onClick={() => setResult(null)}>OK</button>
      </div>
    </div>}
  </section>;
}
