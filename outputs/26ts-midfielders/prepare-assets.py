from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw

work = Path(__file__).resolve().parent
root = work.parent.parent
screenshots = work / 'sources'
cards = json.loads((work / 'cards.json').read_text(encoding='utf-8'))
geometry = []
sheet = Image.new('RGB', (5 * 230, 4 * 310), '#101722')
draw = ImageDraw.Draw(sheet)
for index, card in enumerate(cards):
    source = Image.open(screenshots / f"Screenshot 2026-10-22 {card['stamp']}.png").convert('RGB')
    rgb = np.array(source)
    r, g, b = rgb.transpose(2, 0, 1).astype(int)
    neutral = (((np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])) < 14) & (r > 150) & (r < 230)).astype('uint8') * 255
    neutral[:190] = 0; neutral[235:] = 0; neutral[:, :55] = 0; neutral[:, 120:] = 0
    _, _, components, _ = cv2.connectedComponentsWithStats(neutral)
    numbers = [v for v in components[1:] if 5 <= v[2] <= 15 and 14 <= v[3] <= 24 and v[4] > 50]
    assert len(numbers) == 1, card['slug']
    nx, ny, nw, nh, _ = map(int, numbers[0])
    cream = ((r > 180) & (g > 165) & (b > 95) & (r > b + 20) & (g > b + 10)).astype('uint8') * 255
    cream[:ny - 145] = 0; cream[ny - 94:] = 0; cream[:, :nx - 22] = 0; cream[:, nx + 31:] = 0
    _, _, components, _ = cv2.connectedComponentsWithStats(cream)
    digits = [v for v in components[1:] if 5 <= v[2] <= 18 and 18 <= v[3] <= 30 and v[4] > 60]
    assert len(digits) == 3, card['slug']
    ox = min(int(v[0]) for v in digits); oy = min(int(v[1]) for v in digits)
    ow = max(int(v[0] + v[2]) for v in digits) - ox
    oh = max(int(v[1] + v[3]) for v in digits) - oy
    # Remove only the printed ratings and level number; the game draws these dynamically.
    erase = np.zeros(rgb.shape[:2], np.uint8)
    erase[oy - 2:oy + oh + 2, ox - 2:ox + ow + 2] = 255
    erase[ny - 2:ny + nh + 2, nx - 2:nx + nw + 2] = 255
    clean = cv2.inpaint(rgb, erase, 3, cv2.INPAINT_TELEA)
    # Remove the connected screenshot background, preserving light details inside the card.
    background = np.max(np.abs(rgb.astype(int) - rgb[0, 0].astype(int)), axis=2) < 20
    _, labels = cv2.connectedComponents(background.astype('uint8'))
    edge_labels = set(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])).tolist()) - {0}
    alpha = np.where(np.isin(labels, list(edge_labels)), 0, 255).astype('uint8')
    rgba = Image.fromarray(np.dstack((clean, alpha)))
    cutouts = work / 'cutouts'
    cutouts.mkdir(exist_ok=True)
    Image.fromarray(np.dstack((rgb, alpha))).save(cutouts / f"ts-{card['slug']}.png")
    rgba.save(root / 'public/assets' / f"ts-{card['slug']}-card.webp", lossless=True, exact=True)
    width, height = source.size
    geometry.append({'id': card['id'], 'width': width, 'height': height,
                     'ovrX': round((nx + 4) / width * 100, 2),
                     'ovrY': round((oy - 7) / height * 100, 2),
                     'fontSize': round(36 / width * 100, 2),
                     'levelX': round((nx + 4) / width * 100, 2),
                     'levelY': round((ny + 8) / height * 100, 2),
                     'levelWidth': round(48 / width * 100, 2)})
    preview = rgba.copy(); preview.thumbnail((225, 270))
    x, y = index % 5 * 230, index // 5 * 310
    sheet.paste(preview, (x + (230 - preview.width) // 2, y), preview)
    draw.text((x + 10, y + 275), f"{card['id']} {card['slug']} {card['ovr']}", fill='white')
(work / 'geometry.json').write_text(json.dumps(geometry, indent=2), encoding='utf-8')
sheet.save(work / 'assets-contact-sheet.png')
print(json.dumps(geometry))
