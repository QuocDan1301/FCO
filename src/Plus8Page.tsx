import { useCallback, useEffect, useState } from 'react';
import { Flame, Gift, RefreshCw, Trophy, Zap } from 'lucide-react';
import { findPack } from './event';
import PackImage from './PackImage';
import type { Plus8Board } from './wallet-state';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import './ranks.css';
import './plus8.css';

// Sự kiện HOT "Đập 8 liền tay – Nhận ngay quà chất" (nút ở trang chủ, người dùng yêu cầu 2026-11-14): BXH số cầu thủ khác nhau
// HLV đập thành công lên +8, mỗi mùa tối đa 3 (máy chủ: fco_plus8_board, migration 202611140005).
type Props = { load?: () => Promise<Plus8Board>; online: boolean; onUpgrade: () => void };

const PLACE = ['gold', 'silver', 'bronze'];
// Quà Top 1–5 (người dùng 2026-11-14): gói MULTI EL · CU · UT · CC 114+ … 110+ (+8) — p8-1 … p8-5 trong src/packs.json.
// Riêng thẻ EL trong gói luôn +1 (seasonLevels): ảnh / tên gói không ghi, chỉ nói ở thể lệ.
export const PLUS8_PRIZES = [1, 2, 3, 4, 5].map(rank => ({ rank, pack: `p8-${rank}` }));

export default function Plus8Page({ load, online, onUpgrade }: Props) {
  const [data, setData] = useState<Plus8Board | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!online || !load) return;
    setLoading(true); setError('');
    load().then(setData).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [load, online]);
  useEffect(() => { refresh(); }, [refresh]);

  const rows = (data?.top ?? []).map((r, i) => <li key={i} className={`rk-row rk-row-squad ${PLACE[i] ?? ''} ${r.mine ? 'is-mine' : ''}`}>
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
    </header>
    <div className="p8-body">
      <aside className="p8-side">
        <div className="p8-me">
          <small>Thành tích của bạn</small>
          <b>{me?.count ?? 0}<span>cầu thủ +8</span></b>
          <p>{me?.rank ? <>Hạng hiện tại <strong>#{me.rank}</strong></> : 'Chưa có trên bảng'}</p>
        </div>
        <ul className="p8-rules">
          <li><Zap aria-hidden="true"/><span>Đập thẻ <b>thành công lên +8</b> để ghi điểm. Thẻ +8 có sẵn từ gói hay mua ở TTCN không tính.</span></li>
          <li><Zap aria-hidden="true"/><span>Mỗi cầu thủ chỉ tính <b>1 lần</b>, đập lại cùng cầu thủ không cộng thêm.</span></li>
          <li><Zap aria-hidden="true"/><span>Mỗi mùa thẻ tính <b>tối đa 3 cầu thủ</b>, đập nhiều mùa khác nhau để leo hạng.</span></li>
          <li><Zap aria-hidden="true"/><span>Bằng điểm thì HLV đạt điểm đó trước xếp trên.</span></li>
          <li><Gift aria-hidden="true"/><span>Top 1–5 nhận gói <b>EL, CU, UT, CC</b> (+8) theo hạng. Riêng cầu thủ <b>EL</b> trong gói luôn là thẻ <b>+1</b> và gồm mọi cầu thủ EL.</span></li>
        </ul>
        <button type="button" className="p8-go" onClick={onUpgrade}><Zap aria-hidden="true"/>Đập thẻ ngay</button>
      </aside>
      <article className="rk-board p8-board" aria-label="Top 10 đập +8 nhiều nhất">
        <h2><Trophy aria-hidden="true"/>Top 10 HLV
          <button type="button" className="rk-refresh p8-refresh" onClick={refresh} disabled={loading || !online}><RefreshCw aria-hidden="true" className={loading ? 'is-spin' : ''}/>Làm mới</button>
        </h2>
        <p className="rk-sub">Số cầu thủ khác nhau đập lên +8 · mỗi mùa tối đa 3</p>
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
  </section>;
}