"""Import 25HR (25 HEROES) source assets and roster. Source images are never changed.
Usage: python scripts/import-hr25.py <25HR directory>
The directory holds card-01.png … card-20.png (screenshot order = price-list order),
pack.png (transparent pack art), tunnel.png (background) and logo.png (season crest).
Every screenshot shows the card at the same scale on a flat (243,243,238) background,
so cards are aligned by the orange frame outline and keep their lightning with soft edges.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/hr25.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 20
FIRST_ID = 3771
NATIONS = dict(BE='Bỉ', ES='Tây Ban Nha', BR='Brazil', SK='Slovakia', AR='Argentina', FR='Pháp', EN='Anh', NL='Hà Lan', HR='Croatia', IT='Ý', CZ='Séc', CI='Bờ Biển Ngà', US='Mỹ', CO='Colombia', SA='Ả Rập Xê Út')
BG = np.array([243, 243, 238])
CARD_W, CARD_H, OFF_X = 213, 282, 23   # card incl. lightning; placed at (23,0) in a 259×282 frame
FRAME_X, FRAME_Y = 10, 1                 # frame outline's top-left inside the card crop


def crop_card(path):
    a = np.array(Image.open(path).convert('RGB'))
    r, g, b = (a[..., i].astype(int) for i in range(3))
    frame = (r > 170) & (g < 120) & (b < 110) & (r - b > 90)
    ys, xs = np.nonzero(frame)
    x0, y0 = xs.min() - FRAME_X, ys.min() - FRAME_Y
    crop = a[y0:y0 + CARD_H, x0:x0 + CARD_W]
    assert crop.shape[:2] == (CARD_H, CARD_W), path
    return crop


def cut_background(rgb):
    """Alpha 0 on the flat screenshot background, soft alpha on glow next to it, colours un-mixed."""
    diff = np.abs(rgb.astype(int) - BG).max(2)
    flat = (diff <= 6).astype('uint8')
    _, labels = cv2.connectedComponents(flat)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, edge[edge != 0]) & (flat > 0)
    outside = np.ones(flat.shape, bool)   # flat pockets enclosed by lightning, outside the frame body
    outside[FRAME_Y + 6:FRAME_Y + 250, FRAME_X + 4:FRAME_X + 190] = False
    bg |= (flat > 0) & outside
    near = cv2.dilate(bg.astype('uint8'), np.ones((7, 7), np.uint8)) > 0
    alpha = np.ones(flat.shape)
    soft = near & ~bg
    alpha[soft] = np.clip(diff[soft] / 48, 0, 1)
    alpha[bg] = 0
    a = alpha[..., None]
    colour = np.where(a > 0, (rgb - (1 - a) * BG) / np.maximum(a, 1e-3), 0)
    return np.dstack([np.clip(colour, 0, 255), alpha * 255]).round().astype('uint8')


def erase(rgb, box, threshold):
    x0, y0, x1, y1 = box
    mask = np.zeros(rgb.shape[:2], np.uint8)
    region = rgb[y0:y1, x0:x1].astype(int)
    mask[y0:y1, x0:x1] = (region.min(2) > threshold) * 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    return cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)


reference = crop_card(SOURCE / 'card-01.png')
label = reference[211:230, 55:80]          # printed "25HR" tag before the name
css = ['/* 25HR (25 HEROES): normalized source cards with live OVR/name/upgrade badges. */',
       '.rarity-dot.hr25{background:#e8327e}',
       '.player-card.face-art.season-hr25{aspect-ratio:259/282}',
       '.player-card.face-art.season-hr25>.face-art-img{filter:drop-shadow(0 0 5px #ff5fc455)}',
       '.season-hr25[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-hr25 .face-art-ovr{left:28.09%;top:16.67%;font-size:11.95cqw;color:#ffffff;letter-spacing:-.03em;text-shadow:0 .03em .1em #5a0a2e99}',
       '.season-hr25 .face-art-level{left:18.92%;top:60.64%;width:18.53%;height:10.28%;transform:none;object-fit:fill}',
       '.season-hr25{--name-size:8cqw;--name-color:#ffffff}',
       '.season-hr25 .face-art-name{text-shadow:0 .05em .14em #4a0626aa}',
       '[data-tone=hr25]{--shop-tone:#e8327e;--shop-tone2:#ff9ad5}',
       '.season-tag-hr25{color:#ff6fb5}',
       '.reveal-hr25 .reveal-panel{--led:#ff5fc4;--led2:#5a0a2e;border-color:#ff9ad566}',
       '.reveal-hr25 .reveal-stats dt{color:#ffffff}',
       '.reveal-hr25 .reveal-podium{background:linear-gradient(180deg,#b0124f,#3d0420);border-top-color:#ff9ad5}',
       '.reveal-hr25 .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    rgb = crop_card(SOURCE / f'card-{i:02d}.png')
    _, _, (lx, _), _ = cv2.minMaxLoc(cv2.matchTemplate(rgb[200:240, 20:200], label, cv2.TM_SQDIFF_NORMED))
    lx += 20
    nx = lx + 30
    rgb = erase(rgb, (28, 47, 74, 76), 150)            # printed OVR
    rgb = erase(rgb, (nx - 2, 206, 190, 234), 110)      # printed name
    rgba = cut_background(rgb)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(rgba), (OFF_X, 0))
    face = f'/assets/hr25-{pid}-card.webp'
    canvas.save(ASSETS / Path(face).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / 259 * 100:.2f}%;--nw:{(OFF_X + 192 - nx) / 259 * 100:.2f}%;--ny:{228 / 282 * 100:.2f}%' + '}')
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='hr25', wage=int(row['wage']), cardFace=face, teamLogo='/assets/hr25-team.webp'))

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'hr25-back.png')
pack.save(ASSETS / 'hr25-back.webp', lossless=True)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.save(ASSETS / 'hr25-team.png')
crest.save(ASSETS / 'hr25-team.webp', lossless=True)
Image.open(SOURCE / 'tunnel.png').convert('RGB').save(ASSETS / 'hr25-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// 25HR source order and +1 prices: scripts/data/hr25.csv.', 'export const hr25Players: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/hr25Players.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/hr25-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Imported {len(players)} 25HR players and unique faces, pack/tunnel/team assets.')
