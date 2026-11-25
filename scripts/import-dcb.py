"""Nhập mùa DCB (DRAMATIC COMEBACKS, mã FC Online 846). Ảnh nguồn không bị sửa.
Cách chạy: python -I scripts/import-dcb.py <thư mục nguồn> <thư mục cờ PNG> <kho chân dung playersAction>
Thư mục nguồn (người dùng gửi 2026-11-25): frame.png (khung thẻ trống chụp trên nền xám 405×457 → tách nền, cắt sát 371×423),
pack.png (ảnh gói 160×241, phóng lên 1696 rộng), tunnel.png (nền hầm), logo.png (huy hiệu DCB); fc.png = biểu tượng FC trắng (như mùa CH).
Danh sách scripts/data/dcb.csv: 67 thẻ từ fifaaddict.com (fo4db?class=dcb: tên, vị trí, OVR, uid → spid), lương từ Garena
dc.fconline.garena.vn/api/app/players/<spid>/card (OVR Garena + 3 = OVR fifaaddict = OVR game), quốc tịch theo thẻ mùa khác của chính cầu thủ,
CLB theo fifaaddict đổi sang tên CLB trong game; "Dramatic Comebacks" (huyền thoại) = 'Tự do' dùng huy hiệu DCB làm logo đội.
Thẻ dựng: khung trống + chân dung p<spid>.png (cùng mùa 846; thiếu thì mùa khác của chính cầu thủ) + vị trí, lương (ô lục giác in sẵn)
+ hàng cờ · biểu tượng FC · logo CLB. Nhãn DCB in sẵn trên khung; OVR / tên / cấp vẽ bằng HTML (dcb-cards.css).
"""
import csv, glob, json, re, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE, FLAGS, PORTRAITS = (Path(a) for a in sys.argv[1:4])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/dcb.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 67
FIRST_ID = 4387
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
NATIONAL = {r['nation'] for r in ROWS}
OTHER_LOGOS = {}
for f in sorted((ROOT / 'src').glob('*Players.ts')):
    for m in re.finditer(r'club: ["\']([^"\']+)["\'][^}]*?teamLogo: asset\(["\'](/assets/[^"\']+)["\']\)', f.read_text(encoding='utf-8')):
        if m.group(1) == 'Tự do' or m.group(1) in NATIONAL or re.fullmatch(r'/assets/[a-z0-9]+-team\.webp', m.group(2)): continue
        OTHER_LOGOS.setdefault(m.group(1), m.group(2))


def clean_frame(path):
    """Khung chụp trên nền xám (230): xoá nền nối từ mép + các túi xám bị vòng nhẫn bao kín, cắt sát."""
    a = np.array(Image.open(path).convert('RGBA'))
    rgb = np.ascontiguousarray(a[..., :3]); h, w = rgb.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    edge = [(x, 0) for x in range(0, w, 10)] + [(x, h - 1) for x in range(0, w, 10)] + [(0, y) for y in range(0, h, 10)] + [(w - 1, y) for y in range(0, h, 10)]
    for (x, y) in edge:
        if mask[y + 1, x + 1] == 0 and np.abs(rgb[y, x].astype(int) - 230).max() <= 8:
            cv2.floodFill(rgb.copy(), mask, (x, y), 0, (6, 6, 6), (6, 6, 6), cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8) | 4)
    bg = mask[1:-1, 1:-1] > 0
    grey = (np.abs(rgb.astype(int) - 230).max(axis=2) <= 6).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(grey, 4)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] > 40: bg |= lab == k
    alpha = cv2.GaussianBlur(cv2.erode(np.where(bg, 0, 255).astype(np.uint8), np.ones((2, 2), np.uint8)), (3, 3), 0)
    a[..., 3] = alpha
    im = Image.fromarray(a)
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())


FRAME = clean_frame(SOURCE / 'frame.png')
W, H = FRAME.size                     # 371×423
COL_X = 98                            # tâm cột OVR / vị trí / ô lục giác lương (in sẵn, tâm (98, 177))
POS_Y, WAGE_Y = 122, 166              # đỉnh chữ vị trí, số lương
FACE = 206                            # chân dung 128 → 206
FACE_CX, FACE_BOTTOM = 208, 306       # tâm x, đáy chân dung (trên hàng nhãn DCB + tên)
FACE_RIGHT = 300                      # mép phải trong viền: chân dung mờ dần trước mép này
NAME_X, NAME_RIGHT, NAME_BASELINE = 137, 302, 337   # tên HTML sau nhãn DCB in sẵn (95–130 × 313–343)
ROW_CX, ROW_CY, ROW_GAP = 186, 370, 8               # hàng cờ · FC · CLB
FLAG_W, FLAG_H, FC_H, LOGO_S = 28, 21, 22, 25
LEVEL_BOX = (76, 204, 120, 230)       # ô cấp (+n, HTML) dưới ô lục giác


def font(size, var):
    f = ImageFont.truetype(r'C:\Windows\Fonts\bahnschrift.ttf', size)
    f.set_variation_by_name(var)
    return f


