# Đấu trường huyền thoại

## Mùa 23HW (23 HARD WORKER)

195 thẻ 23HW (OVR 103–112) đã có trong Shop, quản lý cầu thủ, nâng cấp và TTCN; dùng ảnh gói, nền mở thẻ và logo do người dùng cung cấp. Giá +1 được nhập từ ảnh danh sách ngày 28/10/2026; +2…+13 theo công thức bp2 (117, ×1), giữ nguyên các dòng giá đã có. Những thẻ in huy hiệu chung được ghi CLB “23 Hard Worker”; logo in trên thẻ được giữ qua ảnh nguồn, các CLB có sẵn dùng logo riêng của dự án.

Dữ liệu nguồn: `scripts/data/hw23.csv`; dữ liệu game: `src/hw23Players.ts`; vị trí chữ/cấp: `src/hw23-cards.css`. Nhập ảnh bằng `python scripts/import-hw23.py "<thư mục 23HW>"`; đăng ký giá/gói bằng `node --import tsx scripts/import-hw23-prices.mjs`. Các script giữ nguyên ảnh nguồn và các dòng Excel đã có. Kiểm tra mùa này bằng `tests/hw23.test.ts` và `tests/hw23-smoke.mjs`.

## Mùa BDO (BALLON D’OR)

Đã thêm 108 cầu thủ BDO (OVR 102–118), gói BDO (ALL), ảnh gói, nền mở thẻ và logo mùa. Ảnh R. Ferdinand lấy từ ảnh bổ sung của người dùng; ảnh số 99 trong bộ ban đầu bị trùng M. Essien. Giá +1 nhập từ ảnh danh sách ngày 28/10/2026; giá +2…+13 dùng cùng công thức bp2 (mốc 117, hệ số ×1) như các mùa mới trước đó. Các dòng giá có sẵn được giữ nguyên.

Dữ liệu nguồn ở `scripts/data/bdo.csv`, danh sách game ở `src/bdoPlayers.ts`, vị trí OVR/tên/cấp trên ảnh ở `src/bdo-cards.css`. `scripts/import-bdo.py` chuẩn hoá ảnh nguồn, giữ nguyên file gốc; truyền thư mục BDO và đường dẫn ảnh Ferdinand làm hai đối số. `scripts/import-bdo-prices.mjs` đăng ký giá, bổ sung dòng BDO vào `gia-cau-thu-bp2.xlsx` và đăng ký gói bán trong `src/packs.json`.

Khi thêm mùa khác, nối mùa vào `Tier`, `TIERS`, `seasons`, `players` và `defaultPacks` trong `src/game.ts`; bổ sung một cột trọng số 0 cho các gói cũ. Đăng ký tiếp ở `src/admin/pack-rules.ts`, tiêu đề quản trị/ghép ảnh, logo đội, CSS thẻ và `src/packs.json`. Chạy kiểm thử, build và kiểm tra `mothe.html`; bộ đóng gói tự nhúng các ảnh mới được tham chiếu.

**Đang bật xu vô hạn để thử nghiệm:** mở gói/nâng cấp không trừ xu, áp dụng cả tiến trình cũ có số dư 0. Nguyên liệu và tỷ lệ vẫn theo quy tắc thường. Để tắt, đặt `UNLIMITED_COINS = false` trong `src/config.ts` rồi chạy `npm.cmd run build`; số dư thật được giữ nguyên.

**Mở trực tiếp `mothe.html` để chơi.** File này đã chứa toàn bộ JavaScript, CSS, phông chữ và hình ảnh, không cần cài Node.js hay chạy Vite. Chế độ khách chơi được ngoại tuyến; đăng nhập và đồng bộ tài khoản cần Internet. Có thể sao chép riêng file sang thư mục khác rồi mở bằng Chrome/Edge. Bản lưu khách của file mở trực tiếp tách biệt với localhost. Khi đăng nhập cùng tài khoản, tiến trình được đồng bộ qua Supabase.

Trò chơi giả lập mở gói và nâng cấp thẻ, giao diện và nội dung tiếng Việt. React 19, TypeScript, Tailwind CSS 4, Motion và Vite. Có chế độ khách trên máy và tài khoản tên đăng nhập/mật khẩu đồng bộ nhiều thiết bị, không thanh toán thật.

## Đăng ký, đăng nhập và đồng bộ

