import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import { adminInventoryEnforce, adminSyncCatalog, fetchInventoryState } from './inventory-server';
import type { InventoryState } from './inventory-server';
import { catalogVersion } from './inventory-catalog';
import { checkForUpdate } from './update-check';

// Quản trị FC → Kho thẻ: đồng bộ bộ dữ liệu của bản game đang mở (giá, OVR, tỷ lệ gói, luật đập) lên máy chủ
// và bật "bắt buộc" để máy chủ không nhận thẻ / BP / gói do trình duyệt tự ghi (supabase/migrations/202611100013_fco_inventory_server.sql).
type Status = { kind: 'ok' | 'error'; text: string } | null;
const time = (ms: number | null) => ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'chưa đồng bộ';
const short = (version: string | null) => version ? version.slice(0, 12) : '—';

export default function InventoryAdmin() {
  const [state, setState] = useState<InventoryState | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchInventoryState().then(setState).catch(e => setStatus({ kind: 'error', text: (e as Error).message }));
  useEffect(() => { void load(); void catalogVersion().then(setLocal); }, []);
  const matches = !!state?.version && state.version === local;
  const sync = async () => {
    setBusy(true); setStatus(null); setProgress([0, 1]);
    try {
      if (await checkForUpdate()) throw new Error('Tab này đang chạy bản game cũ (đã có bản mới trên web). Tải lại trang (Ctrl + F5) rồi đồng bộ.');
      const next = await adminSyncCatalog((done, total) => setProgress([done, total]));
      setState(next);
      setStatus({ kind: 'ok', text: 'Đã đồng bộ. Người chơi mở bản game này sẽ dùng kho thẻ trên máy chủ.' });
    } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); setProgress(null); }
  };
  const enforce = async (enabled: boolean) => {
    if (enabled && !confirm('Bật bắt buộc? Từ lúc này máy chủ chỉ nhận thẻ, BP và gói do chính máy chủ tạo; game bản cũ trên máy người chơi phải tải lại trang mới chơi tiếp.')) return;
    if (!enabled && !confirm('Tắt bắt buộc? Game bản cũ lại tự ghi thẻ / BP như trước (dễ gian lận).')) return;
    setBusy(true); setStatus(null);
    try { setState(await adminInventoryEnforce(enabled)); setStatus({ kind: 'ok', text: enabled ? 'Đã bật bắt buộc.' : 'Đã tắt bắt buộc.' }); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return <section className="pa-gift" aria-label="Kho thẻ trên máy chủ">
    <div className="pa-form">
      <h2 className="pa-gift-title">Kho thẻ trên máy chủ</h2>
      <p className="pa-gift-note">Máy chủ mở gói, đập thẻ, mua / bán và cộng quà theo bộ dữ liệu được đồng bộ từ bản game. Mỗi lần đổi giá, gói, OVR hay luật đập: deploy bản mới, mở game bản mới rồi bấm Đồng bộ. Khi mã hai bên khác nhau, người chơi chưa bắt buộc vẫn chơi như cũ; đã bắt buộc thì phải chờ đồng bộ.</p>
      {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
      <div className="pa-gift-item"><div><b>Bản game đang mở</b><small>Mã dữ liệu {short(local)}</small></div></div>
      <div className="pa-gift-item"><div><b>Máy chủ</b><small>Mã dữ liệu {short(state?.version ?? null)} · {time(state?.syncedAt ?? null)}</small>
        <small>{matches ? 'Khớp với bản game đang mở.' : 'Khác bản game đang mở: cần đồng bộ.'} · Bắt buộc: {state?.enforced ? 'đang bật' : 'đang tắt'}</small></div></div>
      {progress && <p className="pa-gift-note" role="status">Đang gửi {progress[0]}/{progress[1]}…</p>}
      <div className="pa-actions">
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/>Tải lại</button>
        <button type="button" className="primary-button" onClick={() => void sync()} disabled={busy || !local}><UploadCloud size={16}/>{matches ? 'Đồng bộ lại' : 'Đồng bộ dữ liệu'}</button>
        <button type="button" className="secondary-button" onClick={() => void enforce(!state?.enforced)} disabled={busy || !state || (!state.enforced && !state.version)}><ShieldCheck size={15}/>{state?.enforced ? 'Tắt bắt buộc' : 'Bật bắt buộc'}</button>
      </div>
    </div>
  </section>;
}
