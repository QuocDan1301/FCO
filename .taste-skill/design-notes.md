# Định hướng và kiểm tra

Định hướng được rút: True-black flat, seed 287421379. Tôn trọng yêu cầu riêng của người dùng về nền tối, xanh điện, vàng kim, khung thẻ kim loại và hiệu ứng điện ảnh. Giao diện dùng điều hướng ngang vì có bốn màn chính. Gradient, glow, bóng đổ, nhãn mùa và cỡ số lớn được giữ cho sân vận động/thẻ thể thao theo yêu cầu rõ ràng của người dùng, thay cho quy tắc bảng quản trị trung tính của skill.

Điểm nhấn riêng: thẻ cắt góc nhiều lớp trên bục sân vận động; đường hầm hé lộ năm bước; lò luyện với năm ô nguyên liệu.

Màn mở gói trả lời “gói nào đang chọn và có thể nhận gì?”. Lò luyện trả lời “tỷ lệ và mất gì khi nâng?”. Kho trả lời “tôi có những cầu thủ nào?”. Lịch sử trả lời “kết quả và số xu thay đổi ra sao?”.

Dữ liệu: 30 cầu thủ chia đều ba mùa; kho ban đầu 12 thẻ, 15 triệu xu, chưa mở gói nào. Mọi tổng số lấy từ bản lưu. Chỉ ảnh Messi là ảnh thật, đã tải cục bộ. Các chân dung còn lại là SVG do dự án vẽ. Ảnh Messi của Hossein Zohrevand / Tasnim News Agency, CC BY 4.0; ghi nguồn trong Hướng dẫn và CREDITS.md. Sân vận động, bao gói và khung thẻ là đồ họa SVG/CSS tự thiết kế.

Vòng xem ảnh đầu: desktop/tablet cân bằng; điện thoại đủ nội dung nhưng chữ nhỏ và ba gói quá hẹp. Đã tăng chữ điều khiển, chuyển gói trên điện thoại thành danh sách ngang ảnh bên trái, dùng nhãn điều hướng ngắn, đưa ảnh Messi thật lên thẻ chính. Số liệu dùng tabular-nums; tăng tương phản ghi chú chân trang và trạng thái trống.

Ngoại lệ inspector: gradient/micro-label/icon-chips/tiny-text/app-title-size/heavy-borders — khung kim loại, hạt sáng, số OVR, huy hiệu và chữ thu nhỏ trên artwork phải giữ quy ước thẻ thể thao. Chữ thao tác chính đã tăng riêng, không coi artwork là nội dung biểu mẫu.

## Kiểm tra cuối

Inspector: 0 FAIL, 1 WARN tại 1440/768/390. Cảnh báo duy nhất: số OVR của thẻ phía sau cách mép điện thoại 15px, chấp nhận vì nằm trong artwork trưng bày, không phải chữ thao tác. Chữ và bộ lọc chính nằm trong lề 17px.

8/8 kiểm thử engine thành công. Hai lượt kiểm thử Chrome headless thành công: các luồng thao tác và hoạt cảnh thật; không có exception JavaScript. Bản dựng TypeScript/Vite thành công. Ảnh chụp đã xem: toàn bộ ảnh inspector ở ba kích thước; mở 1/10 gói; lò luyện trước nâng; thành công/thất bại; kho và lò luyện điện thoại. Dữ liệu QA chỉ nằm trong profile tạm, không thay đổi tiến trình của người dùng.