Mở game, chọn **Đăng ký**, nhập tên huấn luyện viên, tên đăng nhập (3–24 ký tự a–z, số hoặc dấu gạch dưới) và mật khẩu tối thiểu 8 ký tự. Người chơi không cần nhập email. Bản thử hiện đăng ký xong vào game ngay, không cần xác nhận email. Tài khoản mới có **0 cầu thủ**. Mỗi tài khoản có kho thẻ, BP, FC, vật phẩm và tiến trình riêng; dữ liệu khách cũ vẫn được giữ riêng trên máy.

Trong **Cài đặt trò chơi**, xem tên tài khoản, trạng thái đồng bộ và nút đăng xuất. Đợi **Đã đồng bộ** trước khi chuyển thiết bị. Khi mất mạng hoặc hai máy cùng sửa tiến trình, game giữ bản trên máy và cho thử lại hoặc tải bản sao; không ghi đè im lặng bản mới hơn.

Trong Cài đặt, **Xóa tài khoản** yêu cầu nhập lại mật khẩu hiện tại và gõ `XOA`. Sau xác nhận, tài khoản và tiến trình trên máy chủ bị xóa vĩnh viễn; bản lưu và các bản sao của đúng tài khoản trên thiết bị này cũng được xóa. Tài khoản khác và bản chơi khách được giữ riêng.

Cấu hình và migration nằm trong [supabase/README.md](supabase/README.md). `mothe.html` được tạo lại bằng build và được bỏ qua trong Git để tránh giới hạn file 100 MB của GitHub.

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
- Chọn 1 thẻ chính và tối đa 5 nguyên liệu. Mỗi vạch là 20% năng lượng. Với nguyên liệu bằng OVR hiện tại của thẻ chính: OVR ≥125 được 1 vạch, 124 được 1,25 vạch, 123 được 1,5 vạch; mỗi OVR thấp hơn thêm 0,25 vạch. Với phôi thấp hơn thẻ chính, năng lượng = mức cùng OVR × `5^((OVR phôi − OVR thẻ chính)/7)`: thấp hơn 7 OVR còn 1/5, phôi 122 đập 129 được 4% (0,2 vạch). Phôi cao hơn cộng 1,2 điểm phần trăm mỗi OVR. Làm tròn từng phôi đến 0,1% rồi cộng, tổng tối đa 5 vạch (100%). Không cộng thưởng riêng khi trùng cầu thủ. Vạch tổng và vạch xem trước nguyên liệu hiển thị đúng phần lẻ. Thành công tăng 1 cấp, OVR cộng dồn theo `UPGRADE_LEVELS`; thất bại rớt ngẫu nhiên xuống một cấp thấp hơn (tối thiểu +1). Phôi cùng cầu thủ bảo vệ mức tối thiểu bằng cấp phôi trùng cao nhất: chỉ phục hồi khi cấp rớt thấp hơn mức đó. Hoạt cảnh và lịch sử hiển thị cấp rớt rồi cấp phục hồi. Cả hai tiêu hao nguyên liệu và phí (miễn phí trong chế độ thử). Cấp tối đa +13.
- Kết quả được tính và ghi vào localStorage trước hoạt cảnh. Làm mới trang giữa hoạt cảnh không mất phần thưởng và không trả lại nguyên liệu.
- Kho hỗ trợ tìm tên, lọc OVR/vị trí/mùa/cấp cộng, sắp xếp, xem chi tiết và chuyển thẻ sang nâng cấp. Lịch sử giữ tối đa 200 hoạt động.
- Âm thanh tổng hợp bằng Web Audio, mặc định tắt; giảm chuyển động theo hệ thống hoặc cài đặt; điện thoại giảm hạt sáng.
- Khung thẻ, sân vận động, huy hiệu và hình đại diện thay thế là SVG/CSS riêng. Ảnh Messi thật lưu cục bộ, ghi tác giả và giấy phép trong phần Hướng dẫn → Dữ liệu và nguồn ảnh. Các cầu thủ còn lại dùng hình đại diện minh họa, không giả nhận diện khuôn mặt.

Tỷ lệ chỉ thuộc trò chơi giả lập này. Tên CLB minh họa giai đoạn sự nghiệp, không phải dữ liệu đội hình hiện tại. Dữ liệu trình duyệt có thể chỉnh sửa, nên không phù hợp thi đấu hoặc kinh tế có giá trị. Xóa dữ liệu trang hoặc đổi trình duyệt sẽ mất tiến trình.

Dự án giả lập do người hâm mộ thực hiện, không liên kết với EA Sports hoặc FC Online.
# Mô hình giá nâng cấp