POS_FONT, WAGE_FONT = font(22, 'Bold SemiCondensed'), font(18, 'Bold')


def text_center(d, x, y, s, f, fill=(255, 255, 255, 255)):
    b = d.textbbox((0, 0), s, font=f)
    left = x - (b[2] - b[0]) / 2 - b[0]
    d.text((left + 1, y + 1), s, font=f, fill=(0, 0, 0, 170))
    d.text((left, y), s, font=f, fill=fill)


def portrait_path(spid):
    p = PORTRAITS / f'p{spid}.png'
    if p.exists(): return p
    alt = sorted(glob.glob(str(PORTRAITS / f'p???{int(spid) % 1000000:06d}.png')), reverse=True)
    return Path(alt[0]) if alt else None


pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
pack = pack.resize((1696, round(pack.height * 1696 / pack.width)), Image.Resampling.LANCZOS)
fc_mark = Image.open(SOURCE / 'fc.png').convert('RGBA')
fc_mark = fc_mark.resize((round(fc_mark.width * FC_H / fc_mark.height), FC_H), Image.Resampling.LANCZOS)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())


def logo_image(club):
    path = LOGOS.get(club) or OTHER_LOGOS.get(club)
    return Image.open(ASSETS / path.removeprefix('/assets/')).convert('RGBA') if path else crest.copy()


fade_y = np.ones(FACE); fade_y[-34:] = np.linspace(1, 0, 34)
face_x = FACE_CX - FACE // 2
players, portraits, report = [], {}, []
for i, row in enumerate(ROWS):
    pid = FIRST_ID + i
    im = FRAME.copy()
    src = portrait_path(row['spid'])
    if src:
        face = Image.open(src).convert('RGBA').resize((FACE, FACE), Image.Resampling.LANCZOS)
        al = np.array(face)
        xs_abs = face_x + np.arange(FACE)
        fade_x = np.clip((FACE_RIGHT - xs_abs) / 10, 0, 1)
        al[..., 3] = (al[..., 3] * fade_y[:, None] * fade_x[None, :]).astype(np.uint8)
        im.alpha_composite(Image.fromarray(al), (face_x, FACE_BOTTOM - FACE))
        portraits[pid] = src.stem[1:]
        if not src.stem.startswith('p846'): report.append(f'chân dung mùa khác ({src.stem[1:4]}): {row["name"]}')
    else:
        report.append(f'không có chân dung: {row["name"]}')
    d = ImageDraw.Draw(im)
    text_center(d, COL_X, POS_Y, row['pos'], POS_FONT, (255, 226, 150, 255))
    text_center(d, COL_X, WAGE_Y, row['wage'], WAGE_FONT)
    flag = Image.open(FLAGS / f"{row['flag']}.png").convert('RGBA').resize((FLAG_W, FLAG_H), Image.Resampling.LANCZOS)
    logo = logo_image(row['club']); logo.thumbnail((LOGO_S, LOGO_S), Image.Resampling.LANCZOS)
    items = [(flag, FLAG_W), (fc_mark, fc_mark.width), (logo, LOGO_S)]
    x = ROW_CX - (sum(w for _, w in items) + ROW_GAP * (len(items) - 1)) / 2
    for item, slot in items:
        im.alpha_composite(item, (round(x + (slot - item.width) / 2), round(ROW_CY - item.height / 2)))
        x += slot + ROW_GAP
    path = f'/assets/dcb-{pid}-card.webp'
    im.save(ASSETS / Path(path).name, quality=92, method=6)
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=row['nation'], flag=row['flag'],
                  club=row['club'], tier='dcb', wage=int(row['wage']), cardFace=path)
    club = row['club']
    if club in LOGOS: player['teamLogo'] = LOGOS[club]
    elif club in OTHER_LOGOS: player['teamLogo'] = OTHER_LOGOS[club]
    else:
        if club != 'Tự do': report.append(f'CLB chưa có logo, dùng huy hiệu DCB: {club}')
        player['teamLogo'] = '/assets/dcb-team.webp'
    players.append(player)

