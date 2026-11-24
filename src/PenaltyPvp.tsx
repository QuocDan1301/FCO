import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Crown, LogOut, Search, Shuffle, Swords, Trophy, Users } from 'lucide-react';
import PenaltyPage from './PenaltyPage';
import type { PenaltyKeep, PenaltyShot, ShotKind } from './penalty';
import { PVP_POLL_MS, PVP_RULES, REASON_LABEL, kicksOf, roundLabel, kickDeadline, secondsLeft, shooterOf } from './pvp';
import type { PvpAccess, PvpBoard, PvpMatch, PvpOutcome, PvpPoint, PvpRound, PvpShot } from './pvp';
import { adminPvpOpen, pvpAccess, pvpBoard, pvpCurrent, pvpFind, pvpLeave, pvpPick, pvpRoomCreate, pvpRoomJoin, pvpState } from './wallet';
import { clubLogoUrl } from './club-logo';
import './pvp.css';

// Penalty đối kháng (người dùng 2026-11-24): ghép ngẫu nhiên hoặc phòng mã; LUÂN PHIÊN mỗi quả một người sút, người kia bắt (202611240009).
// Trận diễn trên chính sân Penalty (PenaltyPage, chế độ pvp): người sút canh vạch ngắm + SÚT, thủ môn chọn hướng + BẮT; chốt xong chờ đối thủ,
// đủ hai bên thì cả hai máy cùng diễn cú sút + cú bay người theo kết quả máy chủ.
export type PvpApi = { current: () => Promise<PvpMatch | null>; find: () => Promise<PvpMatch>; create: () => Promise<PvpMatch>; join: (code: string) => Promise<PvpMatch>;
  state: (id: number) => Promise<PvpMatch>; pick: (id: number, round: number, shot: PvpShot | null, dive: PvpPoint | null) => Promise<PvpMatch>; leave: (id: number) => Promise<PvpMatch>; board: () => Promise<PvpBoard>;
  access?: () => Promise<PvpAccess>; setOpen?: (open: boolean) => Promise<PvpAccess> };
const LIVE: PvpApi = { current: pvpCurrent, find: pvpFind, create: pvpRoomCreate, join: pvpRoomJoin, state: pvpState, pick: pvpPick, leave: pvpLeave, board: pvpBoard, access: pvpAccess, setOpen: adminPvpOpen };

const dot = (o: PvpOutcome | undefined) => o === 'goal' ? 'is-goal' : o ? 'is-fail' : '';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Sút hỏng: căng / bổng thì vọt xà, còn lại dội cột (chỉ để diễn, máy chủ chỉ báo "miss").
const missKind = (shot: PvpShot) => shot.kind === 'power' || shot.y > .6 ? 'bar' as const : 'post' as const;
const toShot = (r: PvpRound): PenaltyShot => ({ goal: r.o === 'goal', over: false, streak: 0, best: 0, keeper: r.dive, saved: r.o === 'save', miss: r.o === 'miss' ? missKind(r.shot) : null, kind: r.shot.kind });
const toKeep = (r: PvpRound): PenaltyKeep => ({ saved: r.o === 'save', goal: r.o === 'goal', over: false, miss: r.o === 'miss' ? missKind(r.shot) : null, shot: r.shot, streak: 0, best: 0 });
const noStart = async () => ({ streak: 0, best: 0 });
const noShoot = async (): Promise<PenaltyShot> => { throw new Error('Không dùng ở chế độ đối kháng.'); };

