import { useCallback, useEffect, useState } from 'react';
import { Flame, Gift, History, RefreshCw, Trophy, X, Zap } from 'lucide-react';
import { getPlayer, players } from './game';
import { seasonShort } from './badges';
import { findPack } from './event';
import PackImage from './PackImage';
import type { Plus8Board, Plus8History, RankRound } from './wallet-state';
import { marketNow } from './market';
import { roundLeft } from './rank-round';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import './ranks.css';
import './plus8.css';

// Sự kiện HOT "Đập 8 liền tay – Nhận ngay quà chất" (nút ở trang chủ, người dùng yêu cầu 2026-11-14): BXH số cầu thủ khác nhau
// HLV đập thành công lên +8, mỗi mùa tối đa 3 (máy chủ: fco_plus8_board, migration 202611140005).
// loadHistory: lịch sử đập +8 của HLV hạng N (null = của mình), mở khi bấm dòng BXH / ô Thành tích của bạn.
// loadRound: vòng đua chung với BXH GLXH / Penalty (202611140017 / 0018): đếm ngược, hết vòng Top 1–5 tự nhận gói, bảng reset 7 ngày.
type Props = { loadRound?: () => Promise<RankRound>; load?: () => Promise<Plus8Board>; loadHistory?: (rank: number | null) => Promise<Plus8History | null>; online: boolean; onUpgrade: () => void };
const known = new Set(players.map(p => p.id));
const when = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const PLACE = ['gold', 'silver', 'bronze'];
// Quà Top 1–5 (người dùng 2026-11-14): gói MULTI EL · CU · UT · CC 114+ … 110+ (+8) — p8-1 … p8-5 trong src/packs.json.
// Riêng thẻ EL trong gói luôn +1 (seasonLevels): ảnh / tên gói không ghi, chỉ nói ở thể lệ.
export const PLUS8_PRIZES = [1, 2, 3, 4, 5].map(rank => ({ rank, pack: `p8-${rank}` }));

