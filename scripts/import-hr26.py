"""Nhập mùa 26HR (26 HEROES). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-hr26.py <thư mục nguồn>
Thư mục có card-01.png … card-09.png (đúng thứ tự scripts/data/hr26.csv, nền trong suốt, khung 216×282 gồm cả mảnh sáng bay quanh thẻ),
pack.png (ảnh gói), tunnel.png (nền hầm) và logo.png (huy hiệu mùa, in ở góc dưới phải mọi thẻ nên dùng làm logo đội; nền tối được xoá).
Thẻ giữ nguyên kích thước, đặt giữa khung 259×282; OVR và tên in sẵn (chữ kem trên nền tím) được xoá để game tự vẽ.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/hr26.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 9
FIRST_ID = 3959
NATIONS = dict(CL='Chile', NL='Hà Lan', IT='Ý', DE='Đức', PE='Peru', ES='Tây Ban Nha', PT='Bồ Đào Nha', AR='Argentina', EN='Anh')
CARD_W, CARD_H = 216, 282
CANVAS_W, CANVAS_H = 259, 282
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 0
OVR_BOX = (44, 77, 22, 74)      # y0, y1, x0, x1 trên thẻ
NAME_BAND = (206, 233)          # y0, y1: dải tên trên nền tím đậm
NAME_RIGHT = 188                # mép phải vùng chữ tên
NAME_BASELINE = 227
BODY_X0, BODY_X1 = 24, 192    # thân thẻ (ngoài khoảng này là mảnh sáng trang trí)


def crop_card(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 40)
    x, y = xs.min(), ys.min()
    card = a[y:y + CARD_H, x:x + CARD_W]
    assert card.shape[:2] == (CARD_H, CARD_W), path
    return card.copy()


def cream(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 150) & (g > 120) & (r - b > 35)


def inpaint(card, mask):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 3, cv2.INPAINT_TELEA)


css = ['/* 26HR (26 HEROES): tạo bởi scripts/import-hr26.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.hr26{background:#a35cff}',
       f'.player-card.face-art.season-hr26{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-hr26>.face-art-img{filter:drop-shadow(0 0 5px #b07cff44)}',
       '.season-hr26[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-hr26 .face-art-ovr{{left:{(OFF_X + 46) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 43) / CANVAS_H * 100:.2f}%;font-size:13.9cqw;color:#f7e0a8;letter-spacing:-.02em;text-shadow:0 .03em .08em #1a0a3a99}}',
       f'.season-hr26 .face-art-level{{left:{(OFF_X + 26) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 169) / CANVAS_H * 100:.2f}%;width:{47 / CANVAS_W * 100:.2f}%;height:{29 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-hr26{--name-size:7.3cqw;--name-color:#f7e0a8}',
       '.season-hr26 .face-art-name{text-shadow:0 .05em .14em #0a0420aa}',
       '[data-tone=hr26]{--shop-tone:#a35cff;--shop-tone2:#f3d9ff}',
       '.season-tag-hr26{color:#c79bff}',
       '.reveal-hr26 .reveal-panel{--led:#c79bff;--led2:#1a0a3a;border-color:#f3d9ff66}',
       '.reveal-hr26 .reveal-stats dt{color:#ffffff}',
       '.reveal-hr26 .reveal-podium{background:linear-gradient(180deg,#6a2fc0,#1a0a3a);border-top-color:#f3d9ff}',
       '.reveal-hr26 .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    # Ảnh nguồn có chỗ áo trắng bị tách nền thành lỗ trong suốt (vd. tay áo Makaay): lỗ nằm trong thân thẻ, không nối ra mép ảnh → tô trắng.
    clear = (card[..., 3] < 200).astype(np.uint8)
    _, labels = cv2.connectedComponents(clear, connectivity=4)
    outside = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    hole = (clear > 0) & ~np.isin(labels, list(outside))
    hole[:, :BODY_X0] = False
    hole[:, BODY_X1:] = False
    if hole.any():
        a = card[..., 3:4].astype(float) / 255
        mix = card[..., :3] * a + np.array([244, 243, 246]) * (1 - a)
        card[hole, :3] = mix[hole].round().astype(np.uint8)
        card[hole, 3] = 255
    rgb = card[..., :3].astype(int)
    y0, y1, x0, x1 = OVR_BOX
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = cream(rgb[y0:y1, x0:x1])
    inpaint(card, ovr)
    # Nhãn 26HR (ô tím viền sáng, b > r) đứng trước tên kem (r > b): khối cột tím sáng đầu tiên là nhãn, tên bắt đầu sau đó.
    y0, y1 = NAME_BAND
    band = rgb[y0:y1]
    lilac = ((band[..., 2] - band[..., 0] > 8) & (band.max(2) > 120)).sum(0) >= 2
    left = next(x for x in range(33, CARD_W) if lilac[x])   # x < 33 là ánh tím của viền khung
    tag_right = left
    while tag_right + 1 < CARD_W and lilac[tag_right + 1:tag_right + 3].any():
        tag_right += 1 + int(np.argmax(lilac[tag_right + 1:tag_right + 3]))
    name = np.zeros(rgb.shape[:2], bool)
    part = band[:, tag_right + 2:NAME_RIGHT + 2]
    # Chữ kem và viền chữ mờ (đỏ hơn xanh, sáng hơn nền tím đậm).
    name[y0:y1, tag_right + 2:NAME_RIGHT + 2] = cream(part) | ((part[..., 0] - part[..., 2] > 12) & (part.max(2) > 80))
    inpaint(card, name)
    nx = tag_right + 5
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/hr26-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='hr26', wage=int(row['wage']), cardFace=path, teamLogo='/assets/hr26-team.webp'))

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'hr26-back.png')
pack.save(ASSETS / 'hr26-back.webp', lossless=True)
# Huy hiệu: xoá nền tối nối từ mép ảnh, cắt sát, thu về 512 px.
crest = np.array(Image.open(SOURCE / 'logo.png').convert('RGBA'))
dark = ((crest[..., :3].max(2) < 70) | (crest[..., 3] < 20)).astype(np.uint8)
_, labels = cv2.connectedComponents(dark, connectivity=4)
edge = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
background = np.isin(labels, [v for v in edge if v != 0]) & (dark > 0)
alpha = 255 - cv2.GaussianBlur(cv2.dilate(background.astype(np.uint8) * 255, np.ones((5, 5), np.uint8)), (5, 5), 0)
crest[..., 3] = np.minimum(crest[..., 3], alpha)
crest_img = Image.fromarray(crest)
crest_img = crest_img.crop(crest_img.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest_img.thumbnail((512, 512), Image.Resampling.LANCZOS)
crest_img.save(ASSETS / 'hr26-team.png')
crest_img.save(ASSETS / 'hr26-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'hr26-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/hr26.csv; tạo bởi scripts/import-hr26.py.', 'export const hr26Players: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/hr26Players.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/hr26-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the 26HR.')