Mùa BTB (BACK TO BACK) gồm 100 cầu thủ, OVR +1 từ 104–106, gói BTB (ALL), logo và nền neon xanh đỏ riêng. Dữ liệu và giá +1 từ bảy bảng ảnh ở `scripts/data/btb.csv`. Nhập ảnh bằng `python scripts/import-btb.py <thư-mục-tach-nen>`, rồi `node --import tsx scripts/import-btb-prices.mjs` để bổ sung giá và các dòng còn thiếu. Bộ nhập chọn đúng chuỗi ảnh BTB ngày 29/10/2026, tránh lẫn các mùa trong cùng thư mục. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa BOE21 (BEST OF EUROPE 21) gồm 90 cầu thủ, OVR +1 từ 99–104, nhãn E21, gói BOE21 (ALL), logo và nền vàng đỏ riêng. Dữ liệu và giá +1 từ sáu bảng ảnh ngày 28–29/10/2026 ở `scripts/data/boe21.csv`. Nhập ảnh bằng `python scripts/import-boe21.py <thư-mục-BOE21>`, rồi `node --import tsx scripts/import-boe21-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa CAP (CAPTAIN CLASS) gồm 90 cầu thủ, OVR +1 từ 102–105, gói CAP (ALL), logo và đường hầm riêng. Dữ liệu và giá +1 từ sáu bảng ảnh ở `scripts/data/cap.csv`. Nhập ảnh bằng `python scripts/import-cap.py <thư-mục-CAP>`, rồi `node --import tsx scripts/import-cap-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa LOL (LEGEND OF THE LOAN) gồm 90 cầu thủ, OVR +1 từ 99–107, gói LOL (ALL) và nền tinh thể tím hồng riêng. Dữ liệu và giá +1 từ sáu bảng ảnh ở `scripts/data/lol.csv`. Nhập ảnh bằng `python scripts/import-lol.py <thư-mục-tach-nen>`, rồi `node --import tsx scripts/import-lol-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa FA (FREE AGENT) gồm 90 cầu thủ, OVR +1 từ 100–107, gói FA (ALL), logo và đường hầm riêng. Dữ liệu và giá +1 từ sáu bảng ảnh ở `scripts/data/fa.csv`; ba ảnh đại diện dạng bóng người được giữ nguyên theo nguồn. Nhập ảnh bằng `python scripts/import-fa.py <thư-mục-FA>`, rồi `node --import tsx scripts/import-fa-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa LN (LEGENDARY NUMBERS) gồm 95 cầu thủ, OVR +1 từ 102–109, gói LN (ALL), logo và đường hầm riêng. Dữ liệu và giá +1 từ bảy bảng ảnh ở `scripts/data/ln.csv`. Nhập ảnh bằng `python scripts/import-ln.py <thư-mục-LN>`, rồi `node --import tsx scripts/import-ln-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa SPL (SPOTLIGHT) gồm 90 cầu thủ, OVR +1 từ 101–108, gói SPL (ALL), ảnh gói và đường hầm riêng. Dữ liệu và giá +1 từ sáu ảnh danh sách ở `scripts/data/spl.csv`. Nhập ảnh bằng `python scripts/import-spl.py <thư-mục-SPL>`, rồi `node --import tsx scripts/import-spl-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa HG (HOME GROWN) gồm 116 cầu thủ, OVR +1 từ 103–111, gói HG (ALL), ảnh gói và đường hầm riêng. Dữ liệu và giá +1 ở `scripts/data/hg.csv`; M. Arnold dùng 26.400 BP theo ảnh danh sách sau lúc 14:27:34. Nhập ảnh bằng `python scripts/import-hg.py <thư-mục-HG>`, rồi `node --import tsx scripts/import-hg-prices.mjs` để bổ sung giá và các dòng còn thiếu. Giá +2…+13 theo công thức bp2 hiện có; giữ nguyên các dòng và công thức cũ.

Mùa LE (LEGEND OF EUROPA) gồm 165 cầu thủ, OVR +1 từ 111–119, có gói LE (ALL), ảnh gói và đường hầm riêng. Ảnh Pedro LE dùng bản bổ sung lúc 16:30 thay cho ảnh Muniain bị trùng. Dữ liệu và giá +1 từ ảnh người dùng ở `scripts/data/le.csv`; giá +2…+13 theo công thức bp2 hiện có. Nhập lại bằng `python scripts/import-le.py <thư-mục-LE>` (ảnh Pedro ở thư mục Screenshots cùng cấp), rồi `node --import tsx scripts/import-le-prices.mjs`. Lệnh nhập giá chỉ thêm các dòng còn thiếu, giữ nguyên dòng và công thức đã có.

