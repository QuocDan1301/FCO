"""Append the 25HR rows to gia-cau-thu-bp2.xlsx and register their prices in src/player-prices.json.
Usage: python scripts/import-hr25-prices.py   (close the workbook in Excel first)
+1 prices come from scripts/data/hr25.csv (the user's price-list screenshots, 07/11/2026);
+2…+13 copy the bp2 formula family of the JNM/SPT rows (117, ×1). Existing rows are never changed,
and the shop pack is not added here: Shop packs are created in the admin page (#quan-tri).
"""
import copy
import csv
import json
import math
import re
from pathlib import Path

import openpyxl
from openpyxl.comments import Comment

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / 'gia-cau-thu-bp2.xlsx'
PRICES = ROOT / 'src/player-prices.json'
FIRST_ID = 3771
NATIONS = dict(BE='Bỉ', ES='Tây Ban Nha', BR='Brazil', SK='Slovakia', AR='Argentina', FR='Pháp', EN='Anh', NL='Hà Lan', HR='Croatia', IT='Ý', CZ='Séc', CI='Bờ Biển Ngà', US='Mỹ', CO='Colombia', SA='Ả Rập Xê Út')
NOTE = 'Giá +1: ảnh danh sách 25HR do người dùng cung cấp ngày 07/11/2026. +2…+13 theo công thức bp2 (117, ×1).'
FAMILY = re.compile(r'^=IF\(\$J\d+=0,0,ROUND\(MAX\(\$J\d+\*([\d.*]+),([\d.]+)\*\(([\d.]+)\^\(MIN\(\$E\d+,123\)-117\)\)\)\*1,0\)\)$')

rows = list(csv.DictReader((ROOT / 'scripts/data/hr25.csv').open(encoding='utf-8'), delimiter='|'))
assert len(rows) == 20
assert not (ROOT / '~$gia-cau-thu-bp2.xlsx').exists(), 'Excel đang mở bảng giá bp2. Lưu và đóng file trước.'
wb = openpyxl.load_workbook(WORKBOOK)
ws = wb['Giá cầu thủ']
template = max(r for r in range(3, ws.max_row + 1) if ws.cell(r, 3).value == 'JNM')
present = {ws.cell(r, 1).value for r in range(3, ws.max_row + 1)}
data = json.loads(PRICES.read_text(encoding='utf-8'))


def evaluate(formula, price, rating):
    m = FAMILY.match(formula)
    assert m, f'Unexpected template: {formula}'
    multiplier = math.prod(float(x) for x in m[1].split('*'))
    return math.floor(max(price * multiplier, float(m[2]) * float(m[3]) ** (min(rating, 123) - 117)) + 0.5)


added = 0
for i, row in enumerate(rows):
    pid, rating, price = FIRST_ID + i, int(row['ovr']), int(row['price'])
    formulas = [ws.cell(template, 12 + 2 * k).value for k in range(12)]
    data['players'].setdefault(str(pid), [price] + [evaluate(f, price, rating) for f in formulas])
    if pid in present:
        continue
    r = ws.max_row + 1
    values = [pid, row['name'], '25HR', row['pos'], rating, NATIONS[row['flag']], row['club'], int(row['wage'])]
    for c in range(1, 35):
        src, dst = ws.cell(template, c), ws.cell(r, c)
        if src.has_style:
            dst._style = copy.copy(src._style)
        if c <= 8:
            dst.value = values[c - 1]
        elif c == 10:
            dst.value = price
            dst.comment = Comment(NOTE, 'Author')
        else:
            dst.value = re.sub(r'\$([A-Z]+)\d+', lambda m: f'${m[1]}{r}', src.value) if isinstance(src.value, str) else src.value
    ws.row_dimensions[r].height = ws.row_dimensions[template].height
    added += 1

if added:
    wb.save(WORKBOOK)
PRICES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'25HR: {added} rows appended; {len(rows)} prices registered. Existing rows preserved.')
