"""Import LE source assets and roster. Source images are never changed.
Usage: python scripts/import-le.py <LE directory>
Image 70 repeats Muniain; Pedro uses the replacement screenshot supplied separately.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/le.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 165
NATIONS = dict(FR='Pháp', DE='Đức', AR='Argentina', NL='Hà Lan', IT='Ý', PT='Bồ Đào Nha', ES='Tây Ban Nha', KR='Hàn Quốc', BE='Bỉ', BR='Brazil', SE='Thụy Điển', MX='Mexico', UY='Uruguay', EN='Anh', MA='Ma-rốc', GA='Gabon', CZ='Séc', NG='Nigeria', CI='Bờ Biển Ngà', AL='Albania', HR='Croatia', AM='Armenia', RO='Romania', RS='Serbia', CH='Thụy Sĩ', CO='Colombia', DK='Đan Mạch', SI='Slovenia', US='Mỹ', EC='Ecuador', BF='Burkina Faso', BA='Bosnia và Herzegovina', CM='Cameroon')


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


reference = component(Image.open(next(SOURCE.glob('01-*-tach-nen.png')))).resize((190, 278), Image.Resampling.LANCZOS)
template = np.array(reference)[:, :, :3][208:228, 28:53]
logos = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
css = ['/* LE: normalized source cards; live OVR/name/upgrade badge. */',
       '.rarity-dot.le{background:#e7c874}',
       '.player-card.face-art.season-le{aspect-ratio:259/282}',
       '.season-le[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-le .face-art-ovr{left:28.2%;top:16.67%;font-size:11.6cqw;color:#f5d98d;letter-spacing:-.03em;text-shadow:0 .03em .1em #00171c}',
       '.season-le .face-art-level{left:19.3%;top:60.28%;width:18.15%;height:10.64%;transform:none;object-fit:fill}',
       '.season-le{--name-size:7.6cqw;--name-color:#f5d98d}',
       '.season-le .face-art-name{text-shadow:0 .05em .14em #00171c}',
       '[data-tone=le]{--shop-tone:#e7c874;--shop-tone2:#12a59b}',
       '.season-tag-le{color:#e7c874}',
       '.reveal-le .reveal-panel{--led:#e7c874;--led2:#00383e;border-color:#e7c87466}',
       '.reveal-le .reveal-stats dt{color:#f5d98d}',
       '.reveal-le .reveal-podium{background:linear-gradient(180deg,#006c70,#001c23);border-top-color:#e7c874}',
       '.reveal-le .reveal-podium span{color:#f5d98d}',
       '.player-card.le{background:linear-gradient(145deg,#c7a453,#00383e 28%,#00151d 70%,#b4954c);border-color:#e7c874}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 2696 + i
    p = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'], club=row['club'], tier='le', wage=int(row['wage']))
    team = '/assets/le-team.webp' if row['club'] == 'Tự do' else logos.get(row['club'])
    source = SOURCE.parent / 'Screenshots/Screenshot 2026-10-28 163050.png' if i == 70 else next(SOURCE.glob(f'{i:02d}-*-tach-nen.png'))
    card = component(transparent_edges(Image.open(source))).resize((190, 278), Image.Resampling.LANCZOS)
    a = np.array(card)
    rgb = a[:, :, :3].copy()
    _, _, (bx, dy), _ = cv2.minMaxLoc(cv2.matchTemplate(rgb[198:234, :130], template, cv2.TM_SQDIFF_NORMED))
    by, nx = dy + 198, bx + 27
    if not team:
        crest = card.crop((96, 234, 132, 260))
        team = f'/assets/le-{pid}-team.webp'
        crest.save(ASSETS / Path(team).name, lossless=True)
    mask = np.zeros((278, 190), np.uint8)
    for y0, y1, x0, x1 in [(43, 76, 16, 59), (by, by + 22, nx, 181)]:
        mask[y0:y1, x0:x1] = 255
    a[:, :, :3] = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(a), (34, 2))
    p['cardFace'] = f'/assets/le-{pid}-card.webp'
    canvas.save(ASSETS / Path(p['cardFace']).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(34 + nx) / 259 * 100:.2f}%;--nw:{(181 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + 20) / 282 * 100:.2f}%' + '}')
    p['teamLogo'] = team or '/assets/le-team.webp'
    players.append(p)

for source, dest in [('Code_Generated_Image.png', 'le-back'), ('Screenshot 2026-10-28 140816.png', 'le-team')]:
    im = transparent_edges(Image.open(SOURCE / source))
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
Image.open(SOURCE / 'Quỹ đạo vàng trên biển ngọc.png').save(ASSETS / 'le-tunnel.webp', quality=94)
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// LE source order and +1 prices: scripts/data/le.csv. Pedro uses the replacement screenshot.', 'export const lePlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/lePlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/le-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print('Imported 165 LE players and unique faces, pack/tunnel/team assets.')
