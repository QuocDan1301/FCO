# Dò ảnh miniface (HEAD) cho mã thẻ giải từ uid fifaaddict: spid = mã mùa của thẻ + mã cầu thủ.
# python -I fa_probe.py <repo> <portraits-all dir> <out.json>
import sys, os, json, collections, urllib.request
from concurrent.futures import ThreadPoolExecutor
repo, pa, out_path = sys.argv[1:4]
BASE = 'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p{}.png'
d = json.load(open('D:/FCOvv-tmp/tmp/need-compact.json', encoding='utf8'))
codes = {c[0]: c[2] for c in d['c']}
nums = open('D:/FCOvv-tmp/tmp/fa-pids.txt').read().split()
pairs = {int(nums[i]): int(nums[i+1]) for i in range(0, len(nums), 2)}
want = {}
for cid, pid in pairs.items():
    want.setdefault(codes[cid] + str(pid).zfill(6), []).append(cid)
# Đối chiếu: mã cầu thủ đã xác nhận bằng so ảnh (cùng tên + quốc tịch) có trùng không
cards = {c['id']: c for c in json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']}
pm = json.load(open(repo + '/src/portraits.json', encoding='utf8'))['cards']
known = collections.defaultdict(set)
for cid, spid in pm.items(): c = cards[int(cid)]; known[(c['name'], c['nation'])].add(spid[3:])
agree = disagree = 0; dis = []
for cid, pid in pairs.items():
    k = known.get((cards[cid]['name'], cards[cid]['nation']))
    if not k: continue
    if str(pid).zfill(6) in k: agree += 1
    else: disagree += 1; dis.append((cid, pid, sorted(k)))
print('pairs', len(pairs), 'spids', len(want), 'person-check agree', agree, 'disagree', disagree)
print('dis sample', dis[:12])
have = {f[1:-4] for f in os.listdir(pa) if f.endswith('.png')}
local = [s for s in want if s in have]
todo = sorted(s for s in want if s not in have)
def head(spid):
    req = urllib.request.Request(BASE.format(spid), method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return spid, r.status, int(r.headers.get('Content-Length') or 0)
    except Exception as e: return spid, getattr(e, 'code', 0), 0
with ThreadPoolExecutor(8) as ex: res = list(ex.map(head, todo))
found = {s: n for s, st, n in res if st == 200}
json.dump({'pairs': {str(k): v for k, v in pairs.items()}, 'local': local, 'found': found, 'want': want}, open(out_path, 'w', encoding='utf8'))
hit = {c for s in list(found) + local for c in want[s]}
print('local', len(local), 'probed', len(todo), 'found', len(found), 'cards covered', len(hit), 'bytes', sum(found.values()), dict(collections.Counter(st for _, st, _ in res)))
