#!/usr/bin/env python3
"""Ghép ảnh gói tùy biến (gói hỗn hợp nhiều mùa) từ ảnh gói của từng mùa — theo bố cục mẫu MULTI CLASS.

Quy tắc bố cục:
  1. Khung nền = ảnh gói của mùa ĐẦU TIÊN trong danh sách (giữ áo đấu và huy hiệu mùa đó ở góc dưới trái).
  2. Xoá tiêu đề gốc của mùa đó, in tiêu đề mới cùng chỗ và cỡ chữ gốc (phủ kín chỗ đã xoá): cùng tông màu chữ gốc; chữ màu
     (vàng…) sáng ở trên, đậm dần xuống dưới, viền tối mảnh; chữ trắng / xám / đen tô phẳng như chữ gốc.
     Chữ in trùng tiêu đề gốc của khung (KEEP_TITLES, vd. FC AMBASSADOR trên khung FC) thì giữ nguyên tiêu đề gốc, không xoá / vẽ lại.
  3. Huy hiệu các mùa còn lại cắt từ ảnh gói của từng mùa, thu về cùng bề ngang huy hiệu mùa đầu và xếp chồng lên trên theo thứ tự
     (mùa thứ hai ngay trên huy hiệu mùa đầu, mùa thứ ba trên nữa...).
  4. Góc dưới phải: tấm tối cắt chéo theo viền thẻ, ghi "▲<OVR tối thiểu>" xanh lá và chữ "OVR" xám bên dưới.
     Không truyền --min-ovr (gói không giới hạn OVR) thì góc dưới phải để nguyên như ảnh gói gốc.
     Gói top price (--top-price N): góc dưới phải ghi N (trắng) và chữ TOP PRICE thay cho ▲OVR.
     Gói chỉ định (--draft N): giữ tên mùa gốc, góc dưới phải ghi N và chữ DRAFT (chọn 1 trong N cầu thủ).

Cách dùng (chạy ở thư mục gốc dự án):
  python scripts/compose-pack.py --id multiclass --title "MULTI CLASS" --seasons stellar,origin,amb --min-ovr 117
Ghi public/assets/custom/<id>-back.webp. Thường không cần gọi tay: trang quản trị gói (npm run dev → Cài đặt → Quản trị gói)
gọi script này rồi lưu gói vào src/packs.json.
Cần Pillow, numpy, opencv-python và font Bahnschrift (có sẵn trên Windows; đổi bằng biến môi trường PACK_FONT).
"""
import argparse
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'public', 'assets')
FONT = os.environ.get('PACK_FONT', 'C:/Windows/Fonts/bahnschrift.ttf')

