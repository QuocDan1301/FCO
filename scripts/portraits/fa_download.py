# Tải ảnh đã dò thấy (fa-probe.json 'found') vào thư mục riêng; kiểm tra là PNG hợp lệ.
import sys, os, json, urllib.request
from concurrent.futures import ThreadPoolExecutor
probe, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
found = json.load(open(probe, encoding='utf8'))['found']
BASE = 'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p{}.png'
def get(s):
    p = os.path.join(dst, f'p{s}.png')
    if os.path.exists(p) and os.path.getsize(p) > 0: return s, True
    try:
        req = urllib.request.Request(BASE.format(s), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r: b = r.read()
        if not b.startswith(b'\x89PNG'): return s, False
        open(p, 'wb').write(b); return s, True
    except Exception: return s, False
with ThreadPoolExecutor(8) as ex: res = list(ex.map(get, sorted(found)))
bad = [s for s, ok in res if not ok]
print('ok', len(res) - len(bad), 'fail', len(bad), bad[:10])
