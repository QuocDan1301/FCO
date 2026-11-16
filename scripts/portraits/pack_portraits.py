# Đóng gói chân dung đã khớp (portrait-match.json) vào game:
#  - nhận cặp khi điểm <= 0,72, hoặc điểm <= 0,85 và chênh với ứng viên khác cầu thủ >= 0,12;
#  - thẻ không có ảnh cùng mùa: dùng ảnh của chính cầu thủ (cùng tên + quốc tịch) ở mùa khác (ưu tiên điểm khớp tốt nhất);
#  - ảnh 112×112 WebP (giữ nền trong suốt) ở public/assets/portraits/<spid>.webp; bảng src/portraits.json { cards: { playerId: spid } }.
# python -I pack_portraits.py <repo> <playersAction>
import sys, os, json, collections
from PIL import Image

repo, pa = sys.argv[1], sys.argv[2]
d = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))
cards = {str(c['id']): c for c in d['cards']}
m = json.load(open('D:/FCOvv-tmp/tmp/portrait-match.json', encoding='utf8'))

def ok(v): return v['score'] <= .72 or (v['score'] <= .85 and v['margin'] >= .12)
own = {cid: v for cid, v in m.items() if ok(v)}
key = lambda c: (c['name'], c.get('nation', ''))
by_person = collections.defaultdict(list)
for cid, v in own.items(): by_person[key(cards[cid])].append(v)
# Mã cầu thủ đã xác nhận bằng so ảnh (6 số cuối spid của cặp khớp đúng mùa), theo người (tên + quốc tịch).
verified = collections.defaultdict(list)
for cid, v in sorted(own.items(), key=lambda kv: kv[1]['score']):
    pid = v['spid'][3:]
    if pid not in verified[key(cards[cid])]: verified[key(cards[cid])].append(pid)
avail = {f[1:-4] for f in os.listdir(pa) if f.endswith('.png')}
avail_by_pid = collections.defaultdict(set)
for s in avail:
    if len(s) == 9 and s.isdigit(): avail_by_pid[s[3:]].add(s)
# Mã cầu thủ tra từ fifaaddict (uid giải mã → spid, cùng mùa + cùng OVR): scripts/portraits/fa-pids.json 'pairs' {thẻ: mã cầu thủ}.
fa_path = os.path.join(repo, 'scripts', 'portraits', 'fa-pids.json')
fa = json.load(open(fa_path, encoding='utf8'))['pairs'] if os.path.exists(fa_path) else {}
# Thêm mã tra từ Garena Data Center (scripts/portraits/garena-pids.json, cùng luật) cho thẻ fifaaddict chưa có.
ga_path = os.path.join(repo, 'scripts', 'portraits', 'garena-pids.json')
if os.path.exists(ga_path): fa = {**json.load(open(ga_path, encoding='utf8'))['pairs'], **fa}
out = {}; src = collections.Counter(); how = {}  # how: độ tin của nguồn gán (dùng gỡ xung đột mã cầu thủ)
for cid, c in cards.items():
    if cid in own: out[cid] = own[cid]['spid']; src['cùng mùa'] += 1; how[cid] = 2.5 if own[cid]['score'] <= .4 else 1.5; continue
    fs = [code + str(fa[cid]).zfill(6) for code in d['years'].get(c['tier'], [])] if cid in fa else []
    fs = [s for s in fs if s in avail]
    if fs: out[cid] = fs[0]; src['fifaaddict'] += 1; how[cid] = 3.0; continue
    # Dựng từ mã: mã mùa của thẻ + mã cầu thủ đã xác nhận → ảnh đúng mùa (đúng người theo cách dựng, kể cả khi ảnh thẻ khác ảnh miniface).
    built = [code + pid for pid in verified.get(key(c), []) for code in d['years'].get(c['tier'], []) if code + pid in avail]
    if built: out[cid] = built[0]; src['dựng từ mã'] += 1; how[cid] = 1.0; continue
    alt = sorted(by_person.get(key(c), []), key=lambda v: v['score'])
    if alt: out[cid] = alt[0]['spid']; src['mùa khác'] += 1; how[cid] = .5
    else: src['không có'] += 1

# Gỡ xung đột (2026-11-16): một mã cầu thủ (6 số cuối spid) chỉ thuộc về MỘT người. So ảnh đôi khi khớp nhầm người khác
# (vd. thẻ Vini Jr. nhận ảnh Van Dijk) → mã thuộc về người có tổng độ tin lớn nhất (fifaaddict 3 > so ảnh tốt 2,5 > so ảnh 1,5 > dựng 1 > mùa khác 0,5).
# Tên viết khác của cùng người (cùng quốc tịch, cùng họ cuối, một tên chỉ có 1 chữ hoặc giống nhau khi bỏ dấu cách / gạch) coi là một người.
import unicodedata, re
def fold(s): return re.sub(r'[^a-z ]', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).split()
def same_person(a, b):
    (na, ca), (nb, cb) = a, b
    if ca != cb: return False
    ta, tb = fold(na), fold(nb)
    if not ta or not tb: return False
    if ''.join(ta) == ''.join(tb): return True
    return ta[-1] == tb[-1] and (len(ta) == 1 or len(tb) == 1)
