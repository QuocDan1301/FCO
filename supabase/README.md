# Tài khoản FCO VIP

Game dùng tên đăng nhập/mật khẩu qua Supabase Auth và bảng `public.fco_game_saves` cho tiến trình. Mật khẩu không được lưu trong mã nguồn hoặc bản lưu game.

## Khởi tạo dự án

1. Trong SQL Editor của dự án Supabase, chạy lần lượt `migrations/202610300001_fco_accounts.sql`, `migrations/202610300002_delete_own_account.sql` và `migrations/202611070001_fco_wallet.sql` `migrations/202611070002_fco_save_audit.sql` `migrations/202611070003_fco_stats.sql` `migrations/202611070004_fco_checkin.sql` `migrations/202611070005_fco_bilac.sql` `migrations/202611070006_fco_bilac_prizes.sql` `migrations/202611070007_fco_bilac_milestones.sql`, `migrations/202611070008_fco_checkin_fc.sql`, `migrations/202611080001_fco_ranks.sql` `migrations/202611080002_fco_checkin_v3.sql` `migrations/202611080003_fco_bilac_weights.sql` `migrations/202611080004_fco_bilac_harder.sql` `migrations/202611080005_fco_bilac_less_fc.sql` `migrations/202611080006_fco_bilac_rare_fc.sql` và `migrations/202611080007_fco_bilac_jackpot_chance.sql` một lần. Migration tạo bảng mới và hàm ghi có kiểm tra phiên bản; không thay đổi các bảng có sẵn.
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
- Kho cầu thủ, BP, vật phẩm, đội hình, lịch sử, mốc quà sự kiện và cài đặt trong bản lưu được đồng bộ. FC, điểm / lượt sự kiện và quỹ jackpot nằm trên máy chủ (xem bên dưới). Tùy chọn nhạc của thiết bị vẫn lưu tại trình duyệt.
- Mỗi tài khoản có một bộ nhớ đệm riêng theo UUID. Người khác không đọc được kho của bạn qua API: bảng bật RLS và chỉ cho người dùng đọc dòng mang UUID của chính mình.
- Ghi dữ liệu qua `fco_commit_save`. Hàm xác định chủ tài khoản từ JWT, không nhận UUID từ phía khách, và chỉ chấp nhận phiên bản hiện tại của bản lưu.
- Các thao tác được lưu vào hàng đợi bền vững trên máy rồi gửi lần lượt. Mất mạng thì dừng chơi và cho thử lại. Đăng xuất bình thường chờ gửi xong; người chơi cũng có thể đăng xuất từ màn lỗi và giữ hàng đợi để gửi sau.
- Bản mới trên máy chủ được kiểm tra mỗi 15 giây và khi quay lại trang. Khi hai thiết bị thay đổi cùng lúc, bản cũ bị từ chối thay vì ghi đè. Người chơi có thể tải bản sao cục bộ và chọn nạp bản máy chủ; bản cục bộ còn được giữ dưới khóa `:backup:`.
- Đợi “Đã đồng bộ” trong Cài đặt trước khi đóng trang hoặc chuyển thiết bị. Đăng nhập và đồng bộ cần Internet, kể cả khi mở `mothe.html` trực tiếp. Bản khách vẫn chơi ngoại tuyến.

## FC trên máy chủ (chống gian lận mức 2)

Từ migration `202611070001_fco_wallet.sql`, FC chỉ do máy chủ thay đổi: bảng `fco_wallets` giữ số dư, `fco_fc_ledger` ghi mọi lần cộng/trừ. `fco_commit_save` bỏ trường `fc` trong bản lưu, nên sửa bản lưu không tạo ra FC. Mọi tài khoản bắt đầu từ 0 FC.

