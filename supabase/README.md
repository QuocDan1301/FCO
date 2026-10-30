# Tài khoản FCO VIP

Game dùng tên đăng nhập/mật khẩu qua Supabase Auth và bảng `public.fco_game_saves` cho tiến trình. Mật khẩu không được lưu trong mã nguồn hoặc bản lưu game.

## Khởi tạo dự án

1. Trong SQL Editor của dự án Supabase, chạy lần lượt `migrations/202610300001_fco_accounts.sql` và `migrations/202610300002_delete_own_account.sql` một lần. Migration tạo bảng mới và hàm ghi có kiểm tra phiên bản; không thay đổi các bảng có sẵn.
2. Bật Email provider trong Authentication. Bản thử hiện tắt Confirm email theo lựa chọn của chủ dự án: người chơi đăng ký xong vào game ngay, email chưa được xác minh. Khi dùng chính thức, cấu hình SMTP riêng rồi bật lại Confirm email. Giao diện yêu cầu mật khẩu tối thiểu 8 ký tự.
3. Đặt Site URL thành URL game GitHub Pages. Thêm URL game và `http://127.0.0.1:5173/FCO/` vào Redirect URLs nếu cần thử trên máy phát triển. Liên kết xác nhận email quay về game để người chơi đăng nhập.
4. `.env` chỉ chứa Project URL và Publishable key công khai dùng trong trình duyệt. Không đưa secret key hoặc `service_role` vào các biến `VITE_*`. Có thể ghi đè cấu hình bằng `.env.local` trên máy phát triển.
5. Chạy `npm run test:accounts`, `npm test`, rồi `npm run build`. GitHub Pages build dùng cùng cấu hình công khai trong `.env`.

## Tên đăng nhập và xóa tài khoản

Tên đăng nhập được chuẩn hóa về chữ thường và ánh xạ ổn định sang định danh nội bộ `<ten>@players.fco.invalid` cho Supabase. Không thu thập hay gửi email thật của người chơi. Giữ Confirm email tắt cho phương án này. Các tài khoản email từ bản trước vẫn đăng nhập được bằng định danh cũ và giữ kho cũ.

Hàm `fco_delete_account()` chỉ dùng UUID từ JWT đã xác minh, không nhận UUID do trình duyệt truyền vào. Hàm yêu cầu AMR `password` trong 5 phút gần nhất; giao diện luôn xác thực lại mật khẩu trước khi gọi. Xóa `auth.users` sẽ cascade sang kho game và các phiên Auth. Client xóa bộ nhớ đệm và bản sao riêng của tài khoản, rồi đăng xuất. Token cũ chưa hết hạn không thể tạo lại kho do khóa ngoại tới người dùng đã xóa.

`tests/account-live.mjs` là bài thử tích hợp cần cho phép rõ ràng trước khi chạy: tự tạo một tài khoản `fcoqa_...`, thử đăng nhập và xóa đúng tài khoản đó. Không đưa bài thử này vào `npm test` tự động.

## Cách hoạt động

- Tài khoản mới có kho cầu thủ trống. Bản lưu khách cũ được giữ riêng và không tự nhập vào tài khoản mới.
- Kho cầu thủ, BP, FC, vật phẩm, đội hình, lịch sử, tiến trình sự kiện và cài đặt trong bản lưu được đồng bộ. Quỹ jackpot giả lập và tùy chọn nhạc của thiết bị vẫn lưu tại trình duyệt.
- Mỗi tài khoản có một bộ nhớ đệm riêng theo UUID. Người khác không đọc được kho của bạn qua API: bảng bật RLS và chỉ cho người dùng đọc dòng mang UUID của chính mình.
- Ghi dữ liệu qua `fco_commit_save`. Hàm xác định chủ tài khoản từ JWT, không nhận UUID từ phía khách, và chỉ chấp nhận phiên bản hiện tại của bản lưu.
- Các thao tác được lưu vào hàng đợi bền vững trên máy rồi gửi lần lượt. Mất mạng thì dừng chơi và cho thử lại. Đăng xuất bình thường chờ gửi xong; người chơi cũng có thể đăng xuất từ màn lỗi và giữ hàng đợi để gửi sau.
- Bản mới trên máy chủ được kiểm tra mỗi 15 giây và khi quay lại trang. Khi hai thiết bị thay đổi cùng lúc, bản cũ bị từ chối thay vì ghi đè. Người chơi có thể tải bản sao cục bộ và chọn nạp bản máy chủ; bản cục bộ còn được giữ dưới khóa `:backup:`.
- Đợi “Đã đồng bộ” trong Cài đặt trước khi đóng trang hoặc chuyển thiết bị. Đăng nhập và đồng bộ cần Internet, kể cả khi mở `mothe.html` trực tiếp. Bản khách vẫn chơi ngoại tuyến.

Đây là cơ chế lưu game giả lập. Kết quả mở thẻ và số dư vẫn được tính ở trình duyệt; nếu bổ sung giao dịch có giá trị thật, cần chuyển các luật kinh tế và xác thực thao tác sang máy chủ.

## Kiểm thử với dịch vụ thật

Sau khi tạo bảng và cấu hình email: đăng ký hai email thử nghiệm, xác nhận email, kiểm tra mỗi kho mới có 0 cầu thủ. Mở gói ở tài khoản A; đăng xuất, đăng nhập B và kiểm tra không thấy thẻ của A. Đăng nhập lại A trong trình duyệt khác để kiểm tra cùng kho thẻ. Ngắt mạng, thực hiện một thao tác và kết nối lại để thử hàng đợi; thay đổi cùng tài khoản ở hai trình duyệt để thử cảnh báo xung đột.

Tài liệu nhà cung cấp: [đăng ký](https://supabase.com/docs/reference/javascript/auth-signup), [đăng nhập](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
