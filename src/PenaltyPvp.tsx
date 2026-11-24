import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, Copy, Crown, Hand, LogOut, Search, Shuffle, Swords, Target, Trophy, Users } from 'lucide-react';
import { SHOT_KINDS } from './penalty';
import type { ShotKind } from './penalty';
import { OUTCOME_LABEL, PVP_POLL_MS, PVP_RULES, REASON_LABEL, fromSvg, roundLabel, secondsLeft, toSvg } from './pvp';
import type { PvpAccess, PvpBoard, PvpMatch, PvpOutcome, PvpPoint, PvpShot } from './pvp';
import { adminPvpOpen, pvpAccess, pvpBoard, pvpCurrent, pvpFind, pvpLeave, pvpPick, pvpRoomCreate, pvpRoomJoin, pvpState } from './wallet';
import { clubLogoUrl } from './club-logo';
import './pvp.css';

// Penalty đối kháng (người dùng 2026-11-24): ghép ngẫu nhiên hoặc phòng mã; mỗi lượt chọn bí mật điểm sút + hướng bay người, máy chủ tính cả hai quả.
export type PvpApi = { current: () => Promise<PvpMatch | null>; find: () => Promise<PvpMatch>; create: () => Promise<PvpMatch>; join: (code: string) => Promise<PvpMatch>;
  state: (id: number) => Promise<PvpMatch>; pick: (id: number, round: number, shot: PvpShot, dive: PvpPoint) => Promise<PvpMatch>; leave: (id: number) => Promise<PvpMatch>; board: () => Promise<PvpBoard>;
  access?: () => Promise<PvpAccess>; setOpen?: (open: boolean) => Promise<PvpAccess> };
const LIVE: PvpApi = { current: pvpCurrent, find: pvpFind, create: pvpRoomCreate, join: pvpRoomJoin, state: pvpState, pick: pvpPick, leave: pvpLeave, board: pvpBoard, access: pvpAccess, setOpen: adminPvpOpen };

// Khung thành nhìn thẳng: bấm để chọn điểm. ball = điểm sút, glove = điểm bay người (vòng tầm với).
function Goal({ ball, glove, onPick, label, result }: { ball?: PvpPoint | null; glove?: PvpPoint | null; onPick?: (p: PvpPoint) => void; label: string; result?: PvpOutcome }) {
  const svg = useRef<SVGSVGElement>(null);
  const click = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!onPick || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    onPick(fromSvg((e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 110));
  };
  const b = ball ? toSvg(ball) : null, g = glove ? toSvg(glove) : null;
  return <svg ref={svg} className={`pvp-goal${onPick ? ' is-pick' : ''}${result ? ` is-${result}` : ''}`} viewBox="0 0 300 110" role={onPick ? 'button' : 'img'} aria-label={label} onClick={click}>
    <defs><pattern id="pvp-net" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0L8 8M8 0L0 8" stroke="#ffffff2e" strokeWidth=".6"/></pattern></defs>
    <rect x="10" y="10" width="280" height="90" fill="#0d2a1a"/>
    <rect x="10" y="10" width="280" height="90" fill="url(#pvp-net)"/>
    <line x1="0" y1="100.5" x2="300" y2="100.5" stroke="#ffffff55" strokeWidth="1"/>
    <path d="M10 101V10h280v91" fill="none" stroke="#f4f6f8" strokeWidth="4" strokeLinejoin="round"/>
    {g && <g className="pvp-glove"><circle cx={g.cx} cy={g.cy} r="40" className="pvp-reach"/><circle cx={g.cx} cy={g.cy} r="9"/><text x={g.cx} y={g.cy + 4} textAnchor="middle">✋</text></g>}
    {b && <g className="pvp-ball"><circle cx={b.cx} cy={b.cy} r="7"/><path d={`M${b.cx - 3} ${b.cy - 2}l3-2 3 2-1 3h-4z`}/></g>}
  </svg>;
}

const dot = (o: PvpOutcome | undefined) => o === 'goal' ? 'is-goal' : o ? 'is-fail' : '';