weight = collections.defaultdict(lambda: collections.defaultdict(float))  # mã → người → độ tin
for cid, s in out.items(): weight[s[3:]][key(cards[cid])] += how[cid]
owner = {pid: max(w, key=lambda k: w[k]) for pid, w in weight.items()}
person_own = collections.defaultdict(list)  # người → các mã của họ (độ tin giảm dần)
for pid, w in weight.items():
    for k, v in w.items():
        if same_person(k, owner[pid]): person_own[k].append((v, pid))
fixed = dropped = 0
for cid in list(out):
    k = key(cards[cid]); pid = out[cid][3:]
    if same_person(k, owner[pid]): continue
    mine = [p for _, p in sorted(person_own.get(k, []), reverse=True)]
    codes = d['years'].get(cards[cid]['tier'], [])
    cand = [c + p for p in mine for c in codes if c + p in avail] or [s for p in mine for s in sorted(avail_by_pid.get(p, ()), reverse=True)] if mine else []
    if cand: out[cid] = cand[0]; fixed += 1
    else: del out[cid]; dropped += 1
src['sửa nhầm người'] = fixed; src['bỏ nhầm người'] = dropped
# Thẻ còn trống (kể cả thẻ vừa bỏ vì nhầm người) mà cầu thủ đã có mã của chính mình ở mùa khác: dùng ảnh mùa khác đó (mùa mới nhất).
for cid, c in cards.items():
    if cid in out: continue
    mine = [p for _, p in sorted(person_own.get(key(c), []), reverse=True)] or [p for p, w in weight.items() if any(same_person(key(c), k) and k == owner[p] for k in w)]
    alt = sorted({s for p in mine for s in avail_by_pid.get(p, ())}, key=lambda s: -int(s[:3]))
    if alt: out[cid] = alt[0]; src['mùa khác (sau sửa)'] += 1

# Miniface để người chơi chọn (2026-11-16): mọi ảnh trong kho có cùng mã cầu thủ (6 số cuối spid) với ảnh đã gán cho người đó (tên + quốc tịch).
allsp = [f[1:-4] for f in os.listdir(pa) if f.endswith('.png') and len(f) == 14 and f[1:-4].isdigit()]
bypid = collections.defaultdict(set)
for s in allsp: bypid[s[3:]].add(s)
person_pids = collections.defaultdict(set)
for cid, spid in out.items(): person_pids[key(cards[cid])].add(spid[3:])
persons = {}
for k, pids in person_pids.items():
    sp = sorted(set().union(*(bypid[p] for p in pids)), key=lambda s: (-int(s[:3]), s))
    if len(sp) > 1: persons[f'{k[0]}|{k[1]}'] = sp
code_tier = {y: t for t, ys in d['years'].items() for y in ys}
dst = os.path.join(repo, 'public', 'assets', 'portraits'); os.makedirs(dst, exist_ok=True)
size = 0
for spid in sorted(set(out.values()) | {s for v in persons.values() for s in v}):
    p = os.path.join(dst, f'{spid}.webp')
    if os.path.exists(p): size += os.path.getsize(p); continue
    im = Image.open(os.path.join(pa, f'p{spid}.png')).convert('RGBA').resize((112, 112), Image.LANCZOS)
    im.save(p, 'WEBP', quality=82, method=6)
    size += os.path.getsize(p)
used = set(out.values()) | {s for v in persons.values() for s in v}
for fn in os.listdir(dst):
    if fn.endswith('.webp') and fn[:-5] not in used: os.remove(os.path.join(dst, fn))  # ảnh không còn dùng
note = ('Chân dung không nền (FC Online playersAction, 128×128 → 112×112 WebP) theo mã cầu thủ: khớp ảnh thẻ với ảnh chân dung cùng mùa '
        '(so ảnh) hoặc mã thẻ tra từ fifaaddict (cùng mùa + OVR), thẻ không có ảnh cùng mùa dùng ảnh của chính cầu thủ (cùng tên + quốc tịch) ở mùa khác. Dựng 2026-11-16; thẻ không có = dùng ảnh thẻ.')
json.dump({'note': note, 'cards': {k: out[k] for k in sorted(out, key=int)}, 'persons': dict(sorted(persons.items())), 'seasons': dict(sorted(code_tier.items()))}, open(os.path.join(repo, 'src', 'portraits.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
by_tier = collections.Counter(cards[c]['tier'] for c in out); tot = collections.Counter(c['tier'] for c in cards.values())
print({k.encode('ascii', 'replace').decode(): v for k, v in src.items()}, 'persons', len(persons), 'files', len(set(out.values()) | {s for v in persons.values() for s in v}), 'size MB', round(size / 1e6, 1))
print(' '.join(f'{t}:{by_tier[t]}/{n}' for t, n in tot.most_common()))