- Quà mỗi ngày (`fco_claim_daily`, +1.000 FC, giờ Việt Nam), gift code (`fco_redeem_gift`, bảng `fco_gift_codes` chỉ lưu mã băm), mua gói (`fco_spend_fc`), chơi sự kiện (`fco_event_play`: máy chủ quay hũ, giữ điểm sự kiện, lượt miễn phí, lượt trả phí trong ngày) và jackpot (`fco_jackpot`: một quỹ chung cho mọi người chơi, bot vẫn săn như bản giả lập) đều chạy trên máy chủ.
- Nhiệm vụ "Mở gói" và "Nâng cấp" diễn ra trong trình duyệt nên máy chủ tin trình duyệt (tối đa 1 lượt miễn phí mỗi nhiệm vụ mỗi ngày).
- Khách (không đăng nhập) không dùng được FC.
- Admin: tài khoản có trong `fco_admins` thấy nút "Quản trị FC" trong Cài đặt: cộng / trừ FC theo tên đăng nhập sau khi kiểm tra bill, xem sổ cái, tạo / xoá gift code (có hiệu lực ngay). Thêm admin: `insert into public.fco_admins(user_id) select id from auth.users where email = '<tên>@players.fco.invalid';`
- Chạy thử migration không cần Supabase: `supabase/tests/fco-wallet.pglite.mjs` (hướng dẫn ở đầu file).

Theo dõi bất thường (`202611070002_fco_save_audit.sql`): mỗi lần đồng bộ, `fco_commit_save` so bản mới với bản cũ; BP, gói, thẻ hoặc cấp thẻ tăng mà không có dòng lịch sử tương ứng (bán thẻ / sự kiện / quà, Shop, mở gói / TTCN, nâng cấp) thì ghi vào `fco_save_audit`. Admin xem ở Quản trị FC → Bất thường. Chỉ phát hiện, không chặn; lỗi trong bước kiểm tra không bao giờ chặn việc lưu.

Thống kê (`202611070003_fco_stats.sql`): game đã đăng nhập gọi `fco_heartbeat` mỗi phút khi tab đang hiện; máy chủ cộng giờ chơi (tối đa 90 giây mỗi lần) vào `fco_presence` và `fco_play_days`. Quản trị FC → Thống kê hiện số tài khoản, đang online (2 phút), giờ chơi, FC nạp (lý do `admin` trong sổ cái) theo ngày và theo từng tài khoản. Khách không được tính.

Điểm danh 7 ngày (`202611070004_fco_checkin.sql`): cùng nút Nhận của Quà mỗi ngày (vẫn +1.000 FC). Từ `202611080002_fco_checkin_v3.sql`: ngày 1: 200 FC, 2: 350 FC, 3: 500 FC, 4: 650 FC, 5: 800 FC, 6: 1.000 FC, 7: gói ITM All 122+ (`the-moment`); bỏ lỡ một ngày hoặc đủ 7 ngày thì về ngày 1. Máy chủ giữ chuỗi và cộng FC (sổ cái `checkin`); gói do trình duyệt thêm theo `src/checkin.ts` (đổi quà thì sửa cả hai).

Sự kiện Bi Lắc (`202611070005_fco_bilac.sql`): mỗi lượt đá 3 bóng vào 5 ô (CLB, FC, Special, BP, Thẻ); 3 giống → hàng x3, 2 giống → hàng x2, khác nhau → hàng mixed; nhận ngẫu nhiên 1 quà của hàng và cộng điểm; điểm mở quà mốc. Special x3 / x2 = Giải Đặc Biệt / Giải Phụ (1/10) từ quỹ chung `fco_jackpot`. Giá 1 / 10 / 50 lượt = 20 / 190 / 900 FC, 1 lượt miễn phí mỗi ngày.
Sửa quà / tỷ lệ / quà mốc bằng SQL (không cần build lại), ví dụ:
```sql
update public.fco_bilac_symbols set weight = 5 where id = 'special';            -- tỷ lệ mỗi quả bóng vào ô
update public.fco_bilac_rows set points = 5, rewards = '[{"fc":3000},{"bp":400000000},{"pack":"eternal","count":1}]' where id = 'fc3';
update public.fco_bilac_milestones set points = 30, options = '[[{"pack":"prime-2","count":1},{"bp":800000}]]' where idx = 1;
```
Quà mốc (`202611070007_fco_bilac_milestones.sql`, lấy từ `quamocbilac.xlsx`): 23 mốc 1…1.250 điểm; mỗi mốc có `options` (danh sách lựa chọn, mỗi lựa chọn là một bộ quà) — mốc có nhiều lựa chọn thì người chơi chọn 1. Mốc `once = true` (mốc 1 điểm) chỉ nhận 1 lần; các mốc khác được nhận thêm 1 lần cho mỗi 1.250 điểm (= điểm mốc cao nhất). `fco_wallets.bilac_claimed` lưu số lần đã nhận của từng mốc; hàm `fco_bilac_claim(p_index, p_choice)` kiểm tra mốc, lựa chọn và số lần, cộng phần FC (sổ cái `bilac_milestone`). Gói quà mốc là các gói `blm-*` (eventOnly) trong `src/packs.json`; 25VB được thay bằng gói VIETNAM, 24HR bằng 25HR.

