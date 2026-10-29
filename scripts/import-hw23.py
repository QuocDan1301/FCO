"""Import the supplied 195 23HW screenshots. Original files remain untouched.
Usage: python scripts/import-hw23.py <23HW image directory>
"""
import csv
import json
from pathlib import Path
import shutil
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/hw23.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 195
NATIONS = dict(PT='Bồ Đào Nha', HU='Hungary', BR='Brazil', NL='Hà Lan', EN='Anh', RS='Serbia', KR='Hàn Quốc',
               CH='Thụy Sĩ', EC='Ecuador', SN='Senegal', AR='Argentina', TN='Tunisia', TR='Thổ Nhĩ Kỳ', AT='Áo',
               DE='Đức', PY='Paraguay', SR='Suriname', XK='Kosovo', DK='Đan Mạch', FR='Pháp', CM='Cameroon',
               JM='Jamaica', JP='Nhật Bản', HR='Croatia', ES='Tây Ban Nha', IT='Ý', CZ='Séc', NO='Na Uy', SC='Scotland',
               GH='Ghana', DZ='Algeria', NG='Nigeria', SE='Thụy Điển', BF='Burkina Faso', SI='Slovenia', BE='Bỉ',
               ML='Mali', BA='Bosnia và Herzegovina', RO='Romania', CO='Colombia', US='Mỹ', UY='Uruguay', WL='Wales',
               GE='Georgia', UA='Ukraine', TG='Togo', MA='Ma-rốc')


def transparent_edges(im):
    rgba = np.array(im.convert('RGBA'))
    if rgba[:, :, 3].min() < 10:
        return Image.fromarray(rgba)
    pale = (rgba[:, :, :3].min(2) > 210).astype('uint8')
    _, labels = cv2.connectedComponents(pale)
    edges = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    rgba[np.isin(labels, edges[edges != 0]), 3] = 0
    return Image.fromarray(rgba)


def main_component(im):
    _, _, stats, _ = cv2.connectedComponentsWithStats((np.array(im.getchannel('A')) > 30).astype('uint8'))
    x, y, w, h, _ = max(stats[1:], key=lambda s: s[4])
    return im.crop((x, y, x + w, y + h))


