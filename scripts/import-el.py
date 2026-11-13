"""Nhập mùa EL (ETERNAL LEGENDS). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-el.py <thư mục nguồn>
Thư mục có card-01.png … card-92.png (đúng thứ tự scripts/data/el.csv, nền trong suốt, thẻ kèm cánh trang trí 273×293),
logo.png (khiên huy hiệu Eternal Legends), tunnel.png (nền hầm) và pack.png (ảnh gói).
Ảnh gốc in tên và vị trí bằng tiếng Trung: script xoá số OVR, chữ vị trí và tên in sẵn, rồi in lại vị trí bằng ký hiệu
tiếng Anh như các mùa khác (ST, CAM…); OVR / tên / cấp do game vẽ bằng HTML. Ô cấp xám ghi "1" giữ nguyên (thẻ +1).
Thẻ được căn theo ô cấp "1" (khớp mẫu) nên ảnh nguồn lệch / bị cắt mép vẫn ra cùng khung.
Thẻ in logo CLB thật dùng logo CLB (clubLogos.json); thẻ "Tự do" in huy hiệu Eternal Legends nên dùng huy hiệu làm logo đội.
"""
import csv
import json
from pathlib import Path
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/el.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 92
FIRST_ID = 4085
NATIONS = dict(PT='Bồ Đào Nha', AR='Argentina', NL='Hà Lan', FR='Pháp', DE='Đức', BR='Brazil', HU='Hungary', EN='Anh', ES='Tây Ban Nha',
               SE='Thụy Điển', UA='Ukraine', UY='Uruguay', MX='Mexico', IT='Ý', CI='Bờ Biển Ngà', RS='Serbia', CZ='Séc', BE='Bỉ',
               CM='Cameroon', KR='Hàn Quốc', DK='Đan Mạch', GH='Ghana', NO='Na Uy', CL='Chile', DZ='Algeria', HR='Croatia')
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
CANVAS_W, CANVAS_H = 273, 293
LEVEL_BOX = (55, 175, 101, 204)       # x0, y0, x1, y1: ô cấp xám "1" (mốc căn thẻ)
OVR_BOX = (55, 51, 103, 82)           # số OVR kem trên nền tối
POS_BOX = (56, 85, 103, 103)          # chữ vị trí (tiếng Trung) dưới OVR
POS_CENTER = (78.5, 93.5)
POS_CAP = 9.6                         # chiều cao chữ hoa vị trí in lại (px)
POS_COLOR = (238, 224, 175)
NAME_BAND = (212, 240)                # y0, y1: dải tên chữ xám đậm trên nền đá kem
NAME_LEFT = 54                        # hộp tên HTML 54 … 216 (giữa ở x = 135, đúng tâm cụm nhãn + tên của thẻ gốc)
NAME_RIGHT = 216                      # mép phải vùng tên (viền trong của khung ở x ≈ 217 không được xoá)
NAME_BASELINE = 233
LABEL_W = 25                          # nhãn huy hiệu mùa trước tên (x0 … x0 + 25)
LABEL_Y0, LABEL_Y1 = 215, 236        # khung nhãn theo chiều dọc (x theo từng thẻ)
FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def load(path):
    return np.array(Image.open(path).convert('RGBA'))


def place(a, ox, oy):
    """Cắt khung CANVAS từ gốc (ox, oy); phần ngoài ảnh nguồn để trong suốt."""
    out = np.zeros((CANVAS_H, CANVAS_W, 4), np.uint8)
    sx0, sy0 = max(ox, 0), max(oy, 0)
    sx1, sy1 = min(ox + CANVAS_W, a.shape[1]), min(oy + CANVAS_H, a.shape[0])
    out[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = a[sy0:sy1, sx0:sx1]
    return out


def inpaint(card, mask, grow=1):
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8), iterations=grow)
    card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), mask, 3, cv2.INPAINT_TELEA)


def box_mask(shape, box, test):
    x0, y0, x1, y1 = box
    m = np.zeros(shape[:2], bool)
    m[y0:y1, x0:x1] = test
    return m


def pos_font(size):
    font = ImageFont.truetype(FONT, size)
    font.set_variation_by_name('SemiBold')
    return font


