"""Import HG source assets and roster. Source images are never changed.
Usage: python scripts/import-hg.py <HG directory>
All 116 supplied HG card faces are imported in screenshot order.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/hg.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 116
NATIONS = dict(FR='Pháp', DE='Đức', AR='Argentina', NL='Hà Lan', IT='Ý', PT='Bồ Đào Nha', ES='Tây Ban Nha', KR='Hàn Quốc', BE='Bỉ', BR='Brazil', SE='Thụy Điển', MX='Mexico', UY='Uruguay', EN='Anh', MA='Ma-rốc', GA='Gabon', CZ='Séc', NG='Nigeria', CI='Bờ Biển Ngà', AL='Albania', HR='Croatia', AM='Armenia', RO='Romania', RS='Serbia', CH='Thụy Sĩ', CO='Colombia', DK='Đan Mạch', SI='Slovenia', US='Mỹ', EC='Ecuador', BF='Burkina Faso', BA='Bosnia và Herzegovina', CM='Cameroon', AT='Áo', GH='Ghana', PL='Ba Lan', TR='Thổ Nhĩ Kỳ', SC='Scotland', NI='Bắc Ireland', TN='Tunisia')


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
template = np.array(reference)[:, :, :3][208:228, 35:60]
logos = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
css = ['/* HG: normalized source cards with live OVR/name/upgrade badges. */',
       '.rarity-dot.hg{background:#b454ed}',
       '.player-card.face-art.season-hg{aspect-ratio:259/282}',
       '.season-hg[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-hg .face-art-ovr{left:26.64%;top:16.67%;font-size:11.6cqw;color:#efff36;letter-spacing:-.03em;text-shadow:0 .03em .1em #251326}',
       '.season-hg .face-art-level{left:18.15%;top:60.28%;width:18.92%;height:10.64%;transform:none;object-fit:fill}',
       '.season-hg{--name-size:7.6cqw;--name-color:#3d4045}',
       '[data-tone=hg]{--shop-tone:#b454ed;--shop-tone2:#ffd14a}',
       '.season-tag-hg{color:#cd8fff}',
       '.reveal-hg .reveal-panel{--led:#b454ed;--led2:#32113e;border-color:#ffd14a66}',
       '.reveal-hg .reveal-stats dt{color:#efff36}',
       '.reveal-hg .reveal-podium{background:linear-gradient(180deg,#62216e,#211027);border-top-color:#ffd14a}',
       '.reveal-hg .reveal-podium span{color:#efff36}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 2861 + i
    p = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'], club=row['club'], tier='hg', wage=int(row['wage']))
    team = '/assets/hg-team.webp' if row['club'] == 'Tự do' else logos.get(row['club'])
    source = next(SOURCE.glob(f'{i:02d}-*-tach-nen.png'))
    card = component(transparent_edges(Image.open(source))).resize((174, 278), Image.Resampling.LANCZOS)
    a = np.array(card)
    rgb = a[:, :, :3].copy()
    _, _, (bx, dy), _ = cv2.minMaxLoc(cv2.matchTemplate(rgb[198:234, :130], template, cv2.TM_SQDIFF_NORMED))
    by, nx = dy + 198, bx + 27
    if not team:
        crest = card.crop((99, 234, 135, 260))
        team = f'/assets/hg-{pid}-team.webp'
        crest.save(ASSETS / Path(team).name, lossless=True)
    mask = np.zeros((278, 174), np.uint8)
    for y0, y1, x0, x1 in [(43, 76, 7, 52)]:
        mask[y0:y1, x0:x1] = 255
    a[:, :, :3] = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    a[by:by + 22, nx:168, :3] = (245, 245, 245)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(a), (42, 2))
    p['cardFace'] = f'/assets/hg-{pid}-card.webp'
    canvas.save(ASSETS / Path(p['cardFace']).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(42 + nx) / 259 * 100:.2f}%;--nw:{(168 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + 20) / 282 * 100:.2f}%' + '}')
    p['teamLogo'] = team or '/assets/hg-team.webp'
    players.append(p)

for source, dest in [('Gemini_Generated_Image_7ze7ub7ze7ub7ze7.png', 'hg-back'), ('Screenshot 2026-10-28 143201.png', 'hg-team')]:
    im = transparent_edges(Image.open(SOURCE / source))
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
Image.open(SOURCE / 'Dải ánh kim tím hổ phách.png').save(ASSETS / 'hg-tunnel.webp', quality=94)
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// HG source order and +1 prices: scripts/data/hg.csv.', 'export const hgPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/hgPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/hg-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print('Imported 116 HG players and unique faces, pack/tunnel/team assets.')
