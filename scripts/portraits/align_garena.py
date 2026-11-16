# Căn khung trống Garena (cdn.vn.garenanow.com/fo3vn/project/Ranking/Cards/<mã mùa>Card.png) về toạ độ ảnh thẻ trong game, từng mùa:
# dò tỉ lệ + dịch (ảnh thẻ thu / phóng đặt lên khung) theo cạnh, chỉ trên viền phía trên mép cắt (bỏ vùng người, cột thông tin, ô cấp).
# Ghi D:/FCOvv-tmp/garena/aligned/<tier>.png (RGBA cỡ ảnh thẻ) + align.json (điểm khớp) + ảnh kiểm tra.
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image
repo = sys.argv[1]
d = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8')); years = d['years']
zones = json.load(open(repo + '/src/portrait-zones.json', encoding='utf8'))['tiers']
zones['stellar'] = {'level': [0, .383, .565, .705], 'info': [0, .37, .16, .485], 'cut': .715, 'inset': .045}
by = collections.defaultdict(list)
for c in d['cards']:
    if c.get('face'): by[c['tier']].append(c)
os.makedirs('D:/FCOvv-tmp/garena/aligned', exist_ok=True)
def grad(rgb):
    g = cv2.GaussianBlur(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32), (3, 3), 0)
    return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
res = {}
only = set(sys.argv[2:])
for tier, cs in by.items():
    if only and tier not in only: continue
    codes = [c for c in years.get(tier, []) if os.path.exists(f'D:/FCOvv-tmp/garena/cards/{c}Card.png')]
    if not codes or tier not in zones: continue
    fr = np.asarray(Image.open(f'D:/FCOvv-tmp/garena/cards/{codes[0]}Card.png').convert('RGBA'))
    size = collections.Counter(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).size for c in cs[:30]).most_common(1)[0][0]
    W, H = size; z = zones[tier]
    # Ảnh thẻ tham chiếu: trung vị vài thẻ (bớt người) cho phần viền.
    imgs = [np.asarray(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA')) for c in cs[:25]]
    imgs = [a for a in imgs if a.shape[:2] == (H, W)]
    card = np.median(np.stack(imgs), 0).astype(np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]; X, Y = xx / W, yy / H
    roi = (card[..., 3] > 220) & (Y < z['cut'])
    roi &= ~((X < z['info'][1]) & (Y > z['info'][2]) & (Y < z['info'][3])) & ~((X < z['level'][1]) & (Y > z['level'][2]) & (Y < z['level'][3]))
    roi &= ~((X > .27) & (X < .9) & (Y > .1))
    cg = grad(card[..., :3]); fg = grad(np.ascontiguousarray(fr[..., :3]))
    fa = fr[..., 3] > 0; fg[~fa] = 0
    pad = 80; fp = cv2.copyMakeBorder(fg, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    best = (-1,)
    for s in np.arange(float(os.environ.get('SMIN', .55)), float(os.environ.get('SMAX', 1.6)), .004):
        sw, sh = int(round(W * s)), int(round(H * s))
        if sw > fp.shape[1] or sh > fp.shape[0]: continue
        tpl = cv2.resize(cg, (sw, sh)); mk = cv2.resize(roi.astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST).astype(np.float32)
        if mk.sum() < 50: continue
        r = cv2.matchTemplate(fp, tpl, cv2.TM_CCORR_NORMED, mask=mk); r[~np.isfinite(r)] = -1
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx > best[0]: best = (mx, s, loc[0] - pad, loc[1] - pad, sw, sh)
    mx, s, dx, dy, sw, sh = best
    w = np.array([[sw / W, 0, dx], [0, sh / H, dy]], np.float32)  # thẻ -> khung
    al = cv2.warpAffine(fr, w, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    Image.fromarray(al, 'RGBA').save(f'D:/FCOvv-tmp/garena/aligned/{tier}.png')
    res[tier] = {'score': round(float(mx), 3), 'scale': round(float(s), 3), 'dx': int(dx), 'dy': int(dy), 'code': codes[0], 'size': [W, H]}
    print(tier, res[tier], flush=True)
old = json.load(open('D:/FCOvv-tmp/garena/align.json')) if os.path.exists('D:/FCOvv-tmp/garena/align.json') else {}
old.update(res); json.dump(old, open('D:/FCOvv-tmp/garena/align.json', 'w'), indent=1)