ROUND 2
Seen in one second: thẻ cầu thủ kim loại trên sân vận động tối và nút mở gói vàng.
Idea (one sentence): mỗi gói cầu thủ là một buổi ra mắt dưới ánh đèn sân vận động.
Live thing: mở gói theo xác suất, nâng cấp có nguyên liệu và kho lưu thật trên trình duyệt.
Layout words by section: hero=sân khấu / gói=danh sách ba lựa chọn / lò luyện=thẻ và bảng xác nhận / kho=lưới thẻ có lọc.
Scores: design 7.5 · usability 8.0 · creativity 7.0 · content 7.0 → overall 7.55.
Caps applied: áp dụng đánh giá app; ngoại lệ thẻ kim loại/ánh sáng theo brief, không áp trần ảnh landing page cho màn chơi. 29 chân dung là hình đại diện thay thế được công bố rõ.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Nhiều chân dung cùng hình minh họa trong mobile-collection.jpg. Bản thử có fallback đẹp và không lỗi ảnh; bổ sung thêm ảnh có giấy phép khi mở rộng dữ liệu.
2. Chữ trong thẻ nhỏ ở danh sách tổng kết 10 gói. Thẻ tốt nhất được phóng lớn, mọi thẻ có chi tiết đầy đủ trong kho.
3. Lò luyện điện thoại dài vì cần thấy thẻ chính và quy tắc trước xác nhận. Bố cục một cột giữ kích thước thẻ và chữ rõ; không giấu quy tắc thất bại.

## Nâng cấp đường hầm

Thay bốn khung chạy đơn giản bằng hành lang CSS 3D có 12 nhịp khung vát góc, mặt sàn/trần/vách, dải LED nối tiếp, phản chiếu sàn, khói hai bên và bụi. Camera tiến 1.470px trong chiều sâu; cửa đôi mở ở bước vị trí; thẻ hiếm đổi ánh sáng xanh sang vàng và walkout ở bước OVR. Nhịp hiếm 6,5 giây, thường 3,25 giây. Chuyển thông tin nhanh 0,2 giây để tránh đoạn trống của hoạt cảnh cũ. Chế độ giảm chuyển động không dựng hành lang.

Build TypeScript/Vite thành công và đã đóng gói lại mothe.html độc lập. Kiểm thử đường hầm trực tiếp qua file:// khi ngắt mạng: đủ 5 bước, mở cửa, kết quả không đổi trong hoạt cảnh, bỏ qua không chạy lại, thẻ thường ngắn hơn, giảm chuyển động không dựng 3D, không tràn màn hình. Không phát sinh yêu cầu HTTP hoặc exception JavaScript. Ảnh chụp trong .taste-skill/tunnel-qa/.


## ICON TM — bản hoàn thiện

Đường hầm Three.js có camera thật, sàn phản chiếu, LED nối tiếp, cửa đôi và sân khấu giữa sân. Ánh sáng trắng/vàng, huy hiệu riêng; quốc tịch → vị trí → đội tuyển/CLB theo dữ liệu. Thẻ chờ xoay quanh chính tâm bục. Khán đài chỉ ở nửa sân phía sau để không chắn cửa. Nhịp chuẩn 9,85 giây, nhanh 3,55 giây, khoảng lặng trước bùng nổ. Năm âm thanh WAV tự tổng hợp; huy hiệu SVG tự thiết kế. Điện thoại giảm độ phân giải phản chiếu xuống 128; canvas 2D cho chế độ nhẹ; giảm chuyển động bỏ qua cảnh bay.

QA mới nhất: npm test 10/10; build TypeScript/Vite và đóng gói HTML thành công. Chrome headless chạy file:// ngoại tuyến qua toàn chuỗi, 1/10 gói, chống nhấn lặp, thống kê, lưu không nhân đôi, tải lại, nhanh/nhẹ/giảm chuyển động. Không yêu cầu HTTP và không có lỗi JavaScript/WebGL. Đã xem ảnh desktop, tablet 768 và điện thoại 390 trong .taste-skill/icon-tm-qa. Không tràn ngang; thẻ và nút kết quả đọc rõ. Xu vô hạn vẫn bật theo yêu cầu thử nghiệm. Thay thế bản đường hầm CSS trước đó.


## Màn chuẩn bị mở thẻ

Nút mở ở bên ngoài dẫn vào màn chuẩn bị có gói thẻ giữa sân vận động, bộ chọn số lượng 1–10 và nút Mở riêng bên trong. Hủy/Quay lại/Mở tiếp không cấp thêm thẻ. Chỉ xác định và lưu thưởng khi xác nhận bên trong. Luồng tổng kết áp dụng mọi lượt 2–10, hiển thị đúng số lượng. Giữ xu vô hạn.

