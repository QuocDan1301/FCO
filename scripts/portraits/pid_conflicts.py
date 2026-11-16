import json, collections, sys
repo = sys.argv[1]
cards = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']; pm = json.load(open(repo + '/src/portraits.json', encoding='utf8'))
m = json.load(open('D:/FCOvv-tmp/tmp/portrait-match.json', encoding='utf8'))
key = lambda c: c['name'] + '|' + c['nation']
owners = collections.defaultdict(collections.Counter)
for c in cards:
    s = pm['cards'].get(str(c['id']))
    if s: owners[s[3:]][key(c)] += 1
bad = []
for c in cards:
    s = pm['cards'].get(str(c['id']))
    if not s: continue
    o = owners[s[3:]]
    if len(o) > 1:
        bad.append((str(c['id']), c['tier'], key(c), s, dict(o), m.get(str(c['id']), {}).get('score')))
out = open('D:/FCOvv-tmp/tmp/pid-conflicts.txt', 'w', encoding='utf8')
for b in bad: print(*b, file=out)
print('conflict cards', len(bad), 'pids', len({b[3][3:] for b in bad}))
