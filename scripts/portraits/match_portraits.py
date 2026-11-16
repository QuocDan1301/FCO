# Khớp ảnh chân dung FC Online (playersAction, tên p<spid>.png, nền trong suốt) với thẻ trong game bằng so ảnh:
# ảnh thẻ (cardFace) dùng cùng ảnh cầu thủ với chân dung. Mỗi mùa: dò vị trí / tỉ lệ đặt ảnh cầu thủ trên khung thẻ (một lần cho cả mùa,
# bằng matchTemplate có mặt nạ alpha trên vài thẻ mẫu), rồi so từng thẻ với từng ứng viên cùng mã mùa (vùng có người, đã chuẩn hoá sáng).
# python -I match_portraits.py <repo> <playersAction> <out.json> [tier ...]
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image

repo, pa, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
only = set(sys.argv[4:])
d = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))
by = collections.defaultdict(list)
for f in os.listdir(pa):
    n = f[1:-4]
    if f.endswith('.png') and len(n) == 9 and n.isdigit(): by[n[:3]].append(n)

def load_rgba(path):
    return np.array(Image.open(path).convert('RGBA'))

portrait_cache = {}
def portrait(spid):
    if spid not in portrait_cache: portrait_cache[spid] = load_rgba(os.path.join(pa, f'p{spid}.png'))
    return portrait_cache[spid]

def gray(a): return cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32)