def draw_pos(card, text):
    """In ký hiệu vị trí giữa chỗ chữ tiếng Trung cũ; vẽ to 8 lần rồi thu nhỏ cho mịn."""
    k = 8
    cap = pos_font(100).getbbox('H')
    font = pos_font(round(100 * POS_CAP / (cap[3] - cap[1]) * k))
    layer = Image.new('RGBA', (CANVAS_W * k, CANVAS_H * k))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=font)
    cx, cy = POS_CENTER
    at = (cx * k - (x0 + x1) / 2, cy * k - (y0 + y1) / 2)
    d.text((at[0], at[1] + k * .6), text, font=font, fill=(20, 14, 6, 150))
    d.text(at, text, font=font, fill=POS_COLOR + (255,))
    base = Image.fromarray(card)
    base.alpha_composite(layer.resize((CANVAS_W, CANVAS_H), Image.Resampling.LANCZOS))
    return np.array(base)


css = ['/* EL (ETERNAL LEGENDS): tạo bởi scripts/import-el.py. Thẻ gốc (vị trí in lại tiếng Anh), OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.el{background:#d9bf7c}',
       f'.player-card.face-art.season-el{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-el>.face-art-img{filter:drop-shadow(0 0 5px #e8cf8a44)}',
       '.season-el[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-el .face-art-ovr{{left:{78.5 / CANVAS_W * 100:.2f}%;top:{51.8 / CANVAS_H * 100:.2f}%;font-size:11.36cqw;color:#eedfb0;letter-spacing:-.02em;text-shadow:0 .03em .1em #1a1206}}',
       f'.season-el .face-art-level{{left:{LEVEL_BOX[0] / CANVAS_W * 100:.2f}%;top:{LEVEL_BOX[1] / CANVAS_H * 100:.2f}%;width:{(LEVEL_BOX[2] - LEVEL_BOX[0]) / CANVAS_W * 100:.2f}%;height:{(LEVEL_BOX[3] - LEVEL_BOX[1]) / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-el{--name-size:6.6cqw;--name-color:#373a40' + f';--nx:{NAME_LEFT / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - NAME_LEFT) / CANVAS_W * 100:.2f}%;--ny:{NAME_BASELINE / CANVAS_H * 100:.2f}%' + '}',
       # Nhãn mùa vẽ trước tên (ảnh nhãn cắt từ thẻ gốc), cả cụm căn giữa như thẻ gốc; tên dài thì chạy chữ như các mùa khác.
       '.season-el .face-art-name{text-align:center}',
       '.season-el .face-art-name.is-long{text-align:left}',
       f'.season-el .face-art-name>b::before{{content:"";display:inline-block;width:{LABEL_W / (CANVAS_W * .066):.3f}em;height:{(LABEL_Y1 - LABEL_Y0) / (CANVAS_W * .066):.3f}em;margin-right:.3em;vertical-align:{-(LABEL_Y1 - NAME_BASELINE) / (CANVAS_W * .066):.3f}em;background:url(/assets/el-label.webp) center/100% 100% no-repeat}}',
       # Hạt vàng rơi chéo (trên phải → dưới trái) trong vùng nền tối sau OVR; mặt nạ riêng từng thẻ (App.tsx gắn --el-dust-mask).
       '.el-dust{position:absolute;inset:0;pointer-events:none;z-index:1;-webkit-mask:var(--el-dust-mask) center/100% 100% no-repeat;mask:var(--el-dust-mask) center/100% 100% no-repeat}',
       '.el-dust::before,.el-dust::after{content:"";position:absolute;inset:0;background-repeat:repeat}',
       '.el-dust::before{background-image:radial-gradient(2.08cqw 2.08cqw at 18% 22%,#fffbe6,#ffd25acc 40%,transparent 72%),radial-gradient(1.44cqw 1.44cqw at 63% 8%,#fff3c4,#f0bd42cc 40%,transparent 72%),radial-gradient(2.4cqw 2.4cqw at 82% 57%,#fffbe6,#ffcf4ddd 40%,transparent 72%),radial-gradient(1.28cqw 1.28cqw at 37% 74%,#ffefb0,#e5b23fcc 40%,transparent 72%),radial-gradient(1.76cqw 1.76cqw at 8% 88%,#fff6d2,#f4c652cc 40%,transparent 72%),radial-gradient(1.12cqw 1.12cqw at 52% 40%,#fff1be,#e8b645bb 40%,transparent 72%);background-size:22cqw 29cqw;filter:drop-shadow(0 0 .9cqw #ffc94d);animation:el-dust-fall 3s linear infinite,el-dust-glint 1.4s ease-in-out infinite alternate}',
       '.el-dust::after{background-image:radial-gradient(1.12cqw 1.12cqw at 30% 40%,#fff1bd,#e3b04499 40%,transparent 72%),radial-gradient(1.6cqw 1.6cqw at 75% 15%,#fff8db,#f0c25ab3 40%,transparent 72%),radial-gradient(0.96cqw 0.96cqw at 55% 85%,#ffe9a8,#d6a2379e 40%,transparent 72%),radial-gradient(1.28cqw 1.28cqw at 10% 60%,#fff4cc,#ecbd4ca8 40%,transparent 72%);background-size:32cqw 39cqw;opacity:.8;animation:el-dust-fall-far 5s linear infinite}',
       '@keyframes el-dust-fall{from{background-position:0 0}to{background-position:-22cqw 29cqw}}',
       '@keyframes el-dust-fall-far{from{background-position:0 0}to{background-position:-32cqw 39cqw}}',
       '@keyframes el-dust-glint{from{opacity:.7}to{opacity:1}}',
       '.reduced-motion .el-dust,.opening-reduced .el-dust,.still .el-dust{display:none}',
       '@media (prefers-reduced-motion:reduce){.el-dust{display:none}}',
       '[data-tone=el]{--shop-tone:#d9bf7c;--shop-tone2:#2a2118}',
       '.season-tag-el{color:#e8cf8a}',
       '.reveal-el .reveal-panel{--led:#e8cf8a;--led2:#16110a;border-color:#f3ead466}',
       '.reveal-el .reveal-stats dt{color:#ffffff}',
       '.reveal-el .reveal-podium{background:linear-gradient(180deg,#3a2f1e,#16110a);border-top-color:#e8cf8a}',
       '.reveal-el .reveal-podium span{color:#ffffff}']

