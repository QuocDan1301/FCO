import { asset } from './asset';
import './voucher-card.css';

// Phiếu giảm thuế bán cầu thủ (Coupon Transfer Fee): ảnh thẻ coupon (assets/coupon-tax.webp, đã xoá số in sẵn), số % ghi bằng chữ
// ở góc tối dưới phải nên một ảnh dùng cho mọi mức 10 / 20 / 30 %. Khung giữ tỷ lệ ảnh (198 × 336), cỡ theo chiều cao chỗ chứa.
export default function VoucherCard({ pct, className = '' }: { pct: number; className?: string }) {
  return <span className={`voucher-card ${className}`}><img src={asset('/assets/coupon-tax.webp')} alt=""/><b>{pct}<small>%</small></b></span>;
}
