import sys, os, json
sys.path.insert(0, 'D:/FCOvv-tmp/pylib')
import numpy as np, onnxruntime as ort
from PIL import Image
repo = sys.argv[1]
sess = ort.InferenceSession('D:/FCOvv-tmp/models/u2net_human_seg.onnx', providers=['CPUExecutionProvider']); inp = sess.get_inputs()[0].name
cards = json.load(open('D:/FCOvv-tmp/tmp/cards.json', encoding='utf8'))['cards']
d = json.load(open(repo + '/src/portraits.json', encoding='utf8')); f = json.load(open(repo + '/src/portrait-frames.json', encoding='utf8'))['tiers']
out = 'D:/FCOvv-tmp/masks-raw'; os.makedirs(out, exist_ok=True)
todo = []
for c in cards:
    if not c.get('face'): continue
    own = d['cards'].get(str(c['id']))
    if c['tier'] in f and own and d['seasons'].get(own[:3]) == c['tier']: continue
    todo.append(c)
json.dump([c['id'] for c in todo], open('D:/FCOvv-tmp/tmp/mask-todo.json', 'w'))
for i, c in enumerate(todo):
    p = f"{out}/{c['id']}.png"
    if os.path.exists(p): continue
    im = Image.open(os.path.join(repo, 'public', c['face'].lstrip('/'))).convert('RGB')
    a = np.asarray(im.resize((320, 320), Image.LANCZOS)).astype(np.float32); a /= max(a.max(), 1e-6)
    a = (a - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    o = sess.run(None, {inp: a.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
    o = (o - o.min()) / max(o.max() - o.min(), 1e-6)
    Image.fromarray((o * 255).astype(np.uint8)).resize(im.size, Image.BILINEAR).save(p)
    if i % 100 == 0: print(i, len(todo), flush=True)
print('done', len(todo))
