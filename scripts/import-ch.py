"""Nhập mùa CH (CONTINENTAL HEROES, mã FC Online 845). Ảnh nguồn không bị sửa.
Cách chạy: python -I scripts/import-ch.py <thư mục nguồn> <thư mục cờ PNG> <kho chân dung playersAction>
Thư mục nguồn (người dùng gửi 2026-11-18): frame.png (khung thẻ trống 298×373), pack.png (ảnh gói), tunnel.png (nền hầm), logo.png (huy hiệu CH);
fc.png = biểu tượng FC trắng nền trong suốt (cắt từ thẻ 26HR, như hàng cờ · FC · CLB trên thẻ huyền thoại FC Online).
Người dùng KHÔNG gửi ảnh từng thẻ: thẻ dựng từ khung trống + chân dung p<spid>.png (miniface FC Online, cùng mùa 845; thiếu thì lấy
mùa khác của chính cầu thủ) + vị trí, lương (ô lục giác), hàng cờ (flag-icons đã chuyển PNG) · biểu tượng FC · logo CLB căn giữa.
Nhãn CH (cắt từ ảnh gói, ch-label.webp) vẽ bằng HTML trước tên; nhãn + tên căn giữa như thẻ thật (tên dài thì canh trái).
OVR / tên / cấp vẽ bằng HTML như các mùa khác. Danh sách: scripts/data/ch.csv (spid, tên, OVR game = Garena + 3, lương, cờ, CLB).
CLB là đội tuyển quốc gia hoặc "Tự do" dùng huy hiệu CH làm logo đội (như MEDALIST).
"""
import csv, glob, json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE, FLAGS, PORTRAITS = (Path(a) for a in sys.argv[1:4])
ASSETS = ROOT / 'public/assets'
ROWS = list(csv.DictReader((ROOT / 'scripts/data/ch.csv').open(encoding='utf-8'), delimiter='|'))
assert len(ROWS) == 151
FIRST_ID = 4195
LOGOS = json.loads((ROOT / 'src/clubLogos.json').read_text(encoding='utf-8'))
NATIONAL = {r['nation'] for r in ROWS} | {'Hà Lan', 'Đức', 'Pháp', 'Brazil', 'Mỹ', 'Tây Ban Nha', 'Úc', 'Ả Rập Xê Út', 'Mexico', 'Cameroon', 'Uruguay', 'Bờ Biển Ngà'}
# CLB chưa có trong clubLogos.json: dùng logo đội đã có ở mùa khác (đọc từ src/*Players.ts).
OTHER_LOGOS = {}
for f in sorted((ROOT / 'src').glob('*Players.ts')):
    for m in re.finditer(r'club: ["\']([^"\']+)["\'][^}]*?teamLogo: asset\(["\'](/assets/[^"\']+)["\']\)', f.read_text(encoding='utf-8')):
        # Bỏ 'Tự do' / đội tuyển (mùa khác dùng huy hiệu mùa của họ, vd boe21-team.webp) và mọi huy hiệu mùa <mùa>-team.webp: chỉ mượn logo CLB thật.
        if m.group(1) == 'Tự do' or m.group(1) in NATIONAL or re.fullmatch(r'/assets/[a-z0-9]+-team\.webp', m.group(2)): continue
        OTHER_LOGOS.setdefault(m.group(1), m.group(2))

FRAME = Image.open(SOURCE / 'frame.png').convert('RGBA')
W, H = FRAME.size                     # 298×373
FACE = 172                            # cỡ chân dung (128 → 172)
FACE_X, FACE_BOTTOM = 92, 258         # góc trái, đáy chân dung
FACE_RIGHT = 252                      # mép phải vùng trong khung: chân dung mờ dần trước mép này
POS_Y, WAGE_Y = 113, 156              # đỉnh chữ vị trí, số lương (tâm cột x = 77, tâm ô lục giác (77, 165))
COL_X = 77
TAG_H = 16                            # nhãn CH (HTML ::before trước tên)
NAME_X, NAME_RIGHT, NAME_BASELINE = 44, 254, 294
ROW_CX, ROW_CY, ROW_GAP = 149, 313, 7   # hàng cờ · FC · CLB: tâm x, tâm y, khoảng cách
FLAG_W, FLAG_H, FC_H, LOGO_S = 24, 18, 19, 21


def font(size, var):
    f = ImageFont.truetype(r'C:\Windows\Fonts\bahnschrift.ttf', size)
    f.set_variation_by_name(var)
    return f