export default function Plus8Page({ loadRound, load, loadHistory, online, onUpgrade }: Props) {
  const [round, setRound] = useState<RankRound | null>(null);
  const [now, setNow] = useState(() => marketNow());
  useEffect(() => { if (!loadRound) return; const id = setInterval(() => setNow(marketNow()), 1000); return () => clearInterval(id); }, [loadRound]);
  const left = round ? roundLeft(round.endsAt, now) : null;
  const [history, setHistory] = useState<{ title: string; data: Plus8History | null; error?: string } | null>(null);
  const openHistory = (rank: number | null, name: string) => {
    if (!loadHistory) return;
    setHistory({ title: name, data: null });
    loadHistory(rank).then(data => setHistory({ title: data?.name ?? name, data })).catch(e => setHistory({ title: name, data: null, error: (e as Error).message }));
  };
  const clickable = (rank: number | null, name: string) => loadHistory ? {
    role: 'button', tabIndex: 0, title: `Xem lịch sử đập +8 của ${name}`, onClick: () => openHistory(rank, name),
    onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHistory(rank, name); } },
  } : {};
  const [data, setData] = useState<Plus8Board | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!online || !load) return;
    setLoading(true); setError('');
    // Hỏi vòng TRƯỚC (hết giờ thì máy chủ trao quà + reset) rồi mới tải bảng.
    const roundFirst = loadRound ? loadRound().then(setRound).catch(() => { /* chưa có migration: ẩn đếm ngược */ }) : Promise.resolve();
    roundFirst.then(() => load()).then(setData).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [load, loadRound, online]);
  useEffect(() => { refresh(); }, [refresh]);
  const ended = !!left?.done;
  useEffect(() => { if (ended) { const id = setTimeout(refresh, 2500); return () => clearTimeout(id); } }, [ended, refresh]);

  const rows = (data?.top ?? []).map((r, i) => <li key={i} className={`rk-row rk-row-squad ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}${loadHistory ? ' is-link' : ''}`} {...clickable(i + 1, r.name)}>
    <span className="rk-rank">{i + 1}</span>
    <span className="rk-coach">{clubLogoUrl(r.club) && <img className="rk-club" src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
    <strong className="rk-value">{r.count}<small>cầu thủ</small></strong>
  </li>);
  const empty = Array.from({ length: Math.max(0, 10 - rows.length) }, (_, k) =>
    <li key={`empty-${k}`} className="rk-row is-empty"><span className="rk-rank">{rows.length + k + 1}</span><span className="rk-none">{loading && !data ? 'Đang tải…' : 'Chưa có'}</span></li>);
  const me = data?.me;

  return <section className="workspace ranks-page p8-page" aria-label="Sự kiện Đập 8 liền tay">
    <header className="p8-hero">
      <span className="p8-hot"><Flame aria-hidden="true"/>Sự kiện hot</span>
      <h1>Đập 8 liền tay</h1>
      <p className="p8-tag">Nhận ngay quà chất</p>
      {round && left && <p className="p8-clock" role="timer" aria-live="off"><small>{left.done ? 'Đang chốt kết quả…' : 'Kết thúc sau'}</small>{!left.done && <b>{left.text}</b>}</p>}
    </header>
    <div className="p8-body">
      <aside className="p8-side">
        <div className={`p8-me ${loadHistory ? 'is-link' : ''}`} {...clickable(null, 'Bạn')}>
          <small>Thành tích của bạn</small>
          <b>{me?.count ?? 0}<span>cầu thủ +8</span></b>
          <p>{me?.rank ? <>Hạng hiện tại <strong>#{me.rank}</strong></> : 'Chưa có trên bảng'}</p>
          {loadHistory && <span className="p8-me-hint"><History aria-hidden="true"/>Xem lịch sử đập +8</span>}
        </div>
        <ul className="p8-rules">
          <li><Zap aria-hidden="true"/><span>Đập thẻ <b>thành công lên +8</b> để ghi điểm. Thẻ +8 có sẵn từ gói hay mua ở TTCN không tính.</span></li>
          <li><Zap aria-hidden="true"/><span>Mỗi cầu thủ chỉ tính <b>1 lần</b>, đập lại cùng cầu thủ không cộng thêm.</span></li>
          <li><Zap aria-hidden="true"/><span>Mỗi mùa thẻ tính <b>tối đa 3 cầu thủ</b>, đập nhiều mùa khác nhau để leo hạng.</span></li>
          <li><Zap aria-hidden="true"/><span>Bằng điểm thì HLV đạt điểm đó trước xếp trên.</span></li>
          <li><Gift aria-hidden="true"/><span>Hết giờ đếm ngược: Top 1–5 tự nhận gói <b>EL, CU, UT, CC</b> (+8) theo hạng. Riêng cầu thủ <b>EL</b> trong gói luôn là thẻ <b>+1</b> và gồm mọi cầu thủ EL.</span></li>
        </ul>
        <button type="button" className="p8-go" onClick={onUpgrade}><Zap aria-hidden="true"/>Đập thẻ ngay</button>
      </aside>
      <article className="rk-board p8-board" aria-label="Top 10 đập +8 nhiều nhất">
        <h2><Trophy aria-hidden="true"/>Top 10 HLV
          <button type="button" className="rk-refresh p8-refresh" onClick={refresh} disabled={loading || !online}><RefreshCw aria-hidden="true" className={loading ? 'is-spin' : ''}/>Làm mới</button>
        </h2>
        <p className="rk-sub">Số cầu thủ khác nhau đập lên +8 · mỗi mùa tối đa 3{loadHistory ? ' · bấm HLV để xem lịch sử' : ''}</p>
        {!online ? <p className="rk-note">Hãy đăng nhập để xem bảng xếp hạng.</p> : error ? <p className="rk-note is-error" role="alert">{error}</p> : null}
        <ol className="rk-list">{rows}{empty}</ol>
      </article>
      <aside className="p8-prizes" aria-label="Quà Top 1–5">
        <h2><Gift aria-hidden="true"/>Quà top</h2>
        <ol>{PLUS8_PRIZES.map(({ rank, pack: id }) => { const pack = findPack(id); return <li key={rank} className={PLACE[rank - 1] ?? ''}>
          <span className="p8-prize-rank">Top {rank}</span>
          {pack && <PackImage pack={pack} className="p8-prize-art"/>}
          <span className="p8-prize-name">{pack?.name ?? id}</span>
        </li>; })}</ol>
      </aside>
    </div>
    {history && <div className="p8-hist-backdrop" role="dialog" aria-modal="true" aria-label={`Lịch sử đập +8 của ${history.title}`} onClick={() => setHistory(null)}>
      <div className="p8-hist" onClick={e => e.stopPropagation()}>
        <header><h2><History aria-hidden="true"/>Lịch sử đập +8 · {history.data?.mine ? 'Bạn' : history.title}</h2>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setHistory(null)}><X/></button></header>
        {history.error ? <p className="rk-note is-error" role="alert">{history.error}</p>
          : !history.data ? <p className="rk-note">Đang tải…</p>
          : !history.data.items.length ? <p className="rk-note">Chưa đập thành công cầu thủ nào lên +8.</p>
          : <>
            <p className="p8-hist-sum"><b>{history.data.items.filter(i => i.counted).length}</b> cầu thủ được tính · {history.data.items.length} lượt +8</p>
            <ol className="p8-hist-list">{history.data.items.map(item => { const p = known.has(item.pid) ? getPlayer({ playerId: item.pid }) : undefined;
              return <li key={item.pid} className={item.counted ? '' : 'is-over'}>
                {p?.cardFace ? <span className="squad-face rk-face"><img src={p.cardFace} alt=""/></span> : <span className="p8-hist-noface"/>}
                <span className="p8-hist-name">{p && <b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>}{p?.name ?? `#${item.pid}`}<em>+8</em></span>
                <span className="p8-hist-time">{when(item.at)}</span>
                <span className={`p8-hist-tag ${item.counted ? 'is-ok' : ''}`}>{item.counted ? 'Tính điểm' : 'Vượt 3 / mùa'}</span>
              </li>; })}</ol>
          </>}
      </div>
    </div>}
  </section>;
}