reference = main_component(Image.open(next(SOURCE.glob('01-*-tach-nen.png')))).resize((174, 278), Image.Resampling.LANCZOS)
template = np.array(reference)[:, :, :3][210:230, 9:35]
club_logos = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
css = ['/* 23HW: uniform source frame, live OVR/name and upgrade badge. */',
       '.rarity-dot.hw23{background:#e0f044}',
       '.player-card.face-art.season-hw23{aspect-ratio:259/282}',
       '.season-hw23[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-hw23 .face-art-ovr{left:27.8%;top:17.73%;font-size:11.4cqw;color:#e7ef75;letter-spacing:-.03em;text-shadow:0 .03em .1em #201128}',
       '.season-hw23 .face-art-level{left:18.53%;top:60.28%;width:18.53%;height:10.28%;transform:none;object-fit:fill}',
       '.season-hw23{--name-size:7.33cqw;--name-color:#3d4045}',
       '[data-tone=hw23]{--shop-tone:#deea49;--shop-tone2:#ee66ba}',
       '.season-tag-hw23{color:#deea49}',
       '.reveal-hw23 .reveal-panel{--led:#deea49;--led2:#29112c;border-color:#deea4966}',
       '.reveal-hw23 .reveal-stats dt{color:#ebf389}',
       '.reveal-hw23 .reveal-podium{background:#29112c;border-top-color:#deea49}',
       '.reveal-hw23 .reveal-podium span{color:#ebf389}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 2128 + i
    source = next(SOURCE.glob(f'{i:02d}-*-tach-nen.png'))
    card = main_component(Image.open(source)).resize((174, 278), Image.Resampling.LANCZOS)
    rgba = np.array(card)
    rgb = rgba[:, :, :3].copy()
    # Team crests are supplied on each card. Use the existing full-resolution asset when known;
    # otherwise preserve a crop of the exact printed crest instead of guessing another club.
    team = club_logos.get(row['club'])
    if not team:
        crest = transparent_edges(card.crop((100, 231, 137, 265)))
        # Discard the separate diagonal card border sometimes captured below a crest.
        pixels = np.array(crest)
        count, labels, stats, centers = cv2.connectedComponentsWithStats((pixels[:, :, 3] > 25).astype('uint8'))
        candidates = [label for label in range(1, count) if stats[label, 4] >= 8]
        if candidates:
            chosen = min(candidates, key=lambda label: (centers[label, 0] - 15) ** 2 + (centers[label, 1] - 17) ** 2)
            pixels[labels != chosen, 3] = 0
            crest = Image.fromarray(pixels)
        if crest.getbbox():
            crest = crest.crop(crest.getbbox())
        team = f'/assets/hw23-{pid}-team.webp'
        crest.save(ASSETS / Path(team).name, lossless=True)
    # Locate the season badge next to the name (name lengths shift its horizontal position).
    match = cv2.matchTemplate(rgb[198:236, :125], template, cv2.TM_SQDIFF_NORMED)
    _, _, (bx, dy), _ = cv2.minMaxLoc(match)
    by, bw, bh = dy + 198, 26, 20
    nx = bx + bw + 4
    # Clear printed letters only; the imported source alpha and colourful frame are retained.
    mask = np.zeros((278, 174), np.uint8)
    region = rgb[45:76, 7:52]
    yellow = (region[:, :, 0] > 160) & (region[:, :, 1] > 170) & (region[:, :, 2] > 40)
    mask[45:76, 7:52] = yellow.astype('uint8') * 255
    rgb = cv2.inpaint(rgb, cv2.dilate(mask, np.ones((2, 2), np.uint8)), 3, cv2.INPAINT_TELEA)
    # Interpolate the empty white panel above and below the original name. This also clears
    # light antialiasing around glyphs without smearing dark letter remnants into the panel.
    y0, y1 = by - 2, by + bh + 2
    top = rgb[y0 - 1, nx:170].astype(float)
    bottom = rgb[by + bh - 1:by + bh + 3, nx:170].max(axis=0).astype(float)
    for y in range(y0, y1):
        t = (y - y0 + 1) / (y1 - y0 + 1)
        rgb[y, nx:170] = np.round(top * (1 - t) + bottom * t).astype('uint8')
    rgba[:, :, :3] = rgb
    canvas = Image.new('RGBA', (259, 282))
    canvas.alpha_composite(Image.fromarray(rgba), (42, 2))
    face = f'/assets/hw23-{pid}-card.webp'
    canvas.save(ASSETS / Path(face).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(42 + nx) / 259 * 100:.2f}%;--nw:{(170 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + bh) / 282 * 100:.2f}%' + '}')
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']],
                        flag=row['flag'], club=row['club'], tier='hw23', wage=int(row['wage']), cardFace=face, teamLogo=team))

for source, dest in [('Code_Generated_Image.png', 'hw23-back'), ('Screenshot 2026-10-28 090646.png', 'hw23-team')]:
    im = transparent_edges(Image.open(SOURCE / source))
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
shutil.copyfile(SOURCE / 'Nền bóng đá neon bùng nổ.png', ASSETS / 'hw23-tunnel.png')
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '',
         '// 195 23 HARD WORKER cards, source order and screenshot prices: scripts/data/hw23.csv.',
         'export const hw23Players: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        text = json.dumps(value, ensure_ascii=False)
        if key in ('cardFace', 'teamLogo'):
            text = f'asset({text})'
        fields.append(f'{key}: {text}')
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/hw23Players.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/hw23-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Imported {len(players)} 23HW players, cards and their team crests.')