POS_FONT, WAGE_FONT = font(19, 'Bold SemiCondensed'), font(16, 'Bold')


def text_center(d, x, y, s, f):
    b = d.textbbox((0, 0), s, font=f)
    left = x - (b[2] - b[0]) / 2 - b[0]
    d.text((left + 1, y + 1), s, font=f, fill=(0, 0, 0, 170))
    d.text((left, y), s, font=f, fill=(255, 255, 255, 255))


def portrait_path(spid):
    p = PORTRAITS / f'p{spid}.png'
    if p.exists(): return p
    alt = sorted(glob.glob(str(PORTRAITS / f'p???{int(spid) % 1000000:06d}.png')), reverse=True)
    return Path(alt[0]) if alt else None


pack = Image.open(SOURCE / 'pack.png').convert('RGBA')
tag = pack.crop((200, 2064, 424, 2244))
a = np.array(tag.convert('L')); ys, xs = np.nonzero(a > 200)
tag = tag.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
tag = tag.resize((round(tag.width * TAG_H / tag.height), TAG_H), Image.Resampling.LANCZOS)
fc_mark = Image.open(SOURCE / 'fc.png').convert('RGBA')
fc_mark = fc_mark.resize((round(fc_mark.width * FC_H / fc_mark.height), FC_H), Image.Resampling.LANCZOS)
crest = Image.open(SOURCE / 'logo.png').convert('RGBA')
crest = crest.crop(crest.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())


def logo_image(club):
    path = LOGOS.get(club) or OTHER_LOGOS.get(club)
    return Image.open(ASSETS / path.removeprefix('/assets/')).convert('RGBA') if path else crest.copy()


fade_y = np.ones(FACE); fade_y[-30:] = np.linspace(1, 0, 30)
players, portraits, report = [], {}, []
for i, row in enumerate(ROWS):
    pid = FIRST_ID + i
    im = FRAME.copy()
    src = portrait_path(row['spid'])
    if src:
        face = Image.open(src).convert('RGBA').resize((FACE, FACE), Image.Resampling.LANCZOS)
        al = np.array(face)
        xs_abs = FACE_X + np.arange(FACE)
        fade_x = np.clip((FACE_RIGHT - xs_abs) / 10, 0, 1)
        al[..., 3] = (al[..., 3] * fade_y[:, None] * fade_x[None, :]).astype(np.uint8)
        im.alpha_composite(Image.fromarray(al), (FACE_X, FACE_BOTTOM - FACE))
        portraits[pid] = src.stem[1:]
    else:
        report.append(f'không có chân dung: {row["name"]}')
    d = ImageDraw.Draw(im)
    text_center(d, COL_X, POS_Y, row['pos'], POS_FONT)
    text_center(d, COL_X, WAGE_Y, row['wage'], WAGE_FONT)
    flag = Image.open(FLAGS / f"{row['flag']}.png").convert('RGBA').resize((FLAG_W, FLAG_H), Image.Resampling.LANCZOS)
    logo = logo_image(row['club']); logo.thumbnail((LOGO_S, LOGO_S), Image.Resampling.LANCZOS)
    items = [(flag, FLAG_W), (fc_mark, fc_mark.width), (logo, LOGO_S)]
    x = ROW_CX - (sum(w for _, w in items) + ROW_GAP * (len(items) - 1)) / 2
    for item, slot in items:
        im.alpha_composite(item, (round(x + (slot - item.width) / 2), round(ROW_CY - item.height / 2)))
        x += slot + ROW_GAP
    path = f'/assets/ch-{pid}-card-v3.webp'   # v3 (2026-11-18): hàng cờ · FC · CLB, nhãn CH HTML, 'Tự do' dùng huy hiệu CH — đổi tên để không dính cache ảnh cũ
    im.save(ASSETS / Path(path).name, quality=92, method=6)
    player = dict(id=pid, name=row['name'], ovr=int(row['ovr']), pos=row['pos'], nation=row['nation'], flag=row['flag'],
                  club=row['club'], tier='ch', wage=int(row['wage']), cardFace=path)
    club = row['club']
    if club in LOGOS: player['teamLogo'] = LOGOS[club]
    elif club in OTHER_LOGOS: player['teamLogo'] = OTHER_LOGOS[club]
    else:
        if club != 'Tự do' and club not in NATIONAL: report.append(f'CLB chưa có logo, dùng huy hiệu CH: {club}')
        player['teamLogo'] = '/assets/ch-team.webp'
    players.append(player)

