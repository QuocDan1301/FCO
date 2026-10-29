"""Import LOL source assets and roster. Source images are never changed.
Usage: python scripts/import-lol.py <LOL directory>
All 90 supplied LOL card faces are imported in screenshot order.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/lol.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 90
NATIONS = dict(FR='Pháp', DE='Đức', AR='Argentina', NL='Hà Lan', IT='Ý', PT='Bồ Đào Nha', ES='Tây Ban Nha', KR='Hàn Quốc', BE='Bỉ', BR='Brazil', SE='Thụy Điển', MX='Mexico', UY='Uruguay', EN='Anh', MA='Ma-rốc', GA='Gabon', CZ='Séc', NG='Nigeria', CI='Bờ Biển Ngà', AL='Albania', HR='Croatia', AM='Armenia', RO='Romania', RS='Serbia', CH='Thụy Sĩ', CO='Colombia', DK='Đan Mạch', SI='Slovenia', US='Mỹ', EC='Ecuador', BF='Burkina Faso', BA='Bosnia và Herzegovina', CM='Cameroon', AT='Áo', GH='Ghana', PL='Ba Lan', TR='Thổ Nhĩ Kỳ', SC='Scotland', NI='Bắc Ireland', TN='Tunisia', WL='Wales', HU='Hungary', IE='Ireland', UA='Ukraine', NO='Na Uy', SN='Senegal', ME='Montenegro', CL='Chile', DZ='Algeria', CF='Cộng hòa Trung Phi', EG='Ai Cập', RU='Nga', GM='Gambia', XK='Kosovo', JP='Nhật Bản')


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


reference = component(Image.open(next(SOURCE.glob('01-Screenshot*-tach-nen.png')))).resize((174, 278), Image.Resampling.LANCZOS)
template = np.array(reference)[:, :, :3][208:228, 16:41]
logos = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
css = ['/* LOL: normalized source cards with live OVR/name/upgrade badges. */',
       '.rarity-dot.lol{background:#e22b97}',
       '.player-card.face-art.season-lol{aspect-ratio:259/282}',
       '.season-lol[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-lol .face-art-ovr{left:26.64%;top:16.67%;font-size:11.6cqw;color:#ff9cdb;letter-spacing:-.03em;text-shadow:0 .03em .1em #2b0a3c}',
       '.season-lol .face-art-level{left:18.15%;top:60.28%;width:18.92%;height:10.64%;transform:none;object-fit:fill}',
       '.season-lol{--name-size:7.6cqw;--name-color:#3d4045}',
       '[data-tone=lol]{--shop-tone:#e22b97;--shop-tone2:#b96afa}',
       '.season-tag-lol{color:#cd8fff}',
       '.reveal-lol .reveal-panel{--led:#e22b97;--led2:#2b0a3c;border-color:#b96afa66}',
       '.reveal-lol .reveal-stats dt{color:#ff9cdb}',
       '.reveal-lol .reveal-podium{background:linear-gradient(180deg,#5a1c82,#1c082c);border-top-color:#b96afa}',
       '.reveal-lol .reveal-podium span{color:#ff9cdb}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 3252 + i
    p = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'], club=row['club'], tier='lol', wage=int(row['wage']))
    team = '/assets/lol-team.webp' if row['club'] == 'Tự do' else logos.get(row['club'])
    source = next(SOURCE.glob(f'{i:02d}-Screenshot*-tach-nen.png'))
    card = component(transparent_edges(Image.open(source))).resize((174, 278), Image.Resampling.LANCZOS)
    a = np.array(card)
    rgb = a[:, :, :3].copy()
    _, _, (bx, dy), _ = cv2.minMaxLoc(cv2.matchTemplate(rgb[198:234, :130], template, cv2.TM_SQDIFF_NORMED))
    by, nx = dy + 198, bx + 27
    if not team:
        crest = card.crop((99, 234, 135, 260))
        team = f'/assets/lol-{pid}-team.webp'
        crest.save(ASSETS / Path(team).name, lossless=True)
    mask = np.zeros((278, 174), np.uint8)
    for y0, y1, x0, x1 in [(43, 76, 7, 52)]:
        mask[y0:y1, x0:x1] = 255
    a[:, :, :3] = cv2.inpaint(rgb, mask, 4, cv2.INPAINT_TELEA)
    a[by:by + 22, nx:168, :3] = (245, 245, 245)
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(a), (42, 2))
    p['cardFace'] = f'/assets/lol-{pid}-card.webp'
    canvas.save(ASSETS / Path(p['cardFace']).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(42 + nx) / 259 * 100:.2f}%;--nw:{(168 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + 20) / 282 * 100:.2f}%' + '}')
    p['teamLogo'] = team or '/assets/lol-team.webp'
    players.append(p)

free = component(Image.open(next(SOURCE.glob('01-Screenshot*-tach-nen.png')))).resize((174, 278), Image.Resampling.LANCZOS)
free = transparent_edges(free.crop((102, 233, 134, 262)))
free.crop(free.getbbox()).save(ASSETS / 'lol-team.webp', lossless=True)
for source, dest in [('01-Gemini_Generated_Image_kltsnskltsnsklts-tach-nen.png', 'lol-back')]:
    im = transparent_edges(Image.open(SOURCE / source))
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
Image.open(SOURCE / 'Tinh thể tím hồng chuyển động.png').save(ASSETS / 'lol-tunnel.webp', quality=94)
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// LOL source order and +1 prices: scripts/data/lol.csv.', 'export const lolPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/lolPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/lol-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print('Imported 90 LOL players and unique faces, pack/tunnel/team assets.')