Kiểm tra: 11/11 engine test đạt; build thành công; Chrome file:// mở lần lượt đủ 1–10 (55 thẻ), chống nhấn lặp, hủy và mở tiếp không nhận trùng, tải lại giữ đủ; kiểm tra lại toàn chuỗi ICON TM đạt. Đã xem ready-desktop.jpg và ready-mobile.jpg ở 1440/390; tăng khoảng cách dưới bao gói trên điện thoại để không chạm chữ.


## Kho gói và hai nút mở

Theo xác nhận mới: bổ sung kho gói chưa mở, 15 gói thử mỗi loại; dữ liệu cũ dùng số khởi đầu này khi chưa có trường kho, không thay đổi thẻ đã nhận. Màn chuẩn bị có hai nút Mở 1 thẻ và Mở N thẻ với N=min(10,kho). Còn một chỉ bật nút mở một; hết gói khóa cả hai. Mỗi lượt trừ kho trong cùng giao dịch lưu phần thưởng. Nhận 10 gói thử ở ngoài màn chuẩn bị, chỉ trong chế độ xu vô hạn.

QA: 12/12 kiểm thử engine đạt; build thành công. Trình duyệt đã kiểm tra 15→5→0, nhãn Mở 5, tổng kết đủ năm thẻ, chặn mở lặp, còn một/hết gói, hủy, nhận thêm và tải lại. Kiểm tra lại toàn bộ ICON TM đạt. Đã xem ảnh desktop và mobile hai nút trong icon-tm-qa, không tràn ngang.


## Làm mượt vào đường hầm

Nguyên nhân: camera đuổi theo mốc rời rạc và ép về đích ở công bố; khung hình đầu bao gồm chi phí khởi tạo GPU. Thay bằng đường Hermite đơn điệu theo thời gian với vận tốc liên tục ở các mốc; cùng đường chạy cho 3D và canvas nhẹ. Đồng hồ hé lộ chỉ bắt đầu sau khi shader/khung đầu sẵn sàng. Thêm chuyển cảnh opacity 0,32 giây và màn tối tan dần 0,75 giây. Camera nhìn, ánh sáng, LED và cánh cửa đều nội suy. Gộp khung/vách theo vật liệu thành InstancedMesh, còn 51 lệnh vẽ ở khung kết thúc trong QA.

Kiểm tra mới: 13/13 test engine/camera đạt; build thành công. Đo Chrome cùng môi trường: bước camera lớn nhất ở khung dưới 60ms giảm từ 2 xuống 0,29 đơn vị; p95 khung 14ms; khung đầu khoảng 1,1 giây được che bằng màn chuyển và không tính vào thời gian bay. Không suy rộng số đo Chrome headless thành FPS cho mọi thiết bị. Toàn chuỗi ICON TM và kho hai nút 15→5→0 đều đạt, không lỗi JavaScript/WebGL. Đã xem lại ảnh quốc tịch, cửa, sân khấu sau chỉnh.


## Lật thẻ và dùng chung cảnh đã làm ấm

Theo phản hồi vẫn chưa mượt: bỏ việc hủy/dựng lại WebGL ở nút mở. PackStage sống liên tục trong một modal chung từ màn chuẩn bị → lật → đường hầm → kết quả. Chuẩn bị GPU dưới màn chọn gói sau chuyển cảnh đầu; chỉ bật hai nút khi đã sẵn sàng. Khi chờ và khi lật, cảnh dừng vẽ GPU. Khi mở: lưu kết quả/trừ kho trước, lật foil hai mặt 0,9 giây (nhanh 0,42), quét sáng rồi chuyển vào canvas cũ. Giảm chuyển động bỏ lật. Mặt lật dùng preserve-3d ở khối xoay, hai mặt phẳng và opacity trên từng mặt để tránh bẹt phối cảnh/lộ chữ ngược. Thẻ dịch xuống trong lúc lật để không chạm header điện thoại.

