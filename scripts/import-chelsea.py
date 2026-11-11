"""Nhập mùa CA (AMBASSADOR CHELSEA FC), tier chelsea. Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-chelsea.py <thư mục nguồn>
Thư mục có card-01.png … card-17.png (đúng thứ tự scripts/data/chelsea.csv, nền trong suốt, khung 174×278 như LIVE),
pack.png (ảnh gói) và tunnel.png (nền hầm). Mọi thẻ CLB Chelsea, logo đội = logo Chelsea có sẵn (clubs/363).
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/chelsea.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 17
FIRST_ID = 3942
NATIONS = dict(CI='Bờ Biển Ngà', EN='Anh', IT='Ý', NL='Hà Lan', FR='Pháp', GH='Ghana', CZ='Séc', AR='Argentina', DE='Đức', UA='Ukraine', ES='Tây Ban Nha', PT='Bồ Đào Nha', CM='Cameroon')
TEAM_LOGO = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))['Chelsea']
CARD_W, CARD_H = 174, 278
CANVAS_W, CANVAS_H = 259, 282
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 2
OVR_BOX = (44, 75, 8, 52)       # y0, y1, x0, x1 trên thẻ: số OVR trắng trên dải xanh
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


css = ['/* CA (AMBASSADOR CHELSEA FC): tạo bởi scripts/import-chelsea.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.chelsea{background:#1f3fae}',
       f'.player-card.face-art.season-chelsea{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-chelsea>.face-art-img{filter:drop-shadow(0 0 5px #6f8dff44)}',
       '.season-chelsea[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-chelsea .face-art-ovr{{left:{(OFF_X + 30) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 41) / CANVAS_H * 100:.2f}%;font-size:13.9cqw;color:#f4f6fb;letter-spacing:-.02em;text-shadow:0 .03em .08em #0a1a5a99}}',
       f'.season-chelsea .face-art-level{{left:{(OFF_X + 6) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 168) / CANVAS_H * 100:.2f}%;width:{48 / CANVAS_W * 100:.2f}%;height:{30 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-chelsea{--name-size:7.3cqw;--name-color:#33373d}',
       '[data-tone=chelsea]{--shop-tone:#2f55d4;--shop-tone2:#dfe6ff}',
       '.season-tag-chelsea{color:#6f8dff}',
       '.reveal-chelsea .reveal-panel{--led:#6f8dff;--led2:#0a1440;border-color:#dfe6ff66}',
       '.reveal-chelsea .reveal-stats dt{color:#ffffff}',
       '.reveal-chelsea .reveal-podium{background:linear-gradient(180deg,#1f3fae,#0a1440);border-top-color:#dfe6ff}',
       '.reveal-chelsea .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    rgb = card[..., :3].astype(int)
    # OVR: chữ trắng trên dải xanh (kênh đỏ của nền thấp).
    y0, y1, x0, x1 = OVR_BOX
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = rgb[y0:y1, x0:x1].min(2) > 150
    inpaint(card, ovr)
    # Tên: nhãn mùa + tên canh giữa nên nhãn xê dịch; tìm mép phải nhãn rồi chỉ xoá phần bên phải.
    y0, y1 = NAME_BAND
    ink = rgb[y0:y1].min(2) < 205
    # Nhãn Chelsea (ô viền xanh có logo): khối cột có điểm xanh đầu tiên (bỏ qua khe ≤ 4 cột); tên bắt đầu sau đó.
    band = rgb[y0:y1]
    cols = ((band[..., 2] - band[..., 0]) > 40).sum(0) >= 1   # điểm xanh của viền / logo (chữ tên màu xám, không xanh)
    left = next(x for x in range(6, CARD_W) if cols[x])
    tag_right = left
    while tag_right + 1 < CARD_W and cols[tag_right + 1:tag_right + 5].any():
        tag_right += 1 + int(np.argmax(cols[tag_right + 1:tag_right + 5]))
    name = np.zeros(rgb.shape[:2], bool)
    name[y0:y1, tag_right + 1:NAME_RIGHT + 2] = ink[:, tag_right + 1:NAME_RIGHT + 2]
    inpaint(card, name)
    nx = tag_right + 5
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/chelsea-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='chelsea', wage=int(row['wage']), cardFace=path, teamLogo=TEAM_LOGO))

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'chelsea-back.png')
pack.save(ASSETS / 'chelsea-back.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'chelsea-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/chelsea.csv; tạo bởi scripts/import-chelsea.py.', 'export const chelseaPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/chelseaPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/chelsea-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the CA.')