export default function PenaltyPvp({ online, onBack, api = LIVE }: { online: boolean; onBack: () => void; api?: PvpApi }) {
  const [match, setMatch] = useState<PvpMatch | null>(null);
  const [board, setBoard] = useState<PvpBoard | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [shot, setShot] = useState<PvpPoint | null>(null);
  const [kind, setKind] = useState<ShotKind>('normal');
  const [dive, setDive] = useState<PvpPoint | null>(null);
  const [offset, setOffset] = useState(0);
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  // Chế độ thử nghiệm (202611240008): admin thấy thanh bật / tắt mở cho mọi người.
  const [access, setAccess] = useState<PvpAccess | null>(null);
  const adopt = (m: PvpMatch | null) => { setMatch(m); if (m) setOffset(m.now - Date.now()); };
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
  // Đồng hồ lượt.
  useEffect(() => { if (match?.status !== 'playing') return; const id = window.setInterval(() => tick(t => t + 1), 500); return () => clearInterval(id); }, [match?.status]);
  // Sang lượt mới: xoá lựa chọn cũ. Trận xong: tải lại BXH.
  const round = match?.round ?? 0;
  useEffect(() => { setShot(null); setDive(null); setKind('normal'); }, [round, match?.id]);
  useEffect(() => { if (match?.status === 'done') loadBoard(); }, [match?.status]);

  if (!online) return <section className="workspace pvp-page"><p className="pvp-note">Hãy đăng nhập để chơi Penalty đối kháng.</p></section>;

  const last = match?.rounds[match.rounds.length - 1];
  const left = match ? secondsLeft(match.deadline, offset) : 0;
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
          <li>Mỗi trận <b>{PVP_RULES.kicks} lượt</b>. Mỗi lượt cả hai cùng chọn bí mật <b>điểm sút</b> và <b>hướng bay người</b>, máy chủ tính cả hai quả.</li>
          <li>Hoà sau {PVP_RULES.kicks} lượt thì đá <b>luân lưu</b> tới khi có cách biệt. Mỗi lượt {PVP_RULES.roundSeconds} giây, hết giờ máy tự chọn ngẫu nhiên.</li>
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

  // ===== Đang đá / kết thúc =====
  const [me, opp] = match.score;
  const kicks = Math.max(PVP_RULES.kicks, match.rounds.length + (match.status === 'playing' ? 1 : 0));
  const done = match.status === 'done';
  const submit = () => { if (!shot || !dive) return; void run(async () => adopt(await api.pick(match.id, match.round, { ...shot, kind }, dive))); };
  return <section className="workspace pvp-page">
    {header}
    <div className="pvp-board-score">
      <div className="pvp-side"><span>Bạn</span><b>{me}</b></div>
      <div className="pvp-mid">{done ? <b>Kết thúc</b> : <><b>{roundLabel(match.round)}</b><span className={left <= 5 ? 'is-hurry' : undefined}>{left}s</span></>}
        <div className="pvp-dots" aria-label="Diễn biến từng lượt">
          <div>{Array.from({ length: kicks }, (_, i) => <i key={i} className={dot(match.rounds[i]?.mine)}/>)}</div>
          <div>{Array.from({ length: kicks }, (_, i) => <i key={i} className={dot(match.rounds[i]?.theirs)}/>)}</div>
        </div>
      </div>
      <div className="pvp-side is-opp"><span>{match.opponent?.name ?? 'Đối thủ'}</span><b>{opp}</b></div>
    </div>

    {last && <div className="pvp-last" aria-live="polite">
      <div><small>Lượt {last.r} · Bạn sút</small><Goal label="Quả bạn sút" ball={last.myShot} glove={last.oppDive} result={last.mine}/><b className={`is-${last.mine}`}>{OUTCOME_LABEL[last.mine]}</b></div>
      <div><small>Lượt {last.r} · Đối thủ sút</small><Goal label="Quả đối thủ sút" ball={last.oppShot} glove={last.myDive} result={last.theirs}/><b className={`is-${last.theirs}`}>{last.theirs === 'goal' ? 'Thủng lưới' : last.theirs === 'save' ? 'Bạn cản phá!' : 'Đối thủ sút hỏng'}</b></div>
    </div>}

    {done ? <div className={`pvp-result is-${match.winner}`}>
      <h2>{match.winner === 'me' ? 'CHIẾN THẮNG' : match.winner === 'opp' ? 'THẤT BẠI' : 'HOÀ'}</h2>
      <p>{me} – {opp}{match.reason && REASON_LABEL[match.reason] ? ` · ${match.winner === 'opp' && match.reason !== 'draw' ? (match.reason === 'leave' ? 'Bạn đã rời trận' : 'Bạn mất kết nối') : REASON_LABEL[match.reason]}` : ''}</p>
      {match.delta !== null && <p className="pvp-delta">{match.delta >= 0 ? `+${match.delta}` : match.delta} điểm BXH</p>}
      <div className="pvp-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => adopt(await api.find()))}><Shuffle size={16}/>Trận mới</button>
        <button type="button" className="secondary-button" onClick={() => adopt(null)}>Về sảnh</button>
      </div>
    </div> : match.picked ? <div className="pvp-waitpick"><div className="pvp-spinner" aria-hidden="true"/><p>Đã chốt lựa chọn · {match.oppPicked ? 'đang tính kết quả…' : 'chờ đối thủ chọn…'}</p></div>
    : <div className="pvp-pick">
      <div className="pvp-pick-col">
        <h3><Target size={16}/>1. Chọn điểm sút</h3>
        <Goal label="Bấm vào khung thành để chọn điểm sút" ball={shot} onPick={setShot}/>
        <div className="pvp-kinds" role="radiogroup" aria-label="Kiểu sút">{SHOT_KINDS.map(k => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} title={k.hint} onClick={() => setKind(k.id)}>{k.name}</button>)}</div>
      </div>
      <div className="pvp-pick-col">
        <h3><Hand size={16}/>2. Chọn hướng bay người</h3>
        <Goal label="Bấm vào khung thành để chọn hướng bay người khi bắt quả của đối thủ" glove={dive} onPick={setDive}/>
        <p className="pvp-note">{match.oppPicked ? 'Đối thủ đã chọn xong.' : 'Đối thủ đang chọn…'}</p>
      </div>
      <div className="pvp-pick-go">
        <button type="button" className="primary-button" disabled={busy || !shot || !dive} onClick={submit}>{!shot ? 'Chọn điểm sút' : !dive ? 'Chọn hướng bay người' : 'Chốt lựa chọn'}</button>
        <button type="button" className="pvp-leave" disabled={busy} onClick={() => { if (confirm('Rời trận sẽ bị xử thua. Vẫn rời?')) void run(async () => adopt(await api.leave(match.id))); }}><LogOut size={14}/>Rời trận</button>
      </div>
    </div>}
    {error && <p className="pvp-error" role="alert">{error}</p>}
  </section>;
}