Giảm tải: bỏ bản đồ bóng động; phản chiếu desktop 256/mobile 128, cập nhật ~30/16 fps riêng, camera vẫn mỗi khung hình; pixel ratio tối đa 1,25/1. Khi đổi viewport, điều chỉnh độ phân giải và số hạt trên cùng renderer. Mở tiếp và quay lại nhanh dùng preparationId để báo sẵn sàng đúng dù modal chưa unmount.

QA: 13/13 engine/camera đạt, build thành công. Bài flip-entry xác nhận canvas trước/sau là cùng một phần tử, chống lặp và bỏ qua, có 121–127 khung trong nhịp lật ở môi trường headless, p95 ~7,1ms, khung dài nhất khoảng 28–42ms; chỉ là số đo môi trường QA. Đã xem mặt trước, mặt sau và mobile. Toàn bộ ICON TM và kho 15→5→0 đều đạt. Không lỗi JavaScript/WebGL. Lật/mở không đổi tỷ lệ, không nhân đôi thưởng và vẫn xu vô hạn.


## Nhịp lật chậm và hòa vào đường hầm — 21/10/2026

Phản hồi tiếp: lật quá nhanh, nối cảnh vẫn có cảm giác dừng. Đổi nhịp chuẩn từ 0,9 lên 1,9 giây, nhanh từ 0,42 lên 0,9 giây. Xoay êm ở đầu, giữ góc 180° từ 48–76% để đọc rõ mặt sau. Camera bắt đầu trước cuối vòng lật 650ms (nhanh 480ms), cùng canvas đang chạy xuyên qua lúc giao diện đổi; bỏ hoàn toàn lớp đen khi cảnh đã sẵn sàng. Nền sân cũ hòa dần theo mốc bắt đầu camera.

PackStage sở hữu đồng hồ dùng chung: đổi Three.js sang Canvas nhẹ giữ nguyên thời gian, không bắt đầu lại camera. Pixel ratio nền tối đa 1, tự giảm 0,8 desktop/0,75 mobile khi nhịp khung thực tế chậm; đo cả khoảng cách giữa khung thay vì chỉ CPU render cost. Chậm kéo dài thì chuyển 2D trên cùng đồng hồ. Thẻ và chữ DOM không chịu giảm độ phân giải.

QA: build thành công, 13/13 kiểm thử engine/camera đạt. Flip-entry desktop và mobile xác nhận lật >=1,8s, giữ mặt sau, camera tiến ngay lúc còn lật, không màn đen hay đặt lại vị trí ở chỗ nối, canvas được giữ nguyên, chuyển 2D giữ tiến độ. Đã xem ảnh lật desktop/mobile. Bài adaptive-scene giả lập chậm: scale về 0,8, giữ đúng thưởng và tiến độ khi chuyển 2D. Toàn chuỗi ICON TM chuẩn/nhanh/10 thẻ và bài kho 15→5→0 đều đạt, không lỗi JavaScript/WebGL. Xu vô hạn vẫn bật theo yêu cầu.


## Mặt trắng và nhịp dừng trước hầm

Theo chỉ dẫn mới: nhấn mở → lật sang mặt trắng sáng trơn có viền mờ và quầng sáng ổn định → giữ yên khoảng 0,65 giây → thẻ tan và camera mới bắt đầu. Đặt cameraLead=0 cho cả hai chế độ, giữ dừng ở góc 180° từ 48–82% vòng lật; không chạy camera trong nhịp dừng. Chuẩn 1,9 giây/nhanh 0,9 giây trước đường hầm; nhãn thời lượng tổng đổi thành khoảng 12/4,5 giây. Cảnh vẫn làm ấm và canvas vẫn giữ nguyên; không khởi tạo lại. Chế độ giảm chuyển động vẫn bỏ qua lật.

Kiểm tra: build thành công, 13/13 engine/camera đạt. Flip-entry trên điện thoại xác nhận mặt trắng RGB255, giấu họa tiết/tên, camera đứng ở z13 trong nhịp dừng rồi mới chạy; giữ canvas, chống nhấn lặp, bỏ qua đúng thưởng và chuyển 2D giữ đồng hồ. Đã xem ảnh mặt trắng sáng ở điện thoại, khung thẻ rõ và không che nút Bỏ qua.
