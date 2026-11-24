// Chế độ thử BP / FC vô hạn (true = mua, mở gói, nâng cấp, chơi sự kiện không trừ tiền). Người dùng tắt ngày 2026-10-29.
// Không thay đổi số dư đã lưu, tỷ lệ ngẫu nhiên hoặc việc tiêu hao thẻ nguyên liệu.
export const UNLIMITED_COINS = false;

// Phiên bản mở thẻ không phát âm thanh, kể cả với thiết lập đã lưu trước đó.
export const AUDIO_ENABLED = false;
// Nhãn độ tuổi + khuyến cáo sức khoẻ ở góc trang chủ (người dùng gửi ảnh mẫu 2026-11-23, đang để "00+").
// Đổi AGE_RATING thành độ tuổi thật theo giấy phép của game (vd. '18'); để '' thì ẩn nhãn.
export const AGE_RATING = '00';

// Nạp FC bằng chuyển khoản (nút "+" cạnh ô FC trên thanh trên cùng): 4.000 VND = 1.000 FC (đổi từ 2.000 ngày 2026-11-07).
// TOPUP_QR: ảnh mã QR ngân hàng đặt trong public/ (vd. '/assets/topup-qr.png'); để trống thì khung nạp báo chưa có mã QR.
// TOPUP_ZALO: link Zalo của admin (vd. 'https://zalo.me/0912345678') để người chơi gửi bill; để trống thì chữ "đây" không bấm được.
// Game không tự cộng FC: admin kiểm tra bill rồi cộng FC cho tài khoản ở Cài đặt → Quản trị FC (máy chủ, src/AdminPanel.tsx).
// Đổi tỉ giá: sửa số dưới đây và thêm một dòng vào bảng fco_topup_rates trên máy chủ, để doanh thu cũ vẫn tính theo giá cũ.
export const TOPUP_VND_PER_1000_FC = 5000;
export const TOPUP_QR = '/assets/topup-qr.webp';
// Mã VietQR tĩnh đọc từ ảnh TOPUP_QR (MB Bank, tài khoản nhận tiền). Trang nạp dựng QR động từ mã này: tự điền số tiền + mã đơn (src/vietqr-payload.ts).
// Đổi tài khoản nhận tiền: thay ảnh TOPUP_QR (đổi tên file) và chuỗi dưới bằng nội dung QR mới; để trống thì trang nạp dùng ảnh tĩnh.
export const TOPUP_VIETQR = '00020101021138570010A000000727012700069704220113VQRQACYWB41880208QRIBFTTA53037045802VN62150107NPS686908006304B8BF';
export const TOPUP_ZALO = 'https://zalo.me/0336856477';
export const TOPUP_MIN_FC = 1_000; // nạp tối thiểu (FC)

// Nhóm Zalo cộng đồng: nút Zalo trên thanh dưới (thay nút Hướng dẫn từ 2026-11-11; Hướng dẫn vẫn mở từ Cài đặt).
export const ZALO_GROUP = 'https://zalo.me/g/euqnnlh3fqnkvsrzernm';

// Sự kiện Nâng Cấp Siêu Sao (EventPage, src/event.ts, fco_event_play trên máy chủ): tạm ẩn từ 2026-11-07 để chạy sự kiện Bi Lắc.
// Bật lại = đặt true rồi build; code, dữ liệu người chơi và hàm máy chủ vẫn giữ nguyên.
export const EVENT_NCSS_ENABLED = false;
// Sự kiện Bi Lắc (src/BilacPage.tsx, supabase/migrations/202611070005_fco_bilac.sql): nút "Sự kiện" trên thanh dưới.
// Tạm ẩn từ 2026-11-13 để chuẩn bị sự kiện Vòng Quanh Thế Giới. Bật lại = đặt true rồi build; điểm, quà mốc, dữ liệu người chơi
// và hàm máy chủ vẫn giữ nguyên.
export const EVENT_BILAC_ENABLED = false;
// Sự kiện Vòng Quanh Thế Giới (src/VqtgPage.tsx, supabase/migrations/202611130004_fco_vqtg.sql): nút "Sự kiện" trên thanh dưới,
// thay chỗ Bi Lắc từ 2026-11-13. Cần chạy migration trước khi build bật cờ này.
// 2026-11-21 ẨN để chuẩn bị sự kiện tuần mới; máy chủ cũng khoá chơi / nhận quà (202611210001_fco_vqtg_hide.sql).
// Mở lại: đặt true + chạy câu "Mở lại" ghi trong migration đó.
export const EVENT_VQTG_ENABLED = false;

// Sự kiện Cờ tỷ phú (src/CtpPage.tsx, 2026-11-22 đang dựng): false = người chơi chưa thấy; admin vẫn có nút xem trước ở thanh dưới.
// Cờ tỷ phú: mở cho người chơi từ 2026-11-22 (máy chủ mở riêng: update public.fco_ctp_state set open = true where id = 1).
export const EVENT_CTP_ENABLED = true;
