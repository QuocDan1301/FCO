from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
import json
import re

work = Path(__file__).resolve().parent
sources = {
    'nexon-seasons.json': 'https://open.api.nexon.com/static/fconline/meta/seasonid.json',
    'garena.html': 'https://dc.fconline.garena.vn/player',
    'fcoplayers.html': 'https://fcoplayers.com/mua-the/no7',
}
def fetch(entry):
    name, url = entry
    raw = urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
    (work / name).write_bytes(raw)
    return name, len(raw)
with ThreadPoolExecutor(max_workers=3) as pool:
    print(json.dumps(list(pool.map(fetch, sources.items()))))
seasons = json.loads((work / 'nexon-seasons.json').read_text(encoding='utf-8-sig'))
print(json.dumps([row for row in seasons if any(word in row.get('className','').upper() for word in ['ICONTM', '26TS', 'NO7', 'NO.7', 'NUMBER 7'])], ensure_ascii=True))
for name in ['garena.html', 'fcoplayers.html']:
    html = (work / name).read_text(encoding='utf-8')
    print(name, re.findall(r'<script[^>]+src=["\x27]([^"\x27]+)', html))
