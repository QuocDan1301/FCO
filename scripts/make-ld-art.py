"""Tự vẽ nền hầm và ảnh gói tạm cho mùa LD (LAST DANCE) — tông kem / đỏ thẫm / vàng như thẻ LD.
Cách chạy: python scripts/make-ld-art.py <thư mục nguồn có logo.png>
Ghi tunnel.png (2752×1536, cùng cỡ nền các mùa khác) và pack.png (1696×2528, khuôn thẻ áo) vào thư mục đó.
pack.png chỉ là ảnh tạm: khi người dùng gửi ảnh gói thật thì chép đè rồi chạy lại scripts/import-ld.py và ghép lại các gói có LD.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SOURCE = Path(sys.argv[1])
rng = np.random.default_rng(2026_11_11)
FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def noise(h, w, scale, octaves=4):
    """Nhiễu mịn nhiều tầng (phóng ảnh ngẫu nhiên nhỏ lên), giá trị 0…1."""
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale * 2 ** o))
        small = rng.random((max(2, h * s // w), s))
        out += amp * np.array(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.Resampling.BICUBIC)) / 255
        total += amp
        amp *= .5
    return out / total


def tunnel(W=2752, H=1536):
    y, x = np.mgrid[0:H, 0:W].astype(float)
    d = (x / W) - (1 - y / H) * .55 - .25          # đường chéo chia đôi: âm = nửa sáng (trái trên), dương = nửa tối
    n = noise(H, W, 6)
    # Nửa sáng: lụa kem ngà có gợn sóng nhẹ.
    silk = .5 + .5 * np.sin((x * .9 + y * 1.6) / 38 + n * 6)
    cream = np.stack([238 + 10 * silk, 226 + 12 * silk, 204 + 14 * silk], -1) - 18 * n[..., None]
    # Nửa tối: đá đỏ thẫm, vân nứt vàng sáng.
    marble = noise(H, W, 9, 5)
    dark = np.stack([70 + 70 * marble, 10 + 14 * marble, 16 + 16 * marble], -1)
    gold = np.zeros((H, W))
    for scale, width in ((4, .012), (7, .008), (11, .006)):   # vân nứt to / vừa / mảnh
        gold = np.maximum(gold, np.clip(1 - np.abs(noise(H, W, scale, 5) - .5) / width, 0, 1) ** 2)
    dark = dark * (1 - gold[..., None]) + np.array([255, 196, 92]) * gold[..., None]
    t = np.clip((d + .01) / .02, 0, 1)[..., None]
    img = cream * (1 - t) + dark * t
    # Dải ruy băng đỏ chéo theo đường chia (như dải lụa đỏ trên thẻ) với viền vàng.
    band = np.exp(-((d - .05) / .03) ** 2)
    ribbon = np.stack([200 + 40 * silk, 30 + 20 * silk, 40 + 15 * silk], -1)
    img = img * (1 - .85 * band[..., None]) + ribbon * .85 * band[..., None]
    for off in (-.012, .112):
        edge = np.exp(-((d - off) / .0028) ** 2)
        img = img * (1 - edge[..., None]) + np.array([255, 222, 150]) * edge[..., None]
    # Hạt sáng vàng lấp lánh.
    sparks = (rng.random((H, W)) > .99975) & (d > -.05)[...]
    glow = np.array(Image.fromarray((sparks * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))) / 255 * 6
    img = img + np.clip(glow, 0, 1)[..., None] * np.array([255, 210, 130])
    # Tối dần ở viền.
    vig = 1 - .35 * (((x / W - .5) * 1.6) ** 2 + ((y / H - .5) * 1.8) ** 2)
    img = np.clip(img * vig[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(img)


def pack(logo, W=1696, H=2528):
    # Khuôn thẻ: hình chữ nhật vát góc như ảnh gói các mùa.
    poly = [(260, 60), (W - 260, 60), (W - 90, 230), (W - 90, H - 330), (W // 2 + 380, H - 90), (W // 2 - 380, H - 90), (90, H - 330), (90, 230)]
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    bg = tunnel(W * 2, H).crop((W // 2, 0, W // 2 + W, H)).resize((W, H))
    card = Image.new('RGBA', (W, H))
    card.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(card)
    # Viền vàng hai lớp.
    draw.line(poly + [poly[0]], fill=(214, 176, 104, 255), width=26, joint='curve')
    inner = [(x + (40 if x < W / 2 else -40), y + (40 if y < H / 2 else -40)) for x, y in poly]
    draw.line(inner + [inner[0]], fill=(255, 232, 176, 230), width=8, joint='curve')
    # Áo đấu trắng có viền đỏ, ở giữa là huy hiệu Last Dance.
    shirt = [(560, 760), (760, 700), (850, 760), (940, 700), (1140, 760), (1330, 980), (1190, 1110), (1120, 1040), (1120, 1700), (580, 1700), (580, 1040), (510, 1110), (370, 980)]
    shadow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shadow).polygon([(x + 18, y + 26) for x, y in shirt], fill=150)
    card.paste((20, 6, 8, 255), (0, 0), shadow.filter(ImageFilter.GaussianBlur(24)))
    draw.polygon(shirt, fill=(246, 240, 230, 255), outline=(176, 30, 38, 255), width=14)
    draw.line([(760, 700), (850, 800), (940, 700)], fill=(176, 30, 38, 255), width=22, joint='curve')
    crest = logo.resize((520, round(logo.height * 520 / logo.width)), Image.Resampling.LANCZOS)
    card.alpha_composite(crest, ((W - crest.width) // 2, 1120 - crest.height // 2))
    # Tiêu đề.
    font = ImageFont.truetype(FONT, 190)
    font.set_variation_by_axes([700, 75]) if hasattr(font, 'set_variation_by_axes') else None
    title = 'LAST DANCE'
    w = draw.textlength(title, font=font)
    draw.text(((W - w) / 2 + 6, 400 + 8), title, font=font, fill=(40, 6, 10, 160))
    draw.text(((W - w) / 2, 400), title, font=font, fill=(255, 244, 222, 255), stroke_width=4, stroke_fill=(120, 18, 26, 255))
    # Huy hiệu mùa góc dưới trái: ô đỏ chữ LD như nhãn trên thẻ.
    bx0, by0, bx1, by1 = 200, 2090, 410, 2250
    draw.rounded_rectangle((bx0, by0, bx1, by1), radius=14, fill=(150, 28, 34, 255), outline=(240, 214, 170, 255), width=8)
    small = ImageFont.truetype(FONT, 120)
    small.set_variation_by_axes([700, 75]) if hasattr(small, 'set_variation_by_axes') else None
    tw = draw.textlength('LD', font=small)
    draw.text(((bx0 + bx1 - tw) / 2, by0 + 12), 'LD', font=small, fill=(255, 238, 214, 255))
    return card


logo = Image.open(SOURCE / 'logo.png').convert('RGBA')
logo = logo.crop(logo.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
tunnel().save(SOURCE / 'tunnel.png')
pack(logo).save(SOURCE / 'pack.png')
print('ok')
