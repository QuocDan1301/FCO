import { useEffect, useState } from 'react';
import { Lock, RotateCcw, ShieldCheck, Unlock } from 'lucide-react';
import { money } from './game';
import { adminAccountLock, adminCloneGroups, adminDeviceAllow } from './wallet';
import type { CloneGroup } from './wallet';

// Nghi clone (supabase/migrations/202611110014_fco_anti_clone.sql): nhóm tài khoản dùng chung thiết bị (mã ngẫu nhiên lưu trong trình duyệt)
// hoặc chung IP. Chung thiết bị đáng tin; chung IP chỉ để tham khảo (wifi gia đình, quán net, 4G dùng chung IP). Chỉ để admin xem, không tự khoá.
const date = (ms: number | null) => ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function CloneSuspects() {
  const [groups, setGroups] = useState<CloneGroup[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await task(); setGroups(await adminCloneGroups()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void run(async () => {}); }, []);
  return <section className="pa-form pa-anomalies" aria-label="Nghi clone">
    <div className="pa-row"><h2 className="pa-gift-title">Nghi clone</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void run(async () => {})}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Tài khoản đăng nhập trên <b>cùng một thiết bị</b> (cùng trình duyệt) hoặc <b>cùng IP</b> (từ 3 tài khoản). Mỗi thiết bị chỉ một tài khoản nhận quà ngày, lượt Bi Lắc miễn phí và mỗi gift code. Người nhà dùng chung máy: bấm <b>Cho phép thiết bị</b> để bỏ giới hạn. Dữ liệu bắt đầu ghi từ bản cập nhật này.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {groups && !groups.length && <p className="pa-empty">Chưa thấy nhóm nào.</p>}
    {groups?.map(g => <div key={g.kind + g.key} className="pa-gift-item pa-clone-group">
      <div>
        <b>{g.kind === 'device' ? `Chung thiết bị · ${g.accounts.length} tài khoản` : `Chung IP ${g.key} · ${g.accounts.length} tài khoản`}{g.allowed ? ' · đã cho phép' : ''}</b>
        {g.accounts.map(a => <small key={a.id} className="pa-clone-row">
          <span><b>{a.login}</b>{a.admin ? ' (admin)' : ''} · tạo {date(a.registered)} · online {date(a.lastSeen)} · đã nạp {money(a.topup)} FC{a.locked ? ' · ĐANG KHOÁ' : ''}</span>
          {!a.admin && <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(() => adminAccountLock(a.id, !a.locked))}>{a.locked ? <><Unlock size={14}/>Mở khoá</> : <><Lock size={14}/>Khoá</>}</button>}
        </small>)}
      </div>
      {g.kind === 'device' && <span className="pa-anomaly-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void run(() => adminDeviceAllow(g.key, !g.allowed))}><ShieldCheck size={15}/>{g.allowed ? 'Bỏ cho phép' : 'Cho phép thiết bị'}</button></span>}
    </div>)}
  </section>;
}
