"""Nhập tài nguyên mùa NARUTO (NARUTO SHIPPUDEN) — người dùng gửi 2026-11-25, cầu thủ thêm sau. Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-naruto.py <thư mục nguồn>   (nguồn hiện ở D:\\FCOvv-tmp\\naruto\\src)
Thư mục nguồn:
  logo.webp  — chữ NARUTO SHIPPUDEN (nền trong suốt)  → huy hiệu đội naruto-team.webp (đặt giữa ô vuông)
  pack.png   — ảnh gói (áo đấu, 457×682)               → naruto-back.png / .webp, phóng lên 1696 rộng như các mùa khác
  tunnel.png — nền hầm mở thẻ                          → naruto-tunnel.webp (1672 rộng)
  badge.png  — huy hiệu mùa (lá Konoha trong khung)    → scripts/data/naruto-badge.png (cắt sát), scripts/season-badges.py tạo seasons/naruto.webp
  frame.png  — khung thẻ trống                          → giữ ở scripts/data/naruto-frame.png
  frame-sand.png — khung trống biểu tượng đồng hồ cát (Làng Cát) cho thẻ Real Madrid → scripts/data/naruto-frame-sand.png
  card-<id>.png — ảnh thẻ hoàn chỉnh từng cầu thủ (thông tin ở scripts/data/naruto.csv) → naruto-<id>-card.webp, src/narutoPlayers.ts, src/naruto-cards.css
  art-<id>.png  — hoặc chỉ ảnh nhân vật + cầu thủ (nền trong suốt): dựng thẻ từ frame.png theo bố cục thẻ Yamal (card-4346.png phải có)
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public' / 'assets'
SRC = Path(sys.argv[1])


def trim(im, pad=0):
    box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    if pad:
        canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        canvas.paste(im, (pad, pad))
        im = canvas
    return im


# Ảnh gói: cắt sát phần thẻ rồi phóng lên khổ 1696 rộng (cùng khổ ảnh gói các mùa khác, compose-pack đo theo khổ này).
pack = trim(Image.open(SRC / 'pack.png').convert('RGBA'))
pack = pack.resize((1696, round(pack.height * 1696 / pack.width)), Image.Resampling.LANCZOS)
pack.save(ASSETS / 'naruto-back.png')
pack.save(ASSETS / 'naruto-back.webp', quality=92, method=6)

tunnel = Image.open(SRC / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'naruto-tunnel.webp', quality=94)

logo = trim(Image.open(SRC / 'logo.webp').convert('RGBA'))
logo = logo.resize((1200, round(logo.height * 1200 / logo.width)), Image.Resampling.LANCZOS)
# Huy hiệu đội (cầu thủ "Tự do" / không có logo CLB): chữ NARUTO SHIPPUDEN đặt giữa ô vuông trong suốt.
side = max(logo.size)
crest = Image.new('RGBA', (side, side), (0, 0, 0, 0))
crest.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
crest = crest.resize((600, 600), Image.Resampling.LANCZOS)
crest.save(ASSETS / 'naruto-team.png')
crest.save(ASSETS / 'naruto-team.webp', quality=92, method=6)

badge = trim(Image.open(SRC / 'badge.png').convert('RGBA'))
badge.save(ROOT / 'scripts' / 'data' / 'naruto-badge.png')  # chỉ là nguồn, không đưa vào public (tránh nhóm tải trước)

shutil.copyfile(SRC / 'frame.png', ROOT / 'scripts' / 'data' / 'naruto-frame.png')
shutil.copyfile(SRC / 'frame-sand.png', ROOT / 'scripts' / 'data' / 'naruto-frame-sand.png')
print('pack', pack.size, 'logo', logo.size, 'badge', badge.size)


# ===== Thẻ cầu thủ (2026-11-25): ảnh thẻ hoàn chỉnh người dùng gửi, card-<id>.png trong thư mục nguồn, thông tin ở scripts/data/naruto.csv =====
# Mỗi ảnh cắt theo khung alpha rồi co về khổ chung CANVAS (đo từ thẻ đầu tiên, Lamine Yamal 646×692 → khung 555×684).
# Giữ nguyên: vị trí, lương (ô lục giác), ô cấp "1", cờ, logo FC, logo đội in sẵn. Xoá số OVR (OVR đổi theo cấp, vẽ bằng HTML),
# nhãn lá Konoha + tên in sẵn (tên vẽ HTML căn giữa, nhãn = naruto-label.webp đặt trước tên bằng ::before, cắt từ thẻ đầu TRƯỚC khi xoá).
import csv
import json

import cv2
import numpy as np

CANVAS = (555, 684)
OVR_BOX = (100, 164, 187, 210)       # số OVR in sẵn
LEVEL_BOX = (111, 399, 183, 446)     # ô cấp xám (giữ; HTML ảnh cấp phủ lên từ +2)
LABEL_BOX = (135, 488, 186, 525)     # nhãn lá Konoha trước tên
NAME_BOX = (129, 482, 405, 530)      # nhãn + tên (xoá)
ROWS = list(csv.DictReader((ROOT / 'scripts/data/naruto.csv').open(encoding='utf-8'), delimiter='|'))


def inpaint(im, mask):
    rgb = cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(rgb, mask, 5, cv2.INPAINT_TELEA)
    res = Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).convert('RGBA')
    res.putalpha(im.getchannel('A'))
    return res


# ===== Dựng thẻ từ khung trống + ảnh nhân vật/cầu thủ (art-<id>.png), bố cục y như thẻ Lamine Yamal (card-4346.png) =====
# Khung trống frame.png đặt lên khổ CANVAS bằng phép biến đổi đo từ thẻ Yamal (ORB, tỉ lệ 1,1057). Ảnh art co vừa ô ART_BOX, đáy ảnh mờ dần.
# Lấy từ thẻ Yamal: ô lục giác lương (xoá số, in lại), ô cấp "1", logo FC VIP + logo NARUTO hàng dưới. In lại: vị trí (Bahnschrift
# SemiLight Condensed, vàng #e4d046), lương (Bold Condensed, kem), cờ quốc gia (PNG từ flag-icons, D:\FCOvv-tmp\ch\flags).
FRAME_M = np.array([[1.1057, -0.0003, -19.6143], [0.0003, 1.1057, -58.0802]])
ART_BOX = (80, 175, 470, 480)     # x0 y0 x1 y1 (Yamal: ảnh nằm 96–454 × 180–480)
ART_FADE = 60                     # px cuối ảnh mờ dần
HEX_BOX = (112, 243, 173, 304)
HEX_DIGITS = (126, 260, 161, 290)
LEVEL_PATCH = (110, 398, 184, 447)
LOGOS_PATCH = (238, 544, 394, 596)
FLAG_BOX = (173, 552, 229, 587)
POS_CENTER, POS_TOP, POS_CAP = 143, 216, 29
WAGE_CENTER, WAGE_MID, WAGE_CAP = 143, 275, 22
FLAGS_DIR = Path(r'D:\FCOvv-tmp\ch\flags')
SHADE_CENTER, SHADE_AXES, SHADE_ALPHA, SHADE_COLOR = (140, 240), (58, 92), .72, (14, 10, 8, 255)
FONT = 'bahnschrift.ttf'


def bahn(size, var):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(var)
    return f


def text_cap(draw, cx, top, cap, s, var, fill, stroke=0):
    """Vẽ chữ s căn giữa theo cx, mép trên chữ hoa ở top, cao chữ hoa = cap px."""
    size = cap * 2
    for _ in range(3):
        f = bahn(size, var)
        b = draw.textbbox((0, 0), 'H', font=f)
        size = max(8, round(size * cap / (b[3] - b[1])))
    f = bahn(size, var)
    hb = draw.textbbox((0, 0), 'H', font=f)
    w = draw.textlength(s, font=f)
    draw.text((cx - w / 2, top - hb[1]), s, font=f, fill=fill, stroke_width=stroke, stroke_fill=(20, 12, 6, 220))


_ref = None


def reference():
    global _ref
    if _ref is None:
        ref = trim(Image.open(SRC / 'card-4346.png').convert('RGBA')).resize(CANVAS, Image.Resampling.LANCZOS)
        hexa = ref.crop(HEX_BOX)
        a = np.array(hexa)
        x0, y0, x1, y1 = (HEX_DIGITS[0] - HEX_BOX[0], HEX_DIGITS[1] - HEX_BOX[1], HEX_DIGITS[2] - HEX_BOX[0], HEX_DIGITS[3] - HEX_BOX[1])
        mask = np.zeros(a.shape[:2], np.uint8)
        mask[y0:y1, x0:x1] = (a[y0:y1, x0:x1, :3].min(axis=2) > 120).astype(np.uint8) * 255
        hexa = inpaint(hexa, cv2.dilate(mask, np.ones((3, 3), np.uint8)))
        # Ô lục giác: chỉ lấy phần khác nền khung (bỏ nền / ảnh Yamal ở góc hình chữ nhật).
        frame = warp_frame()
        diff = np.abs(np.array(ref.crop(HEX_BOX).convert('RGB')).astype(int) - np.array(frame.crop(HEX_BOX).convert('RGB')).astype(int)).sum(axis=2)
        hm = cv2.morphologyEx((diff > 60).astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cnts, _ = cv2.findContours(hm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        fill = np.zeros_like(hm)
        cv2.drawContours(fill, [max(cnts, key=cv2.contourArea)], -1, 255, -1)
        hexa.putalpha(Image.fromarray(cv2.GaussianBlur(fill, (3, 3), 0)))
        _ref = dict(hexa=hexa, level=ref.crop(LEVEL_PATCH), logos=ref.crop(LOGOS_PATCH))
    return _ref


_frame = None


# Khung đồng hồ cát (2026-11-25, thẻ Real Madrid): cùng thiết kế khung lá, đo bằng ORB so với frame.png (951 điểm khớp) rồi ghép với FRAME_M.
FRAME_SAND_M = np.array([[1.0506, -0.0062, -8.4313], [0.0062, 1.0506, -39.9321]])
FRAME_BY_CLUB = {'Real Madrid': ('frame-sand.png', FRAME_SAND_M)}


def warp_frame(club=None):
    global _frame
    if _frame is None:
        _frame = {}
    name, m = FRAME_BY_CLUB.get(club, ('frame.png', FRAME_M))
    if name not in _frame:
        fr = np.array(Image.open(SRC / name).convert('RGBA'))
        _frame[name] = Image.fromarray(cv2.warpAffine(fr, m, CANVAS, flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0)))
    return _frame[name]


def build_card(row):
    pid = int(row['id'])
    card = warp_frame(row['club']).copy()
    art = trim(Image.open(SRC / f'art-{pid}.png').convert('RGBA'))
    bw, bh = ART_BOX[2] - ART_BOX[0], ART_BOX[3] - ART_BOX[1]
    s = min(bw / art.width, bh / art.height)
    art = art.resize((round(art.width * s), round(art.height * s)), Image.Resampling.LANCZOS)
    a = np.array(art).astype(float)
    fade = np.clip(np.arange(art.height)[::-1] / ART_FADE, 0, 1)   # 0 ở đáy → 1 sau ART_FADE px
    a[..., 3] *= fade[:, None]
    art = Image.fromarray(a.astype(np.uint8))
    x = round((ART_BOX[0] + ART_BOX[2]) / 2 - art.width / 2)
    layer = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    layer.paste(art, (x, ART_BOX[3] - art.height))
    card = Image.alpha_composite(card, layer)
    # Cột OVR / vị trí / lương nằm đè lên ảnh: phủ một vùng tối mờ (elip, mép mềm) để chữ luôn đọc được dù tóc nhân vật lấn vào.
    shade = np.zeros((CANVAS[1], CANVAS[0]), np.uint8)
    cv2.ellipse(shade, SHADE_CENTER, SHADE_AXES, 0, 0, 360, 255, -1)
    shade = cv2.GaussianBlur(shade, (0, 0), 18).astype(float) / 255 * SHADE_ALPHA
    dark = Image.new('RGBA', CANVAS, SHADE_COLOR)
    dark.putalpha(Image.fromarray((shade * 255).astype(np.uint8)))
    card = Image.alpha_composite(card, dark)
    ref = reference()
    card.alpha_composite(ref['level'], LEVEL_PATCH[:2])
    card.alpha_composite(ref['logos'], LOGOS_PATCH[:2])
    card.alpha_composite(ref['hexa'], HEX_BOX[:2])
    d = ImageDraw.Draw(card)
    text_cap(d, POS_CENTER, POS_TOP, POS_CAP, row['pos'], 'SemiLight Condensed', (228, 208, 70, 255), stroke=2)
    text_cap(d, WAGE_CENTER, WAGE_MID - WAGE_CAP // 2, WAGE_CAP, row['wage'], 'Bold Condensed', (232, 216, 168, 255))
    flag = Image.open(FLAGS_DIR / f"{row['flag']}.png").convert('RGBA').resize((FLAG_BOX[2] - FLAG_BOX[0], FLAG_BOX[3] - FLAG_BOX[1]), Image.Resampling.LANCZOS)
    card.alpha_composite(flag, FLAG_BOX[:2])
    return card


players = []
label = None
for row in ROWS:
    pid = int(row['id'])
    if not (SRC / f'card-{pid}.png').exists():
        # Chỉ có ảnh nhân vật + cầu thủ: dựng thẻ từ khung trống (không có OVR / tên in sẵn nên không cần xoá).
        card = build_card(row)
    else:
        card = trim(Image.open(SRC / f'card-{pid}.png').convert('RGBA')).resize(CANVAS, Image.Resampling.LANCZOS)
    if label is None:
        label = card.crop(LABEL_BOX)
    a = np.array(card)
    mask = np.zeros(a.shape[:2], np.uint8)
    x0, y0, x1, y1 = OVR_BOX
    if not (SRC / f'card-{pid}.png').exists():
        x0 = x1   # thẻ tự dựng: không xoá gì
    r, g = a[y0:y1, x0:x1, 0].astype(int), a[y0:y1, x0:x1, 1].astype(int)
    mask[y0:y1, x0:x1] = ((r > 195) & (g > 140)).astype(np.uint8) * 255   # chữ số vàng cam sáng hơn nền nâu
    if (SRC / f'card-{pid}.png').exists():
        x0, y0, x1, y1 = NAME_BOX
        mask[y0:y1, x0:x1] = 255
        mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
        card = inpaint(card, mask)
    path = f'/assets/naruto-{pid}-card.webp'
    card.save(ASSETS / Path(path).name, quality=92, method=6)
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=row['nation'], flag=row['flag'], club=row['club'],
                        tier='naruto', wage=int(row['wage']), cardFace=path, teamLogo='/assets/naruto-team.webp'))

if label is not None:
    label.resize((label.width * 3, label.height * 3), Image.Resampling.LANCZOS).save(ASSETS / 'naruto-label.webp', lossless=True)

W, H = CANVAS
pct = lambda v, n: f'{v / n * 100:.2f}%'
lw = (LABEL_BOX[2] - LABEL_BOX[0]) / (LABEL_BOX[3] - LABEL_BOX[1]) * .84
css = ['/* NARUTO (NARUTO SHIPPUDEN): tạo bởi scripts/import-naruto.py. Ảnh thẻ người dùng gửi (đã xoá OVR, nhãn + tên in sẵn); OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.naruto{background:#ff8a1f}',
       f'.player-card.face-art.season-naruto{{aspect-ratio:{W}/{H}}}',
       '.player-card.face-art.season-naruto>.face-art-img{filter:drop-shadow(0 0 5px #ff8a1f33)}',
       '.season-naruto[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-naruto .face-art-ovr{{left:{pct((OVR_BOX[0] + OVR_BOX[2]) / 2 - 1, W)};top:{pct(OVR_BOX[1] - 7, H)};font-size:9.2cqw;color:#ffc25a;letter-spacing:-.01em;text-shadow:0 .03em .1em #3a1a0499}}',
       f'.season-naruto .face-art-level{{left:{pct(LEVEL_BOX[0], W)};top:{pct(LEVEL_BOX[1], H)};width:{pct(LEVEL_BOX[2] - LEVEL_BOX[0], W)};height:{pct(LEVEL_BOX[3] - LEVEL_BOX[1], H)};transform:none;object-fit:fill}}',
       f'.season-naruto{{--name-size:6.6cqw;--name-color:#ffffff;--nx:{pct(NAME_BOX[0] - 14, W)};--nw:{pct(NAME_BOX[2] - NAME_BOX[0] + 28, W)};--ny:{pct(NAME_BOX[3] - 13, H)}}}',
       '.season-naruto .face-art-name{text-align:center;text-shadow:0 .05em .14em #000c}',
       '.season-naruto .face-art-name.is-long{text-align:left}',
       f'.season-naruto .face-art-name>b::before{{content:"";display:inline-block;width:{lw:.3f}em;height:.84em;margin-right:.32em;vertical-align:-.08em;background:url(/assets/naruto-label.webp) center/100% 100% no-repeat}}',
       '[data-tone=naruto]{--shop-tone:#ff8a1f;--shop-tone2:#0d2a55}',
       '.season-tag-naruto{color:#ffb15c}',
       '.reveal-naruto .reveal-panel{--led:#4fd2ff;--led2:#1c0f06;border-color:#ff8a1f66}',
       '.reveal-naruto .reveal-stats dt{color:#ffffff}',
       '.reveal-naruto .reveal-podium{background:linear-gradient(180deg,#5a2a08,#1c0f06);border-top-color:#4fd2ff}',
       '.reveal-naruto .reveal-podium span{color:#ffffff}']
(ROOT / 'src/naruto-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8', newline='\n')

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '',
         '// Mùa NARUTO (NARUTO SHIPPUDEN): thứ tự theo scripts/data/naruto.csv; tạo bởi scripts/import-naruto.py, đừng sửa tay.',
         'export const narutoPlayers: Player[] = [']
for p in players:
    fields = [f'{k}: ' + (f'asset({json.dumps(v, ensure_ascii=False)})' if k in ('cardFace', 'teamLogo') else json.dumps(v, ensure_ascii=False)) for k, v in p.items()]
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/narutoPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(f'{len(players)} the NARUTO')
