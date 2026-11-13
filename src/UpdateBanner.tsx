import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { CHECK_EVERY_MS, UPDATE_DEADLINE_MS, checkForUpdate, currentBuild, onUpdateChange, reloadToLatest, requestReload, updateHeld, updatePending, updateReady } from './update-check';

// Thanh "Đã có bản cập nhật mới" ở đầu màn hình, đếm ngược 2 phút rồi tự tải lại (chờ xong nếu đang mở gói / đập thẻ / xem trận…).
// Quay lại tab / ứng dụng sau khi ẩn quá 30 giây mà đã có bản mới thì tải lại luôn.
export default function UpdateBanner() {
  const ready = useSyncExternalStore(onUpdateChange, updateReady);
  const pending = useSyncExternalStore(onUpdateChange, updatePending);
  const held = useSyncExternalStore(onUpdateChange, updateHeld);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const hiddenAt = useRef(0);
  useEffect(() => {
    if (!currentBuild() || window.location.protocol === 'file:') return;
    const timer = window.setInterval(() => { void checkForUpdate(); }, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = 0;
      void checkForUpdate().then(fresh => { if (fresh && away > 30_000) requestReload(); });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void checkForUpdate();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, []);
  // Có bản mới: bắt đầu đếm ngược; hết giờ thì yêu cầu tải lại.
  useEffect(() => { if (ready && !deadline) setDeadline(Date.now() + UPDATE_DEADLINE_MS); }, [ready, deadline]);
  useEffect(() => {
    if (!deadline) return;
    const tick = window.setInterval(() => {
      const t = Date.now(); setNow(t);
      if (t >= deadline && !updatePending()) requestReload();
    }, 1000);
    return () => clearInterval(tick);
  }, [deadline]);
  if (!ready) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const text = pending && held ? 'Bản cập nhật mới sẽ tải ngay khi bạn xong lượt hiện tại.'
    : `Đã có bản cập nhật mới của FCO VIP · tự cập nhật sau ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return <div className="update-banner" role="status">
    <span>{text}</span>
    <button type="button" onClick={() => { if (updateHeld()) requestReload(); else void reloadToLatest(); }}><RefreshCw size={15}/>Cập nhật ngay</button>
  </div>;
}
