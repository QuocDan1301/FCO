"""Tạo ảnh khung mùa cho nhãn cạnh tên cầu thủ: public/assets/seasons/<tier>.webp và src/season-badges.css.

Chạy từ thư mục dự án: python scripts/season-badges.py

Nguồn: bảng huy hiệu người dùng cung cấp, scripts/season-badges/sheet.png (119 ô 38×30 px).
Thêm mùa mới: mở scripts/season-badges/sheet-labeled.png tìm số "hàng.cột" của huy hiệu (tên từng ô ở labels.json),
thêm một dòng vào TIER_CELLS rồi chạy lại. Bảng chưa có huy hiệu thì thêm vào PACK_CROPS (cắt từ ảnh gói) hoặc xin người dùng bảng mới.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'public', 'assets')
SHEET = os.path.join(ROOT, 'scripts', 'season-badges', 'sheet.png')
CELL_W, CELL_H = 38, 30
COLS = [19, 66, 112, 158, 204, 251, 297, 343, 389, 436, 482, 528, 574, 621, 667, 713, 759, 806, 852, 898, 944]
ROWS = [11, 50, 89, 127, 166, 205]

TIER_CELLS = {
    'origin': '5.8', 'stellar': '6.5', 'eternal': '3.3', 'prime': '6.12', 'vietnam': '4.14', 'prm': '5.20', 'mdl': '3.17', 'amb': '4.16',
    'uc': '6.14', 'wg': '6.1', 'ut': '3.2', 'cu': '2.16', 'gru': '2.15', 'rtn': '2.21', 'dc': '3.4', 'cc': '3.7', 'bld': '3.15', 'wb': '5.10',
    'spt': '6.13', 'bdo': '3.8', 'hw23': '2.9', 'ep24': '2.10', 'ptg': '6.4', 'le': '5.11', 'hg': '2.14', 'spl': '3.5', 'ln': '3.14', 'fa': '3.11',
    'lol': '3.10', 'cap': '3.1', 'boe21': '1.21', 'btb': '2.4', 'ebs': '2.13', 'juventus': '4.7', 'jnm': '3.19', 'hr25': '5.9', 'hr24': '4.6', 'chelsea': '4.3', 'hr26': '5.21', 'ld': '4.4',
}
# Mùa bảng chưa có: cắt từ ảnh gói (ảnh, hộp x0 y0 x1 y1). Ô 2.17 "UP" khác huy hiệu 26UP in trên thẻ nên không dùng.
PACK_CROPS = {'up26': ('up26-back', (136, 2094, 358, 2278)), 'live': ('live-back', (259, 2032, 461, 2202))}


def from_sheet(sheet, cell):
    row, col = map(int, cell.split('.'))
    x, y = COLS[col - 1], ROWS[row - 1]
    return sheet.crop((x, y, x + CELL_W, y + CELL_H))


def from_pack(art, box):
    path = next(p for p in (os.path.join(ASSETS, art + ext) for ext in ('.png', '.webp')) if os.path.exists(p))
    crop = Image.open(path).convert('RGB').crop(box)
    return crop.resize((round(crop.width * CELL_H * 2 / crop.height), CELL_H * 2), Image.LANCZOS)


sheet = Image.open(SHEET).convert('RGB')
os.makedirs(os.path.join(ASSETS, 'seasons'), exist_ok=True)
badges = {tier: from_sheet(sheet, cell) for tier, cell in TIER_CELLS.items()}
badges.update({tier: from_pack(*source) for tier, source in PACK_CROPS.items()})
rules = []
for tier, image in badges.items():
    image.save(os.path.join(ASSETS, 'seasons', tier + '.webp'), lossless=True)
    rules.append(f'.season-tag-{tier}{{--season-img:url(/assets/seasons/{tier}.webp)}}')

css = """/* Tạo bởi scripts/season-badges.py, đừng sửa tay. Nhãn mùa hiện bằng ảnh khung mùa; chữ trong suốt giữ lại cho trình đọc màn hình.
   Nạp trước squad.css để các luật ẩn nhãn (display:none) ở màn hẹp vẫn thắng; các thuộc tính khác dùng !important vì nhiều màn chỉnh cỡ / viền riêng. */
.squad-season{display:inline-block;vertical-align:middle}
.squad-season,.season-badge{width:2.1em;height:1.65em;padding:0!important;border:0!important;border-radius:2px;background:var(--season-img) center/contain no-repeat!important;color:transparent!important;overflow:hidden;white-space:nowrap;box-sizing:border-box}
""" + '\n'.join(rules) + '\n'
open(os.path.join(ROOT, 'src', 'season-badges.css'), 'w', encoding='utf8', newline='\n').write(css)
print(len(badges), 'mua')
