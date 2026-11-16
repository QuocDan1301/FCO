import numpy as np, cv2
from PIL import Image
shot = np.asarray(Image.open(r'C:\Users\Admin\AppData\Local\Temp\claude\be779a1df0f7e18d\dcfcb31c-3736-4f44-9b27-923f23020fd0\images\202.png').convert('RGB')).astype(np.float32)
card = np.asarray(Image.open('D:/FCOvv-tmp/tmp/ts-dembele.png').convert('RGBA')).astype(np.float32); H, W = card.shape[:2]
def grad(g): g = cv2.GaussianBlur(g, (3, 3), 0); return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
cg = grad(cv2.cvtColor(card[..., :3].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32))
sg = grad(cv2.cvtColor(shot.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32))
m = (card[..., 3] > 220).astype(np.uint8)
m[int(.12 * H):int(.72 * H), int(.27 * W):int(.92 * W)] = 0; m[int(.12 * H):int(.52 * H), :int(.27 * W)] = 0
m[int(.70 * H):int(.84 * H), int(.2 * W):] = 0; m[int(.58 * H):int(.72 * H), :int(.3 * W)] = 0
pad = 60; sp = cv2.copyMakeBorder(sg, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
best = (-1,)
for s in np.arange(1.04, 1.20, .002):
    sw, sh = int(round(W * s)), int(round(H * s))
    tpl = cv2.resize(cg, (sw, sh)); mk = cv2.resize(m, (sw, sh), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    r = cv2.matchTemplate(sp, tpl, cv2.TM_CCORR_NORMED, mask=mk)
    r[~np.isfinite(r)] = -1
    _, mx, _, loc = cv2.minMaxLoc(r)
    if mx > best[0]: best = (mx, s, loc[0] - pad, loc[1] - pad, sw, sh)
print(best)
mx, s, dx, dy, sw, sh = best
w = np.array([[s * W / W * sw / (W * s), 0, dx], [0, sh / H, dy]], np.float32); w[0, 0] = sw / W
al = cv2.warpAffine(shot, w, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
np.save('D:/FCOvv-tmp/tmp/ts26-warp.npy', w)
Image.fromarray(al.clip(0, 255).astype(np.uint8)).save('D:/FCOvv-tmp/tmp/ts26-shot-aligned.png')
bl = (al * .5 + card[..., :3] * .5).clip(0, 255).astype(np.uint8)
row = np.concatenate([card[..., :3].astype(np.uint8), al.clip(0, 255).astype(np.uint8), bl], 1)
Image.fromarray(row).resize((row.shape[1] * 2, row.shape[0] * 2)).save('D:/FCOvv-tmp/tmp/align-check2.png')
