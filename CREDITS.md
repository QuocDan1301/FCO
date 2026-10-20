# Nguồn tài nguyên

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
