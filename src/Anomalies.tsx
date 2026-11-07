import { useEffect, useState } from 'react';
import { Check, CheckCheck, RotateCcw } from 'lucide-react';
import { money } from './game';
import { adminAnomalies, adminAnomalyReview } from './wallet';
import type { AnomalyRow } from './wallet';

// Theo dõi bất thường (supabase/migrations/202611070002_fco_save_audit.sql): lần đồng bộ mà BP / gói / thẻ / cấp thẻ tăng
// không kèm dòng lịch sử tương ứng. Chỉ để admin xem xét, không tự xử phạt.
const FLAGS: Record<string, string> = {
  bp_no_source: 'BP tăng không rõ nguồn',
  packs_no_source: 'Gói tăng không rõ nguồn',
  cards_no_source: 'Thẻ tăng không rõ nguồn',
  level_no_source: 'Thẻ lên cấp không qua nâng cấp',
  new_account_items: 'Tài khoản mới đã có sẵn đồ',
};
const HISTORY: Record<string, string> = { pack: 'mở gói', upgrade: 'nâng cấp', gift: 'quà', market: 'TTCN', shop: 'Shop', event: 'sự kiện' };
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const change = (label: string, before: number | null, after: number, unit = '') => before === null ? `${label} ${money(after)}${unit}` : before === after ? '' : `${label} ${money(before)} → ${money(after)}${unit}`;

export default function Anomalies() {
  const [rows, setRows] = useState<AnomalyRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<AnomalyRow[]>) => {
    setBusy(true); setError('');
    try { setRows(await task()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void run(adminAnomalies); }, []);
  return <section className="pa-form pa-anomalies" aria-label="Theo dõi bất thường">
    <div className="pa-row"><h2 className="pa-gift-title">Theo dõi bất thường</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void run(adminAnomalies)}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Các lần đồng bộ mà BP, gói, thẻ hoặc cấp thẻ tăng nhưng không có thao tác tương ứng trong lịch sử của người chơi (dấu hiệu sửa bản lưu). Đây chỉ là cảnh báo: hãy xem kỹ trước khi xử lý (trừ FC ở mục Nạp FC). Người gian lận khéo vẫn có thể không bị phát hiện.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {rows && !rows.length && <p className="pa-empty">Không có bất thường nào chưa xem.</p>}
    {rows?.map(row => <div key={row.id} className="pa-gift-item">
      <div>
        <b>{row.login} · {row.flags.map(f => FLAGS[f] ?? f).join(', ')}</b>
        <small>{[change('BP', row.bpBefore, row.bpAfter), change('Gói', row.packsBefore, row.packsAfter), change('Thẻ', row.cardsBefore, row.cardsAfter)].filter(Boolean).join(' · ')}</small>
        <small>Lịch sử mới: {row.history.length ? row.history.map(t => HISTORY[t] ?? t).join(', ') : 'không có'} · {time(row.time)}</small>
      </div>
      <span className="pa-anomaly-actions">
        <button type="button" className="icon-button" aria-label={`Đã xem cảnh báo này của ${row.login}`} title="Đã xem" disabled={busy} onClick={() => void run(() => adminAnomalyReview(row.id))}><Check size={16}/></button>
        <button type="button" className="icon-button" aria-label={`Đã xem mọi cảnh báo của ${row.login}`} title="Đã xem mọi cảnh báo của tài khoản này" disabled={busy} onClick={() => void run(() => adminAnomalyReview(row.id, true))}><CheckCheck size={16}/></button>
      </span>
    </div>)}
  </section>;
}