Giá BP chấp nhận số nguyên từ 0: nhập `0` trong Excel là giá 0 BP và có thể mua/bán; để trống là chưa có giá. OVR vẫn phải lớn hơn 0.

Mọi thẻ thêm vào game đều phải có trong `gia-cau-thu-bp.xlsx`. `npm run dev`, `npm run build` và `npm run prices:import` tự bổ sung các ID còn thiếu vào cuối trang Giá cầu thủ, giữ nguyên các dòng, giá, OVR sửa tay và công thức đã có. Thẻ mới có đủ OVR +1…+13; giá chưa có dữ liệu được để trống, tô vàng. Không dùng `prices:export` chỉ để thêm thẻ vì lệnh đó dựng lại cả bảng. Hiện bảng gồm 479 thẻ, bao gồm 60 INFINITE PRIME, 40 VIETNAM, 20 PRIME, 40 MEDALIST và 9 FC AMBASSADOR.

Đã cập nhật `gia-cau-thu-bp.xlsx` theo phân nhóm CSV. Giá +1 được giữ nguyên; các cột +2…+13 là công thức có kết quả lưu sẵn, khớp game. Bản sao trước cập nhật ở `outputs/classification/gia-cau-thu-bp.before-csv.xlsx`. Tab Hướng dẫn ghi các giả định và nhóm của từng ID; dòng dữ liệu được hiện lại để xem giá. Kiểm tra đồng bộ bằng `node --import tsx scripts/verify-price-sync.mjs`.

Nhập lại nhóm bằng `node --import tsx scripts/import-classification.mjs <đường-dẫn-CSV>`, rồi build game. Nếu đổi phân nhóm sau này, cần cập nhật lại công thức Excel tương ứng; bước nhập nhóm không tự ghi đè Excel. Các hệ số so với sàn trong CSV là tham chiếu, ô thiếu giữ null, không được dùng làm giá BP sàn.

Phân nhóm tự động theo bốn tiêu chí trong `src/player-classification.ts`. `src/player-classification-facts.json` lưu dữ liệu bổ sung theo ID mùa thẻ: chân không thuận, sút má ngoài, chiều cao, thể hình/tốc độ, đánh giá AI và Tier Team Color đã kiểm chứng. Các trường hợp hai chân 5-5 + Tier 1 hoặc ít nhất ba tiêu chí tốt vào Nhóm 1; ít nhất hai tiêu chí xấu vào Nhóm 3; còn lại Nhóm 2. Tên quốc dân trong danh sách người dùng chỉ đóng góp một tiêu chí AI. Nếu chưa đủ dữ liệu, Nhóm 2 hiển thị “Tạm tính, thiếu dữ liệu tiêu chí”. Không coi dữ liệu trống là điểm trừ; CLB nhỏ hiện tại không chứng minh toàn bộ Team Color là Tier 3. Với chân yếu, cần biết không có sút má ngoài (`outsideFootShot: false`) trước khi tính điểm trừ. Nhóm gán riêng trong `pricing-config.json` được ưu tiên hơn kết quả tự động.

Phân nhóm hiện tại đã nhập từ CSV người dùng: 83 Nhóm 1, 96 Nhóm 2, 131 Nhóm 3; đủ 310 ID và mùa thẻ. `player-classification-groups.json` là nguồn nhóm ưu tiên hơn suy luận chỉ số, không còn nhãn tạm tính cho các dòng đã nhập. Dữ liệu chỉ số bổ sung vẫn độc lập; không coi lời giải thích trong CSV là bằng chứng chân/thể hình thực tế. Để nhập thông tin, ví dụ cấu trúc một bản ghi là `"ID": { "weakFoot": 5, "heightCm": 190, "source": "Nguồn và mùa thẻ đã đối chiếu" }`; đây chỉ là ví dụ định dạng, không phải chỉ số của cầu thủ cụ thể. Các dấu hiệu nhanh/chậm/dẻo/thăng bằng dùng đánh giá có nguồn, chưa áp ngưỡng số tự đặt.

Giá giao dịch +1 giữ nguyên từ `gia-cau-thu-bp.xlsx`. Giá +2 đến +13 lấy trực tiếp từng ô trong `gia-cau-thu-bp2.xlsx`, ghép theo ID cầu thủ. `npm run prices:import`, `dev` và `build` nạp bảng mới vào `src/player-prices.json`; thị trường, lò nâng cấp và phí bảo hiểm cùng dùng giá của cấp tương ứng. Hai file Excel gốc không bị ghi đè khi nhập giá. Công thức thiếu kết quả chỉ được suy ra 0 khi có nhánh `IF(ô=0,0,...)` và ô tham chiếu đúng bằng 0; các trường hợp thiếu kết quả khác bị báo lỗi. Ngày dữ liệu trong game là ngày của giá gốc, không phải ngày quan sát TTCN trực tiếp.

