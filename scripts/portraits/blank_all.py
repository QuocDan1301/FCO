# Khung trống mọi mùa từ ảnh Garena đã căn (D:/FCOvv-tmp/garena/aligned/<tier>.png, cỡ ảnh thẻ):
#   alpha = vùng thay nền + vùng miniface được hiện: trên mép cắt, tránh cột vị trí / chỉ số và ô cấp, trong viền
#   (alpha khung Garena ∩ alpha ảnh thẻ, thu vào inset); box = vị trí chân dung FC của mùa (portrait-frames) hoặc mặc định, đáy ở mép cắt.
# Ghi public/assets/portraits/blank/<tier>.webp + src/portrait-blank.json; --preview: ảnh thử D:/FCOvv-tmp/tmp/blank-prev-*.png
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image, ImageDraw
repo = sys.argv[1]
d = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))
al = json.load(open('D:/FCOvv-tmp/garena/align.json'))
zones = json.load(open(repo + '/src/portrait-zones.json', encoding='utf8'))['tiers']
zones['stellar'] = {'level': [0, .383, .565, .705], 'info': [0, .37, .16, .485], 'cut': .715, 'inset': .045}
if 'el' in zones: zones['el'] = {**zones['el'], 'info': [0, max(.42, zones['el']['info'][1]), zones['el']['info'][2], zones['el']['info'][3]]}  # OVR in sẵn trong ảnh chụp khung EL
SKIP_TIERS_NO_SWAP = {'tsubasa', 'naruto'}
frames = json.load(open(repo + '/src/portrait-frames.json', encoding='utf8'))['tiers']
SKIP = {'prime'}  # bố cục ảnh thẻ khác khung Garena
by = collections.defaultdict(list)
for c in d['cards']:
    if c.get('face'): by[c['tier']].append(c)
dst = os.path.join(repo, 'public', 'assets', 'portraits', 'blank'); os.makedirs(dst, exist_ok=True)
data = {'note': 'Khung trống theo mùa (ảnh khung thẻ Garena cdn.vn.garenanow.com/fo3vn/project/Ranking/Cards/<mã mùa>Card.png, căn về toạ độ ảnh thẻ; '
                'scripts/portraits/align_garena.py + blank_all.py): alpha = vùng thay nền và vùng miniface được hiện. box: [cạnh / cao thẻ, tâm x / rộng, đáy y / cao].',
        'tiers': {}}
blanks = {}
for tier, info in al.items():
    if tier in SKIP or tier in SKIP_TIERS_NO_SWAP or tier not in zones: continue
    fr = np.asarray(Image.open(f'D:/FCOvv-tmp/garena/aligned/{tier}.png').convert('RGBA')).astype(np.float32)
    H, W = fr.shape[:2]; z = zones[tier]
    cards = [np.asarray(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA')) for c in by[tier][:40]]
    cards = [a for a in cards if a.shape[:2] == (H, W)]
    calpha = np.min(np.stack([a[..., 3] for a in cards]), 0) > 200 if cards else np.ones((H, W), bool)
    yy, xx = np.mgrid[0:H, 0:W]; X, Y = xx / W, yy / H
    zone = (Y < z['cut']) & ~((X < z['info'][1]) & (Y > z['info'][2]) & (Y < z['info'][3])) & ~((X < z['level'][1]) & (Y > z['level'][2]) & (Y < z['level'][3]))
    inside = (fr[..., 3] > 200) & calpha
    r = max(1, round(z.get('inset', .045) * W))
    inside = cv2.erode(inside.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) > 0
    a = cv2.GaussianBlur((zone & inside).astype(np.float32), (5, 5), 0)
    out = np.dstack([fr[..., :3].clip(0, 255).astype(np.uint8), (a * 255).round().astype(np.uint8)])
    Image.fromarray(out, 'RGBA').save(os.path.join(dst, f'{tier}.webp'), 'WEBP', quality=90, method=6)
    if tier in frames:
        s, fx, fy = frames[tier]; box = [s, round(fx + s * H / W / 2, 4), round(fy + s, 4)]
    else:
        box = [.52, .56, z['cut']]
    if tier == 'stellar': box = [.47, .555, .715]
    data['tiers'][tier] = {'box': box}
    blanks[tier] = (out, box)
json.dump(data, open(os.path.join(repo, 'src', 'portrait-blank.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('tiers', len(data['tiers']), 'KB', sum(os.path.getsize(os.path.join(dst, f'{t}.webp')) for t in data['tiers']) // 1024)

if '--preview' in sys.argv:
    pm = json.load(open(repo + '/src/portraits.json', encoding='utf8'))
    def compose(c, blank, box, src):
        card = np.asarray(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA')).astype(np.float32)
        H, W = card.shape[:2]; bl = blank.astype(np.float32); zz = bl[..., 3:4] / 255
        o = card.copy(); o[..., :3] = card[..., :3] * (1 - zz) + bl[..., :3] * zz
        t = round(box[0] * H); x = round(box[1] * W - t / 2); y = round(box[2] * H - t)
        p = np.asarray(Image.open(src).convert('RGBA').resize((t, t), Image.LANCZOS)).astype(np.float32)
        L = np.zeros((H, W, 4), np.float32); x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + t), min(H, y + t)
        L[y0:y1, x0:x1] = p[y0 - y:y1 - y, x0 - x:x1 - x]
        v = (np.arange(H)[:, None] - y) / t; fade = np.clip((1 - v) / .12, 0, 1)
        aa = L[..., 3:4] / 255 * fade[..., None] * zz
        o[..., :3] = o[..., :3] * (1 - aa) + L[..., :3] * aa
        return card.astype(np.uint8), o.clip(0, 255).astype(np.uint8)
    tiles = []
    for tier, (blank, box) in blanks.items():
        n = 0
        for c in by[tier]:
            k = f"{c['name']}|{c['nation']}"; opts = [s for s in pm['persons'].get(k, []) if s != pm['cards'].get(str(c['id']))]
            if not opts: continue
            a, b = compose(c, blank, box, f"{repo}/public/assets/portraits/{opts[0]}.webp")
            for im in (a, b):
                bg = Image.new('RGBA', (im.shape[1], im.shape[0]), (30, 30, 40, 255)); bg.alpha_composite(Image.fromarray(im, 'RGBA'))
                ImageDraw.Draw(bg).text((3, 3), tier, fill=(255, 255, 0, 255)); tiles.append(bg.resize((180, round(180 * im.shape[0] / im.shape[1]))))
            n += 1
            if n >= 1: break
    per = 24
    for k in range(0, len(tiles), per):
        part = tiles[k:k + per]; sh = Image.new('RGBA', (8 * 184, 3 * 200), (20, 20, 28, 255))
        for i, tl in enumerate(part): sh.alpha_composite(tl, ((i % 8) * 184, (i // 8) * 200))
        sh.save(f'D:/FCOvv-tmp/tmp/blank-prev-{k // per}.png')