pack.save(ASSETS / 'ch-back.png')
pack.save(ASSETS / 'ch-back.webp', quality=92, method=6)
crest.save(ASSETS / 'ch-team.png')
crest.save(ASSETS / 'ch-team.webp', lossless=True)
tag.save(ASSETS / 'ch-label.webp', lossless=True)
tunnel = Image.open(SOURCE / 'tunnel.png').convert('RGB')
tunnel.resize((1672, round(tunnel.height * 1672 / tunnel.width)), Image.Resampling.LANCZOS).save(ASSETS / 'ch-tunnel.webp', quality=94)

css = ['/* CH (CONTINENTAL HEROES): tạo bởi scripts/import-ch.py. Thẻ dựng từ khung trống + chân dung; OVR / tên / cấp vẽ bằng HTML. */',
       '.rarity-dot.ch{background:#ff3d7f}',
       f'.player-card.face-art.season-ch{{aspect-ratio:{W}/{H}}}',
       '.player-card.face-art.season-ch>.face-art-img{filter:drop-shadow(0 0 5px #ff3d7f33)}',
       f'.season-ch .face-art-ovr{{left:{COL_X / W * 100:.2f}%;top:{64 / H * 100:.2f}%;font-size:10.9cqw;color:#ffffff;letter-spacing:-.02em;text-shadow:0 .03em .12em #1a0630}}',
       f'.season-ch .face-art-level{{left:{54 / W * 100:.2f}%;top:{190 / H * 100:.2f}%;width:{46 / W * 100:.2f}%;height:{28 / H * 100:.2f}%;transform:none;object-fit:fill}}',
       f'.season-ch{{--name-size:6.4cqw;--name-color:#ffffff;--nx:{NAME_X / W * 100:.2f}%;--nw:{(NAME_RIGHT - NAME_X) / W * 100:.2f}%;--ny:{NAME_BASELINE / H * 100:.2f}%}}',
       '.season-ch .face-art-name{text-align:center;text-shadow:0 .05em .14em #000c}',
       '.season-ch .face-art-name.is-long{text-align:left}',
       f'.season-ch .face-art-name>b::before{{content:"";display:inline-block;width:{tag.width / tag.height * .84:.3f}em;height:.84em;margin-right:.28em;vertical-align:-.08em;background:url(/assets/ch-label.webp) center/100% 100% no-repeat}}',
       '[data-tone=ch]{--shop-tone:#ff3d7f;--shop-tone2:#1b2a7a}',
       '.season-tag-ch{color:#ff6b9a}',
       '.reveal-ch .reveal-panel{--led:#5fd4ff;--led2:#1a0b3a;border-color:#ff3d7f66}',
       '.reveal-ch .reveal-stats dt{color:#ffffff}',
       '.reveal-ch .reveal-podium{background:linear-gradient(180deg,#2a1466,#120a33);border-top-color:#ff3d7f}',
       '.reveal-ch .reveal-podium span{color:#ffffff}']
lines = ["import type { Player } from './game';", "import { asset } from './asset';", '',
         '// Thứ tự theo scripts/data/ch.csv (OVR giảm dần); tạo bởi scripts/import-ch.py.', 'export const chPlayers: Player[] = [']
for p in players:
    fields = [f'{k}: ' + (f'asset({json.dumps(v, ensure_ascii=False)})' if k in ('cardFace', 'teamLogo') else json.dumps(v, ensure_ascii=False)) for k, v in p.items()]
    lines.append('  { ' + ', '.join(fields) + ' },')
lines.append('];')
(ROOT / 'src/chPlayers.ts').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
(ROOT / 'src/ch-cards.css').write_text('\n'.join(css) + '\n', encoding='utf-8', newline='\n')

# Chân dung không nền (src/portraits.json): thẻ CH → đúng spid 845 (hoặc mùa khác của chính cầu thủ); thêm vào danh sách miniface của người.
pj_path = ROOT / 'src/portraits.json'
pj = json.loads(pj_path.read_text(encoding='utf-8'))
pj.setdefault('seasons', {})['845'] = 'ch'
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
(ROOT / 'scripts/data/ch-import-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
print(f'Da nhap {len(players)} the CH; chan dung {len(portraits)}; bao cao: scripts/data/ch-import-report.txt')
