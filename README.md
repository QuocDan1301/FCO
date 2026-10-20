# Đấu trường huyền thoại

**Đang bật xu vô hạn để thử nghiệm:** mở gói/nâng cấp không trừ xu, áp dụng cả tiến trình cũ có số dư 0. Nguyên liệu và tỷ lệ vẫn theo quy tắc thường. Để tắt, đặt `UNLIMITED_COINS = false` trong `src/config.ts` rồi chạy `npm.cmd run build`; số dư thật được giữ nguyên.

**Mở trực tiếp `mothe.html` để chơi.** File này đã chứa toàn bộ JavaScript, CSS, phông chữ và hình ảnh, không cần cài Node.js, chạy Vite hoặc có Internet. Có thể sao chép riêng file sang thư mục khác rồi mở bằng Chrome/Edge. Tiến trình của file mở trực tiếp tách biệt với bản chạy qua localhost.

Trò chơi giả lập mở gói và nâng cấp thẻ, giao diện và nội dung tiếng Việt. React 19, TypeScript, Tailwind CSS 4, Motion và Vite. Dự án chạy cục bộ, không đăng nhập, không thanh toán thật.

## Chạy thử trên Windows

```powershell
npm.cmd install
npm.cmd run dev
```

Mở địa chỉ Vite in ra, thường là http://127.0.0.1:5173. `/` chạy bản phát triển React; `/mothe.html` là bản HTML độc lập được tạo sau mỗi lần build. Mở `mothe.html` trực tiếp cũng chơi được. Sau khi sửa mã nguồn trong `src/`, chạy `npm.cmd run build` để cập nhật file độc lập.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`dist/` là bản dựng tĩnh có thể đưa lên hosting. Trên macOS/Linux dùng `npm` thay `npm.cmd`.

## Hoạt cảnh ICON TM mới

- Cảnh được làm ấm ngay trong màn chuẩn bị và giữ nguyên canvas khi mở. Nhấn Mở sẽ ẩn ngay tất cả nút (kể cả Mở, Rời và Đóng), chờ 2 giây (khóa mở lặp trong lúc chờ), rồi mới lật thẻ hai mặt, quét ánh kim trong 1,9 giây (nhanh 0,9 giây), giữ mặt sau ở giữa vòng lật. Thẻ lật sang mặt trắng sáng, giữ yên một nhịp khoảng 0,65 giây rồi tan dần; sau đó camera mới bắt đầu vào đường hầm. Cảnh được chuẩn bị sẵn để không phải khởi tạo lại lúc chuyển. Cửa đôi mở ra sân khấu; bảng LED cập nhật từng bước.
- Nhịp đầy đủ khoảng 12 giây: bóng tối → đèn chạy → huy hiệu mùa → quốc tịch → vị trí → CLB/đội tuyển → khoảng lặng → mở cửa → sân khấu → tên và OVR. Chế độ nhanh khoảng 4,5 giây.
- `Điện ảnh / Nhanh` trên màn chọn gói; cài đặt cũng có tùy chọn. Nút âm thanh, hiệu ứng nhẹ và bỏ qua nằm trong màn mở thẻ.
- Sàn phản chiếu qua Reflector, 256px ở máy tính và 128px trên điện thoại, cập nhật riêng với tần suất thấp hơn camera để giảm tải. Giới hạn pixel ratio 1; nếu khung hình chậm, giảm riêng nền xuống 0,8 trên máy tính hoặc 0,75 trên điện thoại. Thẻ và chữ DOM giữ nguyên độ nét. Bỏ bản đồ bóng động; tự điều chỉnh theo kích thước màn hình và dùng chung đồng hồ khi chuyển sang 2D. Máy không có WebGL hoặc quá yếu tự chuyển sang cảnh Canvas 2D. Chế độ giảm chuyển động bỏ qua cảnh 3D/2D.
- Thẻ ICON dùng đội tuyển theo dữ liệu quốc tịch; ảnh Messi là áo Argentina, không chèn logo CLB hoặc số áo không tương ứng. Huy hiệu ICON TM trong dự án là SVG tự thiết kế, không phải tài nguyên EA.
- Mở 10 gói trình diễn thẻ tốt nhất, giữ một nhịp rồi tự chuyển sang đủ 10 thẻ; có thể xem tổng kết ngay.
- `Lưu vào kho` xác nhận xem kho vì thẻ đã được lưu an toàn trước hoạt cảnh; không nhận lại. `Mở tiếp` quay lại màn chuẩn bị, chỉ tạo lượt mới khi nhấn nút mở; `Xem chỉ số` mở bảng chỉ số giả lập.
- Năm âm thanh PCM do dự án tổng hợp trong `public/assets/cinema-*.wav`, tái tạo bằng `node scripts/create-cinema-audio.mjs`. Huy hiệu ở `public/assets/icon-tm.svg`. Tất cả được nhúng trong `mothe.html` để chạy ngoại tuyến.
- Kiểm tra chuỗi và chống nhận trùng: `tests/icon-tm-smoke.mjs` với CDP helper của kỹ năng thiết kế. Các script browser cũ là bài kiểm tra của giao diện trước đây; bài ICON TM là bài hiện hành.

