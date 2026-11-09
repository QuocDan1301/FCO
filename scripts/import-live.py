"""Nhập mùa LIVE. Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-live.py <thư mục nguồn>
Thư mục có card-01.png … card-32.png (đúng thứ tự scripts/data/live.csv, nền trong suốt, khung 174×278), pack.png, tunnel.png.
Thẻ giữ nguyên kích thước, đặt giữa khung 259×282 như các mùa khác; OVR và tên in sẵn được xoá để game tự vẽ.
CLB chưa có logo trong clubLogos.json (cột club không có trong bảng) lấy logo cắt từ chính thẻ, lưu live-<id>-team.webp.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/live.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 32
FIRST_ID = 3896
NATIONS = dict(NL='Hà Lan', CM='Cameroon', ES='Tây Ban Nha', FR='Pháp', BE='Bỉ', IT='Ý', CH='Thụy Sĩ', BR='Brazil', DE='Đức', CZ='Séc', EN='Anh', PL='Ba Lan', CR='Costa Rica', SI='Slovenia', RU='Nga', AR='Argentina', RS='Serbia', UA='Ukraine')
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
CARD_W, CARD_H = 174, 278
CANVAS_W, CANVAS_H = 259, 282
OFF_X, OFF_Y = round((CANVAS_W - CARD_W) / 2), 2
OVR_BOX = (46, 76, 12, 54)      # y0, y1, x0, x1 trên thẻ
NAME_BAND = (205, 231)          # y0, y1: dải tên trên nền trắng
NAME_RIGHT = 166                # mép phải vùng chữ tên
LOGO_BOX = (100, 230, 132, 258) # x0, y0, x1, y1: logo CLB in trên thẻ
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


def team_logo(card, path):
    x0, y0, x1, y1 = LOGO_BOX
    part = card[y0:y1, x0:x1].copy()
    ink = part[..., :3].min(2) < 215
    ys, xs = np.nonzero(ink)
    part = part[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # Phóng trước rồi xoá nền sáng nối từ mép ảnh: phần trắng bên trong logo vẫn giữ nguyên.
    big = cv2.resize(part, (part.shape[1] * 4, part.shape[0] * 4), interpolation=cv2.INTER_CUBIC)
    light = (big[..., :3].min(2) > 200).astype(np.uint8)
    h, w = light.shape
    _, labels = cv2.connectedComponents(light, connectivity=4)
    edge = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    background = np.isin(labels, [v for v in edge if v != 0]) & (light > 0)
    alpha = 255 - cv2.GaussianBlur(cv2.dilate(background.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (3, 3), 0)
    big[..., 3] = alpha
    Image.fromarray(big).save(path, lossless=True)


css = ['/* LIVE: tạo bởi scripts/import-live.py. Thẻ gốc, OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.live{background:#1fe36b}',
       f'.player-card.face-art.season-live{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-live>.face-art-img{filter:drop-shadow(0 0 5px #1fe36b33)}',
       '.season-live[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-live .face-art-ovr{{left:{(OFF_X + 31) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 41) / CANVAS_H * 100:.2f}%;font-size:13.9cqw;color:#fff;letter-spacing:-.02em;text-shadow:0 .03em .08em #0009}}',
       f'.season-live .face-art-level{{left:{(OFF_X + 6) / CANVAS_W * 100:.2f}%;top:{(OFF_Y + 168) / CANVAS_H * 100:.2f}%;width:{48 / CANVAS_W * 100:.2f}%;height:{30 / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-live{--name-size:7.3cqw;--name-color:#33373d}',
       '[data-tone=live]{--shop-tone:#1fe36b;--shop-tone2:#d8f7e4}',
       '.season-tag-live{color:#1fe36b}',
       '.reveal-live .reveal-panel{--led:#1fe36b;--led2:#0d1a13;border-color:#1fe36b66}',
       '.reveal-live .reveal-stats dt{color:#ffffff}',
       '.reveal-live .reveal-podium{background:linear-gradient(180deg,#26302b,#0c110e);border-top-color:#1fe36b}',
       '.reveal-live .reveal-podium span{color:#ffffff}']
players = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card = crop_card(SOURCE / f'card-{i:02d}.png')
    teamLogo = None
    if row['club'] not in LOGOS:
        teamLogo = f'/assets/live-{pid}-team.webp'
        team_logo(card, ASSETS / Path(teamLogo).name)
    rgb = card[..., :3].astype(int)
    # OVR: chữ trắng trên nền tối; mũi tên ▲▼ phía trên giữ nguyên.
    y0, y1, x0, x1 = OVR_BOX
    ovr = np.zeros(rgb.shape[:2], bool)
    ovr[y0:y1, x0:x1] = rgb[y0:y1, x0:x1].min(2) > 130
    inpaint(card, ovr)
    # Tên: nhóm nhãn năm + tên canh giữa nên nhãn xê dịch; tìm mép phải nhãn rồi chỉ xoá phần bên phải.
    y0, y1 = NAME_BAND
    ink = rgb[y0:y1].min(2) < 205
    solid = ink[8:20].mean(0) > .75
    left = next(x for x in range(12, CARD_W) if solid[x])
    tag_right = next(x for x in range(left, CARD_W) if not solid[x])
    name = np.zeros(rgb.shape[:2], bool)
    name[y0:y1, tag_right + 1:NAME_RIGHT + 2] = ink[:, tag_right + 1:NAME_RIGHT + 2]
    inpaint(card, name)
    nx = tag_right + 5
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H))
    canvas.alpha_composite(Image.fromarray(card), (OFF_X, OFF_Y))
    path = f'/assets/live-{pid}-card.webp'
    canvas.save(ASSETS / Path(path).name, lossless=True)
    css.append(f'.face-{pid}' + '{' + f'--nx:{(OFF_X + nx) / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - nx) / CANVAS_W * 100:.2f}%;--ny:{(OFF_Y + NAME_BASELINE) / CANVAS_H * 100:.2f}%' + '}')
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                  club=row['club'], tier='live', wage=int(row['wage']), cardFace=path)
    if teamLogo: player['teamLogo'] = teamLogo
    players.append(player)

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'live-back.png')
pack.save(ASSETS / 'live-back.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'live-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/live.csv; tạo bởi scripts/import-live.py.', 'export const livePlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/livePlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/live-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the LIVE.')
