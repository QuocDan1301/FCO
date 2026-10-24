import json, re, zipfile, pathlib, shutil
d=pathlib.Path('outputs/prime-fc-prices-20261024')
changes=json.loads((d/'changes.json').read_text(encoding='utf-8'))
source=pathlib.Path('gia-cau-thu-bp.xlsx')
out=d/'gia-cau-thu-bp.xlsx'
with zipfile.ZipFile(d/'before.xlsx') as original, zipfile.ZipFile(d/'authored.xlsx') as authored:
    xml=original.read('xl/worksheets/sheet1.xml').decode()
    new=authored.read('xl/worksheets/sheet1.xml').decode()
    for t in changes:
        addr=f'J{t["row"]}'
        pat=rf'<c\b[^>]*\br="{addr}"[^>]*(?:/>|>.*?</c>)'
        oldcell=re.search(pat,xml).group()
        authoredcell=re.search(rf'<x:c\b[^>]*\br="{addr}"[^>]*>.*?</x:c>',new).group()
        val=re.search(r'<x:v>(.*?)</x:v>',authoredcell).group(1)
        assert float(val)==t['price']
        opening=oldcell.split('>')[0].rstrip('/')+'>'
        opening=re.sub(r' t="[^"]*"','',opening)
        replacement=opening+f'<v>{t["price"]}</v></c>'
        xml,n=re.subn(pat,lambda _:replacement,xml)
        assert n==1
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for entry in original.infolist():
            z.writestr(entry,xml.encode() if entry.filename=='xl/worksheets/sheet1.xml' else original.read(entry.filename))
with zipfile.ZipFile(d/'before.xlsx') as a,zipfile.ZipFile(out) as b:
    assert a.namelist()==b.namelist()
    assert [n for n in a.namelist() if a.read(n)!=b.read(n)]==['xl/worksheets/sheet1.xml']
    xa=a.read('xl/worksheets/sheet1.xml').decode(); xb=b.read('xl/worksheets/sheet1.xml').decode()
    for t in changes:
        pat=rf'<c\b[^>]*\br="J{t["row"]}"[^>]*(?:/>|>.*?</c>)'
        xa=re.sub(pat,'',xa); xb=re.sub(pat,'',xb)
    assert xa==xb,'Unintended worksheet changes'
try:
    shutil.copyfile(out,source)
    print('Updated original workbook; verified exactly 24 price cells changed, all other XML preserved.')
except PermissionError:
    print('Original workbook is locked by Excel. Updated copy saved at '+str(out))
