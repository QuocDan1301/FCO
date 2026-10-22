from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import gzip
import json

work = Path(__file__).resolve().parent
spid = json.loads((work / 'nexon-spid.json').read_text(encoding='utf-8-sig'))
expected = [{**p, 'id': 843000000 + p['id'] % 1000000} if p['id'] // 1000000 == 839 else p for p in spid if p['id'] // 1000000 in [100, 839, 866]]
cache = work / 'garena-player-names.json'
saved = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else []
found = {p['spid']: p for p in saved}
def fetch(player):
    identifier = player['id']
    if identifier in found: return found[identifier]
    url = f'https://dc.fconline.garena.vn/api/app/players/{identifier}/card'
    try:
        raw = urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://dc.fconline.garena.vn/player'}), timeout=25).read()
        if raw[:2] == b'\x1f\x8b': raw = gzip.decompress(raw)
        response = json.loads(raw)
        return {**response['data']['player'], 'source': url, 'asOfDate': response.get('meta', {}).get('asOfDate')}
    except Exception as error:
        return {'spid': identifier, 'nameKo': player['name'], 'error': str(error)}
with ThreadPoolExecutor(max_workers=4) as pool:
    result = list(pool.map(fetch, expected))
cache.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'expected': len(expected), 'loaded': sum('name' in p for p in result), 'errors': [p for p in result if 'error' in p]}))
