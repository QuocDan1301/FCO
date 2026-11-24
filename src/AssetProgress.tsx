import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Download, X } from 'lucide-react';
import { assetParts, assetProgress } from './asset-progress';
import './asset-progress.css';

const HIDE_AFTER_DONE_MS = 5000;

// Nút tiến độ tải tài nguyên trên thanh trên cùng (người dùng 2026-11-24: "thêm nút tiến độ tải tài nguyên để người chơi dễ theo dõi,
// nhấn vào sẽ biết đang tải phần nào"): vòng tròn + số %, bấm mở bảng từng phần (giao diện, ảnh gói, đường hầm, hiệu ứng, sự kiện, logo CLB…)
// với thanh tiến độ và trạng thái Xong / Đang tải / Chờ. Không hiện khi không tải nền (bản mothe.html, điện thoại, mạng yếu, tiết kiệm dữ liệu).
// Tải xong đủ thì tự ẩn sau vài giây (trừ khi đang mở bảng).
export default function AssetProgressRing() {
  const { status, percent, failed } = useSyncExternalStore(assetProgress.subscribe, assetProgress.get);
  const { parts, current } = useSyncExternalStore(assetParts.subscribe, assetParts.get);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== 'done' || open) return;
    const timer = window.setTimeout(() => setHidden(true), HIDE_AFTER_DONE_MS);
    return () => clearTimeout(timer);
  }, [status, open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (status === 'idle' || hidden) return null;
  const label = status === 'done' ? 'Đã tải xong tài nguyên' : `Đang tải tài nguyên ${percent}%`;
  const now = parts.find(p => p.id === current);
  return <div className={`asset-ring is-${status}${open ? ' is-open' : ''}`} ref={root}>
    <button type="button" className="asset-ring-button" aria-expanded={open} aria-controls="asset-panel" aria-label={`${label}. Bấm để xem đang tải phần nào`} title={label} onClick={() => setOpen(o => !o)}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="asset-ring-track" cx="16" cy="16" r="13" pathLength={100}/>
        <circle className="asset-ring-value" cx="16" cy="16" r="13" pathLength={100} strokeDasharray={`${percent} 100`}/>
      </svg>
      <span className="asset-ring-num">{status === 'done' ? <Check size={13}/> : percent}</span>
    </button>
    {open && <section id="asset-panel" className="asset-panel" aria-label="Tiến độ tải tài nguyên">
      <div className="asset-panel-head"><Download size={16}/><b>Tải tài nguyên</b><span>{status === 'done' ? 'Xong' : `${percent}%`}</span>
        <button type="button" className="asset-panel-close" aria-label="Đóng" onClick={() => setOpen(false)}><X size={15}/></button></div>
      <p className="asset-panel-now">{status === 'done' ? 'Đã tải đủ, mọi trang mở ngay không phải chờ.'
        : status === 'partial' ? `${failed.toLocaleString('vi-VN')} tài nguyên chưa tải được, game sẽ tự tải lại khi cần.`
        : now ? <>Đang tải: <b>{now.label}</b></> : 'Đang chuẩn bị…'}</p>
      <ul>{parts.map(p => {
        const pct = p.total ? Math.floor(p.loaded / p.total * 100) : 100, done = p.loaded >= p.total, active = p.id === current;
        return <li key={p.id} className={done ? 'is-done' : active ? 'is-active' : 'is-wait'}>
          <div className="asset-part-head"><span>{p.label}</span><small>{done ? <><Check size={12}/>Xong</> : active ? `Đang tải · ${pct}%` : 'Chờ'}</small></div>
          <div className="asset-part-bar" role="progressbar" aria-label={p.label} aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.loaded}><i style={{ width: `${pct}%` }}/></div>
          <small className="asset-part-count">{p.loaded.toLocaleString('vi-VN')} / {p.total.toLocaleString('vi-VN')} tệp</small>
        </li>; })}</ul>
      <p className="asset-panel-note">Vẫn chơi bình thường trong lúc tải. Phần nào chưa tải xong sẽ được tải ngay khi bạn mở tới.</p>
    </section>}
  </div>;
}