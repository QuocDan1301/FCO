# Tra mã thẻ (spid) cho thẻ chưa có miniface qua API công khai Garena Data Center (/api/app/search/players?q=<tên>),
# chọn mục cùng mã mùa với thẻ, OVR lệch <= 3, trùng họ (bỏ dấu). Rồi HEAD máy chủ ảnh FC Online (chưa tải).
# python -I garena_lookup.py <out.json>
import sys, json, time, re, unicodedata, urllib.request, urllib.parse, collections
from concurrent.futures import ThreadPoolExecutor
out_path = sys.argv[1]
miss = json.load(open('D:/FCOvv-tmp/tmp/missing-faces.json', encoding='utf8'))
years = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['years']
def fold(s):
    s = s.replace('ß', 'ss').replace('æ', 'ae').replace('ø', 'o').replace('ı', 'i').replace('đ', 'd').replace('Đ', 'D')
    return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).split()
def search(q):
    url = 'https://dc.fconline.garena.vn/api/app/search/players?q=' + urllib.parse.quote(q)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}), timeout=25) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(1.5)
    return None
cache = {}
def lookup(name):
    if name in cache: return cache[name]
    toks = fold(name); res = search(name) or []
    if not res and toks: res = search(toks[-1]) or []
    cache[name] = res; time.sleep(.25); return res
names = sorted({c['name'] for c in miss})
with ThreadPoolExecutor(3) as ex: list(ex.map(lookup, names))
found = {}; why = collections.Counter()
for c in miss:
    codes = years.get(c['tier'], []); last = (fold(c['name']) or [''])[-1]
    res = cache.get(c['name']) or []
    cand = [r for r in res if str(r.get('seasonId')) in codes and last in fold(r.get('name', ''))]
    if not res: why['không tìm thấy tên'] += 1; continue
    if not cand: why['không có mùa này'] += 1; continue
    cand.sort(key=lambda r: abs((r.get('overall') or 0) - c['ovr']))
    d = abs((cand[0].get('overall') or 0) - c['ovr'])
    if d > 3: why[f'OVR lệch {d}'] += 1; continue
    if len(cand) > 1 and abs((cand[1].get('overall') or 0) - c['ovr']) == d and cand[1]['spid'] % 1000000 != cand[0]['spid'] % 1000000: why['trùng tên khó chọn'] += 1; continue
    found[str(c['id'])] = cand[0]['spid']
def head(spid):
    req = urllib.request.Request(f'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p{spid}.png', method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return spid, r.status, int(r.headers.get('Content-Length') or 0)
    except Exception as e: return spid, getattr(e, 'code', 0), 0
with ThreadPoolExecutor(8) as ex: hs = list(ex.map(head, sorted(set(found.values()))))
ok = {s: n for s, st, n in hs if st == 200}
json.dump({'found': found, 'cdn': {str(k): v for k, v in ok.items()}}, open(out_path, 'w', encoding='utf8'))
print('missing', len(miss), 'names', len(names), 'matched', len(found), 'cdn ok', len(ok), 'bytes', sum(ok.values()))
print({k.encode('ascii', 'replace').decode(): v for k, v in why.items()})
