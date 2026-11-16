# Vùng an toàn cho miniface trên ảnh thẻ từng mùa (không che thông tin, không tràn viền) → src/portrait-zones.json.
#  level: ô cấp xám (ô màu xám đồng nhất, cùng chỗ trên >= 70% thẻ của mùa, vùng trái giữa thẻ).
#  info : cột chữ vị trí + chỉ số phía trên ô cấp (từ 17% chiều cao tới đỉnh ô cấp, ngang tới max(phải ô cấp, 37%)).
#  cut  : mép dưới vùng ảnh = đáy ô cấp + 1,2% (dưới là nhãn mùa / tên / cờ / logo).
#  inset: thu vào trong viền (theo alpha thẻ) 4,5% chiều rộng.
# python -I zones_detect.py <repo> [--sheet]
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image, ImageDraw
repo = sys.argv[1]
cards = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']
by = collections.defaultdict(list)
for c in cards:
    if c.get('face'): by[c['tier']].append(c)
out = {}; miss = []
for tier, cs in by.items():
    imgs = [np.asarray(Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA')) for c in cs[:60]]
    size = collections.Counter(a.shape for a in imgs).most_common(1)[0][0]; imgs = [a for a in imgs if a.shape == size]; H, W = size[:2]
    fr = np.zeros((H, W), np.float32)
    for a in imgs:
        r, g, b = [a[..., k].astype(int) for k in range(3)]
        mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
        fr += ((mx - mn < 22) & (mx > 55) & (mx < 150) & (a[..., 3] > 200))
    fr /= len(imgs)
    yy, xx = np.mgrid[0:H, 0:W]
    m = (fr > .7) & (xx < .55 * W) & (yy > .45 * H) & (yy < .82 * H)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    best = None
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if area < .004 * W * H or w < .08 * W or h < .03 * H: continue
        fill = area / (w * h)
        if fill < .6: continue
        if best is None or area > best[4]: best = (x, y, w, h, area)
    if not best: miss.append(tier); continue
    x, y, w, h, _ = best
    lv = [round(x / W, 3), round((x + w) / W, 3), round(y / H, 3), round((y + h) / H, 3)]
    info = [0, round(max(lv[1], .37), 3), .17, lv[2]]
    out[tier] = {'level': lv, 'info': info, 'cut': round(lv[3] + .012, 3), 'inset': .045}
print(len(out), 'missing', miss)
json.dump(out, open('D:/FCOvv-tmp/tmp/zones-auto.json', 'w'), indent=0)
if '--sheet' in sys.argv:
    tiers = json.load(open('D:/FCOvv-tmp/tmp/zone-tiers.json'))
    for k in range(0, len(tiers), 9):
        tiles = []
        for t in tiers[k:k + 9]:
            c = by[t][len(by[t]) // 2]; im = Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGBA'); W, H = im.size
            bg = Image.new('RGBA', im.size, (40, 40, 52, 255)); bg.alpha_composite(im); d = ImageDraw.Draw(bg)
            z = out.get(t)
            if z:
                L = z['level']; d.rectangle([L[0] * W, L[2] * H, L[1] * W, L[3] * H], outline=(255, 0, 0, 255), width=2)
                I = z['info']; d.rectangle([I[0] * W, I[2] * H, I[1] * W, I[3] * H], outline=(255, 160, 0, 255), width=2)
                d.line([(0, z['cut'] * H), (W, z['cut'] * H)], fill=(0, 255, 0, 255), width=2)
            d.text((4, H - 12), t, fill=(255, 255, 255, 255)); tiles.append(bg)
        sh = Image.new('RGBA', (sum(t.width + 6 for t in tiles), max(t.height for t in tiles)), (20, 20, 28, 255)); x = 0
        for t in tiles: sh.alpha_composite(t, (x, 0)); x += t.width + 6
        sh.save(f'D:/FCOvv-tmp/tmp/zonecheck-{k // 9}.png')
