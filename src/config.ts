// Chế độ thử BP / FC vô hạn (true = mua, mở gói, nâng cấp, chơi sự kiện không trừ tiền). Người dùng tắt ngày 2026-10-29.
// Không thay đổi số dư đã lưu, tỷ lệ ngẫu nhiên hoặc việc tiêu hao thẻ nguyên liệu.
export const UNLIMITED_COINS = false;

// Phiên bản mở thẻ không phát âm thanh, kể cả với thiết lập đã lưu trước đó.
export const AUDIO_ENABLED = false;

// Nạp FC bằng chuyển khoản (nút "+" cạnh ô FC trên thanh trên cùng): 2.000 VND = 1.000 FC.
// TOPUP_QR: ảnh mã QR ngân hàng đặt trong public/ (vd. '/assets/topup-qr.png'); để trống thì khung nạp báo chưa có mã QR.
// TOPUP_ZALO: link Zalo của admin (vd. 'https://zalo.me/0912345678') để người chơi gửi bill; để trống thì chữ "đây" không bấm được.
// Game không tự cộng FC: admin kiểm tra bill rồi cộng FC cho tài khoản ở Cài đặt → Quản trị FC (máy chủ, src/AdminPanel.tsx).
export const TOPUP_VND_PER_1000_FC = 2000;
export const TOPUP_QR = '/assets/topup-qr.webp';
export const TOPUP_ZALO = 'https://zalo.me/0336856477';
export const TOPUP_MIN_FC = 1_000; // nạp tối thiểu (FC)
