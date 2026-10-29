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

Logo LA Galaxy, Tottenham, Everton, Bologna, Genoa, Levante, Freiburg, Başakşehir, Panathinaikos, Albacete, FC Copenhagen, Ulsan HD, Suwon Samsung và Seongnam FC trong `public/assets/clubs/` do người dùng cung cấp (24/10/2026), chỉ cắt sát và giữ nền trong suốt. Logo và nhãn hiệu thuộc về các CLB tương ứng.
# Additional season assets

BTB (BACK TO BACK): 100 card screenshots, seven price lists, pack artwork, neon teal/red tunnel and BTB crest were supplied by the user on 29 October 2026. The roster and screenshot +1 prices are in `scripts/data/btb.csv`. The importer selects the exact 29 October BTB screenshot series within the shared `tach-nen` folder to avoid mixing seasons. Imported copies preserve the source portraits, normalize frames and render names, OVR and upgrade badges live. Free agents use the supplied BTB crest; club cards reuse existing logos or their printed crest. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

BOE21 (BEST OF EUROPE 21): 90 card screenshots, six price lists, pack artwork, yellow/red tunnel and BOE crest were supplied by the user from screenshots dated 28–29 October 2026. The roster and +1 prices are transcribed in `scripts/data/boe21.csv`. Imported copies preserve the source portraits and E21 badges, normalize frames, and render names, OVR and upgrade badges live. Free agents use the supplied BOE crest; club cards reuse existing logos or their printed crest. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

CAP (CAPTAIN CLASS): 90 card screenshots, six price lists, pack artwork, blue/cyan/orange tunnel and the transparent CAP crest were supplied by the user on 28 October 2026. Source-order roster data and +1 prices are in `scripts/data/cap.csv`. Game copies retain the supplied vintage portraits and S. Handanovič silhouette, normalize frames, and render names, OVR and upgrade badges live. Free agents use the supplied CAP crest; other cards reuse existing club artwork or their printed crest. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

LOL (LEGEND OF THE LOAN): 90 card screenshots, six price lists, transparent pack artwork and purple/pink crystal tunnel were supplied by the user on 28 October 2026 from the `tach-nen` folder. Source-order data and +1 prices are in `scripts/data/lol.csv`. Imported copies align the frame and render names, OVR and upgrade badges live. The free-agent crest is preserved from the supplied Ibrahimović card; other cards reuse existing club logos or their printed crest. Central African Republic and Gambia SVG flags are from flag-icons 7.5.0 (MIT), `https://github.com/lipis/flag-icons/tree/v7.5.0/flags/4x3`. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted for fan-game art.

FA (FREE AGENT): 90 card screenshots, six price lists, pack artwork, blue/silver tunnel and season crest were supplied by the user on 28 October 2026. The roster and +1 prices are transcribed in `scripts/data/fa.csv`. Game copies retain the supplied portraits (including the silhouettes for K. Boateng, S. Rudy and Diego López), align frames, and render names, OVR and upgrade badges live. Free agents use the supplied FA crest; club cards reuse existing club artwork or preserve the printed crest. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

LN (LEGENDARY NUMBERS): 95 card screenshots, seven price lists, pack artwork, cobalt/lime tunnel and season crest were supplied by the user on 28 October 2026. The roster and screenshot +1 prices are transcribed in `scripts/data/ln.csv`. All cards retain their supplied LN crest; game copies normalize the frame and render names, OVR and upgrade badges live. +2…+13 follow the existing bp2 formula family (117, ×1). Original source images and existing workbook rows remain unchanged; no additional licence is asserted.

SPL (SPOTLIGHT): 90 card screenshots, six price lists, pack artwork and purple/cyan tunnel were supplied by the user on 28 October 2026. The source-order roster and +1 prices are in `scripts/data/spl.csv`. Imported game copies align the frames and render names, OVR and upgrade badges live. The free-agent triangle is preserved from the supplied Fekir card; other cards reuse existing club logos or retain their printed crest. Upgrade prices follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows are untouched; no additional licence is asserted.

HG (HOME GROWN): 116 card screenshots, eight price lists, pack artwork, purple/amber tunnel and season crest were supplied by the user on 28 October 2026. The roster and +1 prices are in `scripts/data/hg.csv`; M. Arnold uses 26,400 BP from the later 14:27:34 list rather than 24,000 BP in the earlier list. Game copies align the frames and render names, OVR and upgrade badges live. Free agents use the supplied HG crest; club cards reuse existing logos or preserve the printed crest. +2…+13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

