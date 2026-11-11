"""Nhập mùa LD (LAST DANCE). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-ld.py <thư mục nguồn>
Thư mục có card-01.png … card-16.png (đúng thứ tự scripts/data/ld.csv, nền trong suốt, khung 174×278 như LIVE), logo.png (huy hiệu Last Dance),
tunnel.png (nền hầm, tự tạo bằng scripts/make-ld-art.py) và pack.png (ảnh gói; người dùng sẽ gửi ảnh thật, tạm thời dùng ảnh do make-ld-art.py vẽ).
Thẻ in logo CLB thật (cột club có trong clubLogos.json) dùng logo CLB; thẻ "Tự do" in huy hiệu Last Dance nên dùng huy hiệu làm logo đội.
OVR (chữ nâu đậm trên nền sáng) và tên in sẵn được xoá để game tự vẽ.
"""
import csv
import json
from pathlib import Path
import sys
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/ld.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 16
FIRST_ID = 3968
NATIONS = dict(FR='Pháp', ES='Tây Ban Nha', HR='Croatia', DE='Đức', UY='Uruguay', BR='Brazil', IT='Ý', PT='Bồ Đào Nha', BA='Bosnia và Herzegovina',
               CO='Colombia', BE='Bỉ', EN='Anh')
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
CARD_W, CARD_H = 174, 278
CANVAS_W, CANVAS_H = 259, 282
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 2
OVR_BOX = (44, 76, 8, 52)       # y0, y1, x0, x1 trên thẻ: số OVR nâu đậm trên nền sáng
NAME_BAND = (205, 231)          # y0, y1: dải tên trên nền trắng
NAME_RIGHT = 166
NAME_BASELINE = 226


def crop_card(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 40)
    x, y = xs.min(), ys.min()
    card = a[y:y + CARD_H, x:x + CARD_W]
    if card.shape[0] < CARD_H:   # ảnh nguồn sát mép dưới: thêm hàng trong suốt
        card = np.vstack([card, np.zeros((CARD_H - card.shape[0], CARD_W, 4), np.uint8)])
    assert card.shape[:2] == (CARD_H, CARD_W), path
    return card.copy()


def inpaint(card, mask):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 3, cv2.INPAINT_TELEA)


css = ['/* LD (LAST DANCE): tạo bởi scripts/import-ld.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.ld{background:#c8323a}',
       f'.player-card.face-art.season-ld{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-ld>.face-art-img{filter:drop-shadow(0 0 5px #e0505a33)}',
       '.season-ld[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-ld .face-art-ovr{{left:{(OFF_X + 30) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 41) / CANVAS_H * 100:.2f}%;font-size:13.9cqw;color:#4a3f38;letter-spacing:-.02em;text-shadow:0 .02em .06em #fff9}}',
       f'.season-ld .face-art-level{{left:{(OFF_X + 6) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 168) / CANVAS_H * 100:.2f}%;width:{48 / CANVAS_W * 100:.2f}%;height:{30 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-ld{--name-size:7.3cqw;--name-color:#33373d}',
       '[data-tone=ld]{--shop-tone:#c8323a;--shop-tone2:#f1dfc4}',
       '.season-tag-ld{color:#e0505a}',
       '.reveal-ld .reveal-panel{--led:#e0505a;--led2:#2a0a0c;border-color:#f1dfc466}',
       '.reveal-ld .reveal-stats dt{color:#ffffff}',
       '.reveal-ld .reveal-podium{background:linear-gradient(180deg,#8f1d24,#2a0a0c);border-top-color:#f1dfc4}',
       '.reveal-ld .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    rgb = card[..., :3].astype(int)
    # OVR: chữ nâu xám đậm (ít bão hoà); dải đỏ phía sau có kênh đỏ cao nên không bị xoá.
    y0, y1, x0, x1 = OVR_BOX
    part = rgb[y0:y1, x0:x1]
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = (part.max(2) < 140) & (part.max(2) - part.min(2) < 45)
    inpaint(card, ovr)
    # Tên: nhãn LD đỏ đứng trước tên xám; mép phải nhãn = cột đỏ cuối của khối đỏ đầu tiên.
    y0, y1 = NAME_BAND
    band = rgb[y0:y1]
    red = ((band[..., 0] - band[..., 2] > 25) & (band.max(2) - band.min(2) > 30)).sum(0) >= 2
    left = next(x for x in range(14, CARD_W) if red[x])   # x < 14 là viền khung
    tag_right = left
    while tag_right + 1 < CARD_W and red[tag_right + 1:tag_right + 3].any():
        tag_right += 1 + int(np.argmax(red[tag_right + 1:tag_right + 3]))
    ink = band.min(2) < 205
    name = np.zeros(rgb.shape[:2], bool)
    name[y0:y1, tag_right + 2:NAME_RIGHT + 2] = ink[:, tag_right + 2:NAME_RIGHT + 2]
    inpaint(card, name)
    nx = tag_right + 5
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/ld-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                  club=row['club'], tier='ld', wage=int(row['wage']), cardFace=path)
    player['teamLogo'] = LOGOS[row['club']] if row['club'] in LOGOS else '/assets/ld-team.webp'
    players.append(player)

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'ld-back.png')
pack.save(ASSETS / 'ld-back.webp', lossless=True)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.save(ASSETS / 'ld-team.png')
crest.save(ASSETS / 'ld-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'ld-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/ld.csv; tạo bởi scripts/import-ld.py.', 'export const ldPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/ldPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/ld-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the LD.')
