"""Nhập mùa 24HR (24 HEROES). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-hr24.py <thư mục nguồn>
Thư mục có card-01.png … card-14.png (đúng thứ tự scripts/data/hr24.csv, nền trong suốt, khung 174×278 như LIVE),
pack.png (ảnh gói), tunnel.png (nền hầm) và logo.png (huy hiệu mùa, in ở góc dưới phải mọi thẻ nên dùng làm logo đội).
Thẻ giữ nguyên kích thước, đặt giữa khung 259×282; OVR và tên in sẵn được xoá để game tự vẽ.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/hr24.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 14
FIRST_ID = 3928
NATIONS = dict(IT='Ý', NL='Hà Lan', BE='Bỉ', UY='Uruguay', AR='Argentina', BG='Bulgaria', EN='Anh', FR='Pháp', CZ='Séc', NO='Na Uy', BR='Brazil', NG='Nigeria', US='Mỹ')
CARD_W, CARD_H = 174, 278
CANVAS_W, CANVAS_H = 259, 282
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 2
OVR_BOX = (44, 75, 8, 52)       # y0, y1, x0, x1 trên thẻ: số OVR màu kem trên nền cam
NAME_BAND = (205, 231)          # y0, y1: dải tên trên nền trắng
NAME_RIGHT = 166                # mép phải vùng chữ tên
NAME_BASELINE = 226


def crop_card(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 40)
    x, y = xs.min(), ys.min()
    card = a[y:y + CARD_H, x:x + CARD_W]
    assert card.shape[:2] == (CARD_H, CARD_W), path
    return card.copy()


def inpaint(card, mask):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 3, cv2.INPAINT_TELEA)


css = ['/* 24HR (24 HEROES): tạo bởi scripts/import-hr24.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.hr24{background:#f07a1a}',
       f'.player-card.face-art.season-hr24{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-hr24>.face-art-img{filter:drop-shadow(0 0 5px #ffb04a44)}',
       '.season-hr24[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-hr24 .face-art-ovr{{left:{(OFF_X + 30) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 41) / CANVAS_H * 100:.2f}%;font-size:13.9cqw;color:#fbf0d6;letter-spacing:-.02em;text-shadow:0 .03em .08em #5a2a0099}}',
       f'.season-hr24 .face-art-level{{left:{(OFF_X + 6) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 168) / CANVAS_H * 100:.2f}%;width:{48 / CANVAS_W * 100:.2f}%;height:{30 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-hr24{--name-size:7.3cqw;--name-color:#33373d}',
       '[data-tone=hr24]{--shop-tone:#f07a1a;--shop-tone2:#ffd27a}',
       '.season-tag-hr24{color:#ff9a3d}',
       '.reveal-hr24 .reveal-panel{--led:#ff9a3d;--led2:#3d1a05;border-color:#ffd27a66}',
       '.reveal-hr24 .reveal-stats dt{color:#ffffff}',
       '.reveal-hr24 .reveal-podium{background:linear-gradient(180deg,#b5520f,#3d1a05);border-top-color:#ffd27a}',
       '.reveal-hr24 .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    rgb = card[..., :3].astype(int)
    # OVR: chữ kem sáng trên nền cam / nâu (kênh xanh lam của nền thấp).
    y0, y1, x0, x1 = OVR_BOX
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = rgb[y0:y1, x0:x1].min(2) > 150
    inpaint(card, ovr)
    # Tên: nhãn 24HR + tên canh giữa nên nhãn xê dịch; tìm mép phải nhãn rồi chỉ xoá phần bên phải.
    y0, y1 = NAME_BAND
    ink = rgb[y0:y1].min(2) < 205
    # Nhãn 24HR màu cam (chữ trắng bên trong): cột có điểm cam; mép phải = cột cam cuối của khối cam đầu tiên (bỏ qua khe ≤ 2 cột).
    band = rgb[y0:y1]
    orange = ((band[..., 0] > 150) & (band[..., 0] - band[..., 2] > 70)).sum(0) >= 3
    left = next(x for x in range(12, CARD_W) if orange[x])
    tag_right = left
    while tag_right + 1 < CARD_W and orange[tag_right + 1:tag_right + 4].any():
        tag_right += 1 + int(np.argmax(orange[tag_right + 1:tag_right + 4]))
    name = np.zeros(rgb.shape[:2], bool)
    name[y0:y1, tag_right + 1:NAME_RIGHT + 2] = ink[:, tag_right + 1:NAME_RIGHT + 2]
    inpaint(card, name)
    nx = tag_right + 5
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/hr24-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='hr24', wage=int(row['wage']), cardFace=path, teamLogo='/assets/hr24-team.webp'))

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'hr24-back.png')
pack.save(ASSETS / 'hr24-back.webp', lossless=True)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.save(ASSETS / 'hr24-team.png')
crest.save(ASSETS / 'hr24-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'hr24-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/hr24.csv; tạo bởi scripts/import-hr24.py.', 'export const hr24Players: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/hr24Players.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/hr24-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the 24HR.')