first = load(SOURCE / 'card-03.png')
ys, xs = np.nonzero(first[..., 3] > 40)
first = place(first, xs.min(), ys.min())
x0, y0, x1, y1 = LEVEL_BOX
template = np.ascontiguousarray(first[y0:y1, x0:x1, :3])
# Mẫu nhãn mùa: thẻ 3 (nhãn sáng, x 84) và thẻ 2 Messi (nhãn tối, x 102).
LABEL_Y = 214


def align(i):
    """Đặt thẻ i vào khung chung theo vị trí ô cấp "1"."""
    src = load(SOURCE / f'card-{i:02d}.png')
    pad = 20
    padded = np.pad(src, ((pad, pad), (pad, pad), (0, 0)))
    score = cv2.matchTemplate(np.ascontiguousarray(padded[..., :3]), template, cv2.TM_CCOEFF_NORMED)
    _, best, _, (mx, my) = cv2.minMaxLoc(score)
    assert best > .9, (i, best)
    return place(src, mx - pad - LEVEL_BOX[0], my - pad - LEVEL_BOX[1]), best


messi = align(2)[0]
labels = [np.ascontiguousarray(c[LABEL_Y:LABEL_Y + 23, x:x + LABEL_W + 1, :3]) for c, x in ((first, 84), (messi, 102))]
# Vá khung: vài ảnh nguồn bị tách nền lẹm vào khung / cánh trang trí (C. Ronaldo, Zidane, Rooney, Lúcio…). Mọi thẻ cùng một khung nên
# dựng khung đầy đủ từ các thẻ còn nguyên (điểm đủ nhiều thẻ có và cùng màu), lót dưới từng thẻ; lỗ trong suốt nằm trong thẻ
# (không thông ra ngoài) mà đa số thẻ khác đều kín thì tô từ điểm xung quanh.
aligned = [align(i) for i in range(1, len(ROWS) + 1)]
stack = np.array([c for c, _ in aligned])
solid = stack[..., 3] > 200
with np.errstate(all='ignore'):
    tone = np.nanmedian(np.where(solid[..., None], stack[..., :3].astype(float), np.nan), 0)
    spread = np.nanstd(np.where(solid[..., None], stack[..., :3].astype(float), np.nan), 0).mean(2)
