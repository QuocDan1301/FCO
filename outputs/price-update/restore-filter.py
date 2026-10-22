from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import sys

# Artifact Tool does not preserve an imported worksheet AutoFilter on export.
# Restore that native feature and extend it to the added price/status columns.
targets = ['outputs/price-update/gia-cau-thu-bp.xlsx']
if '--output-only' not in sys.argv:
    targets.append('gia-cau-thu-bp.xlsx')
for name in targets:
    target = Path(name)
    with ZipFile(target) as source:
        members = [(info, source.read(info.filename)) for info in source.infolist()]
    replacement = target.with_suffix('.filter-fixed.xlsx')
    with ZipFile(replacement, 'w', ZIP_DEFLATED) as output:
        for info, data in members:
            if info.filename == 'xl/worksheets/sheet1.xml':
                xml = data.decode('utf-8')
                prefix = re.search(r'<((?:\w+:)?)worksheet', xml).group(1)
                filter_tag = f'<{prefix}autoFilter ref="A1:W224"/>'
                if f'<{prefix}autoFilter' in xml:
                    xml = re.sub(rf'<{prefix}autoFilter\b[^>]*/>', filter_tag, xml)
                else:
                    closing = f'</{prefix}sheetData>'
                    assert closing in xml
                    xml = xml.replace(closing, closing + filter_tag, 1)
                data = xml.encode('utf-8')
            output.writestr(info, data)
    replacement.replace(target)
print('Restored workbook filter A1:W224 in existing workbook and output copy.')
