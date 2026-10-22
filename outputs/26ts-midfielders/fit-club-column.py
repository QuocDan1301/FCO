from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
import re

work = Path(__file__).resolve().parent
target = work.parent.parent / 'gia-cau-thu-bp.xlsx'
before = target.read_bytes()
result = BytesIO()
with ZipFile(BytesIO(before)) as source, ZipFile(result, 'w') as output:
    for info in source.infolist():
        value = source.read(info.filename)
        if info.filename == 'xl/worksheets/sheet1.xml':
            xml = value.decode('utf-8')
            xml, count = re.subn(r'(<col\b[^>]*\bmin="7"[^>]*\bmax="7"[^>]*\bwidth=")[^"]+', r'\g<1>22', xml)
            assert count == 1
            value = xml.encode('utf-8')
        output.writestr(info, value)
assert target.read_bytes() == before
temporary = work / 'excel-width.tmp'
temporary.write_bytes(result.getvalue())
temporary.replace(target)
print('Club column widened to fit Vancouver Whitecaps; other package contents preserved.')