keep = (solid.sum(0) >= 8) & (spread < 28)
frame = np.zeros(stack.shape[1:], np.uint8)
frame[..., :3] = np.nan_to_num(tone).clip(0, 255).astype(np.uint8)
frame[..., 3] = np.where(keep, np.percentile(stack[..., 3], 90, axis=0), 0).astype(np.uint8)
usually_solid = solid.mean(0) > .5
repaired = []
for k, (card, best) in enumerate(aligned):
    base = Image.fromarray(frame.copy())
    base.alpha_composite(Image.fromarray(card))
    card = np.array(base)
    clear = (card[..., 3] < 200).astype(np.uint8)
    _, parts = cv2.connectedComponents(clear, connectivity=4)
    outside = set(parts[0]) | set(parts[-1]) | set(parts[:, 0]) | set(parts[:, -1])
    hole = (clear > 0) & ~np.isin(parts, list(outside)) & usually_solid
    if hole.any():
        card[..., :3] = cv2.inpaint(np.ascontiguousarray(card[..., :3]), hole.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA)
        card[hole, 3] = 255
    if (card[..., 3] > 200).sum() - (aligned[k][0][..., 3] > 200).sum() > 30:
        repaired.append(k + 1)
    aligned[k] = (card, best)
print('Va khung the:', repaired)

cards = []
players = []
report = []
report_fit = []
for i, row in enumerate(ROWS, 1):
    pid = FIRST_ID + i - 1
    card, best = aligned[i - 1]
    raw = card.copy()
    rgb = raw[..., :3].astype(int)
    lum = rgb.mean(2)
    # OVR và chữ vị trí: chữ kem sáng trên nền tối (bụi vàng lẫn vào cũng bị xoá, game vẽ đè OVR lên).
    x0, y0, x1, y1 = OVR_BOX
    inpaint(card, box_mask(card.shape, OVR_BOX, lum[y0:y1, x0:x1] > 120), 2)
    x0, y0, x1, y1 = POS_BOX
    inpaint(card, box_mask(card.shape, POS_BOX, lum[y0:y1, x0:x1] > 105), 1)
    # Nhãn huy hiệu mùa (ô vuông viền vàng trước tên, vị trí đổi theo độ dài tên in sẵn): khớp mẫu nhãn sáng / nhãn tối (Messi).
    area = np.ascontiguousarray(raw[205:247, 52:NAME_RIGHT, :3])
    fit, (lx, ly), dark = max((*cv2.minMaxLoc(cv2.matchTemplate(area, t, cv2.TM_CCOEFF_NORMED))[1:4:2], k) for k, t in enumerate(labels))
    assert fit > .6 and abs(ly + 205 - LABEL_Y) <= 2, (i, row['name'], fit, ly)
    tag = lx + 52
    # Xoá cả nhãn lẫn tên (chữ xám đậm ít màu trên nền đá kem): game vẽ lại nhãn + tên bằng HTML, căn giữa như thẻ gốc.
    y0, y1 = NAME_BAND
    band = rgb[y0:y1]
    text = (band.mean(2) < 175) & (band.max(2) - band.min(2) < 45)
    text[:, :tag + LABEL_W] = False
    text[:, NAME_RIGHT - 2:] = False
    erase = np.zeros(rgb.shape[:2], bool)
    erase[y0:y1] = cv2.dilate(text.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    erase[LABEL_Y0 - 2:LABEL_Y1 + 2, tag - 2:tag + LABEL_W + 3] = True
    erase[:, NAME_RIGHT - 2:] = False
    card = draw_pos(card, row['pos'])
    report.append((i, row['name'], tag, round(best, 3)))
    path = f'/assets/el-{pid}-card.webp'
    cards.append((card, erase, ASSETS / Path(path).name))
    if dark:
        css.append(f'.face-{pid} .face-art-name>b::before{{background-image:url(/assets/el-label-dark.webp)}}')
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                  club=row['club'], tier='el', wage=int(row['wage']), cardFace=path)
    club = row['club']
    if club in LOGOS:
        player['teamLogo'] = LOGOS[club]
    else:
        assert club == 'Tự do', club
        player['teamLogo'] = '/assets/el-team.webp'
    players.append(player)

