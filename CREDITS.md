# Nguồn tài nguyên

## Thẻ NO.7

Nền đường hầm NO.7 dùng ảnh “Dòng chảy cẩm thạch ánh kim.png” do người dùng cung cấp, lưu tại `public/assets/no7-tunnel.png` và nhúng trong bản HTML ngoại tuyến.

24 mặt thẻ NO.7 do người dùng cung cấp qua các ảnh chụp `Screenshot 2026-10-21 145520.png` đến `145837.png`. Bản dùng trong trò chơi được lưu ở `public/assets/no7-*-card.webp`, giữ nền trong suốt và tách OVR/cấp cộng để cập nhật khi nâng cấp. Ảnh được nhúng vào `mothe.html` để hoạt động ngoại tuyến.

## Thẻ 26TS bổ sung

17 mặt thẻ từ Y. Begraoui đến J. Panichelli do người dùng cung cấp qua ảnh chụp ngày 22/10/2026 (`174510.png` đến `174744.png`). Tệp `public/assets/ts-*-card.webp` được tách nền ảnh chụp và tách số OVR/cấp cộng để trò chơi cập nhật khi nâng cấp. Toàn bộ ảnh được nhúng vào `mothe.html` để dùng ngoại tuyến.

17 ảnh thẻ tiền vệ từ C. Roldan đến Trincão (gồm Pablo Fornals đã có trong dữ liệu) do người dùng cung cấp qua ảnh chụp `181428.png` đến `182130.png` ngày 22/10/2026. Bản dùng trong game giữ bố cục ảnh gốc, nền ngoài khung trong suốt và OVR/cấp cộng hiển thị động. Có thêm 16 cầu thủ mới, không tạo bản trùng Pablo Fornals.

## Logo CLB mùa 26TS và NO.7

Logo của 69 CLB được lưu trong `public/assets/clubs/` và nhúng vào bản HTML độc lập để hoạt động ngoại tuyến. Nguồn ảnh: [ESPN](https://www.espn.com/soccer/); tên CLB, đường dẫn ảnh gốc và trang nguồn cho từng logo được ghi trong `public/assets/clubs/sources.json`. Nhãn CLB trong dữ liệu hiện có được ánh xạ sang logo tương ứng, gồm “Torino” → Juventus, “Milano” → AC Milan và “Los Angeles FC” → LAFC. Logo và nhãn hiệu thuộc về các CLB/chủ sở hữu tương ứng; không ngụ ý họ bảo trợ dự án.

## Ảnh cầu thủ

**Lionel Messi WC2022.jpg** — Hossein Zohrevand / Tasnim News Agency. Giấy phép [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). [Trang nguồn Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lionel_Messi_WC2022.jpg). Tệp cục bộ: `public/assets/messi.jpg`.

Ảnh gốc được hiển thị qua khung cắt, mặt nạ và điều chỉnh màu bằng CSS. Không ngụ ý nhiếp ảnh gia hoặc cầu thủ bảo trợ trò chơi. Ghi công cũng nằm trong giao diện: Hướng dẫn chơi → Dữ liệu và nguồn ảnh.

Các cầu thủ khác hiện dùng hình đại diện SVG do dự án vẽ. Không dùng ảnh không rõ giấy phép. Khung kim loại, sân vận động, huy hiệu mùa giải và bao gói được thiết kế bằng SVG/CSS riêng.

## Phông chữ và mã

Be Vietnam Pro và Barlow Condensed từ Google Fonts, SIL Open Font License. Biểu tượng Lucide, ISC License. Thư viện được khai báo trong `package.json`, phiên bản thực tế trong `package-lock.json`.

Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.

## Tài nguyên điện ảnh tự tạo

Huy hiệu `icon-tm.svg`, các texture bảng LED/cánh cửa/ánh sáng vẽ bằng canvas trong `src/cinema/StadiumScene.tsx`, và năm tệp âm thanh WAV `cinema-crowd`, `cinema-cue`, `cinema-gate`, `cinema-impact`, `cinema-cheer` đều do dự án tạo. Không lấy logo, mô hình hay tiếng mở thẻ của EA/FC Online.

Âm thanh được tổng hợp toán học thành PCM bằng `scripts/create-cinema-audio.mjs`. Three.js và Reflector sử dụng giấy phép MIT của Three.js.

Huy hiệu đội NO.7 (public/assets/no7-team.png) dùng ảnh Screenshot 2026-10-22 100314.png do người dùng cung cấp, tách nền bằng công cụ imagegen tích hợp. Yêu cầu xử lý: chỉ bỏ nền xám, giữ huy hiệu số 7, màu sắc và các chi tiết; xuất nền trong suốt. Áp dụng cho đúng 17 cầu thủ có huy hiệu này trên mặt thẻ.


10 mặt thẻ 26TS bổ sung ngày 22/10/2026 (Mailson, D. St. Clair, R. Koeman Jr., O. Baumann, L. Carević, D. Nejašmić, A. Stiller, M. Akliouche, B. André và M. Perrone) dùng ảnh chụp do người dùng cung cấp. Theo lựa chọn của người dùng, Python chỉ tách nền ngoài khung và xóa số OVR/cấp in sẵn để game hiển thị giá trị động; bản PNG trong suốt giữ nguyên dữ liệu màu của ảnh gốc. Nguồn logo Al Taawoun, Telstar, Famalicão và Lille: ESPN, ghi trong `public/assets/clubs/sources.json`. Cờ Canada và Montenegro: flag-icons v7.5.0, giấy phép MIT.
