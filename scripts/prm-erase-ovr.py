# Xoá số OVR in sẵn trên ảnh thẻ PRM (người dùng 2026-11-17: bỏ nền đỏ sau OVR) — vẽ lại nền tại ô OVR bằng inpaint.
# Ô OVR mỗi thẻ đọc từ src/prm-cards.css (--prm-ovr-x/y/width/height, % ảnh). Sao lưu gốc ở D:/FCOvv-tmp/prm-orig.
# python -I prm_erase_ovr.py <repo> [--apply]
import sys, os, re, json, shutil
import numpy as np, cv2
from PIL import Image
repo = sys.argv[1]; apply = '--apply' in sys.argv
css = open(os.path.join(repo, 'src', 'prm-cards.css'), encoding='utf8').read()
boxes = {int(m.group(1)): {k: float(v) for k, v in re.findall(r'--prm-ovr-(x|y|width|height):([\d.]+)%', m.group(2))} for m in re.finditer(r'\.face-(\d+)\{([^}]*)\}', css)}
cards = {c['id']: c for c in json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']}
os.makedirs('D:/FCOvv-tmp/prm-orig', exist_ok=True)
tiles = []
for cid, b in sorted(boxes.items()):
    rel = cards[cid]['face'].lstrip('/'); path = os.path.join(repo, 'public', rel)
    bak = os.path.join('D:/FCOvv-tmp/prm-orig', os.path.basename(path))
    if not os.path.exists(bak): shutil.copy2(path, bak)
    im = np.asarray(Image.open(bak).convert('RGBA')); H, W = im.shape[:2]
    # Ảnh thẻ PRM đặt giữa khung 270×294 → toạ độ % theo khung; ảnh thật cùng tỉ lệ nên dùng thẳng.
    x0, y0 = int(b['x'] / 100 * W) - 3, int(b['y'] / 100 * H) - 3
    x1, y1 = int((b['x'] + b['width']) / 100 * W) + 3, int((b['y'] + b['height']) / 100 * H) + 3
    rgb = cv2.cvtColor(np.ascontiguousarray(im[..., :3]), cv2.COLOR_RGB2BGR)
    roi = rgb[y0:y1, x0:x1].astype(np.int16)
    r, g, bl = roi[..., 2], roi[..., 1], roi[..., 0]
    text = ((r > 170) & (g > 140) & (bl > 90)) | ((g - bl > 25) & (r > 190))      # chữ kem / vàng nhạt trên nền đỏ
    mask = np.zeros(rgb.shape[:2], np.uint8); mask[y0:y1, x0:x1] = cv2.dilate(text.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    out = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    res = np.dstack([cv2.cvtColor(out, cv2.COLOR_BGR2RGB), im[..., 3]])
    if apply: Image.fromarray(res, 'RGBA').save(path, 'WEBP', quality=92, method=6)
    pad = 20
    a = Image.fromarray(im[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]); bb = Image.fromarray(res[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad])
    tiles.append((a, bb))
cw = max(a.width for a, _ in tiles); ch = max(a.height for a, _ in tiles)
sh = Image.new('RGBA', (10 * (2 * cw + 8), 2 * (ch + 6)), (20, 20, 28, 255))
for i, (a, bb) in enumerate(tiles):
    x, y = (i % 10) * (2 * cw + 8), (i // 10) * (ch + 6); sh.paste(a, (x, y)); sh.paste(bb, (x + cw, y))
sh.save('D:/FCOvv-tmp/tmp/prm-ovr-erase.png'); print(len(tiles), 'applied' if apply else 'preview')
