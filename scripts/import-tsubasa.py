"""Nhập mùa TSUBASA (CAPTAIN TSUBASA). Ảnh nguồn không bị sửa.
Cách chạy: python scripts/import-tsubasa.py <thư mục nguồn>
Thư mục có card-01.png … card-18.png (đúng thứ tự scripts/data/tsubasa.csv, nền trong suốt, kích thước khác nhau vì bị cắt theo
vệt trang trí), logo.png (chữ CAPTAIN TSUBASA), tunnel.png (nền hầm) và pack.png (ảnh gói 1696 × 2528).
Ảnh gốc in tên và vị trí bằng tiếng Trung (như mùa EL): script xoá số OVR, chữ vị trí, nhãn chim ưng và tên in sẵn, in lại vị trí bằng
ký hiệu tiếng Anh (ST, CAM…); OVR / nhãn + tên / cấp do game vẽ bằng HTML. Ô cấp xám "1", ô lương lục giác, cờ, nhãn tên nhân vật
truyện (chữ dọc cạnh nhân vật) giữ nguyên.
Thẻ được căn theo ô cấp "1" (khớp mẫu) nên ảnh nguồn lệch / bị cắt mép vẫn ra cùng khung 264 × 310.
Dải tên có ảnh cầu thủ đè lên (khác nhau từng thẻ) nên chỗ xoá được vá: nền chung (trung vị các thẻ) ở chỗ mọi thẻ giống nhau,
còn lại tô từ điểm xung quanh của chính thẻ đó.
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
ROWS = list(csv.DictReader((ROOT / 'scripts/data/tsubasa.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 18
FIRST_ID = 4177
NATIONS = dict(BR='Brazil', ES='Tây Ban Nha', CZ='Séc', IT='Ý', SE='Thụy Điển', RS='Serbia', NL='Hà Lan', AR='Argentina', PT='Bồ Đào Nha', FR='Pháp')
CANVAS_W, CANVAS_H = 264, 310
ORIGIN = (6, 16)                      # gốc khung trên ảnh thẻ 1 (thẻ 1 không bị cắt mép)
LEVEL_BOX = (54, 192, 102, 222)       # ô cấp xám "1" (mốc căn thẻ), toạ độ khung
OVR_BOX = (54, 66, 103, 99)           # số OVR xanh đậm
POS_BOX = (54, 101, 103, 119)         # x ≥ 54: viền khung xanh ở x 50–53 không được xoá         # chữ vị trí (tiếng Trung) dưới OVR; nhãn tên nhân vật bắt đầu ở x ≈ 104
POS_CENTER = (78.5, 110)
POS_CAP = 9.4
NAME_BAND = (229, 255)                # y0, y1 dải nhãn + tên
NAME_LEFT, NAME_RIGHT = 44, 220       # hộp tên HTML (giữa x = 132, đúng tâm cụm nhãn + tên của thẻ gốc)
NAME_BASELINE = 249
LABEL_W, LABEL_Y0, LABEL_Y1 = 26, 231, 252   # nhãn chim ưng trước tên (x theo từng thẻ)
FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def load(path):
    return np.array(Image.open(path).convert('RGBA'))


def place(a, ox, oy):
    out = np.zeros((CANVAS_H, CANVAS_W, 4), np.uint8)
    sx0, sy0 = max(ox, 0), max(oy, 0)
    sx1, sy1 = min(ox + CANVAS_W, a.shape[1]), min(oy + CANVAS_H, a.shape[0])
    out[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = a[sy0:sy1, sx0:sx1]
    return out


def pos_font(size):
    font = ImageFont.truetype(FONT, size)
    font.set_variation_by_name('SemiBold')
    return font


def draw_pos(card, text, color):
    k = 8
    cap = pos_font(100).getbbox('H')
    font = pos_font(round(100 * POS_CAP / (cap[3] - cap[1]) * k))
    layer = Image.new('RGBA', (CANVAS_W * k, CANVAS_H * k))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=font)
    cx, cy = POS_CENTER
    d.text((cx * k - (x0 + x1) / 2, cy * k - (y0 + y1) / 2), text, font=font, fill=tuple(color) + (255,))
    base = Image.fromarray(card)
    base.alpha_composite(layer.resize((CANVAS_W, CANVAS_H), Image.Resampling.LANCZOS))
    return np.array(base)


def ink(card):
    """Lõi chữ in xanh đậm (OVR / vị trí xanh #1929c9, tên xanh than #102070): xanh bão hoà và tối hơn áo / nền xanh nhạt.
    Viền chữ mờ được phủ bằng cách nới mặt nạ 2 px (erase_masks)."""
    r, g, b = (card[..., k].astype(int) for k in range(3))
    return (b - r > 60) & ((r + g + b) / 3 < 125) & (card[..., 3] > 200)


src1 = load(SOURCE / 'card-01.png')
first = place(src1, *ORIGIN)
x0, y0, x1, y1 = LEVEL_BOX
template = np.ascontiguousarray(first[y0:y1, x0:x1, :3])


def align(i):
    src = load(SOURCE / f'card-{i:02d}.png')
    pad = 30
    padded = np.pad(src, ((pad, pad), (pad, pad), (0, 0)))
    score = cv2.matchTemplate(np.ascontiguousarray(padded[..., :3]), template, cv2.TM_CCOEFF_NORMED)
    _, best, _, (mx, my) = cv2.minMaxLoc(score)
    assert best > .95, (i, best)
    return place(src, mx - pad - LEVEL_BOX[0], my - pad - LEVEL_BOX[1]), best


aligned = [align(i) for i in range(1, len(ROWS) + 1)]
# Mẫu nhãn chim ưng: thẻ 2 (Ronaldinho), nhãn ở x 66.
LABEL_REF_X = 66
label_src = aligned[1][0][LABEL_Y0:LABEL_Y1, LABEL_REF_X:LABEL_REF_X + LABEL_W].copy()   # chép trước khi xoá nhãn khỏi thẻ
label_tpl = np.ascontiguousarray(label_src[..., :3])

erase_masks = []
name_rects = []
report = []
for i, (card, best) in enumerate(aligned, 1):
    m = np.zeros((CANVAS_H, CANVAS_W), bool)
    text = ink(card)
    # OVR / vị trí: xoá cả khối chữ (nét chữ Trung có viền mờ rộng) — nền góc này giống nhau mọi thẻ nên vá bằng nền chung.
    for x0, y0, x1, y1 in (OVR_BOX, POS_BOX):
        core = np.zeros_like(m)
        core[y0:y1, x0:x1] = text[y0:y1, x0:x1]
        ys, xs = np.nonzero(core)
        if len(xs):
            m[max(ys.min() - 3, y0 - 2):ys.max() + 4, max(xs.min() - 3, 56):min(xs.max() + 4, x1)] = True
    area = np.ascontiguousarray(card[NAME_BAND[0] - 4:NAME_BAND[1], 40:NAME_RIGHT, :3])
    _, fit, _, (lx, ly) = cv2.minMaxLoc(cv2.matchTemplate(area, label_tpl, cv2.TM_CCOEFF_NORMED))
    tag, ty = lx + 40, ly + NAME_BAND[0] - 4
    assert fit > .6 and abs(ty - LABEL_Y0) <= 2, (i, ROWS[i - 1]['name'], fit, ty)
    y0, y1 = NAME_BAND
    band = text[y0:y1].copy()
    band[:, :tag + LABEL_W] = False
    band[:, NAME_RIGHT:] = False
    xs = np.nonzero(band.any(0))[0]
    right = int(xs.max()) + 4 if len(xs) else tag + LABEL_W + 2
    # Tên Trung có viền sáng quanh chữ: xoá cả khối nhãn + tên (vá theo cột bên dưới), không chỉ điểm chữ.
    name_rects.append((tag - 2, y0, min(right, NAME_RIGHT), y1))
    m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2) > 0
    erase_masks.append(m)
    report.append((i, ROWS[i - 1]['name'], tag, round(best, 3), round(fit, 3)))

panel = np.zeros((CANVAS_H, CANVAS_W), bool)   # góc OVR / vị trí: nền giống nhau ở mọi thẻ → luôn dùng nền chung
panel[OVR_BOX[1] - 2:POS_BOX[3] + 2, 56:OVR_BOX[2]] = True
# Nền chung: trung vị các thẻ ở chỗ thẻ đó không bị xoá; điểm "ổn định" (các thẻ gần như cùng màu) dùng nền chung, chỗ khác vá theo thẻ.
stack = np.array([c[..., :3] for c, _ in aligned], float)
hidden = np.array(erase_masks)
masked = np.where(hidden[..., None], np.nan, stack)
with np.errstate(all='ignore'):
    clean = np.nanmedian(masked, 0)
    spread = np.nanstd(masked, 0).mean(2)
holes = np.isnan(clean).any(2)
# Lỗ ở góc OVR / vị trí (thẻ nào cũng có chữ): nội suy theo cột từ điểm nền gần nhất phía trên và phía dưới (tô ngang sẽ kéo màu viền khung vào).
for x in range(CANVAS_W):
    col = holes[:, x]
    if not col.any():
        continue
    known = np.nonzero(~col)[0]
    for ch in range(3):
        clean[col, x, ch] = np.interp(np.nonzero(col)[0], known, clean[known, x, ch])
holes = np.isnan(clean).any(2)
clean = cv2.inpaint(np.nan_to_num(clean).round().astype(np.uint8), holes.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA).astype(float)
stable = (np.nan_to_num(spread, nan=0) < 9) | panel

pos_color = None
players = []
for i, ((card, best), m, row) in enumerate(zip(aligned, erase_masks, ROWS), 1):
    pid = FIRST_ID + i - 1
    if pos_color is None:
        x0, y0, x1, y1 = OVR_BOX
        pos_color = np.median(card[y0:y1, x0:x1, :3][ink(card)[y0:y1, x0:x1]], 0).astype(int)
    own = cv2.inpaint(np.ascontiguousarray(card[..., :3]), m.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA).astype(float)
    use_clean = (m & stable).astype(float)
    fill = own * (1 - use_clean[..., None]) + clean * use_clean[..., None]
    w = cv2.GaussianBlur(cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(float), (5, 5), 1.0)[..., None]
    card[..., :3] = (card[..., :3] * (1 - w) + fill * w).round().astype(np.uint8)
    # Khối nhãn + tên: mỗi cột nội suy thẳng từ điểm ngay trên xuống ngay dưới khối (nền dải tên là vệt mờ chuyển dần), làm mềm mép.
    x0, y0, x1, y1 = name_rects[i - 1]
    top, bot = card[y0 - 1, x0:x1, :3].astype(float), card[y1, x0:x1, :3].astype(float)
    t = (np.arange(y0, y1) - (y0 - 1)) / (y1 - (y0 - 1))
    block = top[None] * (1 - t[:, None, None]) + bot[None] * t[:, None, None]
    region = card[y0 - 3:y1 + 3, x0 - 3:x1 + 3, :3].astype(float)
    filled = region.copy()
    filled[3:-3, 3:-3] = block
    blur = cv2.GaussianBlur(filled, (5, 5), 1.2)
    wm = np.zeros(region.shape[:2]); wm[3:-3, 3:-3] = 1
    wm = cv2.GaussianBlur(wm, (5, 5), 1.0)[..., None]
    card[y0 - 3:y1 + 3, x0 - 3:x1 + 3, :3] = (region * (1 - wm) + blur * wm).round().astype(np.uint8)
    card = draw_pos(card, row['pos'], pos_color)
    path = f'/assets/tsubasa-{pid}-card.webp'
    Image.fromarray(card).save(ASSETS / Path(path).name, lossless=True)
    assert row['club'] == 'Tự do', row['club']
    players.append(dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=NATIONS[row['flag']], flag=row['flag'],
                        club=row['club'], tier='tsubasa', wage=int(row['wage']), cardFace=path, teamLogo='/assets/tsubasa-team.webp'))

label = Image.fromarray(np.ascontiguousarray(label_src))
label.resize((label.width * 4, label.height * 4), Image.Resampling.LANCZOS).save(ASSETS / 'tsubasa-label.webp', lossless=True)

ovr_hex = '#%02x%02x%02x' % tuple(pos_color)
css = ['/* TSUBASA (CAPTAIN TSUBASA): tạo bởi scripts/import-tsubasa.py. Thẻ gốc (vị trí in lại tiếng Anh), OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.tsubasa{background:#3a7bea}',
       f'.player-card.face-art.season-tsubasa{{aspect-ratio:{CANVAS_W}/{CANVAS_H}}}',
       '.player-card.face-art.season-tsubasa>.face-art-img{filter:drop-shadow(0 0 5px #4a8cff44)}',
       '.season-tsubasa[data-level="1"] .face-art-level{visibility:hidden}',
       f'.season-tsubasa .face-art-ovr{{left:{78 / CANVAS_W * 100:.2f}%;top:{68.5 / CANVAS_H * 100:.2f}%;font-size:12.2cqw;color:{ovr_hex};letter-spacing:-.02em}}',
       f'.season-tsubasa .face-art-level{{left:{LEVEL_BOX[0] / CANVAS_W * 100:.2f}%;top:{LEVEL_BOX[1] / CANVAS_H * 100:.2f}%;width:{(LEVEL_BOX[2] - LEVEL_BOX[0]) / CANVAS_W * 100:.2f}%;height:{(LEVEL_BOX[3] - LEVEL_BOX[1]) / CANVAS_H * 100:.2f}%;transform:none;object-fit:fill}}',
       '.season-tsubasa{--name-size:6.4cqw;--name-color:' + ovr_hex + f';--nx:{NAME_LEFT / CANVAS_W * 100:.2f}%;--nw:{(NAME_RIGHT - NAME_LEFT) / CANVAS_W * 100:.2f}%;--ny:{NAME_BASELINE / CANVAS_H * 100:.2f}%' + '}',
       '.season-tsubasa .face-art-name{text-align:center}',
       '.season-tsubasa .face-art-name.is-long{text-align:left}',
       f'.season-tsubasa .face-art-name>b::before{{content:"";display:inline-block;width:{LABEL_W / (CANVAS_W * .064):.3f}em;height:{(LABEL_Y1 - LABEL_Y0) / (CANVAS_W * .064):.3f}em;margin-right:.35em;vertical-align:{-(LABEL_Y1 - NAME_BASELINE) / (CANVAS_W * .064):.3f}em;background:url(/assets/tsubasa-label.webp) center/100% 100% no-repeat}}',
       '[data-tone=tsubasa]{--shop-tone:#3a7bea;--shop-tone2:#0f1d44}',
       '.season-tag-tsubasa{color:#7fb2ff}',
       '.reveal-tsubasa .reveal-panel{--led:#7fb2ff;--led2:#0b1430;border-color:#e8f0ff66}',
       '.reveal-tsubasa .reveal-stats dt{color:#ffffff}',
       '.reveal-tsubasa .reveal-podium{background:linear-gradient(180deg,#1d3a7a,#0b1430);border-top-color:#ff5a4a}',
       '.reveal-tsubasa .reveal-podium span{color:#ffffff}']

pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack.save(ASSETS / 'tsubasa-back.png')
pack.save(ASSETS / 'tsubasa-back.webp', quality=92, method=6)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
crest.thumbnail((512, 512), Image.Resampling.LANCZOS)
crest.save(ASSETS / 'tsubasa-team.png')
crest.save(ASSETS / 'tsubasa-team.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'tsubasa-tunnel.webp', quality=94)

lines = ["import type { Player } from './game';", "import { asset } from './asset';", '', '// Thứ tự theo scripts/data/tsubasa.csv; tạo bởi scripts/import-tsubasa.py.', 'export const tsubasaPlayers: Player[] = [']
for p in players:
    fields = []
    for key, value in p.items():
        value = json.dumps(value, ensure_ascii=False)
        fields.append(f'{key}: ' + (f'asset({value})' if key in ('cardFace', 'teamLogo') else value))
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/tsubasaPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(ROOT / 'src/tsubasa-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the TSUBASA. OVR/ten mau {ovr_hex}')
for r in report:
    print(*r)
