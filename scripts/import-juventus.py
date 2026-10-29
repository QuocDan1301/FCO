"""Import JUVENTUS source assets and roster. Source images are never changed.
Usage: python scripts/import-juventus.py <JUVENTUS directory>
All 14 supplied JUVENTUS card faces are imported in screenshot order.
"""
import csv
import json
from pathlib import Path
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/juventus.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 14
NATIONS = dict(FR='Pháp', DE='Đức', AR='Argentina', NL='Hà Lan', IT='Ý', PT='Bồ Đào Nha', ES='Tây Ban Nha', KR='Hàn Quốc', BE='Bỉ', BR='Brazil', SE='Thụy Điển', MX='Mexico', UY='Uruguay', EN='Anh', MA='Ma-rốc', GA='Gabon', CZ='Séc', NG='Nigeria', CI='Bờ Biển Ngà', AL='Albania', HR='Croatia', AM='Armenia', RO='Romania', RS='Serbia', CH='Thụy Sĩ', CO='Colombia', DK='Đan Mạch', SI='Slovenia', US='Mỹ', EC='Ecuador', BF='Burkina Faso', BA='Bosnia và Herzegovina', CM='Cameroon', AT='Áo', GH='Ghana', PL='Ba Lan', TR='Thổ Nhĩ Kỳ', SC='Scotland', NI='Bắc Ireland', TN='Tunisia', WL='Wales', HU='Hungary', IE='Ireland', UA='Ukraine', NO='Na Uy', SN='Senegal', ME='Montenegro', CL='Chile', DZ='Algeria', SK='Slovakia', FI='Phần Lan', BG='Bulgaria', IS='Iceland', RU='Nga')


def component(im):
    im = im.convert('RGBA')
    _, _, stats, _ = cv2.connectedComponentsWithStats((np.array(im)[:, :, 3] > 30).astype('uint8'))
    x, y, w, h, _ = max(stats[1:], key=lambda s: s[4])
    return im.crop((x, y, x + w, y + h))


def transparent_edges(im):
    a = np.array(im.convert('RGBA'))
    if a[:, :, 3].min() < 10:
        return Image.fromarray(a)
    _, labels = cv2.connectedComponents((a[:, :, :3].min(2) > 210).astype('uint8'))
    edges = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    a[np.isin(labels, edges[edges != 0]), 3] = 0
    return Image.fromarray(a)


reference = component(Image.open(next(SOURCE.glob('01-*-tach-nen.png')))).resize((174, 278), Image.Resampling.LANCZOS)
template = np.array(reference)[:, :, :3][208:228, 40:65]
logos = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
css = ['/* JUVENTUS: normalized source cards with live OVR/name/upgrade badges. */',
       '.rarity-dot.juventus{background:#bfc0bd}',
       '.player-card.face-art.season-juventus{aspect-ratio:259/282}',
       '.season-juventus[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-juventus .face-art-ovr{left:26.64%;top:16.67%;font-size:11.6cqw;color:#ffffff;letter-spacing:-.03em;text-shadow:0 .03em .1em #0b1459}',
       '.season-juventus .face-art-level{left:18.15%;top:60.28%;width:18.92%;height:10.64%;transform:none;object-fit:fill}',
       '.season-juventus{--name-size:7.6cqw;--name-color:#3d4045}',
       '[data-tone=juventus]{--shop-tone:#bfc0bd;--shop-tone2:#e2e1da}',
       '.season-tag-juventus{color:#cd8fff}',
       '.reveal-juventus .reveal-panel{--led:#bfc0bd;--led2:#0b1459;border-color:#e2e1da66}',
       '.reveal-juventus .reveal-stats dt{color:#ffffff}',
       '.reveal-juventus .reveal-podium{background:linear-gradient(180deg,#172bb8,#080f4a);border-top-color:#e2e1da}',
       '.reveal-juventus .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 3722 + i
    p = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'], club=row['club'], tier='juventus', wage=int(row['wage']))
    team = '/assets/juventus-team.webp' if row['club'] == 'Tự do' else logos.get(row['club'])
    source = next(SOURCE.glob(f'{i:02d}-*-tach-nen.png'))
    card = component(transparent_edges(Image.open(source))).resize((174, 278), Image.Resampling.LANCZOS)
    a = np.array(card)
    rgb = a[:, :, :3].copy()
    _, _, (bx, dy), _ = cv2.minMaxLoc(cv2.matchTemplate(rgb[198:234, :130], template, cv2.TM_SQDIFF_NORMED))
    by, nx = dy + 198, bx + 27
    if not team:
        crest = card.crop((99, 234, 135, 260))
        team = f'/assets/juventus-{pid}-team.webp'
        crest.save(ASSETS / Path(team).name, lossless=True)
    mask = np.zeros((278, 174), np.uint8)
    for y0, y1, x0, x1 in [(43, 76, 7, 52)]:
        mask[y0:y1, x0:x1] = 255
    a[:, :, :3] = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    a[by:by + 22, nx:168, :3] = (245, 245, 245)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(a), (42, 2))
    p['cardFace'] = f'/assets/juventus-{pid}-card.webp'
    canvas.save(ASSETS / Path(p['cardFace']).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(42 + nx) / 259 * 100:.2f}%;--nw:{(168 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + 20) / 282 * 100:.2f}%' + '}')
    p['teamLogo'] = team or '/assets/juventus-team.webp'
    players.append(p)

for source, dest in [('Screenshot 2026-10-29 121958.png', 'juventus-back'), ('Screenshot 2026-10-29 121458.png', 'juventus-team')]:
    im = transparent_edges(Image.open(SOURCE / source))
    if dest == 'juventus-team':
        im = im.crop(im.getbbox())
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
Image.open(SOURCE / 'Vân bạc trên đá đen.png').save(ASSETS / 'juventus-tunnel.webp', quality=94)
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// JUVENTUS source order and +1 prices: scripts/data/juventus.csv.', 'export const juventusPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/juventusPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/juventus-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print('Imported 14 JUVENTUS players and unique faces, pack/tunnel/team assets.')