Mã gói phải có trong `src/packs.json` (đang bán hoặc gói sự kiện); gói không có thì người chơi không nhận được. Bật / tắt sự kiện bằng `EVENT_BILAC_ENABLED` trong `src/config.ts`.

Chỉ FC được bảo vệ. BP, thẻ và gói trong kho vẫn tính ở trình duyệt và nằm trong bản lưu, nên người rành kỹ thuật vẫn sửa được; muốn chặn cần chuyển việc mở gói / nâng cấp lên máy chủ.

## Kiểm thử với dịch vụ thật

Sau khi tạo bảng và cấu hình email: đăng ký hai email thử nghiệm, xác nhận email, kiểm tra mỗi kho mới có 0 cầu thủ. Mở gói ở tài khoản A; đăng xuất, đăng nhập B và kiểm tra không thấy thẻ của A. Đăng nhập lại A trong trình duyệt khác để kiểm tra cùng kho thẻ. Ngắt mạng, thực hiện một thao tác và kết nối lại để thử hàng đợi; thay đổi cùng tài khoản ở hai trình duyệt để thử cảnh báo xung đột.

Tài liệu nhà cung cấp: [đăng ký](https://supabase.com/docs/reference/javascript/auth-signup), [đăng nhập](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Bảng xếp hạng HLV (`202611080001_fco_ranks.sql`, mục BXH trên thanh menu dưới): top 10 kỷ lục đập thẻ OVR cao nhất (game gọi `fco_rank_upgrade` sau mỗi lần đập thành công; máy chủ chỉ ghi khi cao hơn kỷ lục cũ) và top 10 giá trị đội hình đang dùng (`fco_rank_squad` khi "Giá trị ĐH" đổi). `fco_leaderboard()` trả hai bảng + hạng của người xem; tên HLV che bớt như bảng tin jackpot. OVR / giá thẻ chỉ tính được trong game nên máy chủ tin số game gửi lên.

Quản lý tài khoản (`202611080008_fco_admin_accounts.sql`, Quản trị FC → Tài khoản): mọi tài khoản đã đăng ký kể cả chưa từng vào game; tìm, sắp xếp, phân trang; cộng / trừ FC, xem sổ cái; khoá (đặt `auth.users.banned_until`, xoá phiên, và `fco_require_user` / `fco_commit_save` chặn cả JWT còn hạn; dữ liệu giữ nguyên); xoá vĩnh viễn (cascade, gồm cả sổ cái nên tổng nạp ở Thống kê giảm theo). Không khoá / xoá được tài khoản admin. Chạy thử: `supabase/tests/fco-admin-accounts.pglite.mjs`.

Tỉ lệ quà Bi Lắc (`202611080003_fco_bilac_weights.sql`): bóng CLB 24 · FC 12 · Special 6 · BP 30 · Thẻ 28; `fco_bilac_rows.weights` (cùng thứ tự `rewards`, tổng 100) cho quà càng giá trị càng khó trúng, quà FC hiếm nhất. `fco_bilac_pick` chọn theo trọng số (null = chia đều).
`202611080004_fco_bilac_harder.sql`: trọng số theo phần nghìn (quà đắt nhất hàng 0,5–3 %) và hàng x3 thường chỉ giữ 40 % (còn lại quả thứ 3 lăn lại thành x2).
`202611080005_fco_bilac_less_fc.sql`: giảm quà FC — bóng FC 6 (CLB 26 · BP 32 · Thẻ 30), FC x3 chỉ giữ 10 %, món FC trong hàng FC x2 / x3 hiếm hơn; danh sách quà không đổi.
`202611080006_fco_bilac_rare_fc.sql`: bóng FC 3 và Special 3 (CLB 27 · BP 34 · Thẻ 33) — Giải Phụ ~1/380 lượt, quà FC từ bảng ~1/25.000 lượt.
`202611080007_fco_bilac_jackpot_chance.sql`: quỹ ≥ 10.000 FC thì mỗi lượt thêm cơ hội Giải Đặc Biệt = min(0,5 %, 0,04 % × fco_jackpot_pressure(quỹ)) để người chơi cạnh tranh với bot.
