import json
import shutil
from pathlib import Path
from collections import deque
from PIL import Image

root = Path.cwd()
sources = Path('C:/Users/Admin/OneDrive/Hình ảnh')
roster = json.loads((root / '.taste-skill/prime-qa/roster.json').read_text(encoding='utf8'))

def components(im, region, match):
    pix = im.load()
    x0,y0,x1,y1 = map(int, region)
    remaining = {(x,y) for y in range(y0,y1) for x in range(x0,x1) if match(pix[x,y])}
    result = []
    while remaining:
        start = remaining.pop()
        q = deque([start])
        xs,ys = [start[0]],[start[1]]
        while q:
            x,y = q.popleft()
            for n in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if n in remaining:
                    remaining.remove(n);q.append(n);xs.append(n[0]);ys.append(n[1])
        result.append((min(xs),min(ys),max(xs)+1,max(ys)+1,len(xs)))
    return result

for p in roster:
    src = sources / p['sourceFile']
    target = root / p['cardFace'].lstrip('/')
    target = root / 'public' / p['cardFace'].lstrip('/')
    shutil.copy2(src, target)
    original = Image.open(src)
    im = original.convert('RGBA')
    w,h = im.size
    if w > 500:
        im.thumbnail((500,600))
    aw,ah = im.size
    gray = components(im, (aw*.08,ah*.49,aw*.55,ah*.81), lambda c: c[3]>220 and max(c[:3])-min(c[:3])<18 and 35<sum(c[:3])/3<160 and (p['id'] < 325 or (c[2] >= c[0]+5 and c[1] >= c[0]+2)))
    gray = [c for c in gray if c[2]-c[0] > aw*.07 and c[3]-c[1] > ah*.03 and 0.8 < (c[2]-c[0])/(c[3]-c[1]) < 3.0]
    assert gray, (p['name'], 'Không tìm thấy ô cấp cộng')
    level = max(gray, key=lambda c:c[4])
    if p['id'] == 324:
        level = (94, 353, 183, 407)
    red = components(im, (aw*.08,ah*.15,aw*.52,ah*.34), lambda c: c[3]>220 and c[0]>c[1]*1.6 and c[0]>c[2]*1.6 and c[0]>90)
    digits = [c for c in red if ah*.04<c[3]-c[1]<ah*.13 and aw*.01<c[2]-c[0]<aw*.14 and c[4]>aw*ah*.0003]
    groups = []
    for c in digits:
        for group in groups:
            if abs(group[0][1]-c[1])<ah*.015 and abs(group[0][3]-c[3])<ah*.015:
                group.append(c);break
        else:groups.append([c])
    triples = [g for g in groups if len(g)==3]
    assert triples, (p['name'], 'Không tìm thấy đủ ba chữ số', digits)
    digits = min(triples, key=lambda g:min(c[1] for c in g))
    rating = [min(c[0] for c in digits),min(c[1] for c in digits),max(c[2] for c in digits),max(c[3] for c in digits)]
    # Chỉ đọc tọa độ/màu để đặt lớp HTML; giữ nguyên toàn bộ byte ảnh gốc.
    from statistics import median
    pixels = [im.getpixel((x,y))[:3] for x in range(rating[0],rating[2]) for y in range(rating[1],rating[3]) if not (im.getpixel((x,y))[0] > im.getpixel((x,y))[1]*1.6)]
    sample = tuple(round(median(c[i] for c in pixels)) for i in range(3))
    sample = '#'+''.join(f'{c:02x}' for c in sample)
    p.update(width=w,height=h,analysisWidth=aw,analysisHeight=ah,level=list(level[:4]),rating=rating,ratingBackground=sample)
    print(p['id'],p['name'],(w,h),'OVR',rating,'cấp',level[:4],sample)

(root/'.taste-skill/prime-qa/measured.json').write_text(json.dumps(roster,ensure_ascii=False,indent=2),encoding='utf8')
