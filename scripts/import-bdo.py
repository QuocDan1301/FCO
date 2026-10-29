"""Import supplied BDO game assets and register their card geometry.

Usage: python scripts/import-bdo.py <BDO image folder> [Ferdinand PNG]
The numbered source screenshots are never modified. IDs follow CSV row order.
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
FERDINAND = Path(sys.argv[2]) if len(sys.argv) > 2 else None
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/bdo.csv').open(encoding='utf-8'), delimiter='|'))
NATIONS = dict(NL='Hà Lan', BR='Brazil', FR='Pháp', PT='Bồ Đào Nha', DE='Đức', UA='Ukraine',
               NI='Bắc Ireland', BG='Bulgaria', IT='Ý', CZ='Séc', EN='Anh', SC='Scotland',
               DK='Đan Mạch', RO='Romania', ES='Tây Ban Nha', HU='Hungary', CI='Bờ Biển Ngà',
               HR='Croatia', CM='Cameroon', FI='Phần Lan', BE='Bỉ', WL='Wales', UY='Uruguay',
               AR='Argentina', SE='Thụy Điển', IE='Ireland', RS='Serbia', NG='Nigeria', GH='Ghana')


def transparent_edges(im):
    """Key only the pale background connected to the outside of an opaque PNG."""
    a = np.array(im.convert('RGBA'))
    if a[:, :, 3].min() < 10:
        return Image.fromarray(a)
    pale = (a[:, :, :3].min(2) > 210).astype('uint8')
    count, labels, stats, _ = cv2.connectedComponentsWithStats(pale)
    edges = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    a[np.isin(labels, edges[edges != 0]), 3] = 0
    return Image.fromarray(a)


def main_component(im):
    alpha = np.array(im.getchannel('A'))
    _, _, stats, _ = cv2.connectedComponentsWithStats((alpha > 30).astype('uint8'))
    x, y, w, h, _ = max(stats[1:], key=lambda s: s[4])
    return im.crop((x, y, x + w, y + h))


css = ['/* BDO: source cards aligned to one 259 × 282 frame; names and OVR are live HTML. */',
       '.rarity-dot.bdo{background:#d6b253}',
       '.player-card.face-art.season-bdo{aspect-ratio:259/282}',
       '.season-bdo[data-level="1"] .face-art-level{visibility:hidden}',
       '.season-bdo .face-art-ovr{left:27.8%;top:16.67%;font-size:11.4cqw;color:#fff3c6;letter-spacing:-.03em;text-shadow:0 .03em .1em #000b}',
       '.season-bdo .face-art-level{left:18.53%;top:60.28%;width:18.53%;height:10.28%;transform:none;object-fit:fill}',
       '.season-bdo{--name-size:7.33cqw;--name-color:#fafaf5}',
       '.season-bdo .face-art-name{text-shadow:0 .05em .14em #000c}',
       '.player-card.bdo{background:#211d16;color:#f7e5b7}',
       '.player-card.bdo .card-inside{background:#1d1a14}',
       '[data-tone=bdo]{--shop-tone:#d6b253;--shop-tone2:#f1dca0}',
       '.season-tag-bdo{color:#e6c76d}',
       '.reveal-bdo .reveal-panel{--led:#c4a254;--led2:#211d16;border-color:#f1dca066}',
       '.reveal-bdo .reveal-stats dt,.reveal-bdo .reveal-podium span{color:#f7e5b7}',
       '.reveal-bdo .reveal-podium{background:#292319;border-top-color:#f1dca0}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = 2020 + i
    row['flag'] = {'GB-NIR': 'NI', 'GB-SCT': 'SC', 'GB-WLS': 'WL'}.get(row['flag'], row['flag'])
    source = FERDINAND if i == 99 else next(SOURCE.glob(f'{i:02d}-*-tach-nen.png'))
    face = None
    if source and source.exists():
        card = main_component(transparent_edges(Image.open(source)))
        # All supplied cards share the same frame. Standardize its size, preserve alpha.
        card = card.resize((178, 277), Image.Resampling.LANCZOS)
        rgba = np.array(card)
        rgb = rgba[:, :, :3].copy()
        # OVR uses the dark rectangle at upper left; remove only the pale letter ink.
        mask = np.zeros((277, 178), np.uint8)
        region = rgb[44:74, 8:51]
        mask[44:74, 8:51] = (region.min(2) > 135).astype('uint8') * 255
        mask = cv2.dilate(mask, np.ones((2, 2), np.uint8))
        rgb = cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA)
        # Match the identical printed BDO badge; some outlines touch the card border.
        reference = main_component(transparent_edges(Image.open(next(SOURCE.glob('01-*-tach-nen.png'))))).resize((178, 277), Image.Resampling.LANCZOS)
        template = np.array(reference)[:, :, :3][207:227, 37:61]
        match = cv2.matchTemplate(rgb[198:236, :115], template, cv2.TM_SQDIFF_NORMED)
        _, _, (bx, dy), _ = cv2.minMaxLoc(match)
        by, bw, bh = dy + 198, 24, 20
        nx = bx + bw + 4
        # Remove bright name glyphs, retaining the original black/gold frame detail.
        name_mask = np.zeros((277, 178), np.uint8)
        region = rgb[by - 2:by + bh + 4, nx:174]
        name_mask[by - 2:by + bh + 4, nx:174] = (region.min(2) > 145).astype('uint8') * 255
        name_mask = cv2.dilate(name_mask, np.ones((2, 2), np.uint8))
        rgb = cv2.inpaint(rgb, name_mask, 3, cv2.INPAINT_TELEA)
        rgba[:, :, :3] = rgb
        canvas = Image.new('RGBA', (259, 282))
        canvas.alpha_composite(Image.fromarray(rgba), (40, 2))
        face = f'bdo-{pid}-card.webp'
        canvas.save(ASSETS / face, lossless=True)
        css.append(f'.face-{pid}' + '{' + f'--nx:{(40 + nx) / 259 * 100:.2f}%;--nw:{(174 - nx) / 259 * 100:.2f}%;--ny:{(2 + by + bh) / 282 * 100:.2f}%' + '}')
    else:
        print(f'Missing correct source: {row["name"]}; use built-in silhouette until supplied.')
    fields = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']],
                  flag=row['flag'], club='Ballon d’Or', tier='bdo', wage=int(row['wage']),
                  teamLogo='/assets/bdo-team.webp')
    if face:
        fields['cardFace'] = f'/assets/{face}'
    players.append(fields)

for source, dest in [('Code_Generated_Image.png', 'bdo-back'), ('Screenshot 2026-10-28 102850.png', 'bdo-team')]:
    im = transparent_edges(Image.open(SOURCE / source))
    im.save(ASSETS / f'{dest}.png')
    im.save(ASSETS / f'{dest}.webp', lossless=True)
shutil.copyfile(SOURCE / 'Nền vàng đen sang trọng.png', ASSETS / 'bdo-tunnel.png')

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '',
         '// 108 BDO players; source order, wages and +1 prices: scripts/data/bdo.csv.',
         '// Screenshot 99 duplicates Essien; use the separately supplied Ferdinand image.',
         'export const bdoPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        text = json.dumps(value, ensure_ascii=False)
        if key in ('teamLogo', 'cardFace'):
            text = f'asset({text})'
        fields.append(f'{key}: {text}')
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/bdoPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/bdo-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Imported {len(players)} BDO players and {sum("cardFace" in p for p in players)} card images.')
