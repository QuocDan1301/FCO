# Xoá số OVR in sẵn trên ảnh thẻ (người dùng 2026-11-17: bỏ nền sau OVR các mùa PRIME, MEDALIST, VIETNAM, FC AMBASSADOR).
# Ô OVR: mdl / vietnam / amb dùng chung vị trí theo khung 254×276 (ảnh 174×276 đặt giữa); prime theo biến --prime-ovr-* từng thẻ (khung = ảnh).
# Chữ = điểm lệch màu nền ô (nền lấy từ viền ô) → nới → inpaint. Gốc sao lưu ở D:/FCOvv-tmp/ovr-orig. python -I erase_ovr_seasons.py <repo> [--apply]
import sys, os, re, json, shutil
import numpy as np, cv2
from PIL import Image
repo = sys.argv[1]; apply = '--apply' in sys.argv
cards = json.load(open('D:/FCOvv-tmp/tmp/ovr-cards.json', encoding='utf8'))
css = open(os.path.join(repo, 'src', 'prime-cards.css'), encoding='utf8').read()
prime = {int(m.group(1)): {k: float(v) for k, v in re.findall(r'--prime-ovr-(x|y|width|height):([\d.]+)%', m.group(2))} for m in re.finditer(r'\.face-(\d+)\{([^}]*)\}', css)}
SHARED = {'x': 19.29, 'y': 16.3, 'width': 16.93, 'height': 9.4}
os.makedirs('D:/FCOvv-tmp/ovr-orig', exist_ok=True)
tiles = []; skipped = []
for c in cards:
    path = os.path.join(repo, 'public', c['face'].replace('/FCO/', '/', 1).lstrip('/'))
    if not os.path.exists(path): skipped.append(c['id']); continue
    bak = os.path.join('D:/FCOvv-tmp/ovr-orig', os.path.basename(path))
    if not os.path.exists(bak): shutil.copy2(path, bak)
    im = np.asarray(Image.open(bak).convert('RGBA')); H, W = im.shape[:2]
    if c['tier'] == 'prime':
        b = prime.get(c['id'])
        if not b: skipped.append(c['id']); continue
        X = lambda p: p / 100 * W
    else:
        # Ảnh rộng đủ khung 254 (có lề trong suốt) thì % tính thẳng; ảnh hẹp 174 thì đặt giữa khung.
        b = SHARED; fw = W if W / H > .8 else W * 254 / 174; off = (fw - W) / 2
        X = lambda p: p / 100 * fw - off
    x0, x1 = int(X(b['x'])) - 2, int(X(b['x'] + b['width'])) + 2
    y0, y1 = int(b['y'] / 100 * H) - 2, int((b['y'] + b['height']) / 100 * H) + 2
    x0, y0 = max(0, x0), max(0, y0)
    rgb = cv2.cvtColor(np.ascontiguousarray(im[..., :3]), cv2.COLOR_RGB2BGR)
    roi = rgb[y0:y1, x0:x1].astype(np.float32)
    ring = np.concatenate([roi[:2].reshape(-1, 3), roi[-2:].reshape(-1, 3), roi[:, :2].reshape(-1, 3), roi[:, -2:].reshape(-1, 3)])
    bg = np.median(ring, 0)
    text = np.abs(roi - bg).max(-1) > 55
    mask = np.zeros(rgb.shape[:2], np.uint8); mask[y0:y1, x0:x1] = cv2.dilate(text.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    out = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    res = np.dstack([cv2.cvtColor(out, cv2.COLOR_BGR2RGB), im[..., 3]])
    if apply: Image.fromarray(res, 'RGBA').save(path, 'WEBP', quality=92, method=6)
    pad = 14; sl = (slice(max(0, y0 - pad), y1 + pad), slice(max(0, x0 - pad), x1 + pad))
    tiles.append((Image.fromarray(im[sl]).resize((90, 70)), Image.fromarray(res[sl]).resize((90, 70))))
cols = 12; sh = Image.new('RGBA', (cols * 186, ((len(tiles) + cols - 1) // cols) * 74), (20, 20, 28, 255))
for i, (a, bb) in enumerate(tiles):
    x, y = (i % cols) * 186, (i // cols) * 74; sh.paste(a, (x, y)); sh.paste(bb, (x + 92, y))
sh.save('D:/FCOvv-tmp/tmp/ovr-erase.png'); print(len(tiles), 'applied' if apply else 'preview', 'skipped', skipped)
