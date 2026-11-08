import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Crown, RefreshCw, Shirt, Trophy } from 'lucide-react';
import { getPlayer, money, players } from './game';
import { seasonShort } from './badges';
import type { Leaderboard } from './wallet-state';
import './ranks.css';

// Bảng xếp hạng HLV (supabase/migrations/202611080001_fco_ranks.sql): top 10 kỷ lục đập thẻ OVR cao nhất và top 10
// giá trị đội hình đang dùng. Game gửi số lên ở App.tsx (đập thành công / Giá trị ĐH đổi); trang này chỉ đọc.
type Props = { load: () => Promise<Leaderboard>; online: boolean; levelBadge: (level: number) => string };

const PLACE = ['gold', 'silver', 'bronze'];
const known = new Set(players.map(p => p.id));

export default function RanksPage({ load, online, levelBadge }: Props) {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!online) return;
    setLoading(true); setError('');
    load().then(setData).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [load, online]);
  useEffect(() => { refresh(); }, [refresh]);

  // Luôn đủ 10 dòng để hai bảng cao bằng nhau; dòng chưa có người ghi "Chưa có".
  const ten = (filled: ReactNode[]) => [...filled, ...Array.from({ length: Math.max(0, 10 - filled.length) }, (_, k) =>
    <li key={`empty-${k}`} className="rk-row is-empty"><span className="rk-rank">{filled.length + k + 1}</span><span className="rk-none">{loading && !data ? 'Đang tải…' : 'Chưa có'}</span></li>)];

  const ovrRows = (data?.ovr ?? []).map((r, i) => {
    const p = r.playerId && known.has(r.playerId) ? getPlayer({ playerId: r.playerId }) : undefined;
    return <li key={i} className={`rk-row ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
      <span className="rk-rank">{i + 1}</span>
      <span className="rk-coach">{r.name}{r.mine && <em>Bạn</em>}</span>
      <span className="rk-card">
        {p?.cardFace && <img className="rk-face" src={p.cardFace} alt=""/>}
        <span className="rk-player">{p && <b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>}{p?.name ?? '—'}</span>
        {r.level ? <img className="rk-level" src={levelBadge(r.level)} alt={`+${r.level}`}/> : null}
      </span>
      <strong className="rk-value">{r.ovr}<small>OVR</small></strong>
    </li>;
  });
  const squadRows = (data?.squad ?? []).map((r, i) => <li key={i} className={`rk-row rk-row-squad ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
    <span className="rk-rank">{i + 1}</span>
    <span className="rk-coach">{r.name}{r.mine && <em>Bạn</em>}</span>
    <strong className="rk-value">{money(r.value)}<small>BP</small></strong>
  </li>);
  const me = data?.me;

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
        <p className="rk-sub">Tổng giá 11 cầu thủ đá chính của đội hình đang dùng</p>
        <ol className="rk-list">{ten(squadRows)}</ol>
        <p className="rk-me">{me?.squad ? <>Hạng của bạn: <b>#{me.squadRank}</b> · {money(me.squad)} BP</> : 'Đội hình đang dùng chưa có giá trị — xếp cầu thủ ở màn Đội hình.'}</p>
      </article>
    </div>
  </section>;
}
