// Biểu tượng Zalo (vẽ riêng): ô vuông bo tròn xanh Zalo, bong bóng chat trắng ghi chữ "Zalo".
// Dùng ở thanh dưới trong game (App.tsx) và trang đăng nhập (AccountApp.tsx).
export default function ZaloIcon({ size = 24 }: { size?: number }) {
  return <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="zalo-icon">
    <rect x="2" y="2" width="44" height="44" rx="12" fill="#0068ff"/>
    <path d="M24 10c-9.4 0-16 5.6-16 12.6 0 4 2.2 7.5 5.7 9.8l-1.6 5.1 5.8-3c1.9.5 3.9.8 6.1.8 9.4 0 16-5.6 16-12.7S33.4 10 24 10z" fill="#fff"/>
    <text x="24" y="27" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="10.5" fill="#0068ff">Zalo</text>
  </svg>;
}