def season_transform(cards, cands):
    # Dò tỉ lệ / vị trí trên tối đa 6 thẻ mẫu (ảnh thu nhỏ một nửa), lấy trung vị.
    found = []
    for c in cards[:6]:
        card = load_rgba(repo + '/public' + c['face']); H, W = card.shape[:2]
        cg = cv2.resize(gray(card), (W // 2, H // 2))
        best = None
        for spid in cands:
            p = portrait(spid)
            for s in np.arange(.40, .96, .05):
                t = max(8, int(round(s * H / 2)))
                if t >= min(cg.shape): continue
                tg = cv2.resize(gray(p), (t, t)); ta = cv2.resize(p[..., 3].astype(np.float32) / 255, (t, t))
                if ta.sum() < 20: continue
                r = cv2.matchTemplate(cg, tg, cv2.TM_SQDIFF, mask=ta)
                v, _, loc, _ = cv2.minMaxLoc(r); v /= ta.sum()
                if best is None or v < best[0]: best = (v, s, loc, spid)
        if best: found.append((best[1], best[2][0] * 2 / W, best[2][1] * 2 / H))
    if not found: return None
    a = np.array(found)
    return float(np.median(a[:, 0])), float(np.median(a[:, 1])), float(np.median(a[:, 2]))

def patch(a, mask=None):
    g = gray(a) if a.ndim == 3 else a
    return g

N = 40
def prep(cands):
    P = []; M = []
    for spid in cands:
        p = portrait(spid)
        P.append(cv2.resize(gray(p), (N, N))); M.append(cv2.resize(p[..., 3].astype(np.float32) / 255, (N, N)))
    return np.stack(P), np.stack(M)

def card_scores(g, P, M, tf):
    # Điểm sai khác của MỘT thẻ (ảnh xám g) với mọi ứng viên, theo vị trí đặt ảnh tf = (tỉ lệ, x, y) (phần của khung thẻ).
    s, fx, fy = tf; H, W = g.shape
    t = max(4, int(round(s * H))); pad = t + 4
    gp = cv2.copyMakeBorder(g, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    x, y = int(round(fx * W)) + pad, int(round(fy * H)) + pad
    crop = gp[y:y + t, x:x + t]
    if crop.shape != (t, t): return np.full(len(P), np.inf, np.float32)
    cr = cv2.resize(crop, (N, N))
    inside = np.zeros_like(gp); inside[pad:pad + H, pad:pad + W] = 1
    im = cv2.resize(inside[y:y + t, x:x + t], (N, N))
    w = M * im[None]; ws = w.sum(axis=(1, 2)) + 1e-6
    # Chuẩn hoá sáng (trừ trung bình, chia độ lệch) trong mặt nạ rồi so trung bình sai khác.
    mc = (cr[None] * w).sum(axis=(1, 2)) / ws; sc = np.sqrt(((cr[None] - mc[:, None, None]) ** 2 * w).sum(axis=(1, 2)) / ws) + 1e-3
    mp = (P * w).sum(axis=(1, 2)) / ws; sp = np.sqrt(((P - mp[:, None, None]) ** 2 * w).sum(axis=(1, 2)) / ws) + 1e-3
    diff = np.abs((cr[None] - mc[:, None, None]) / sc[:, None, None] - (P - mp[:, None, None]) / sp[:, None, None])
    return ((diff * w).sum(axis=(1, 2)) / ws).astype(np.float32)

def tf_quality(grays, P, M, tf):
    # Vị trí đúng thì những thẻ CÓ ảnh trong kho cho điểm rất thấp: lấy trung bình 40 % thẻ tốt nhất.
    best = np.sort([card_scores(g, P, M, tf).min() for g in grays])
    k = max(1, int(len(best) * .4)); return float(best[:k].mean())

STANDARD = [(.5, .286, .199), (.5, .293, .184), (.45, .301, .24), (.45, .303, .254), (.5, .309, .206), (.45, .301, .209)]
def match_season(tier, cards, cands):
    P, M = prep(cands)
    grays = [gray(load_rgba(repo + '/public' + c['face'])) for c in cards]
    sub = grays[::max(1, len(grays) // 30)][:30]
    tries = list(STANDARD)
    tf0 = season_transform(cards[::max(1, len(cards) // 6)], cands)
    if tf0: tries.append(tf0)
    tf = min(tries, key=lambda x: tf_quality(sub, P, M, x))
    # Tinh chỉnh quanh vị trí tốt nhất.
    for step in (.02, .01):
        grid = [(tf[0] + ds, tf[1] + dx, tf[2] + dy) for ds in (-2 * step, -step, 0, step, 2 * step) for dx in (-step, 0, step) for dy in (-step, 0, step)]
        tf = min(grid, key=lambda x: tf_quality(sub, P, M, x))
    scores = np.stack([card_scores(g, P, M, tf) for g in grays])
    # Gán duy nhất: cặp điểm tốt nhất trước.
    out = {}; usedc = set(); usedp = set()
    order = np.dstack(np.unravel_index(np.argsort(scores, axis=None), scores.shape))[0]
    for k, j in order:
        if k in usedc or j in usedp: continue
        sc = float(scores[k, j])
        if not np.isfinite(sc): break
        # Chênh so với ứng viên KHÁC cầu thủ (6 chữ số cuối khác — cùng cầu thủ ở mã mùa khác dùng chung ảnh).
        pid = cands[j][3:]; other = [float(scores[k, q]) for q in range(len(cands)) if cands[q][3:] != pid]; second = min(other) if other else 9
        out[cards[k]['id']] = {'spid': cands[j], 'score': round(sc, 3), 'margin': round(second - sc, 3)}
        usedc.add(k); usedp.add(j)
        if len(usedc) == len(cards) or len(usedp) == len(cands): break
    return out, tf

res = json.load(open(out_path, encoding='utf8')) if os.path.exists(out_path) else {}
tiers = collections.defaultdict(list)
for c in d['cards']: tiers[c['tier']].append(c)
for tier, cards in tiers.items():
    if only and tier not in only: continue
    cands = sorted(sum((by[y] for y in d['years'].get(tier, [])), []))
    if not cands: continue
    m, tf = match_season(tier, cards, cands)
    for cid, v in m.items(): res[str(cid)] = {**v, 'tier': tier}
    sc = sorted(v['score'] for v in m.values())
    print(tier, 'cards', len(cards), 'cands', len(cands), 'matched', len(m), 'tf', tf and tuple(round(x, 3) for x in tf), 'score p50', sc and sc[len(sc) // 2], 'p90', sc and sc[int(len(sc) * .9)], flush=True)
json.dump(res, open(out_path, 'w', encoding='utf8'), indent=0)
