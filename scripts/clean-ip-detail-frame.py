import sys, numpy as np, cv2
from PIL import Image
# Chạy: python scripts/clean-ip-detail-frame.py <ảnh ra .png>  (nguồn: scripts/data/pd-ip-frame-src.png, ảnh khung IP người dùng gửi 2026-11-25; sau đó lưu thành public/assets/pd-ip-frame.webp)
import pathlib
src = str(pathlib.Path(__file__).resolve().parent / 'data' / 'pd-ip-frame-src.png')
out = sys.argv[1]
im = Image.open(src).convert('RGBA'); a = np.array(im)
rgb = a[..., :3].astype(np.float32); alpha = a[..., 3]
H, W = alpha.shape
X0, Y0, X1, Y1 = 79, 109, 1339, 956                 # viền ngoài của bảng (đo trên ảnh)
inner = np.zeros((H, W), bool); inner[Y0 + 6:Y1 - 5, X0 + 6:X1 - 5] = True
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
# Nền kem sạch: sáng, ít bão hoà, hơi ngả vàng
cream = (R > 222) & (G > 212) & (B > 190) & (R - B > 8) & (R - B < 60) & (np.abs(R - G) < 24)
# Dải lụa đỏ: giữ nguyên (chỉ khung xoá chữ), lấy vùng đỏ đậm lớn
silk = (R > 90) & (R - G > 45) & (R - B > 35)
silk = cv2.morphologyEx(silk.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)) > 0
n, lab, st, _ = cv2.connectedComponentsWithStats((silk & inner).astype(np.uint8), 8)
big = np.zeros_like(silk)
for k in range(1, n):
    if st[k, cv2.CC_STAT_AREA] > 4000: big |= lab == k
silk = cv2.dilate(big.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
# Nút "Vs cầu thủ của tôi" nằm trên lụa: tô lại từ lụa xung quanh
btn = np.zeros((H, W), np.uint8); btn[868:956, 840:1250] = 255
btn[:, :] = 0; btn[884:940, 1000:1238] = 255      # nút 'Vs cầu thủ của tôi' (đo trên ảnh)
# Phần cần xoá = trong bảng, không phải kem sạch, không phải lụa
bad = inner & ~cream & ~silk
lum = (0.3 * R + 0.59 * G + 0.11 * B).astype(np.float32)
for k in ((1, 41), (41, 1)):
    bh = cv2.morphologyEx(lum, cv2.MORPH_BLACKHAT, np.ones(k, np.uint8))
    bad |= inner & (bh > 17) & ~silk      # đường kẻ hàng mảnh (tương phản mạnh); vân đá mờ không bị xoá
bad = cv2.dilate(bad.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
bad &= inner & ~silk
for (y0, y1, x0, x1) in [(188, 246, 215, 515), (290, 345, 255, 435), (395, 480, 79, 100)]:   # khung tên mờ + chấm lạc + mép dải xám
    bad[y0:y1, x0:x1] = True
bad &= inner & ~silk
# Nền kem ước lượng: lấy chập chuẩn hoá chỉ từ điểm kem sạch xa chữ
good = (inner & cream & ~bad).astype(np.float32)
fill = np.zeros_like(rgb)
for s in (18, 40, 90):
    num = cv2.GaussianBlur(rgb * good[..., None], (0, 0), s); den = cv2.GaussianBlur(good, (0, 0), s)[..., None]
    est = num / np.maximum(den, 1e-4)
    use = (den[..., 0] > 0.05) & (fill.sum(axis=2) == 0)
    fill[use] = est[use]
# Vân mờ + hạt: lấy nhiễu từ chính vùng kem sạch (dịch ô) để vùng được tô không bị phẳng
rng = np.random.default_rng(3)
grain = rng.normal(0, 1.6, (H, W, 1)).astype(np.float32)
fill = fill + cv2.GaussianBlur(grain, (0, 0), 0.8)[..., None]
res = rgb.copy()
soft = cv2.GaussianBlur(bad.astype(np.float32), (0, 0), 2.0)[..., None]
res = res * (1 - soft) + fill * soft
# Nút trên lụa: inpaint
res8 = np.clip(res, 0, 255).astype(np.uint8)
btn[924:956, 876:995] = 255
res8 = cv2.inpaint(res8, btn, 9, cv2.INPAINT_TELEA)
# Dải xám đè lên viền trái (y 400–476): chép cột viền từ đoạn sạch phía trên
res8[404:476, 70:92] = res8[326:398, 70:92]
alpha = alpha.copy(); alpha[404:476, 70:92] = alpha[326:398, 70:92]
# Điểm lạc ngoài khung (chữ, chấm): chỉ giữ thành phần lớn (cánh) hoặc bảng
a10 = (alpha > 10).astype(np.uint8)
nn, ll, ss, _ = cv2.connectedComponentsWithStats(a10, 8)
keep = np.zeros_like(a10, bool)
for k in range(1, nn):
    if ss[k, cv2.CC_STAT_AREA] > 3000: keep |= ll == k
alpha = np.where(keep, alpha, 0).astype(np.uint8)
# Chữ 'CD' lẫn trong cánh trái-dưới và chữ góc phải-trên nằm trong thành phần cánh: inpaint
txt = np.zeros((H, W), np.uint8); txt[836:866, 20:52] = 255
res8 = cv2.inpaint(res8, txt, 6, cv2.INPAINT_TELEA)
outa = np.dstack([res8, alpha])
Image.fromarray(outa, 'RGBA').save(out)
print('bad px', int(bad.sum()), 'silk px', int(silk.sum()))
