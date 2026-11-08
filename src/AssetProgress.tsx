import { useEffect, useState, useSyncExternalStore } from 'react';
import { assetProgress } from './asset-progress';
import './asset-progress.css';

const HIDE_AFTER_DONE_MS = 5000;

// Vòng tròn tiến trình tải tài nguyên trên thanh trên cùng; rê chuột (điện thoại: chạm) để xem phần trăm.
// Không hiện khi không có gì để tải nền (bản mothe.html, mạng yếu, bật tiết kiệm dữ liệu). Tải xong đủ thì tự ẩn sau vài giây.
export default function AssetProgressRing() {
  const { status, percent, failed } = useSyncExternalStore(assetProgress.subscribe, assetProgress.get);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (status !== 'done') return;
    const timer = window.setTimeout(() => setHidden(true), HIDE_AFTER_DONE_MS);
    return () => clearTimeout(timer);
  }, [status]);
  if (status === 'idle' || hidden) return null;
  const label = `Đã tải ${percent}% tài nguyên`;
  return <span className={`asset-ring is-${status}`} role="progressbar" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle className="asset-ring-track" cx="12" cy="12" r="9" pathLength={100}/>
      <circle className="asset-ring-value" cx="12" cy="12" r="9" pathLength={100} strokeDasharray={`${percent} 100`}/>
    </svg>
    <span className="asset-ring-tip" role="tooltip"><b>{label}</b>{status === 'partial' && <small>{failed.toLocaleString('vi-VN')} tài nguyên chưa tải được, game sẽ tự tải lại khi cần.</small>}</span>
  </span>;
}