# Ảnh gói từng mùa (khoá = Tier trong src/game.ts), toạ độ theo pixel ảnh gốc:
#   badge = khung huy hiệu mùa ở góc dưới trái (x0, y0, x1, y1), title = vùng tiêu đề cần xoá (một hộp, hoặc danh sách hộp
#   khi tiêu đề nhiều dòng nằm xen hình nền — tiêu đề mới đặt giữa hộp bao của cả danh sách),
#   ink = điểm ảnh nào là chữ tiêu đề (để xoá và lấy màu cho tiêu đề mới).
SEASONS = {
    'stellar': dict(art='ts26-back.png', badge=(39, 575, 103, 627), title=(86, 70, 372, 163), ink=lambda r, g, b: (r - b > 22) & (r > 120)),
    'origin': dict(art='no7-back.png', badge=(103, 1292, 239, 1398), title=(255, 240, 800, 382), ink=lambda r, g, b: (np.maximum(np.maximum(r, g), b) < 95) & (b >= r)),
    'amb': dict(art='amb-back.png', badge=(40, 621, 107, 672), title=(20, 112, 455, 182), ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 205),
    'eternal': dict(art='icon-tm-back.png', badge=(18, 296, 50, 322), title=(25, 26, 207, 88), ink=lambda r, g, b: (np.maximum(np.maximum(r, g), b) < 178) & (r - b > 8)),
    'prime': dict(art='prime-back.png', badge=(9, 251, 33, 272), title=(30, 32, 182, 100), ink=lambda r, g, b: (r - g > 70) & (r > 110)),
    'vietnam': dict(art='vietnam-back.png', badge=(37, 636, 104, 688), title=(100, 105, 390, 182), ink=lambda r, g, b: (g > 140) & (r - b > 40)),
    'prm': dict(art='prm-back.png', badge=(18, 469, 71, 512), title=(35, 70, 362, 188), ink=lambda r, g, b: (g > 120) & (r - b > 60)),
    'mdl': dict(art='mdl-back.png', badge=(37, 622, 103, 674), title=(110, 105, 380, 180), ink=lambda r, g, b: (np.maximum(np.maximum(r, g), b) < 100) & (b > r)),
    'uc': dict(art='uc-back.png', badge=(44, 573, 106, 623), title=[(58, 70, 410, 100), (195, 105, 268, 160)], ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 165) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 45)),
    'wg': dict(art='wg-back.png', badge=(43, 543, 100, 589), title=[(92, 98, 330, 122), (172, 130, 246, 174)], ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 165) & (r - b < 90)),
    'ut': dict(art='ut-back.png', badge=(33, 602, 97, 652), title=[(68, 74, 396, 108), (198, 112, 270, 165)], ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 175) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 50)),
    'cu': dict(art='cu-back.png', badge=(32, 610, 99, 661), title=[(128, 72, 338, 108), (136, 110, 328, 164)], ink=lambda r, g, b: (r - b > 12) & (r > 45)),
    'gru': dict(art='gru-back.png', badge=(32, 615, 95, 667), title=[(70, 76, 396, 108), (176, 116, 284, 168)], ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 175) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 50)),
    'rtn': dict(art='rtn-back.png', badge=(30, 635, 97, 690), title=(94, 118, 366, 184), ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 195) & (r - b < 60)),
    'dc': dict(art='dc-back.png', badge=(33, 612, 97, 665), title=(128, 112, 342, 174), ink=lambda r, g, b: (r - b > 40) & (r > 140)),
    'cc': dict(art='cc-back.png', badge=(33, 603, 97, 653), title=(46, 112, 416, 174), ink=lambda r, g, b: (r > 215) & (g > 185) & (r - b > 45) & (b < 200)),
    # BLD: viền vàng dày nên góc OVR lùi vào (corner_edge).
    'bld': dict(art='bld-back.png', corner_edge=.935, badge=(44, 578, 104, 624), title=(68, 104, 399, 160), ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 170) & (r - b > 4) & (r - b < 80) & (r > 205)),
    'wb': dict(art='wb-back.png', badge=(32, 593, 97, 645), title=(56, 100, 410, 158), ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'jnm': dict(art='jnm-back.png', badge=(195, 2100, 410, 2280), title=[(270, 430, 1450, 610)], ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'juventus': dict(art='juventus-back.png', badge=(55, 865, 155, 945), title=[(200, 105, 490, 155), (150, 165, 540, 235)], ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'ebs': dict(art='ebs-back.png', badge=(195, 2070, 410, 2240), title=[(340, 305, 1350, 430), (700, 450, 1005, 650)], ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'btb': dict(art='btb-back.png', badge=(195, 2130, 405, 2305), title=(255, 465, 1440, 685), ink=lambda r, g, b: (r > 170) & (g > 175) & (b < 155)),
    'boe21': dict(art='boe21-back.png', badge=(150, 2110, 380, 2290), title=[(390, 240, 1295, 370), (560, 390, 1135, 605)], ink=lambda r, g, b: (r < 150) & (g < 100) & (b < 100)),
    'cap': dict(art='cap-back.png', badge=(165, 2075, 395, 2300), title=[(495, 250, 1200, 390), (675, 400, 1040, 615)], ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'lol': dict(art='lol-back.png', badge=(130, 2120, 365, 2320), title=[(380, 230, 1310, 365), (680, 390, 1030, 600)], ink=lambda r, g, b: (r > 175) & (b > 115) & (r - g > 35)),
    'fa': dict(art='fa-back.png', badge=(164, 2085, 390, 2265), title=(350, 390, 1380, 610), ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 195),
    'ln': dict(art='ln-back.png', badge=(245, 2080, 460, 2260), title=[(410, 340, 1380, 460), (765, 480, 1000, 690)], ink=lambda r, g, b: (g > 155) & (r > 100) & (b < 140)),
    'spl': dict(art='spl-back.png', badge=(150, 2100, 385, 2295), title=(390, 360, 1340, 600), ink=lambda r, g, b: (g > 160) & (g - r > 25)),
    'hg': dict(art='hg-back.png', badge=(150, 2080, 380, 2265), title=(280, 390, 1460, 620), ink=lambda r, g, b: (r > 180) & (g > 185) & (b < 140)),
    'le': dict(art='le-back.png', badge=(70, 1049, 185, 1144), title=[(135, 115, 714, 187), (365, 194, 474, 286)], ink=lambda r, g, b: (r > 155) & (g > 140) & (r - b > 20)),
    'hw23': dict(art='hw23-back.png', badge=(61, 1043, 179, 1143), title=[(204, 125, 623, 183), (281, 193, 549, 286)], ink=lambda r, g, b: (r > 155) & (g > 165) & (b < 175)),
    'bdo': dict(art='bdo-back.png', badge=(88, 1036, 196, 1125), title=(154, 232, 683, 325), ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 160),
    'spt': dict(art='spt-back.png', badge=(34, 607, 97, 657), title=(108, 116, 354, 166), ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 185) & (r - b > 10) & (r - b < 75)),
    'ep24': dict(art='ep24-back.png', badge=(33, 604, 99, 654), title=[(82, 74, 380, 108), (170, 112, 296, 165)], ink=lambda r, g, b: (np.minimum(np.minimum(r, g), b) > 170) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 45)),
    'ptg': dict(art='ptg-back.png', badge=(34, 612, 100, 666), title=[(126, 77, 338, 110), (180, 117, 280, 171)], ink=lambda r, g, b: np.minimum(np.minimum(r, g), b) > 190),
}

# Tiêu đề gốc in trên ảnh gói từng mùa (khớp chữ in mặc định của gói ở trang quản trị): ghép với đúng chữ này thì giữ nguyên tiêu đề gốc.
KEEP_TITLES = {'stellar': '26 TOTS', 'origin': 'NUMBER 7', 'amb': 'FC AMBASSADOR', 'eternal': 'THE MOMENT', 'prime': 'INFINITE PRIME',
               'vietnam': 'VIET NAM', 'prm': 'PRIME', 'mdl': 'MEDALIST', 'uc': 'UC', 'wg': 'WG', 'ut': 'UT', 'cu': 'CU', 'gru': 'GRU', 'rtn': 'RTN', 'dc': 'DC', 'cc': 'CC', 'bld': 'BEST LEGENDS', 'wb': 'WONDERBOYS', 'spt': 'SPARTAN', 'bdo': 'BALLON D’OR', 'hw23': '23 HARD WORKER', 'ep24': '24 ENERGETIC PLAYER', 'ptg': 'PATH TO GLORY',
               'le': 'LEGEND OF EUROPA', 'hg': 'HOME GROWN', 'spl': 'SPOTLIGHT', 'ln': 'LEGENDARY NUMBERS', 'fa': 'FREE AGENT', 'lol': 'LEGEND OF THE LOAN',
               'cap': 'CAPTAIN CLASS', 'boe21': 'BEST OF EUROPE 21', 'btb': 'BACK TO BACK', 'ebs': 'EUROPEAN BEST STARS', 'juventus': 'AMBASSADOR JUVENTUS', 'jnm': 'JOURNEYMAN'}

# Góc OVR theo khung thẻ (tỉ lệ trong hộp bao của thẻ, đo từ mẫu): mép chéo đi từ mép phải ở 57% chiều cao xuống 34% bề ngang ở đáy.
PANEL_LINE = ((1.0, .569), (.338, .973))
PANEL_COLOR = (30, 33, 39)
OVR_GREEN = (22, 235, 100)
OVR_GRAY = (168, 171, 176)


def font(size, weight, width):
    f = ImageFont.truetype(FONT, max(1, round(size)))
    try:
        f.set_variation_by_axes([weight, width])
    except OSError:
        pass  # font không có trục biến thể: dùng nguyên kiểu mặc định
    return f


def cap_font(cap_px, weight, width):
    """Font có chiều cao chữ hoa đúng cap_px."""
    probe = font(200, weight, width)
    x0, y0, x1, y1 = probe.getbbox('H')
    return font(200 * cap_px / (y1 - y0), weight, width)


def render_text(text, size, weight, width, scale=4, stroke=0, word_gap=1.0):
    """Vẽ chữ ở scale× rồi thu về 1×. word_gap co / giãn khoảng cách giữa các từ (1 = khoảng trắng của font).
    Trả về (mặt nạ chữ, mặt nạ viền, toạ độ y đỉnh chữ hoa, toạ độ x mép trái nét chữ) — mặt nạ dạng ảnh L."""
    f = font(size * scale, weight, width)
    cx0, cy0, cx1, cy1 = f.getbbox('H')
    words, space = text.split(' '), f.getlength(' ') * word_gap
    starts, x = [], 0.0
    for word in words:
        starts.append(x); x += f.getlength(word) + space
    boxes = [f.getbbox(word, stroke_width=stroke * scale) for word in words]
    x0 = min(s + b[0] for s, b in zip(starts, boxes)); x1 = max(s + b[2] for s, b in zip(starts, boxes))
    y0 = min([b[1] for b in boxes] + [cy0]); y1 = max([b[3] for b in boxes] + [cy1])
    pad = (stroke + 2) * scale
    w, h = int(x1 - x0) + 2 * pad, y1 - y0 + 2 * pad
    w, h = (w + scale - 1) // scale * scale, (h + scale - 1) // scale * scale
    origin = (pad - x0, pad - y0)
    fill, outline = Image.new('L', (w, h)), Image.new('L', (w, h))
    for start, word in zip(starts, words):
        at = (origin[0] + start, origin[1])
        ImageDraw.Draw(fill).text(at, word, font=f, fill=255)
        if stroke:
            ImageDraw.Draw(outline).text(at, word, font=f, fill=255, stroke_width=stroke * scale, stroke_fill=255)
    size1 = (w // scale, h // scale)
    cap_top = (origin[1] + cy0) / scale
    left = (pad + stroke * scale) / scale  # mép trái nét chữ (không tính viền)
    return fill.resize(size1, Image.LANCZOS), outline.resize(size1, Image.LANCZOS), cap_top, left


def paint(base, mask, color, at):
    """Tô màu (hoặc ảnh màu cùng cỡ) qua mặt nạ lên base tại toạ độ at."""
    layer = Image.new('RGBA', mask.size, color) if isinstance(color, tuple) else color
    layer.putalpha(Image.fromarray((np.asarray(layer.getchannel('A'), np.float32) * np.asarray(mask, np.float32) / 255).astype(np.uint8)))
    base.alpha_composite(layer, (round(at[0]), round(at[1])))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def saturate(color, k):
    gray = sum(color) / 3
    return tuple(int(np.clip(gray + (c - gray) * k, 0, 255)) for c in color)


def boxes(title):
    return title if isinstance(title, list) else [title]


def fill_vertical(rgb, mask):
    """Vá vùng mask bằng nội suy dọc theo từng cột giữa điểm nền ngay trên và ngay dưới (nền gói thường chuyển màu dọc),
    nên không loang thành vệt xoáy như inpaint; cột chạm mép ảnh thì lấy điểm còn lại.
    Trả thêm độ tin cậy từng điểm (0–1): cao khi màu trên / dưới gần nhau (nền trơn), thấp khi nền nhiều hoạ tiết."""
    out = rgb.astype(np.float32).copy()
    trust = np.zeros(mask.shape, np.float32)
    h = mask.shape[0]
    for x in np.nonzero(mask.any(0))[0]:
        col = mask[:, x] > 0
        y = 0
        while y < h:
            if not col[y]: y += 1; continue
            y0 = y
            while y < h and col[y]: y += 1
            above, below = y0 - 1, y
            a = out[above, x] if above >= 0 else None
            b = out[below, x] if below < h else None
            if a is None: a = b
            if b is None: b = a
            t = (np.arange(y0, y) - above)[:, None] / (below - above)
            out[y0:y, x] = a * (1 - t) + b * t
            trust[y0:y, x] = np.clip(1.4 - np.abs(a - b).max() / 50, 0, 1)
    return out.astype(np.uint8), trust


def erase_title(img, title, ink):
    """Xoá chữ tiêu đề gốc: nhận điểm chữ trong vùng, nới rộng (ăn cả bóng / viền chữ) rồi vá bằng inpaint, làm mịn chỗ vá.
    Trả về ảnh đã xoá, màu chữ gốc (trung vị nửa trên, nửa dưới), hộp bao chữ gốc, chiều cao dòng chữ gốc cao nhất và số dòng chữ gốc."""
    rgba = np.asarray(img).copy()
    a = rgba[..., :3].astype(int)
    mask = np.zeros(a.shape[:2], np.uint8)
    colors = []  # màu chữ (trung vị) theo từng nửa trên / dưới của mỗi hộp, từ trên xuống
    for x0, y0, x1, y1 in boxes(title):
        sub = a[y0:y1, x0:x1]
        hit = ink(sub[..., 0], sub[..., 1], sub[..., 2])
        rows = np.nonzero(hit.any(1))[0]
        if not len(rows):
            raise SystemExit('Không thấy chữ tiêu đề trong vùng title của mùa này — kiểm tra lại toạ độ / ink.')
        mid = (rows[0] + rows[-1]) // 2
        for half in (slice(0, mid), slice(mid, None)):
            if hit[half].any():
                colors.append(np.median(sub[half][hit[half]], axis=0))
        mask[y0:y1, x0:x1] |= hit.astype(np.uint8) * 255
    top, bottom = colors[0], colors[-1]
    ys, xs = np.nonzero(mask)
    ink_box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    k = max(5, round(9 * img.width / 462)) | 1
    mask = cv2.dilate(mask, np.ones((k, k), np.uint8))
    rgb = np.ascontiguousarray(rgba[..., 2::-1])
    # Vá theo chiều dọc rồi trộn với inpaint (giữ chút vân nền), làm mịn ngang nhẹ để không thành sọc dọc.
    vertical, trust = fill_vertical(rgb, mask)
    vertical = np.where(mask[..., None] > 0, cv2.GaussianBlur(vertical, (0, 0), sigmaX=2.5 * img.width / 462, sigmaY=.6), vertical)
    trust = cv2.GaussianBlur(trust, (0, 0), 3)[..., None] * .8
    out = (vertical * trust + cv2.inpaint(rgb, mask, k, cv2.INPAINT_TELEA) * (1 - trust)).astype(np.uint8)
    blur = cv2.GaussianBlur(out, (0, 0), 1.2 * img.width / 462)
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 1.2 * img.width / 462)[..., None]
    out = (out * (1 - soft) + blur * soft).astype(np.uint8)
    rgba[..., :3] = out[..., ::-1]
    return Image.fromarray(rgba), tuple(int(v) for v in top), tuple(int(v) for v in bottom), ink_box


# Cỡ tiêu đề mới như nhau trên mọi khung (theo bề ngang ảnh, bằng khung BDO): chữ hoa cao TITLE_CAP × bề ngang;
# tiêu đề dài hơn TITLE_MAX_WIDTH × bề ngang mới co lại cho vừa.
TITLE_CAP = .0968
TITLE_MAX_WIDTH = .82


def draw_title(img, text, top, bottom, ink_box):
    """Tiêu đề mới ở giữa chỗ chữ gốc, cùng cỡ trên mọi khung (người dùng: "MULTI CLASS, TOP PRICE phải cùng cỡ chữ như thẻ BDO")."""
    ix0, iy0, ix1, iy1 = ink_box
    light = sum(mix(top, bottom, .5)) / 3 > 128
    # Màu chính = dòng chữ gốc nổi nhất (chữ sáng lấy dòng sáng hơn, chữ tối lấy dòng tối hơn).
    ink = max(top, bottom, key=sum) if light else min(top, bottom, key=sum)
    # Chữ trắng / xám / đen (ít màu): tô phẳng, chỉ đổ bóng nhẹ như chữ gốc; chữ màu: dải sáng–đậm và viền tối mảnh.
    neutral = max(ink) - min(ink) < 40
    cap = img.width * TITLE_CAP
    room = img.width * TITLE_MAX_WIDTH
    stroke = max(1, round(img.width / 462))
    outlined = light and not neutral
    for _ in range(4):
        fill, outline, cap_top, _left = render_text(text, cap / .7, 650, 84, stroke=stroke if outlined or light else 0, word_gap=.55)
        if fill.width <= room:
            break
        cap *= room / fill.width
    at = ((ix0 + ix1) / 2 - fill.width / 2, (iy0 + iy1) / 2 - cap / 2 - cap_top)
    w, h = fill.size
    # Dải màu dọc: trên sáng (pha trắng), giữa đúng màu chữ gốc, dưới đậm hơn.
    if neutral:
        hi, lo = mix(ink, (255, 255, 255), .25), mix(ink, (0, 0, 0), .06)
    else:
        hi, lo = (mix(ink, (255, 252, 236), .5), saturate(mix(ink, (0, 0, 0), .15), 1.5)) if light else (mix(ink, (255, 255, 255), .12), mix(ink, (0, 0, 0), .1))
    ramp = np.zeros((h, w, 4), np.uint8)
    t = np.clip((np.arange(h) - cap_top) / max(1, cap), 0, 1)[:, None]
    for c in range(3):
        ramp[..., c] = np.where(t < .45, hi[c] + (ink[c] - hi[c]) * t / .45, ink[c] + (lo[c] - ink[c]) * (t - .45) / .55)
    ramp[..., 3] = 255
    if outlined:
        shadow = outline.filter(ImageFilter.GaussianBlur(1.6 * stroke))
        paint(img, shadow, (12, 10, 6, 150), (at[0], at[1] + stroke))
        paint(img, outline, mix(bottom, (0, 0, 0), .78) + (235,), at)
    elif light:
        shadow = fill.filter(ImageFilter.GaussianBlur(.9 * stroke))
        paint(img, shadow, (0, 0, 0, 110), (at[0], at[1] + stroke))
    paint(img, fill, Image.fromarray(ramp, 'RGBA'), at)


def stack_badges(img, first, rest):
    """Huy hiệu các mùa sau cắt từ ảnh gói của mùa đó, cùng bề ngang huy hiệu mùa đầu, xếp chồng lên trên."""
    bx0, by0, bx1, by1 = SEASONS[first]['badge']
    width, gap, top = bx1 - bx0, max(2, round((bx1 - bx0) * .065)), by0
    for tier in rest:
        cfg = SEASONS[tier]
        src = Image.open(os.path.join(ASSETS, cfg['art'])).convert('RGBA')
        x0, y0, x1, y1 = cfg['badge']
        crop = src.crop((x0, y0, x1, y1))
        height = round(width * (y1 - y0) / (x1 - x0))
        crop = crop.resize((width, height), Image.LANCZOS)
        top -= gap + height
        img.alpha_composite(crop, (bx0, top))


def corner_panel(img):
    """Tấm tối cắt chéo ở góc dưới phải (cắt theo viền thẻ); trả về khung thẻ (bx0, by0, bw, bh) để đặt chữ."""
    alpha = np.asarray(img.getchannel('A'))
    ys, xs = np.nonzero(alpha > 8)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    bw, bh = bx1 - bx0, by1 - by0
    (u1, v1), (u2, v2) = PANEL_LINE
    p1 = np.array([bx0 + u1 * bw, by0 + v1 * bh]); p2 = np.array([bx0 + u2 * bw, by0 + v2 * bh])
    normal = np.array([p2[1] - p1[1], p1[0] - p2[0]]); normal /= np.hypot(*normal)
    if np.dot(np.array([bx1, by1]) - p1, normal) < 0:
        normal = -normal
    yy, xx = np.mgrid[0:img.height, 0:img.width]
    cover = np.clip((xx + .5 - p1[0]) * normal[0] + (yy + .5 - p1[1]) * normal[1] + .5, 0, 1)
    rgba = np.asarray(img).astype(np.float32)
    for c in range(3):
        rgba[..., c] = rgba[..., c] * (1 - cover) + PANEL_COLOR[c] * cover
    img.paste(Image.fromarray(rgba.astype(np.uint8), 'RGBA'))
    return bx0, by0, bw, bh


def ovr_corner(img, min_ovr, edge=.961):
    """Góc dưới phải: ▲OVR tối thiểu xanh lá và chữ OVR xám. edge = mép phải chữ (tỉ lệ bề ngang thẻ); khung viền dày như BLD lùi vào."""
    bx0, by0, bw, bh = corner_panel(img)
    # ▲117: chữ số cao ~7,4% thẻ, mép phải ở 96% bề ngang, chân chữ ở 85% chiều cao; tam giác ngay bên trái, thấp hơn giữa số.
    cap = .074 * bh
    digits, _o, cap_top, left = render_text(str(min_ovr), cap / .7, 700, 75)
    right = bx0 + edge * bw
    at = (right - digits.width + 2, by0 + .850 * bh - cap - cap_top)
    paint(img, digits, OVR_GREEN, at)
    tri_w, tri_h = .060 * bw, .020 * bh
    tri_r = at[0] + left - .012 * bw
    tri_b = by0 + .821 * bh
    s = 4
    tri = Image.new('L', (round(tri_w * s) + s, round(tri_h * s) + s))
    ImageDraw.Draw(tri).polygon([(0, tri_h * s), (tri_w * s, tri_h * s), (tri_w * s / 2, 0)], fill=255)
    tri = tri.resize((tri.width // s, tri.height // s), Image.LANCZOS)
    paint(img, tri, OVR_GREEN, (tri_r - tri_w, tri_b - tri_h))
    label, _o, cap_top, _l = render_text('OVR', .034 * bh / .7, 400, 80)
    paint(img, label, OVR_GRAY, (bx0 + (edge - .003) * bw - label.width + 2, by0 + .868 * bh - cap_top))


def top_price_corner(img, top_price, label_text='TOP PRICE', edge=.961):
    """Góc dưới phải của gói top price / chỉ định: số cầu thủ (chữ trắng, cùng cỡ số OVR) và chữ TOP PRICE / DRAFT bên dưới."""
    bx0, by0, bw, bh = corner_panel(img)
    cap = .074 * bh
    digits, _o, cap_top, _l = render_text(str(top_price), cap / .7, 700, 75)
    paint(img, digits, (255, 255, 255), (bx0 + edge * bw - digits.width + 2, by0 + .850 * bh - cap - cap_top))
    label, _o, cap_top, _l = render_text(label_text, .034 * bh / .7, 600, 80)
    paint(img, label, (235, 237, 240), (bx0 + (edge - .003) * bw - label.width + 2, by0 + .868 * bh - cap_top))


def compose(title, seasons, min_ovr=None, top_price=None, draft=None):
    first = seasons[0]
    cfg = SEASONS[first]
    img = Image.open(os.path.join(ASSETS, cfg['art'])).convert('RGBA')
    if ' '.join(title.upper().split()) != KEEP_TITLES.get(first):
        img, top, bottom, ink_box = erase_title(img, cfg['title'], cfg['ink'])
        draw_title(img, title, top, bottom, ink_box)
    stack_badges(img, first, seasons[1:])
    # Gói top price ghi số cầu thủ ở góc thay cho ▲OVR (OVR tối thiểu vẫn lọc cầu thủ nhưng không in).
    if draft is not None:
        top_price_corner(img, draft, 'DRAFT', cfg.get('corner_edge', .961))
    elif top_price is not None:
        top_price_corner(img, top_price, edge=cfg.get('corner_edge', .961))
    elif min_ovr is not None:
        ovr_corner(img, min_ovr, cfg.get('corner_edge', .961))
    return img


def main():
    parser = argparse.ArgumentParser(description='Ghép ảnh gói tùy biến từ ảnh gói các mùa (mùa đầu tiên làm khung).')
    parser.add_argument('--id', required=True, help='id gói trong src/game.ts, cũng là tên file <id>-back.webp')
    parser.add_argument('--title', required=True, help='tiêu đề in trên gói, vd. "MULTI CLASS"')
    parser.add_argument('--seasons', required=True, help='danh sách mùa theo thứ tự huy hiệu, vd. stellar,origin,amb')
    parser.add_argument('--min-ovr', type=int, help='OVR tối thiểu ghi ở góc dưới phải (bỏ trống = không in góc OVR)')
    parser.add_argument('--top-price', type=int, help='gói top price: số cầu thủ giá cao nhất, in ở góc dưới phải thay cho ▲OVR')
    parser.add_argument('--draft', type=int, help='gói chỉ định: số cầu thủ được chọn, in N và chữ DRAFT ở góc dưới phải')
    parser.add_argument('--out', help='đường dẫn ra (mặc định public/assets/custom/<id>-back.webp)')
    args = parser.parse_args()
    seasons = [s.strip() for s in args.seasons.split(',') if s.strip()]
    unknown = [s for s in seasons if s not in SEASONS]
    if unknown:
        raise SystemExit(f'Mùa không có trong bảng SEASONS: {", ".join(unknown)} (có: {", ".join(SEASONS)})')
    out = args.out or os.path.join(ASSETS, 'custom', f'{args.id}-back.webp')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    img = compose(args.title.upper(), seasons, args.min_ovr, args.top_price, args.draft)
    if out.lower().endswith('.webp'):
        img.save(out, 'WEBP', quality=92, method=6)
    else:
        img.save(out)
    print(f'Đã ghép {out} ({img.width}×{img.height}) · khung {seasons[0]} · huy hiệu {" → ".join(seasons)} · {f"OVR ≥ {args.min_ovr}" if args.min_ovr is not None else "không giới hạn OVR"}{f" · top {args.top_price} giá cao nhất" if args.top_price is not None else ""}')


if __name__ == '__main__':
    main()
