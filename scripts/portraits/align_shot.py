# Căn ảnh chụp khung trống (người dùng gửi, có thể có OVR / tên / cờ vẽ đè) về toạ độ ảnh thẻ của mùa: dò tỉ lệ + dịch theo cạnh,
# chỉ trên phần viền (bỏ vùng người, cột thông tin, ô cấp, dải tên). Ghi D:/FCOvv-tmp/garena/aligned/<tier>.png + align.json.
# python -I align_shot.py <repo> <tier> <ảnh chụp>
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image
repo, tier, shot_path = sys.argv[1:4]
cs = [c for c in json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards'] if c['tier'] == tier and c.get('face')]
imgs = [np.asarray(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA')) for c in cs[:30]]
H, W = collections.Counter(a.shape[:2] for a in imgs).most_common(1)[0][0]
card = np.median(np.stack([a for a in imgs if a.shape[:2] == (H, W)]), 0).astype(np.uint8)
shot = Image.open(shot_path).convert('RGB')
k = 420 / shot.width; shot = np.asarray(shot.resize((420, round(shot.height * k)), Image.LANCZOS))
def grad(rgb):
    g = cv2.GaussianBlur(cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2GRAY).astype(np.float32), (3, 3), 0)
    return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
cg, sg = grad(card[..., :3]), grad(shot)
yy, xx = np.mgrid[0:H, 0:W]; X, Y = xx / W, yy / H
m = (card[..., 3] > 220) & ~((X > .2) & (X < .92) & (Y > .1) & (Y < .9)) & ~((X < .45) & (Y > .12) & (Y < .78))
m = m.astype(np.uint8)
pad = 60; sp = cv2.copyMakeBorder(sg, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
best = (-1,)
for s in np.arange(.8, 1.9, .004):
    sw, sh = round(W * s), round(H * s)
    if sw > sp.shape[1] or sh > sp.shape[0]: continue
    tpl = cv2.resize(cg, (sw, sh)); mk = cv2.resize(m, (sw, sh), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    r = cv2.matchTemplate(sp, tpl, cv2.TM_CCORR_NORMED, mask=mk); r[~np.isfinite(r)] = -1
    _, mx, _, loc = cv2.minMaxLoc(r)
    if mx > best[0]: best = (mx, s, loc[0] - pad, loc[1] - pad, sw, sh)
mx, s, dx, dy, sw, sh = best
w = np.array([[sw / W, 0, dx], [0, sh / H, dy]], np.float32)
al = cv2.warpAffine(shot, w, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
out = np.dstack([al, card[..., 3]])  # ảnh chụp không có alpha: lấy alpha của ảnh thẻ
Image.fromarray(out, 'RGBA').save(f'D:/FCOvv-tmp/garena/aligned/{tier}.png')
A = json.load(open('D:/FCOvv-tmp/garena/align.json')); A[tier] = {'score': round(float(mx), 3), 'scale': round(float(s), 3), 'dx': int(dx), 'dy': int(dy), 'code': 'shot', 'size': [W, H]}
json.dump(A, open('D:/FCOvv-tmp/garena/align.json', 'w'), indent=1); print(tier, A[tier])
bl = (card[..., :3] * .5 + al * .5).astype(np.uint8)
Image.fromarray(np.concatenate([card[..., :3], al, bl], 1)).resize((W * 6, H * 2)).save(f'D:/FCOvv-tmp/tmp/shot-align-{tier}.png')