LE: 165 roster entries and base prices are transcribed from the user's 28 October 2026 screenshots in `scripts/data/le.csv`. The supplied card image 70 duplicates Muniain; Pedro uses the separately supplied `Screenshot 2026-10-28 163050.png`. All 165 game card faces use the supplied LE artwork, normalized frames and live names/OVR/upgrade badges. The pack, teal/gold tunnel and free-agent crest also come from the user's attachments. Existing club assets are reused where available; otherwise the printed crest is preserved. Upgrade prices follow the existing bp2 formula family (117, ×1), and existing workbook rows remain unchanged. Original images are untouched; no additional licence is asserted.

23HW: 195 card screenshots, pack artwork, neon tunnel background and season crest were supplied by the user on 28 October 2026. Metadata and base prices are transcribed in `scripts/data/hw23.csv`. Imported game copies normalize the frame, clear printed names/OVR for live rendering, and preserve printed club crests where the project has no matching asset. Tunisia and Jamaica flag SVGs use the existing flag-icons 7.5.0 (MIT) source: `https://github.com/lipis/flag-icons/tree/v7.5.0/flags/4x3`. Original user images remain unchanged; no additional licence is asserted for fan-game artwork.

BDO card screenshots, Ballon d’Or pack art, gold/black tunnel background and season logo were supplied by the user on 28 October 2026. The source list and screenshot prices are transcribed in `scripts/data/bdo.csv`. R. Ferdinand uses the separately supplied corrected screenshot, replacing the duplicated Essien image at position 99. Original source files are untouched; imported game copies align the frame, clear printed names/OVR for live rendering, and key the supplied pale backgrounds. These are fan-game assets; no additional licence is asserted.

24EP: 208 card screenshots, 13 price-list screenshots, pack artwork, lightning background and season crest were supplied by the user on 28 October 2026. Card data is in `src/ep24Players.ts`; imported card faces are aligned to a 259×282 frame with printed names/OVR cleared for live rendering (`src/ep24-cards.css`). Prices for the 15 OVR 112–111 cards arrived in a later screenshot. Albania and DR Congo flags are flag-icons 7.5.0 originals. Club logos for Heidenheim, Werder Bremen, Birmingham, Wolves, Millwall, Leicester, Derby County, Schalke, Almería, Las Palmas, Leganés, Monza, Lecce, Sparta Prague and Monterrey come from ESPN (see `public/assets/clubs/sources.json`).

PTG: 165 card screenshots, 11 price-list screenshots, pack artwork and background were supplied by the user on 28 October 2026. Card data is in `src/ptgPlayers.ts`; card faces are aligned to a 259×282 frame with printed names/OVR cleared for live rendering (`src/ptg-cards.css`). Free-agent cards keep the grey shield printed on the card (`ptg-free-team`). Club logos for Olympiacos, Minnesota United, Club Brugge, Huracán, Dinamo Zagreb, Genk and Rizespor come from ESPN; the Jordan flag is a flag-icons 7.5.0 original.

EBS (EUROPEAN BEST STARS): 100 card screenshots, seven price lists, pack artwork, blue tunnel and season crest were supplied by the user on 29 October 2026. The roster and screenshot +1 prices are in `scripts/data/ebs.csv`. Game copies align frames and render names, OVR and upgrade badges live. Free agents use the supplied crest, cropped to its circular outline. Iceland's flag uses flag-icons 7.5.0 (MIT): https://github.com/lipis/flag-icons/blob/v7.5.0/flags/4x3/is.svg. +2 through +13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

JUVENTUS (AMBASSADOR JUVENTUS): 14 card screenshots, one price list, pack artwork, crest and black/silver marble tunnel were supplied by the user on 29 October 2026. The roster and screenshot +1 prices are in `scripts/data/juventus.csv`. Game copies align frames and render names, OVR and upgrade badges live. +2 through +13 use the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.

JNM (JOURNEYMAN): 34 card screenshots, three price lists, pack artwork, crest and green/purple/gold tunnel were supplied by the user on 29 October 2026. Metadata and +1 prices are in `scripts/data/jnm.csv`. Imported copies normalize frames and render names, OVR and upgrade badges live. +2 through +13 follow the existing bp2 formula family (117, ×1). Original images and existing workbook rows remain unchanged; no additional licence is asserted.
