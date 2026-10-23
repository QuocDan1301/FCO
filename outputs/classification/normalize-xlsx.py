from pathlib import Path
import zipfile
import re
path = Path('gia-cau-thu-bp.xlsx')
with zipfile.ZipFile(path) as z:
    parts = {name: z.read(name) for name in z.namelist()}
for name, content in parts.items():
    if name.endswith('.xml'):
        text = content.decode('utf-8-sig')
        # ExcelJS nhận namespace chính dạng mặc định, không nhận tên phần tử x:.
        text = text.replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
        text = re.sub(r'(<\/?)(?:x:)', r'\1', text)
        # Bảng nguồn ẩn toàn bộ dòng dữ liệu; hiện lại để người dùng kiểm tra giá mới.
        if name == 'xl/worksheets/sheet1.xml':
            text = re.sub(r'(<row\b[^>]*?)\s+hidden="1"', r'\1', text)
        if name == '[Content_Types].xml' and 'PartName="/xl/workbook.xml"' not in text:
            text = text.replace('</Types>', '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
        parts[name] = text.encode('utf-8')
with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, content in parts.items():
        z.writestr(name, content)
Path('outputs/classification/gia-cau-thu-bp.xlsx').write_bytes(path.read_bytes())
print('Normalized XML namespaces for ExcelJS compatibility; cell formulas and values preserved.')
