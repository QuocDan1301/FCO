import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Crown, Medal, RefreshCw, Shirt, Swords, Target, Trophy } from 'lucide-react';
import { getPlayer, money, players } from './game';
import { seasonShort } from './badges';
import type { Leaderboard } from './wallet-state';
import './ranks.css';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import { tierById } from './ranked';
import type { RankedState } from './ranked';

// Bảng xếp hạng HLV (supabase/migrations/202611080001_fco_ranks.sql): top 10 kỷ lục đập thẻ OVR cao nhất, giá trị đội hình đang dùng,
// Penalty và GLXH (điểm xếp hạng giả lập, fco_ranked_state). Game gửi số lên ở App.tsx (đập thành công / Giá trị ĐH đổi); trang này chỉ đọc.
// loadRanked: BXH GLXH (fco_ranked_state) — bảng thứ tư, top 10 theo điểm xếp hạng.
type Props = { load: () => Promise<Leaderboard>; loadRanked?: () => Promise<RankedState>; online: boolean; levelBadge: (level: number) => string };

const PLACE = ['gold', 'silver', 'bronze'];
const known = new Set(players.map(p => p.id));

export default function RanksPage({ load, loadRanked, online, levelBadge }: Props) {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [ranked, setRanked] = useState<RankedState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!online) return;
    setLoading(true); setError('');
    Promise.all([load().then(setData), loadRanked ? loadRanked().then(setRanked) : null]).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [load, loadRanked, online]);
  useEffect(() => { refresh(); }, [refresh]);

  // Luôn đủ 10 dòng để hai bảng cao bằng nhau; dòng chưa có người ghi "Chưa có".
  const ten = (filled: ReactNode[]) => [...filled, ...Array.from({ length: Math.max(0, 10 - filled.length) }, (_, k) =>
    <li key={`empty-${k}`} className="rk-row is-empty"><span className="rk-rank">{filled.length + k + 1}</span><span className="rk-none">{loading && !data ? 'Đang tải…' : 'Chưa có'}</span></li>)];

  const ovrRows = (data?.ovr ?? []).map((r, i) => {
    const p = r.playerId && known.has(r.playerId) ? getPlayer({ playerId: r.playerId }) : undefined;
    return <li key={i} className={`rk-row ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
      <span className="rk-rank">{i + 1}</span>
      <span className="rk-coach">{clubLogoUrl(r.club) && <img className="rk-club" src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
      <span className="rk-card">
        {/* Chỉ lấy phần mặt: ảnh gốc in sẵn ô cấp +1, cấp thật hiện ở huy hiệu bên cạnh. */}
        {p?.cardFace && <span className="squad-face rk-face"><img src={p.cardFace} alt=""/></span>}
        <span className="rk-player">{p && <b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>}{p?.name ?? '—'}</span>
        {r.level ? <img className="rk-level" src={levelBadge(r.level)} alt={`+${r.level}`}/> : null}
      </span>
      <strong className="rk-value">{r.ovr}<small>OVR</small></strong>
    </li>;
  });
  const squadRows = (data?.squad ?? []).map((r, i) => <li key={i} className={`rk-row rk-row-squad ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
    <span className="rk-rank">{i + 1}</span>
    <span className="rk-coach">{clubLogoUrl(r.club) && <img className="rk-club" src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
    <strong className="rk-value">{money(r.value)}<small>BP</small></strong>
  </li>);
  const penaltyRows = (data?.penalty ?? []).map((r, i) => <li key={i} className={`rk-row rk-row-squad ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
    <span className="rk-rank">{i + 1}</span>
    <span className="rk-coach">{clubLogoUrl(r.club) && <img className="rk-club" src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
    <strong className="rk-value">{r.goals}<small>bàn</small></strong>
  </li>);
  const rankedRows = (ranked?.top ?? []).slice(0, 10).map((r, i) => { const tier = tierById(r.tier); return <li key={i} className={`rk-row rk-row-squad rk-row-ranked ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
    <span className="rk-rank">{i + 1}</span>
    <span className="rk-coach">{clubLogoUrl(r.club) && <img className="rk-club" src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect as never).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
    <strong className="rk-value"><span>{r.points.toLocaleString('vi-VN')}<small>điểm</small></span><span className="rk-tier" style={{ color: tier.color }}><Medal aria-hidden="true"/>{tier.name}</span></strong>
  </li>; });
  const me = data?.me, rankedMe = ranked?.me;

  return <section className="workspace ranks-page" aria-label="Bảng xếp hạng HLV">
    <header className="rk-head">
      <h1><Trophy aria-hidden="true"/>Bảng xếp hạng HLV</h1>
      <button type="button" className="rk-refresh" onClick={refresh} disabled={loading || !online}><RefreshCw aria-hidden="true" className={loading ? 'is-spin' : ''}/>Làm mới</button>
    </header>
    {!online ? <p className="rk-note">Hãy đăng nhập để xem bảng xếp hạng.</p> : error ? <p className="rk-note is-error" role="alert">{error}</p> : null}
    <div className="rk-boards">
      <article className="rk-board" aria-label="Top 10 đập thẻ OVR cao nhất">
        <h2><Crown aria-hidden="true"/>Đập thẻ OVR cao nhất</h2>
        <p className="rk-sub">Kỷ lục OVR khi đập thẻ thành công</p>
        <ol className="rk-list">{ten(ovrRows)}</ol>
        <p className="rk-me">{me?.ovr ? <>Hạng của bạn: <b>#{me.ovrRank}</b> · {me.ovr} OVR</> : 'Bạn chưa có kỷ lục — đập thẻ thành công để lên bảng.'}</p>
      </article>
      <article className="rk-board" aria-label="Top 10 giá trị đội hình">
        <h2><Shirt aria-hidden="true"/>Giá trị đội hình cao nhất</h2>
        <p className="rk-sub">Tổng giá 11 cầu thủ đá chính</p>
        <ol className="rk-list">{ten(squadRows)}</ol>
        <p className="rk-me">{me?.squad ? <>Hạng của bạn: <b>#{me.squadRank}</b> · {money(me.squad)} BP</> : 'Đội hình đang dùng chưa có giá trị — xếp cầu thủ ở màn Đội hình.'}</p>
      </article>
      <article className="rk-board" aria-label="Top 10 Penalty">
        <h2><Target aria-hidden="true"/>Penalty</h2>
        <p className="rk-sub">Chuỗi bàn thắng liên tiếp dài nhất</p>
        <ol className="rk-list">{ten(penaltyRows)}</ol>
        <p className="rk-me">{me?.penalty ? <>Hạng của bạn: <b>#{me.penaltyRank}</b> · {me.penalty} bàn</> : 'Bạn chưa có kỷ lục — vào Penalty ở trang chủ để chơi.'}</p>
      </article>
      {loadRanked && <article className="rk-board" aria-label="Top 10 GLXH">
        <h2><Swords aria-hidden="true"/>GLXH</h2>
        <p className="rk-sub">Điểm xếp hạng giả lập</p>
        <ol className="rk-list">{ten(rankedRows)}</ol>
        <p className="rk-me">{rankedMe?.rank ? <>Hạng của bạn: <b>#{rankedMe.rank}</b> · {rankedMe.points.toLocaleString('vi-VN')} điểm · {tierById(rankedMe.tier).name}</> : 'Bạn chưa đá trận GLXH nào — vào GLXH ở trang chủ để thi đấu.'}</p>
      </article>}
    </div>
  </section>;
}
