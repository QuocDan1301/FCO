"""Import 26UP source assets and roster. Source images are never changed.
Usage: python scripts/import-up26.py <26UP directory>
The directory holds card-01.png … card-98.png (screenshot order = price-list order, transparent
in-game renders), pack.png (transparent pack art) and tunnel.png (background).
Cards are aligned on the frame (bottom-left anchor, refined by matching the 26UP tag/level box),
the printed OVR and name are inpainted, and the card is scaled to fill a 259×282 frame.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/up26.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 98
FIRST_ID = 3791
NATIONS = dict(BR='Brazil', CI='Bờ Biển Ngà', EN='Anh', DE='Đức', HU='Hungary', AR='Argentina', ES='Tây Ban Nha', PT='Bồ Đào Nha', NL='Hà Lan', FR='Pháp', CM='Cameroon', CO='Colombia', NO='Na Uy', SN='Senegal', EC='Ecuador', WL='Wales', CZ='Séc', IT='Ý', BF='Burkina Faso', EG='Ai Cập', RS='Serbia', UY='Uruguay', GM='Gambia', XK='Kosovo', GE='Georgia', CH='Thụy Sĩ', DK='Đan Mạch', HR='Croatia', JP='Nhật Bản', AT='Áo', SE='Thụy Điển', US='Mỹ', RO='Romania', NG='Nigeria')
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
CARD_W, CARD_H = 214, 297          # frame size in the screenshots
SCALE = 280 / CARD_H               # card fills 280 of the 282 px canvas height
OFF_X, OFF_Y = round((259 - CARD_W * SCALE) / 2), 1


def raw_crop(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 40)
    pad = np.zeros((a.shape[0] + 40, a.shape[1] + 40, 4), np.uint8)
    pad[20:-20, 20:-20] = a
    x0, y1 = xs.min() + 20, ys.max() + 20
    return pad, x0, y1 - CARD_H + 1


def grey(c):
    a = c[..., 3:] / 255
    return (c[..., :3] * a + 128 * (1 - a)).astype(np.uint8)


ref_pad, rx, ry = raw_crop(SOURCE / 'card-12.png')   # M. Rogers
tag = grey(ref_pad[ry + 224:ry + 284, rx + 10:rx + 80])
label = None   # printed 26UP tag (set from the reference card below)


def crop_card(path):
    pad, x, y = raw_crop(path)
    region = grey(pad[y + 214:y + 294, x:x + 90])
    _, _, _, (dx, dy) = cv2.minMaxLoc(-cv2.matchTemplate(region, tag, cv2.TM_SQDIFF_NORMED))
    x, y = x + dx - 10, y + dy - 10
    card = pad[y:y + CARD_H, x:x + CARD_W]
    assert card.shape[:2] == (CARD_H, CARD_W), path
    return card.copy()


def inpaint(card, mask):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 4, cv2.INPAINT_TELEA)


css = ['/* 26UP: normalized source cards with live OVR/name/upgrade badges. */',
       '.rarity-dot.up26{background:#c9a35c}',
       '.player-card.face-art.season-up26{aspect-ratio:259/282}',
       '.player-card.face-art.season-up26>.face-art-img{filter:drop-shadow(0 0 5px #f3d69a44)}',
       '.season-up26[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-up26 .face-art-ovr{left:28.84%;top:17.87%;font-size:10.1cqw;color:#3b2a20;letter-spacing:-.03em}',
       f'.season-up26 .face-art-level{{left:{(OFF_X + 27 * SCALE) / 259 * 100:.2f}%;top:{(OFF_Y + 174 * SCALE) / 282 * 100:.2f}%;width:{52 * SCALE / 259 * 100:.2f}%;height:{28 * SCALE / 282 * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-up26{--name-size:6.4cqw;--name-color:#ffffff}',
       '.season-up26 .face-art-name{text-shadow:0 .05em .14em #1d1209cc}',
       '[data-tone=up26]{--shop-tone:#c9a35c;--shop-tone2:#f3e2bd}',
       '.season-tag-up26{color:#e3c27f}',
       '.reveal-up26 .reveal-panel{--led:#f0cf8a;--led2:#3a2414;border-color:#f3e2bd66}',
       '.reveal-up26 .reveal-stats dt{color:#ffffff}',
       '.reveal-up26 .reveal-podium{background:linear-gradient(180deg,#6b4a2b,#24170d);border-top-color:#f0cf8a}',
       '.reveal-up26 .reveal-podium span{color:#ffffff}']
players = []
ref = crop_card(SOURCE / 'card-12.png')
label = ref[221:241, 51:78, :3].copy()
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    rgb = card[..., :3].astype(int)
    opaque = card[..., 3] > 200
    ovr = np.zeros(opaque.shape, bool)
    ovr[56:88, 26:76] = (rgb[56:88, 26:76].max(2) < 120) & opaque[56:88, 26:76]
    inpaint(card, ovr)
    # The tag + name group is centred, so the tag moves: find it, then erase only what is right of it.
    band = np.ascontiguousarray(card[214:248, 20:160, :3])
    _, _, (tx, _), _ = cv2.minMaxLoc(cv2.matchTemplate(band, label, cv2.TM_SQDIFF_NORMED))
    tag_right = tx + 20 + label.shape[1]
    white = (rgb.min(2) > 150) & opaque
    name = np.zeros(opaque.shape, bool)
    name[216:246, tag_right + 1:204] = white[216:246, tag_right + 1:204]
    nx = tag_right + 5
    inpaint(card, name)
    face = Image.fromarray(card).resize((round(CARD_W * SCALE), 280), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(face, (OFF_X, OFF_Y))
    path = f'/assets/up26-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    left, right, base = OFF_X + nx * SCALE, OFF_X + 202 * SCALE, OFF_Y + 238 * SCALE
    css.append(f'.face-{pid}' + '{' + f'--nx:{left / 259 * 100:.2f}%;--nw:{(right - left) / 259 * 100:.2f}%;--ny:{base / 282 * 100:.2f}%' + '}')
    assert row['club'] in LOGOS, row['club']
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='up26', wage=int(row['wage']), cardFace=path))

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'up26-back.png')
pack.save(ASSETS / 'up26-back.webp', lossless=True)
Image.open(SOURCE / 'tunnel.png').convert('RGB').save(ASSETS / 'up26-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// 26UP source order and +1 prices: scripts/data/up26.csv.', 'export const up26Players: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key == 'cardFace' else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/up26Players.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/up26-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Imported {len(players)} 26UP players and unique faces, pack/tunnel assets.')