Sửa bảng giá Excel tương ứng, rồi chạy `npm run build` để cập nhật `mothe.html`. `src/pricing-config.json` và các hệ số dưới đây là mô hình tham khảo cũ, không ghi đè giá Excel từng cấp; cấu hình nhóm vẫn dùng cho ghi chú phân loại và thanh khoản. Nhóm lấy từ CSV đã nhập; chỉ các thẻ chưa có phân nhóm mới dùng bộ suy luận dự phòng. +2 mặc định tăng 63,7%. `overrides` dùng ID cầu thủ, ví dụ `"1": { "group": 1, "metaHeatPercent": 25 }`. Các tham số đều có thể ghi đè riêng cho mỗi ID.

- Nhóm 1: mặc định biên nhiệt 25%; bằng 0 là giữ chuẩn, ngoài ra cho phép 15–35%. Biên áp dụng từ +5 và giữ ở các cấp sau, không nhân chồng thêm tại +8.
- Nhóm 2: nhân đúng hệ số từng bước, làm tròn BP một lần ở kết quả cuối.
- Nhóm 3: mặc định +2–+4 giảm 20%, +5 bằng 7,5 lần giá +1, +8 giảm 45%. +6/+7 nội suy biên giảm giữa +5 và +8; +9 trở lên giữ biên +8 và ghi “Đóng băng thanh khoản”. Đây là giá tham chiếu theo mức giảm, chưa phải giá sàn OVR vì chưa có dữ liệu giá sàn. Ghi chú thanh khoản không vô hiệu hóa giao dịch mô phỏng.

Phí bảo hiểm báo riêng khi xem thẻ +8 đến +12: giá thẻ hiện tại × 95% / 80% / 60% theo OVR gốc ≤92 / 93–100 / ≥101. Không cộng phí vào giá thẻ, không thay đổi cơ chế thực hiện nâng cấp hay tự trừ phí bảo hiểm. OVR cộng theo cấp đã khớp `[0,1,2,4,6,8,11,15,17,19,21,24,27]`. Các quyền Team Color/chỉ số ẩn chưa được triển khai bởi mô hình giá này.

Bảng bp2 là nguồn giá +2…+13 ưu tiên, thay cho hệ số mô hình cũ ở trên. Kiểm tra toàn bộ giá bằng `node --import tsx scripts/verify-price-sync.mjs`. `npm run prices:export` xuất giá game đang dùng; không chạy ghi đè khi muốn giữ bảng nguồn cũ.

Mùa EBS (EUROPEAN BEST STARS) có 100 cầu thủ, OVR 100–105, cùng ảnh thẻ, gói, logo và nền do người dùng cung cấp. Danh sách và giá +1 từ bảy bảng ảnh nằm trong `scripts/data/ebs.csv`; giá +2…+13 theo công thức bp2 hiện có (117, ×1). Nhập lại ảnh bằng `python scripts/import-ebs.py "C:/Users/Admin/OneDrive/Hình ảnh/EBS"`, sau đó chạy `node --import tsx scripts/import-ebs-prices.mjs` để đồng bộ giá và bổ sung các hàng còn thiếu vào bảng bp2.

Mùa JUVENTUS có 14 cầu thủ, OVR 108–114, cùng gói AMBASSADOR JUVENTUS và nền đá đen bạc do người dùng cung cấp. Danh sách và giá +1 nằm trong `scripts/data/juventus.csv`; +2…+13 theo công thức bp2 hiện có (117, ×1). Nhập ảnh bằng `python scripts/import-juventus.py "C:/Users/Admin/OneDrive/Hình ảnh/tach-nen"`, rồi chạy `node --import tsx scripts/import-juventus-prices.mjs` để đồng bộ giá và bổ sung hàng vào bảng bp2.

Mùa JNM (JOURNEYMAN) có 34 cầu thủ, OVR 107–114, cùng ảnh thẻ, gói, logo và nền do người dùng cung cấp. Danh sách và giá +1 từ ba bảng ảnh nằm trong `scripts/data/jnm.csv`; +2…+13 theo công thức bp2 hiện có (117, ×1). Nhập ảnh bằng `python scripts/import-jnm.py "C:/Users/Admin/OneDrive/Hình ảnh/JNM"`, rồi chạy `node --import tsx scripts/import-jnm-prices.mjs` để đồng bộ giá và bổ sung hàng vào bảng bp2.
