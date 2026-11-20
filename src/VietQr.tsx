import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Vẽ mã QR thành SVG ngay trên máy (không gửi số tài khoản cho dịch vụ ngoài). Mức sửa lỗi M, viền trắng 4 ô như chuẩn.
export default function VietQr({ payload, label }: { payload: string; label: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(payload, 'Byte');
    qr.make();
    const n = qr.getModuleCount(), m = 4;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return { size: n + m * 2, d };
  }, [payload]);
  return <svg className="vietqr" viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={svg.size} height={svg.size} fill="#fff"/><path d={svg.d} fill="#000"/>
  </svg>;
}
