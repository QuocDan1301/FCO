import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { money } from './game';
import { adminStats } from './wallet';
import type { AdminStats, StatsPlayer } from './wallet';

// Thống kê người chơi (supabase/migrations/202611070003_fco_stats.sql): tài khoản, online, giờ chơi, FC nạp (admin cộng ở Nạp FC).
// Chỉ tính người chơi đã đăng nhập; khách không có tài khoản nên không đếm được.
export const hours = (s: number) => s < 3600 ? `${Math.round(s / 60)} phút` : `${(s / 3600).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
export const vnd = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')} đ`;
export const ago = (ms: number | null, now: number) => {
  if (ms === null) return 'chưa vào game';
  const m = Math.round((now - ms) / 60000);
  return m < 2 ? 'đang online' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};
type Sort = 'lastSeen' | 'playSeconds' | 'topupVnd' | 'registered';
const SORTS: { id: Sort; label: string }[] = [{ id: 'lastSeen', label: 'Mới vào' }, { id: 'playSeconds', label: 'Giờ chơi' }, { id: 'topupVnd', label: 'Nạp nhiều' }, { id: 'registered', label: 'Mới đăng ký' }];

export default function Stats() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('lastSeen');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (q = search) => {
    setBusy(true); setError('');
    try { setData(await adminStats(q.trim())); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void load(''); const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); return () => clearInterval(id); }, []);
  const players = useMemo(() => [...(data?.players ?? [])].sort((a: StatsPlayer, b: StatsPlayer) => (b[sort] ?? 0) - (a[sort] ?? 0)), [data, sort]);
  const s = data?.summary;
  const maxDay = Math.max(1, ...(data?.days ?? []).map(d => d.seconds));
  return <section className="pa-form pa-stats" aria-label="Thống kê người chơi">
    <div className="pa-row"><h2 className="pa-gift-title">Thống kê người chơi</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Chỉ tính người chơi đã đăng nhập (khách không đếm được). Online = có hoạt động trong 2 phút gần nhất. Giờ chơi chỉ tính lúc tab game đang mở trên màn hình. Nạp = FC admin cộng ở mục Nạp FC (quy ra tiền theo tỉ giá tại thời điểm nạp); quà ngày, gift code, sự kiện không tính. Tự cập nhật mỗi phút.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {s && <div className="pa-stat-grid">
      <div><small>Đăng ký</small><b>{money(s.registered)}</b><span>+{money(s.registeredToday)} hôm nay · +{money(s.registered7)} 7 ngày</span></div>
      <div className="is-live"><small>Đang online</small><b>{money(s.online)}</b><span>{money(s.activeToday)} người chơi hôm nay · {money(s.active7)} trong 7 ngày</span></div>
      <div><small>Giờ chơi</small><b>{hours(s.playSecondsToday)}</b><span>hôm nay · {hours(s.playSeconds7)} 7 ngày · {hours(s.playSecondsAll)} tổng</span></div>
      <div><small>Nạp hôm nay</small><b>{vnd(s.topupVndToday)}</b><span>{money(s.topupFcToday)} FC</span></div>
      <div><small>Nạp 7 / 30 ngày</small><b>{vnd(s.topupVnd7)}</b><span>{vnd(s.topupVnd30)} trong 30 ngày</span></div>
      <div><small>Tổng nạp</small><b>{vnd(s.topupVndAll)}</b><span>{money(s.topupFcAll)} FC · {money(s.payers)} người đã nạp</span></div>
    </div>}
    {data && <div className="pa-stat-days" aria-label="14 ngày gần nhất">
      <h3>14 ngày gần nhất</h3>
      <table><thead><tr><th>Ngày</th><th>Người chơi</th><th>Giờ chơi</th><th>Đăng ký mới</th><th>Nạp</th></tr></thead>
        <tbody>{data.days.map(d => <tr key={d.day}><td>{d.day.split('-').reverse().slice(0, 2).join('/')}</td><td>{money(d.active)}</td>
          <td><span className="pa-stat-bar" style={{ width: `${d.seconds / maxDay * 100}%` }}/>{hours(d.seconds)}</td><td>{money(d.registered)}</td><td>{d.topupFc ? vnd(d.topupVnd) : '—'}</td></tr>)}</tbody></table>
    </div>}
    {data && <div className="pa-stat-players">
      <form className="pa-row" onSubmit={e => { e.preventDefault(); void load(); }}>
        <label className="pa-field"><span>Tìm tài khoản</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="tên đăng nhập" spellCheck={false}/></label>
        <label className="pa-field pa-narrow-sort"><span>Sắp xếp</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </form>
      <table><thead><tr><th>Tài khoản</th><th>Hoạt động</th><th>Giờ chơi</th><th>Đã nạp</th><th>FC còn</th><th>Đăng ký</th></tr></thead>
        <tbody>{players.map(p => <tr key={p.login} className={p.online ? 'is-online' : undefined}>
          <td>{p.online && <i className="pa-dot" aria-label="đang online"/>}{p.login}</td><td>{ago(p.lastSeen, data.now)}</td>
          <td>{hours(p.playSeconds)}{p.playSecondsToday ? <small> · {hours(p.playSecondsToday)} hôm nay</small> : null}</td>
          <td>{p.topupFc ? vnd(p.topupVnd) : '—'}</td><td>{money(p.fc)}</td><td>{new Date(p.registered).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td></tr>)}</tbody></table>
      {!players.length && <p className="pa-empty">Không có tài khoản nào.</p>}
    </div>}
  </section>;
}
