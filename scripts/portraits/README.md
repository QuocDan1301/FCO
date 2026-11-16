# Chân dung không nền (2026-11-16)

Nguồn: thư mục cache FC Online của người dùng `...\fcovn\externalAssets\common\playersAction` (ảnh `p<spid>.png`, 128×128, nền trong suốt;
`spid` = mã mùa (3 chữ số, như TIER_YEARS trong scripts/build-gold-traits.mjs) + mã cầu thủ 6 chữ số). Cache chỉ có ảnh của thẻ máy đó từng mở.
Ảnh còn thiếu lấy thêm từ máy chủ ảnh FC Online `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p<spid>.png`
(403 = không có) — **hỏi người dùng trước khi tải** (số ảnh, dung lượng). Kho gộp: `D:/FCOvv-tmp/portraits-all`.

1. Xuất thẻ: `node --import tsx` một đoạn ghi `D:/FCOvv-tmp/tmp/cards.json` = `{ years: TIER_YEARS, cards: [{ id, name, nation, tier, face }] }`.
2. `python -I scripts/portraits/match_portraits.py <repo> <playersAction> D:/FCOvv-tmp/tmp/portrait-match.json [tier ...]`
   — khớp ảnh thẻ (cardFace) với chân dung cùng mã mùa bằng so ảnh (mỗi mùa dò vị trí / tỉ lệ đặt ảnh cầu thủ trên khung thẻ, rồi so vùng có người).
   ~1 phút / mùa.
3. Thẻ chưa khớp: tra mã trên fifaaddict (`/fo4db?playername=<tên>&sv=vn`, dữ liệu ở `__NUXT__.data[0].items`: uid, year, name, pos1val)
   qua Chrome người dùng; chọn mục cùng mùa + OVR lệch ≤ 3 (gần như luôn 0), giải uid ra spid; kiểm `floor(spid/1e6) == year`.
   Kết quả: `scripts/portraits/fa-pids.json` `{ pairs: { thẻ: mã cầu thủ } }`.
   `fa_probe.py` dò HEAD máy chủ ảnh, `fa_download.py` tải (sau khi người dùng đồng ý).
   - uid = Hashids của spid, bảng chữ thường bỏ ký tự phân cách → 17 chữ, cơ số 17. Chữ đầu = chữ "lottery" theo `(pid % 100) % 17`:
     `{0:o,1:z,2:b,3:p,4:v,5:m,6:n,7:q,8:a,9:k,10:g,11:w,12:y,13:d,14:r,15:l,16:j}`; phần sau là các chữ số cơ số 17 (chữ số lớn trước)
     theo bảng hoán vị riêng của chữ đầu: `n = 0; for ch of uid.slice(1): n = n*17 + ALPH[uid[0]].indexOf(ch)`.
   - ALPH: `{"o":"yapdwgkoqjlbvnmzr","z":"nmlozakdgqwrpjbyv","b":"dgmwqyjkbzaolrnpv","p":"dvkywgazjrlpmqnbo","v":"vmgbzrqdnplkwojay","m":"nqzywdjamlkobvprg","n":"qbjdwgkanrlzpmvoy","q":"kmywogdjzrlvnaqpb","a":"nvadwypkzoqglrmjb","k":"vgjlmdwaprqkobzyn","g":"dozvbygkqnpmljwar","w":"mpnybwajqvlgozdkr","y":"kvmyoaqdgnlrjpzwb","d":"zdywqngkvpoblrjma","r":"ynowzgdpbrlmqkajv","l":"qnoymlkwvrjgzpbda","j":"jpgqmdkybrnalzowv"}`
4. `python -I scripts/portraits/pack_portraits.py <repo> D:/FCOvv-tmp/portraits-all` — thứ tự nguồn: so ảnh cùng mùa → fifaaddict → dựng từ mã
   (mã cầu thủ đã xác nhận + mã mùa thẻ) → ảnh mùa khác của chính cầu thủ (tên + quốc tịch); ghi `public/assets/portraits/<spid>.webp` (112×112)
   + `src/portraits.json`, xoá webp không còn dùng.

Game: `src/portraits.ts` (`faceOf`) — có chân dung thì hiện nguyên ảnh không nền (class `is-portrait`, CSS ở lineup.css), không thì ảnh thẻ như cũ.
Người chơi chọn miniface khác của cùng cầu thủ (`persons` trong portraits.json, lưu `Save.minifaces`).

## Đổi miniface lên ảnh thẻ (src/card-swap.ts)
- Mùa có vị trí chân dung (`src/portrait-frames.json`, từ log match_portraits — chỉ mùa p50 ≤ 0,45) + chân dung tự gán cùng mùa: hình người cũ = alpha chân dung đó.
- Còn lại (9 mùa tranh riêng + thẻ mượn ảnh mùa khác, ~1.013 thẻ): mặt nạ người tách bằng mô hình u2net_human_seg
  (onnxruntime cài vào `D:/FCOvv-tmp/pylib`, mô hình `D:/FCOvv-tmp/models/u2net_human_seg.onnx` từ GitHub rembg — hỏi người dùng trước khi tải).
  `python -I scripts/portraits/seg_cards.py <repo>` → `D:/FCOvv-tmp/masks-raw`, rồi `python -I scripts/portraits/masks_pack.py <repo>`
  → `public/assets/portraits/masks/<id>.webp` + `src/portrait-masks.json`. Chạy lại sau mỗi lần đóng gói chân dung hoặc thêm mùa mới.
## Khung trống theo mùa (ưu tiên cao nhất khi đổi miniface lên thẻ)
Người dùng gửi ảnh khung mùa không có người (chụp trong game): `scripts/portraits/align_blank.py` căn ảnh chụp khớp ảnh thẻ cùng mùa
(dò tỉ lệ + dịch theo cạnh, bỏ vùng người / chữ vẽ đè), rồi `python -I scripts/portraits/blank_frames.py <repo> <mùa> <ảnh đã căn>`
→ `public/assets/portraits/blank/<mùa>.webp` (alpha = vùng thay nền + vùng miniface được hiện: trong viền, tránh cột OVR/vị trí, ô cấp, tên, cờ)
+ `src/portrait-blank.json` (box). Vùng của từng mùa khai báo trong blank_frames.py (đo bằng lưới %). Đã có: 26TS (stellar).
### Khung trống từ Garena (thay cho ảnh chụp, 2026-11-16)
API công khai `https://dc.fconline.garena.vn/api/app/players/<spid>/card` trả `seasonBadge` = `https://cdn.vn.garenanow.com/fo3vn/project/Ranking/Cards/<mã mùa>Card.png`
— khung thẻ trống (nền trong suốt) theo mã mùa. Tải về `D:/FCOvv-tmp/garena/cards`, rồi
`python -I scripts/portraits/align_garena.py <repo> [mùa…]` (căn về toạ độ ảnh thẻ; lệch thì chạy lại với env SMIN/SMAX quanh 1,21)
và `python -I scripts/portraits/blank_all.py <repo> [--preview]`. PRIME bỏ qua (ảnh thẻ khác bố cục); EL / UP26 / TSUBASA chưa có khung trên Garena.