## Tính năng và quy tắc

- 30 cầu thủ mẫu, 3 mùa giải tự thiết kế; mỗi mùa 10 cầu thủ. Dữ liệu tại `src/game.ts`.
- Khởi đầu 15 triệu xu và 12 thẻ; điểm danh 1 triệu xu/ngày theo giờ Việt Nam.
- Kho gói chưa mở: tặng 15 gói mỗi loại, lưu trên trình duyệt và trừ đúng số đã mở. Màn chuẩn bị có hai nút: Mở 1 thẻ và Mở N thẻ (N = số gói còn lại, tối đa 10). Còn 5 hiển thị Mở 5 thẻ; hết gói khóa thao tác. Bên ngoài có Nhận 10 gói thử khi bật xu vô hạn. Mọi lượt mở nhiều thẻ có tổng kết đủ số nhận; bỏ qua không đổi kết quả.
- Chọn 1 thẻ chính và tối đa 5 nguyên liệu. Mỗi vạch là 20% năng lượng. Với nguyên liệu bằng OVR hiện tại của thẻ chính: OVR ≥125 được 1 vạch, 124 được 1,25 vạch, 123 được 1,5 vạch; mỗi OVR thấp hơn thêm 0,25 vạch. Nguyên liệu lệch OVR được cộng/trừ 1,2 điểm phần trăm mỗi OVR; mỗi thẻ giới hạn 6–100%, tổng tối đa 5 vạch. Không cộng thưởng riêng khi trùng cầu thủ. Vạch tổng và vạch xem trước nguyên liệu hiển thị đúng phần lẻ. Thành công tăng 1 cấp, OVR cộng dồn theo `UPGRADE_LEVELS`; thất bại rớt ngẫu nhiên xuống một cấp thấp hơn (tối thiểu +1). Phôi cùng cầu thủ bảo vệ mức tối thiểu bằng cấp phôi trùng cao nhất: chỉ phục hồi khi cấp rớt thấp hơn mức đó. Hoạt cảnh và lịch sử hiển thị cấp rớt rồi cấp phục hồi. Cả hai tiêu hao nguyên liệu và phí (miễn phí trong chế độ thử). Cấp tối đa +13.
- Kết quả được tính và ghi vào localStorage trước hoạt cảnh. Làm mới trang giữa hoạt cảnh không mất phần thưởng và không trả lại nguyên liệu.
- Kho hỗ trợ tìm tên, lọc OVR/vị trí/mùa/cấp cộng, sắp xếp, xem chi tiết và chuyển thẻ sang nâng cấp. Lịch sử giữ tối đa 200 hoạt động.
- Âm thanh tổng hợp bằng Web Audio, mặc định tắt; giảm chuyển động theo hệ thống hoặc cài đặt; điện thoại giảm hạt sáng.
- Khung thẻ, sân vận động, huy hiệu và hình đại diện thay thế là SVG/CSS riêng. Ảnh Messi thật lưu cục bộ, ghi tác giả và giấy phép trong phần Hướng dẫn → Dữ liệu và nguồn ảnh. Các cầu thủ còn lại dùng hình đại diện minh họa, không giả nhận diện khuôn mặt.

Tỷ lệ chỉ thuộc trò chơi giả lập này. Tên CLB minh họa giai đoạn sự nghiệp, không phải dữ liệu đội hình hiện tại. Dữ liệu trình duyệt có thể chỉnh sửa, nên không phù hợp thi đấu hoặc kinh tế có giá trị. Xóa dữ liệu trang hoặc đổi trình duyệt sẽ mất tiến trình.

Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.