# Nền dải tên giống hệt nhau ở mọi thẻ (cùng ảnh khung): lấy trung vị các thẻ ở chỗ không có nhãn / chữ làm nền sạch,
# chỗ thẻ nào cũng có chữ thì tô từ nền xung quanh; rồi phủ nền sạch (viền mềm) lên chỗ đã xoá của từng thẻ.
y0, y1 = NAME_BAND[0] - 2, NAME_BAND[1] + 2
stack = np.array([c[y0:y1, :, :3] for c, _, _ in cards], float)
hidden = np.array([m[y0:y1] for _, m, _ in cards])
stack[hidden] = np.nan
with np.errstate(all='ignore'):
    clean = np.nanmedian(stack, 0)
holes = np.isnan(clean).any(2)
clean = cv2.inpaint(np.nan_to_num(clean).round().astype(np.uint8), holes.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA).astype(float)
for card, erase, out in cards:
    w = cv2.GaussianBlur(cv2.dilate(erase[y0:y1].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(float), (5, 5), 1.2)[..., None]
    card[y0:y1, :, :3] = (card[y0:y1, :, :3] * (1 - w) + clean * w).round().astype(np.uint8)
    Image.fromarray(card).save(out, lossless=True)
# Mặt nạ hạt vàng (el-<id>-fx.webp): vùng nền khán đài tối phía trên bên trái (sau OVR, cạnh cầu thủ). Nền giống nhau ở mọi thẻ nên
# so từng thẻ với trung vị các thẻ: điểm gần trung vị là nền; giữ mảng nền lớn nhất (bỏ đốm trên người cầu thủ), trừ ô lục giác cấp
# và chỗ cánh trang trí sáng. CSS (el-cards.css .el-dust) cho hạt vàng rơi chéo trong mặt nạ.
finals = np.array([c for c, _, _ in cards]).astype(float)
backdrop = np.median(finals[..., :3], 0)
zone = np.zeros((CANVAS_H, CANVAS_W), np.uint8)
cv2.fillPoly(zone, [np.array([(57, 42), (66, 40), (96, 25), (116, 21), (136, 29), (156, 21), (176, 25), (206, 40), (215, 42), (215, 172), (57, 172)])], 1)
zone[106:145, 60:100] = 0
zone &= (backdrop.mean(2) < 120).astype(np.uint8)
for (card, _, out), final in zip(cards, finals):
    m = ((np.abs(final[..., :3] - backdrop).mean(2) < 20) & (zone > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, parts, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    if n > 1:
        m = (parts == 1 + np.argmax(stats[1:, 4])).astype(np.uint8)
        n, parts, stats, _ = cv2.connectedComponentsWithStats(1 - m, connectivity=4)
        for k in range(1, n):
            if stats[k, 4] < 60:
                m[parts == k] = 1
    m &= zone
    fx = np.zeros((CANVAS_H, CANVAS_W, 4), np.uint8)
    fx[..., :3] = 255
    fx[..., 3] = cv2.GaussianBlur(m.astype(float) * 255, (5, 5), 1.2).round().astype(np.uint8)
    Image.fromarray(fx).save(out.with_name(out.name.replace('-card.webp', '-fx.webp')), lossless=True)
for crop, name in ((first[LABEL_Y0:LABEL_Y1, 84:84 + LABEL_W], 'el-label'), (messi[LABEL_Y0:LABEL_Y1, 102:102 + LABEL_W + 1], 'el-label-dark')):
    label = Image.fromarray(np.ascontiguousarray(crop))
    label.resize((label.width * 4, label.height * 4), Image.Resampling.LANCZOS).save(ASSETS / f'{name}.webp', lossless=True)

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'el-back.png')
pack.save(ASSETS / 'el-back.webp', quality=92, method=6)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.thumbnail((512, 512), Image.Resampling.LANCZOS)
crest.save(ASSETS / 'el-team.png')
crest.save(ASSETS / 'el-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'el-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/el.csv; tạo bởi scripts/import-el.py.', 'export const elPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/elPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/el-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the EL.', 'tag x min/max', min(r[2] for r in report), max(r[2] for r in report), 'match min', min(r[3] for r in report))
for r in report:
    print(*r)
print(sorted(report_fit)[:12])