pack.save(ASSETS / 'dcb-back.png')
pack.save(ASSETS / 'dcb-back.webp', quality=92, method=6)
sq = max(crest.size); team = Image.new('RGBA', (sq, sq), (0, 0, 0, 0)); team.alpha_composite(crest, ((sq - crest.width) // 2, (sq - crest.height) // 2))
team.save(ASSETS / 'dcb-team.png')
team.save(ASSETS / 'dcb-team.webp', lossless=True)
crest.save(ROOT / 'scripts' / 'data' / 'dcb-badge.png')
FRAME.save(ROOT / 'scripts' / 'data' / 'dcb-frame.png')
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'dcb-tunnel.webp', quality=94)

# Khung trống đổi miniface lên thẻ (portraits/blank/dcb.webp): alpha = vùng thay nền + miniface được hiện — trong viền, phải cột thông tin,
# trên hàng nhãn DCB / tên; box = [cạnh / cao, tâm x / rộng, đáy y / cao] đúng vị trí chân dung trên thẻ.
fa = np.array(FRAME)
inside = cv2.erode((fa[..., 3] > 200).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * 14 + 1, 2 * 14 + 1))) > 0
yy, xx = np.mgrid[0:H, 0:W]
zone = (xx > 124) & (xx < 304) & (yy > 40) & (yy < 308)
a = cv2.GaussianBlur((zone & inside).astype(np.float32), (5, 5), 0)
blank = np.dstack([fa[..., :3], (a * 255).round().astype(np.uint8)])
(ASSETS / 'portraits' / 'blank').mkdir(parents=True, exist_ok=True)
Image.fromarray(blank, 'RGBA').save(ASSETS / 'portraits' / 'blank' / 'dcb.webp', 'WEBP', quality=90, method=6)
bj_path = ROOT / 'src/portrait-blank.json'
bj = json.loads(bj_path.read_text(encoding='utf-8'))
bj['tiers']['dcb'] = {'box': [round(FACE / H, 4), round(FACE_CX / W, 4), round(FACE_BOTTOM / H, 4)]}
bj_path.write_text(json.dumps(bj, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')

pct = lambda v, t: f'{v / t * 100:.2f}%'
css = ['/* DCB (DRAMATIC COMEBACKS): tạo bởi scripts/import-dcb.py. Thẻ dựng từ khung trống + chân dung; nhãn DCB in sẵn; OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.dcb{background:#c9a24a}',
       f'.player-card.face-art.season-dcb{{aspect-ratio:{W}/{H}}}',
       '.player-card.face-art.season-dcb>.face-art-img{filter:drop-shadow(0 0 5px #c9a24a33)}',
       f'.season-dcb .face-art-ovr{{left:{pct(COL_X, W)};top:{pct(64, H)};font-size:11cqw;color:#ffe9b0;letter-spacing:-.02em;text-shadow:0 .03em .12em #2a0a06}}',
       f'.season-dcb .face-art-level{{left:{pct(LEVEL_BOX[0], W)};top:{pct(LEVEL_BOX[1], H)};width:{pct(LEVEL_BOX[2] - LEVEL_BOX[0], W)};height:{pct(LEVEL_BOX[3] - LEVEL_BOX[1], H)};transform:none;object-fit:fill}}',
       f'.season-dcb{{--name-size:6.2cqw;--name-color:#ffffff;--nx:{pct(NAME_X, W)};--nw:{pct(NAME_RIGHT - NAME_X, W)};--ny:{pct(NAME_BASELINE, H)}}}',
       '.season-dcb .face-art-name{text-align:left;text-shadow:0 .05em .14em #000c}',
       '[data-tone=dcb]{--shop-tone:#c9a24a;--shop-tone2:#5a0e14}',
       '.season-tag-dcb{color:#e6c172}',
       '.reveal-dcb .reveal-panel{--led:#ffd98a;--led2:#2a0a06;border-color:#c9a24a66}',
       '.reveal-dcb .reveal-stats dt{color:#ffffff}',
       '.reveal-dcb .reveal-podium{background:linear-gradient(180deg,#6a1218,#24070a);border-top-color:#c9a24a}',
       '.reveal-dcb .reveal-podium span{color:#ffffff}']
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '',
         '// Thứ tự theo scripts/data/dcb.csv (OVR giảm dần, như fifaaddict); tạo bởi scripts/import-dcb.py.', 'export const dcbPlayers: Player[] = [']
for p in players:
    fields = [f'{k}: ' + (f'asset({json.dumps(v, ensure_ascii=False)})' if k in ('cardFace', 'teamLogo') else json.dumps(v, ensure_ascii=False)) for k, v in p.items()]
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/dcbPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
(ROOT / 'src/dcb-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8', newline='\n')

# Chân dung không nền (src/portraits.json): thẻ DCB → spid 846 (hoặc mùa khác của chính cầu thủ); thêm vào danh sách miniface của người.
pj_path = ROOT / 'src/portraits.json'
pj = json.loads(pj_path.read_text(encoding='utf-8'))
pj.setdefault('seasons', {})['846'] = 'dcb'
for p in players:
    spid = portraits.get(p['id'])
    if not spid: continue
    pj['cards'][str(p['id'])] = spid
    out = ASSETS / 'portraits' / f'{spid}.webp'
    if not out.exists():
        Image.open(PORTRAITS / f'p{spid}.png').convert('RGBA').resize((112, 112), Image.Resampling.LANCZOS).save(out, quality=90, method=6)
    key = f"{p['name']}|{p['nation']}"
    lst = pj.setdefault('persons', {}).setdefault(key, [])
    if spid not in lst: lst.insert(0, spid)
pj_path.write_text(json.dumps(pj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
(ROOT / 'scripts/data/dcb-import-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the DCB; chan dung {len(portraits)}; bao cao: scripts/data/dcb-import-report.txt')
