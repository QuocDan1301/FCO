import { useEffect, useState } from 'react';
import { asset } from './asset';
import { money } from './game';
import { TOPUP_MIN_FC, TOPUP_QR, TOPUP_VND_PER_1000_FC, TOPUP_ZALO } from './config';
import { fetchFcStats } from './wallet';
import type { FcStats } from './wallet';

// Khung nạp FC (nút "+" cạnh ô FC): quét mã QR chuyển khoản (tối thiểu TOPUP_MIN_FC), rồi gửi bill cho admin qua Zalo.
// Game không tự cộng FC; admin kiểm tra bill rồi gửi FC cho người chơi.
const vnd = (n: number) => n.toLocaleString('vi-VN');
export const topupVnd = (fc: number) => Math.round(fc / 1000 * TOPUP_VND_PER_1000_FC);

// Đã nạp / Đã dùng của chính tài khoản (supabase/migrations/202611080009_fco_my_fc_stats.sql). Tải lại mỗi lần mở khung nạp.
function FcSummary() {
  const [stats, setStats] = useState<FcStats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchFcStats().then(result => { if (active) setStats(result); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);
  if (error) return <p className="topup-summary-error" role="alert">Chưa tải được thống kê FC. {error}</p>;
  const value = (n?: number) => n === undefined ? '…' : money(n);
  return <div className="topup-summary-box">
    <dl className="topup-summary" aria-busy={!stats}>
      <div><dt>Đã nạp</dt><dd>{value(stats?.topup)} <span>FC</span></dd></div>
      <div><dt>Đã dùng</dt><dd>{value(stats?.spent)} <span>FC</span></dd></div>
    </dl>
    <p>Đã nạp là FC admin đã cộng sau khi kiểm tra bill. Đã dùng là FC đã chi cho Shop và sự kiện.</p>
  </div>;
}

export default function TopUp({ accountName, online }: { accountName?: string; online: boolean }) {
  const note = `NAP FC ${accountName ?? ''}`.trim();
  if (!online) return <div className="topup"><p className="topup-steps">FC được lưu trên tài khoản. Hãy đăng nhập (hoặc đăng ký) tài khoản để nạp và dùng FC.</p></div>;
  return <div className="topup">
    <FcSummary/>
    <p className="topup-rate">Tỷ lệ: <b>{vnd(TOPUP_VND_PER_1000_FC)} VND = 1.000 FC</b></p>
    <div className="topup-qr">
      {TOPUP_QR ? <img src={asset(TOPUP_QR)} alt="Mã QR chuyển khoản"/> : <span>Chưa có mã QR chuyển khoản. Hãy liên hệ admin.</span>}
    </div>
    <dl className="topup-info">
      <div><dt>Nạp tối thiểu</dt><dd>{money(TOPUP_MIN_FC)} FC ({vnd(topupVnd(TOPUP_MIN_FC))} VND)</dd></div>
      <div><dt>Nội dung chuyển khoản</dt><dd>{note}</dd></div>
    </dl>
    <p className="topup-steps">Chuyển khoản → gửi bill qua Zalo admin để check nhanh tại {TOPUP_ZALO ? <a href={TOPUP_ZALO} target="_blank" rel="noopener noreferrer">đây</a> : <span className="topup-nolink">đây</span>}.</p>
  </div>;
}