export default function PenaltyPvp({ online, reduced = false, onBack, api = LIVE }: { online: boolean; reduced?: boolean; onBack: () => void; api?: PvpApi }) {
  const [match, setMatch] = useState<PvpMatch | null>(null);
  const latest = useRef<PvpMatch | null>(null);
  const [board, setBoard] = useState<PvpBoard | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [offset, setOffset] = useState(0);
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  // Quả đang diễn trên sân: chỉ sang quả mới khi đã diễn xong quả trước (trạng thái máy chủ có thể đi trước).
  const [shownKick, setShownKick] = useState(0);
  const [animating, setAnimating] = useState(false);
  // Lúc quả đang chọn hiện trên sân (mỗi quả 10 giây tính từ đây).
  const [kickAt, setKickAt] = useState<{ key: string; at: number } | null>(null);
  // Chế độ thử nghiệm (202611240008): admin thấy thanh bật / tắt mở cho mọi người.
  const [access, setAccess] = useState<PvpAccess | null>(null);
  const adopt = (m: PvpMatch | null) => { latest.current = m; setMatch(m); if (m) setOffset(m.now - Date.now()); };
  const run = async (task: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await task(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const loadBoard = () => { void api.board().then(setBoard).catch(() => {}); };

  // Vào trang: tiếp tục trận dở (nếu có) + tải BXH.
  useEffect(() => { if (!online) return; void api.current().then(adopt).catch(e => setError((e as Error).message)); loadBoard(); void api.access?.().then(setAccess).catch(() => {}); }, [online]);
  // Đang chờ / đang đá: hỏi trạng thái định kỳ (chỉ khi tab đang mở).
  const active = match && (match.status === 'waiting' || match.status === 'playing') ? match.id : null;
  useEffect(() => {
    if (active === null) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void api.state(active).then(adopt).catch(() => {}); }, PVP_POLL_MS);
    return () => clearInterval(id);
  }, [active]);
  // Đồng hồ quả.
  useEffect(() => { if (match?.status !== 'playing') return; const id = window.setInterval(() => tick(t => t + 1), 500); return () => clearInterval(id); }, [match?.status]);
  // Không diễn dở thì theo kịp quả hiện tại của trận.
  useEffect(() => { if (match && !animating && match.round > 0) setShownKick(match.round); }, [match?.id, match?.round, animating]);
  useEffect(() => { if (match?.status === 'done') loadBoard(); }, [match?.status]);
  // Quả mới hiện trên sân (diễn xong quả trước) thì bắt đầu đếm 10 giây.
  const liveKey = match && match.status === 'playing' && !animating && shownKick === match.round && match.round > 0 ? `${match.id}:${match.round}` : null;
  useEffect(() => { if (liveKey) setKickAt(k => k?.key === liveKey ? k : { key: liveKey, at: Date.now() }); }, [liveKey]);

  // Chốt lựa chọn rồi chờ máy chủ tính quả k (đối thủ chốt / hết giờ máy tự chọn).
  const waitRound = async (id: number, k: number) => {
    for (let i = 0; i < 150; i++) {
      const m = latest.current, found = m?.rounds.find(x => x.r === k);
      if (found) return found;
      if (m && m.status !== 'playing') throw new Error('Trận đã kết thúc.');
      await sleep(700);
      try { adopt(await api.state(id)); } catch { /* thử lại vòng sau */ }
    }
    throw new Error('Mất kết nối với trận, hãy tải lại trang.');
  };
  const submit = async <T,>(k: number, shot: PvpShot | null, dive: PvpPoint | null, map: (r: PvpRound) => T) => {
    const m = latest.current;
    if (!m || m.status !== 'playing') throw new Error('Trận đã kết thúc.');
    setAnimating(true);
    try { adopt(await api.pick(m.id, k, shot, dive)); return map(await waitRound(m.id, k)); }
    catch (e) { setAnimating(false); throw e; }
  };

  if (!online) return <section className="workspace pvp-page"><p className="pvp-note">Hãy đăng nhập để chơi Penalty đối kháng.</p></section>;

  const header = <><header className="pvp-head">
    <button type="button" className="pvp-back" onClick={onBack}><ArrowLeft size={16}/>Penalty</button>
    <h1><Swords aria-hidden="true"/>Penalty đối kháng</h1>
    {access && !access.open && <span className="pvp-testtag">Đang thử nghiệm</span>}
  </header>
  {access?.admin && <div className={`pvp-admin${access.open ? ' is-open' : ''}`} role="status">
    <span>{access.open ? 'Đã MỞ cho mọi người chơi (trừ acc phụ).' : 'Chế độ THỬ NGHIỆM: chỉ admin và acc phụ vào được, người chơi thường chưa thấy nút này.'}</span>
    <button type="button" className={access.open ? 'secondary-button' : 'primary-button'} disabled={busy}
      onClick={() => { if (!api.setOpen) return; if (!access.open && !confirm('Mở Penalty đối kháng cho mọi người chơi?')) return; void run(async () => setAccess(await api.setOpen!(!access.open))); }}>
      {access.open ? 'Đưa về thử nghiệm' : 'Mở cho mọi người'}</button>
  </div>}</>;

  // ===== Sảnh =====
  if (!match || match.status === 'cancelled') return <section className="workspace pvp-page">
    {header}
    <div className="pvp-lobby">
      <div className="pvp-modes">
        <button type="button" className="pvp-mode is-main" disabled={busy} onClick={() => void run(async () => adopt(await api.find()))}>
          <Shuffle size={30}/><b>Ghép ngẫu nhiên</b><small>Gặp người đang chờ ghép · tính điểm BXH</small></button>
        <button type="button" className="pvp-mode" disabled={busy} onClick={() => void run(async () => adopt(await api.create()))}>
          <Users size={26}/><b>Tạo phòng</b><small>Nhận mã 6 ký tự gửi cho bạn bè · giao hữu</small></button>
        <form className="pvp-join" onSubmit={e => { e.preventDefault(); if (code.trim()) void run(async () => adopt(await api.join(code.trim()))); }}>
          <label><span>Nhập mã phòng</span><input value={code} maxLength={6} placeholder="VD: K7M2QX" autoCapitalize="characters" spellCheck={false} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/></label>
          <button type="submit" className="primary-button" disabled={busy || code.trim().length < 6}><Search size={16}/>Vào phòng</button>
        </form>
        {error && <p className="pvp-error" role="alert">{error}</p>}
        <ul className="pvp-rules">
          <li>Mỗi người sút <b>{PVP_RULES.kicks} quả</b>, <b>luân phiên</b>: quả này bạn sút thì đối thủ làm thủ môn, quả sau đổi vai. Hai bên chọn bí mật <b>điểm sút</b> / <b>hướng bay người</b>.</li>
          <li>Hoà sau {PVP_RULES.kicks} lượt thì đá <b>luân lưu</b> từng cặp tới khi có cách biệt. Mỗi quả <b>{PVP_RULES.pickSeconds} giây</b> cho cả hai bên, hết giờ chưa chọn thì máy <b>tự sút</b> / <b>tự bắt</b>.</li>
          <li>Rời trận hoặc mất kết nối quá {PVP_RULES.awaySeconds} giây là thua. Chỉ trận <b>ghép ngẫu nhiên</b> tính điểm BXH.</li>
        </ul>
      </div>
      <aside className="pvp-board" aria-label="BXH Penalty đối kháng">
        <h2><Trophy size={18}/>BXH đối kháng</h2>
        {board?.me && <p className="pvp-me">Hạng của bạn: <b>#{board.me.rank}</b> · {board.me.points} điểm · {board.me.wins}T {board.me.draws}H {board.me.losses}B</p>}
        {!board ? <p className="pvp-note">Đang tải…</p> : board.top.length === 0 ? <p className="pvp-note">Chưa có ai đá trận xếp hạng.</p>
          : <ol>{board.top.map(row => <li key={row.rank} className={row.mine ? 'is-mine' : undefined}>
              <span className={`pvp-rank r${Math.min(row.rank, 4)}`}>{row.rank <= 3 ? <Crown size={13}/> : null}{row.rank}</span>
              {clubLogoUrl(row.club) ? <img src={clubLogoUrl(row.club)!} alt="" width={22} height={22}/> : <i className="pvp-noclub"/>}
              <b>{row.name}</b><span className="pvp-wl">{row.wins}T {row.draws}H {row.losses}B</span><strong>{row.points}</strong>
            </li>)}</ol>}
        <p className="pvp-note">Quà BXH đối kháng sẽ được thông báo sau.</p>
      </aside>
    </div>
  </section>;

  // ===== Chờ đối thủ =====
  if (match.status === 'waiting') return <section className="workspace pvp-page">
    {header}
    <div className="pvp-wait">
      {match.mode === 'room' ? <>
        <p>Gửi mã phòng này cho người bạn muốn đấu:</p>
        <div className="pvp-code"><b>{match.code}</b><button type="button" className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(match.code ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}><Copy size={15}/>{copied ? 'Đã chép' : 'Chép mã'}</button></div>
        <p className="pvp-note">Trận phòng mã là giao hữu, không tính điểm BXH.</p>
      </> : <>
        <div className="pvp-spinner" aria-hidden="true"/>
        <p>Đang tìm đối thủ…</p>
        <p className="pvp-note">Giữ trang này mở. Ai bấm Ghép ngẫu nhiên lúc này sẽ gặp bạn.</p>
      </>}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => adopt(await api.leave(match.id)))}>Huỷ</button>
      {error && <p className="pvp-error" role="alert">{error}</p>}
    </div>
  </section>;

  // ===== Đang đá / kết thúc: diễn trên sân Penalty (luân phiên sút / bắt) =====
  const done = match.status === 'done';
  const kick = Math.max(1, shownKick || match.round);
  // Người 1 / 2 của mình suy từ quả hiện tại (máy chủ chỉ báo iShoot cho quả hiện tại).
  const myIdx = match.round > 0 ? (match.iShoot ? shooterOf(match.id, match.round) : 3 - shooterOf(match.id, match.round)) : 1;
  const role = shooterOf(match.id, kick) === myIdx ? 'shooter' as const : 'keeper' as const;
  // Đang diễn quả k: chưa lộ kết quả quả đó trên bảng tỉ số.
  const vis = animating ? match.rounds.filter(x => x.r < kick) : match.rounds;
  const mine = vis.filter(x => x.shooter === 'me' && x.o === 'goal').length, theirs = vis.filter(x => x.shooter === 'opp' && x.o === 'goal').length;
  const myKicks = kicksOf(vis, 'me'), oppKicks = kicksOf(vis, 'opp');
  const slots = (n: number) => Math.max(PVP_RULES.kicks, n + (done ? 0 : 1));
  const live = !done && kick === match.round;
  const oppName = match.opponent?.name ?? 'Đối thủ';
  const kickKey = `${match.id}:${kick}`;
  const pickBy = live && match.deadline ? kickDeadline(match.deadline - offset, kickAt?.key === kickKey ? kickAt.at : Date.now()) : null;
  const left = pickBy === null ? 0 : secondsLeft(pickBy, 0);
  const head = <div className="pvp-stage-head">
    <div className="pvp-sb">
      <span className="pvp-sb-name is-me">Bạn<small>{role === 'shooter' && !done ? 'đang sút' : !done ? 'đang bắt' : ''}</small></span>
      <b>{mine}</b>
      <div className="pvp-sb-mid">
        <span>{done ? 'Kết thúc' : roundLabel(kick)}</span>
        {live && <strong className={left <= 3 ? 'is-hurry' : undefined}>{left}s</strong>}
        <div className="pvp-dots" aria-label="Diễn biến từng quả">
          <div>{Array.from({ length: slots(myKicks.length) }, (_, i) => <i key={i} className={dot(myKicks[i])}/>)}</div>
          <div>{Array.from({ length: slots(oppKicks.length) }, (_, i) => <i key={i} className={dot(oppKicks[i])}/>)}</div>
        </div>
      </div>
      <b>{theirs}</b>
      <span className="pvp-sb-name is-opp">{oppName}<small>{role === 'keeper' && !done ? 'đang sút' : !done ? 'đang bắt' : ''}</small></span>
    </div>
    {!done && <button type="button" className="pvp-leave" disabled={busy} onClick={() => { if (confirm('Rời trận sẽ bị xử thua. Vẫn rời?')) void run(async () => adopt(await api.leave(match.id))); }}><LogOut size={14}/>Rời trận</button>}
  </div>;
  const overlay = done && !animating ? <div className={`pvp-result is-${match.winner}`}>
    <h2>{match.winner === 'me' ? 'CHIẾN THẮNG' : match.winner === 'opp' ? 'THẤT BẠI' : 'HOÀ'}</h2>
    <p>{match.score[0]} – {match.score[1]}{match.reason && REASON_LABEL[match.reason] ? ` · ${match.winner === 'opp' && match.reason !== 'draw' ? (match.reason === 'leave' ? 'Bạn đã rời trận' : 'Bạn mất kết nối') : REASON_LABEL[match.reason]}` : ''}</p>
    {match.delta !== null && <p className="pvp-delta">{match.delta >= 0 ? `+${match.delta}` : match.delta} điểm BXH</p>}
    <div className="pvp-actions">
      <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { setShownKick(0); adopt(await api.find()); })}><Shuffle size={16}/>Trận mới</button>
      <button type="button" className="secondary-button" onClick={() => { setShownKick(0); adopt(null); }}>Về sảnh</button>
    </div>
    {error && <p className="pvp-error" role="alert">{error}</p>}
  </div> : undefined;
  return <PenaltyPage online reduced={reduced} onStart={noStart} onShoot={noShoot} pvp={{
    role, kick, header: head, meName: 'Bạn', oppName, overlay,
    deadline: match.picked ? null : pickBy,
    onShoot: (x: number, y: number, kind: ShotKind) => submit(kick, { x, y, kind }, null, toShot),
    onKeep: (x: number, y: number) => submit(kick, null, { x, y }, toKeep),
    onShown: () => setAnimating(false),
  }}/>;
}