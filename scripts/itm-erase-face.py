"""Xoá số OVR, số cấp và tên in sẵn trên ảnh R. Varane (ICON TM) đã căn khung 270×294; giữ huy hiệu mùa (như các thẻ ICON TM khác)."""
import cv2
import numpy as np
from PIL import Image

im = np.array(Image.open(r'D:\FCOvv-tmp\varane\aligned.png').convert('RGBA'))
rgb = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2BGR)
lum = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY).astype(int)
mask = np.zeros(lum.shape, np.uint8)


def dark_text(x0, y0, x1, y1, thr):
    """Đánh dấu chữ tối hơn nền sáng của thẻ trong vùng."""
    reg = lum[y0:y1, x0:x1]
    mask[y0:y1, x0:x1][reg < thr] = 255


dark_text(55, 48, 101, 80, 165)    # 122
dark_text(110, 209, 200, 237, 160)  # R. Varane
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
out = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)

# Số cấp "1" trong ô xám phẳng: phủ phần trong ô bằng màu ô (như ô trống của thẻ Pepe).
box = out[174:201, 57:100].reshape(-1, 3)
color = np.median(box[np.sum(box, axis=1) < np.median(np.sum(box, axis=1)) + 20], axis=0)
out[175:200, 58:99] = color

res = im.copy()
res[:, :, :3] = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
Image.fromarray(res).save(r'D:\FCOvv-tmp\varane\varane-card.png')
Image.fromarray(res).save(r'D:\FCOvv-tmp\varane\varane-card.webp', quality=90, method=6)
big = Image.new('RGBA', (270, 294), (60, 60, 60, 255)); big.alpha_composite(Image.fromarray(res))
big.resize((540, 588), Image.NEAREST).save(r'D:\FCOvv-tmp\varane\preview.png')
print('ok', color)
