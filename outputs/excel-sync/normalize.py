from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET
from copy import deepcopy

# ExcelJS's XML reader expects the SpreadsheetML default namespace.
# Normalize prefixes only; the authored workbook contents are unchanged.
directory = Path(sys.argv[1] if len(sys.argv) > 1 else 'outputs/excel-sync')
path = directory / 'proposed.xlsx'
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ET.register_namespace('', ns)
ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
with ZipFile(directory / 'before.xlsx') as original:
    original_entries = [(item, original.read(item.filename)) for item in original.infolist()]
    cached = {}
    views = {}
    for name in original.namelist():
        if not (name.startswith('xl/worksheets/') and name.endswith('.xml')):
            continue
        root = ET.fromstring(original.read(name))
        views[name] = root.find('{' + ns + '}sheetViews')
        cached[name] = {cell.attrib['r']: cell for cell in root.findall('.//{' + ns + '}c') if cell.find('{' + ns + '}f') is not None}
with ZipFile(path) as source:
    entries = [(item, source.read(item.filename)) for item in source.infolist()]
with ZipFile(path, 'w', ZIP_DEFLATED) as dest:
    for item, data in entries:
        if item.filename.startswith('xl/') and item.filename.endswith('.xml'):
            root = ET.fromstring(data)
            if root.tag.startswith('{' + ns + '}'):
                if item.filename in views:
                    current = root.find('{' + ns + '}sheetViews')
                    if current is not None:
                        root.remove(current)
                    if views[item.filename] is not None:
                        root.insert(0, deepcopy(views[item.filename]))
                # Preserve original formula caches: unrelated rows are outside this edit.
                for cell in root.findall('.//{' + ns + '}c'):
                    before = cached.get(item.filename, {}).get(cell.attrib['r'])
                    if before is None:
                        continue
                    old_formula, new_formula = before.find('{' + ns + '}f'), cell.find('{' + ns + '}f')
                    if new_formula is None or old_formula.text != new_formula.text:
                        raise ValueError('Existing formula changed: ' + cell.attrib['r'])
                    value = cell.find('{' + ns + '}v')
                    if value is not None:
                        cell.remove(value)
                    old_value = before.find('{' + ns + '}v')
                    if old_value is not None:
                        cell.append(deepcopy(old_value))
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
        dest.writestr(item, data)

# Preserve workbook-level settings, relationships and document properties.
# Only the data sheets, styles and strings are affected by the appended rows.
with ZipFile(path) as source:
    updated = {item.filename: source.read(item.filename) for item in source.infolist()}
affected = {'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'}
with ZipFile(path, 'w', ZIP_DEFLATED) as dest:
    for item, data in original_entries:
        dest.writestr(item, updated[item.filename] if item.filename in affected else data)
