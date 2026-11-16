# Đóng gói mặt nạ người (u2net_human_seg, D:/FCOvv-tmp/masks-raw/<id>.png) cho thẻ không thay được bằng chân dung cùng mùa:
#  - cắt ở mép dưới vùng ảnh (mùa có vị trí chân dung: đáy ô chân dung; mùa khác: dòng mà mặt nạ trung bình của mùa tụt mạnh nhất);
#  - giữ khối người lớn nhất; mặt nạ phủ > 60% vùng ảnh hoặc quá nhỏ → dùng mặt nạ trung bình của mùa;
#  - nới 3px; ô đặt miniface: đáy ô = mép cắt, đỉnh đầu ở 1,8% ô (như ảnh FC Online), tâm theo đầu.
# Ghi public/assets/portraits/masks/<id>.webp (xám, lossless) + src/portrait-masks.json { cards: { id: [cạnh/cao, x/rộng, y/cao] } }.
# python -I masks_pack.py <repo>
import sys, os, json, collections
import numpy as np, cv2
from PIL import Image
repo = sys.argv[1]
cards = {c['id']: c for c in json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']}
todo = json.load(open('D:/FCOvv-tmp/tmp/mask-todo.json'))
frames = json.load(open(repo + '/src/portrait-frames.json', encoding='utf8'))['tiers']
raw = {i: np.asarray(Image.open(f'D:/FCOvv-tmp/masks-raw/{i}.png')).astype(np.float32) / 255 for i in todo if os.path.exists(f'D:/FCOvv-tmp/masks-raw/{i}.png')}
alpha = {i: np.asarray(Image.open(os.path.join(repo, 'public', cards[i]['face'].lstrip('/'))).convert('RGBA'))[..., 3] > 128 for i in raw}
by = collections.defaultdict(list)
for i in raw: by[cards[i]['tier']].append(i)
dst = os.path.join(repo, 'public', 'assets', 'portraits', 'masks'); os.makedirs(dst, exist_ok=True)
out = {}; st = collections.Counter(); cuts = {}
for tier, ids in by.items():
    size = collections.Counter(raw[i].shape for i in ids).most_common(1)[0][0]; H, W = size
    same = [i for i in ids if raw[i].shape == size]
    mean = np.mean([(raw[i] > .5) for i in same], axis=0)
    if tier in frames:
        s, fx, fy = frames[tier]; cut = int(round((fy + s) * H))
    else:
        prof = mean.mean(1); lo, hi = int(.5 * H), int(.88 * H)
        drop = [prof[r - 3] - prof[r + 3] for r in range(lo, hi)]; cut = lo + int(np.argmax(drop))
    cuts[tier] = round(cut / H, 3)
    for i in ids:
        m = raw[i] > .5; h, w = m.shape; c = int(round(cut / H * h))
        m[c:] = False; m &= alpha[i]
        n, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
        if n > 1:
            big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])); keep = lab == big
            # giữ thêm khối lớn (tay, bóng...) chạm gần khối chính
            near = cv2.dilate(keep.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            for k in range(1, n):
                if k != big and stats[k, cv2.CC_STAT_AREA] > .01 * h * w and (near & (lab == k)).any(): keep |= lab == k
            m = keep
        zone = alpha[i][:c].sum() or 1; frac = m[:c].sum() / zone
        if frac > .6 or frac < .06:
            mm = cv2.resize(mean.astype(np.float32), (w, h)) > .5; mm[c:] = False; m = mm & alpha[i]; st['trung bình mùa'] += 1
        else: st['tách người'] += 1
        m = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
        m[c:] = False
        rows = np.where(m.sum(1) > max(3, .03 * w))[0]
        if not len(rows): st['bỏ'] += 1; continue
        top = rows[0]
        if tier in frames and cards[i]['tier'] == tier:
            box = list(frames[tier])
        else:
            t = (c - top) / .98; band = m[top:top + max(2, int(.1 * (c - top)))]; xs = np.where(band.any(0))[0]
            cx = xs.mean() if len(xs) else w / 2
            box = [round(t / h, 4), round((cx - t / 2) / w, 4), round((c - t) / h, 4)]
        Image.fromarray((m * 255).astype(np.uint8), 'L').save(os.path.join(dst, f'{i}.webp'), 'WEBP', lossless=True)
        out[str(i)] = box
for fn in os.listdir(dst):
    if fn.endswith('.webp') and fn[:-5] not in out: os.remove(os.path.join(dst, fn))
note = ('Mặt nạ người trên ảnh thẻ (u2net_human_seg, scripts/portraits/masks_pack.py) cho thẻ không thay được bằng chân dung cùng mùa: '
        'public/assets/portraits/masks/<id>.webp; cards: id → ô đặt miniface [cạnh/cao, x/rộng, y/cao].')
json.dump({'note': note, 'cards': dict(sorted(out.items(), key=lambda kv: int(kv[0])))}, open(os.path.join(repo, 'src', 'portrait-masks.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
size = sum(os.path.getsize(os.path.join(dst, f'{i}.webp')) for i in out)
print({k.encode('ascii', 'replace').decode(): v for k, v in st.items()}, 'cards', len(out), 'KB', size // 1024, 'cuts', cuts)
