"""Nhập mùa WS (WINNING STREAK). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-ws.py <thư mục nguồn>
Thư mục có card-01.png … card-98.png (đúng thứ tự scripts/data/ws.csv, nền trong suốt, khung thẻ 179×283), logo.png (huy hiệu Winning Streak),
tunnel.png (nền hầm) và pack.png (ảnh gói).
Thẻ in logo CLB thật dùng logo CLB (clubLogos.json; CLB chưa có logo thì cắt logo in trên thẻ); thẻ "Tự do" in huy hiệu Winning Streak nên dùng huy hiệu làm logo đội.
Số OVR (trắng trên nền xanh) và tên in sẵn (trắng trên nền đồng) được xoá để game tự vẽ; ô cấp xám ghi "1" giữ nguyên (thẻ +1).
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/ws.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 98
FIRST_ID = 3985
NATIONS = dict(AR='Argentina', PT='Bồ Đào Nha', BR='Brazil', BE='Bỉ', PL='Ba Lan', UY='Uruguay', FR='Pháp', NL='Hà Lan', ES='Tây Ban Nha', CM='Cameroon',
               SN='Senegal', IT='Ý', DE='Đức', EN='Anh', NO='Na Uy', EG='Ai Cập', CL='Chile', BA='Bosnia và Herzegovina', WL='Wales', SE='Thụy Điển',
               GE='Georgia', KR='Hàn Quốc', CA='Canada', NG='Nigeria', HR='Croatia', RS='Serbia', IE='Ireland', SC='Scotland', AT='Áo', GH='Ghana',
               CI='Bờ Biển Ngà', CZ='Séc')
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
# CLB chưa có trong clubLogos.json: logo có sẵn của mùa khác hoặc cắt từ thẻ (x0, y0, x1, y1 trên thẻ 179×283).
EXTRA_LOGOS = {'Real Oviedo': '/assets/le-2847-team.webp'}
CUT_LOGO = {'CF Montréal': (110, 247, 128, 265)}
CARD_W, CARD_H = 179, 283
CANVAS_W, CANVAS_H = 266, 287
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 2
OVR_BOX = (46, 78, 10, 56)      # y0, y1, x0, x1: số OVR trắng trên nền xanh
NAME_BAND = (209, 233)          # y0, y1: dải tên trắng trên nền đồng
NAME_RIGHT = 165
NAME_BASELINE = 227


def crop_card(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 40)
    x, y = xs.min(), ys.min()
    card = a[y:y + CARD_H, x:x + CARD_W]
    if card.shape[0] < CARD_H:
        card = np.vstack([card, np.zeros((CARD_H - card.shape[0], card.shape[1], 4), np.uint8)])
    if card.shape[1] < CARD_W:
        card = np.hstack([card, np.zeros((CARD_H, CARD_W - card.shape[1], 4), np.uint8)])
    assert card.shape[:2] == (CARD_H, CARD_W), path
    return card.copy()


def inpaint(card, mask, grow=1):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8), iterations=grow)
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 3, cv2.INPAINT_TELEA)


def white(part, lo=165, spread=70):
    return (part.min(2) > lo) & (part.max(2) - part.min(2) < spread)


css = ['/* WS (WINNING STREAK): tạo bởi scripts/import-ws.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.ws{background:#d6a84a}',
       f'.player-card.face-art.season-ws{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-ws>.face-art-img{filter:drop-shadow(0 0 5px #3a6fd833)}',
       '.season-ws[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-ws .face-art-ovr{{left:{(OFF_X + 31) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 45.5) / CANVAS_H * 100:.2f}%;font-size:11.7cqw;color:#fbf6e8;letter-spacing:-.02em;text-shadow:0 .03em .1em #061a44}}',
       f'.season-ws .face-art-level{{left:{(OFF_X + 10) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 172) / CANVAS_H * 100:.2f}%;width:{45 / CANVAS_W * 100:.2f}%;height:{28 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-ws{--name-size:7.15cqw;--name-color:#f6f1e4}',
       '.season-ws .face-art-name{text-shadow:0 .05em .14em #000c}',
       '[data-tone=ws]{--shop-tone:#d6a84a;--shop-tone2:#1c3a7a}',
       '.season-tag-ws{color:#e8c06a}',
       '.reveal-ws .reveal-panel{--led:#e8c06a;--led2:#0b1a3d;border-color:#e8c06a66}',
       '.reveal-ws .reveal-stats dt{color:#ffffff}',
       '.reveal-ws .reveal-podium{background:linear-gradient(180deg,#1c3a7a,#0b1a3d);border-top-color:#e8c06a}',
       '.reveal-ws .reveal-podium span{color:#ffffff}']
players = []
report = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    raw = card.copy()
    rgb = card[..., :3].astype(int)
    # OVR trắng.
    y0, y1, x0, x1 = OVR_BOX
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = white(rgb[y0:y1, x0:x1])
    inpaint(card, ovr)
    # Nhãn WS: ô nền xanh đậm viền vàng đứng trước tên; tên bắt đầu sau mép trái nhãn ~30 px.
    y0, y1 = NAME_BAND
    band = raw[y0:y1, :, :3].astype(int)
    blue = ((band[..., 2] - band[..., 0] > 20) & (band[..., 2] > 60)).sum(0)
    tag = next(x for x in range(12, CARD_W) if blue[x] >= 4)
    start = tag + 27
    name = np.zeros(rgb.shape[:2], bool)
    name[y0:y1, start:NAME_RIGHT + 3] = white(band[:, start:NAME_RIGHT + 3], 150, 80)
    inpaint(card, name, 2)
    nx = tag + 30
    report.append((i, row['name'], tag))
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/ws-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                  club=row['club'], tier='ws', wage=int(row['wage']), cardFace=path)
    club = row['club']
    if club in LOGOS: player['teamLogo'] = LOGOS[club]
    elif club in EXTRA_LOGOS: player['teamLogo'] = EXTRA_LOGOS[club]
    elif club in CUT_LOGO:
        x0, y0, x1, y1 = CUT_LOGO[club]
        logo = Image.fromarray(raw[y0:y1, x0:x1]).resize(((x1 - x0) * 4, (y1 - y0) * 4), Image.Resampling.LANCZOS)
        name_file = f'ws-{pid}-team.webp'
        logo.save(ASSETS / name_file, lossless=True)
        player['teamLogo'] = f'/assets/{name_file}'
    else:
        assert club == 'Tự do', club
        player['teamLogo'] = '/assets/ws-team.webp'
    players.append(player)

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'ws-back.png')
pack.save(ASSETS / 'ws-back.webp', quality=92, method=6)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.save(ASSETS / 'ws-team.png')
crest.save(ASSETS / 'ws-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'ws-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/ws.csv; tạo bởi scripts/import-ws.py.', 'export const wsPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/wsPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/ws-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the WS.', 'tag x min/max', min(r[2] for r in report), max(r[2] for r in report))
