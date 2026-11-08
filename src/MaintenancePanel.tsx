import { useEffect, useState } from 'react';
import { Power, RotateCcw, Save } from 'lucide-react';
import { adminMaintenanceSet, fetchMaintenanceState } from './wallet';
import { MAINTENANCE_CHANGED, MAINTENANCE_DEFAULT_MESSAGE } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';

// Nút bảo trì (Quản trị FC → Bảo trì). Máy chủ kiểm tra quyền admin và tự chặn người chơi khi đang bảo trì.
export default function MaintenancePanel() {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setStatus(null);
    try { const next = await fetchMaintenanceState(); setState(next); setMessage(next.message); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const apply = async (enabled: boolean, text: string) => {
    setBusy(true); setStatus(null);
    try {
      const next = await adminMaintenanceSet(enabled, message);
      setState(next); setMessage(next.message); setStatus({ kind: 'ok', text });
      window.dispatchEvent(new Event(MAINTENANCE_CHANGED));
    } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const toggle = () => {
    if (!state) return;
    if (!state.enabled && !confirm('Bật bảo trì? Mọi người chơi (trừ admin) sẽ bị đưa ra màn bảo trì trong tối đa 30 giây và không chơi được cho tới khi tắt.')) return;
    void apply(!state.enabled, state.enabled ? 'Đã tắt bảo trì. Người chơi tự vào lại game trong tối đa 30 giây.' : 'Đã bật bảo trì. Người chơi sẽ thấy màn bảo trì trong tối đa 30 giây.');
  };
  return <section className="pa-form pa-maintenance" aria-label="Bảo trì">
    <div className="pa-row"><h2 className="pa-gift-title">Bảo trì</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    {state && <>
      <p className={`pa-maintenance-state ${state.enabled ? 'is-on' : 'is-off'}`} role="status"><i aria-hidden="true"/>{state.enabled ? 'Đang bảo trì: người chơi không vào được game' : 'Game đang mở bình thường'}</p>
      <label className="pa-field"><span>Thông báo cho người chơi <small>để trống sẽ dùng câu mặc định; tối đa 300 ký tự</small></span><textarea rows={3} maxLength={300} value={message} onChange={e => setMessage(e.target.value)} placeholder={MAINTENANCE_DEFAULT_MESSAGE}/></label>
      <div className="pa-actions">
        <button type="button" className={state.enabled ? 'primary-button' : 'pa-account-delete'} disabled={busy} onClick={toggle}><Power size={16}/>{state.enabled ? 'Tắt bảo trì' : 'Bật bảo trì'}</button>
        {state.enabled && <button type="button" className="secondary-button pa-gift-random" disabled={busy || message.trim() === state.message} onClick={() => void apply(true, 'Đã cập nhật thông báo bảo trì.')}><Save size={15}/>Lưu thông báo</button>}
      </div>
      <p className="pa-gift-note">Trong lúc bảo trì, tài khoản admin vẫn đăng nhập và chơi được để kiểm tra. Thao tác người chơi vừa làm trước đó vẫn được đồng bộ nên không mất tiến trình. Khi tắt, người chơi tự vào lại game mà không cần tải lại trang.</p>
    </>}
  </section>;
}