import { useEffect, useState } from 'react';
import { cardSwapOf, type CardSwap } from './portraits';
import type { Player } from './game';

// Đổi miniface lên ảnh thẻ (face-art): người trên thẻ là ảnh chân dung FC Online đặt ở vị trí cố định của mùa (portrait-frames.json),
// (mùa khác: mặt nạ người tách sẵn) nên biết đúng hình người cũ → lấp vùng đó bằng nền xung quanh (trung bình có trọng số, nhiều cỡ), rồi đặt miniface mới vào cùng chỗ.
// Ghép trong trình duyệt bằng canvas, chỉ cho thẻ của cầu thủ đã chọn miniface khác; kết quả giữ trong bộ nhớ theo (thẻ, miniface).

type Img = { data: Uint8ClampedArray; width: number; height: number };

// Tổng tích luỹ 2 chiều để lấy trung bình hộp nhanh.
function integral(src: Float32Array, W: number, H: number) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += src[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  return I;
}
const boxSum = (I: Float64Array, W: number, H: number, x: number, y: number, r: number) => {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1), S = W + 1;
  return I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
};

// card: ảnh thẻ; old / next: ảnh chân dung cũ / mới đã vẽ sẵn vào ô vuông tf trên khung cùng cỡ thẻ (ngoài ô trong suốt).
// soft: ảnh mới có nền riêng (miniface người dùng gửi) → mờ viền bốn phía; ảnh FC Online chỉ mờ dần ở đáy ô.
// Vùng an toàn của mùa (portrait-zones.json): không xoá / không đặt miniface lên cột vị trí – chỉ số, ô cấp, phần dưới mép cắt
// (nhãn mùa, tên, cờ, logo); miniface còn phải nằm trong viền thẻ (alpha thẻ thu vào inset × rộng).
export type Zone = { level: number[]; info: number[]; cut: number; inset: number };
function zoneMasks(card: Img, zone: Zone) {
  const { width: W, height: H } = card, n = W * H, c = card.data;
  const inRect = (r: number[], x: number, y: number) => x >= r[0] * W && x < r[1] * W && y >= r[2] * H && y < r[3] * H;
  const hard = new Float32Array(n), outside = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    hard[i] = y < zone.cut * H && !inRect(zone.info, x, y) && !inRect(zone.level, x, y) ? 1 : 0;
    outside[i] = c[i * 4 + 3] < 128 ? 1 : 0;
  }
  const BI = integral(hard, W, H), OI = integral(outside, W, H), r = Math.max(1, Math.round(zone.inset * W));
  const base = new Float32Array(n), inner = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = boxSum(BI, W, H, x, y, 1) / 9;
    base[i] = b;
    inner[i] = boxSum(OI, W, H, x, y, r) > 0 ? 0 : b;
  }
  return { base, inner };
}

export function swapPixels(card: Img, old: Img, next: Img, box: { x: number; y: number; t: number }, soft: boolean, zone?: Zone): Uint8ClampedArray {
  const { width: W, height: H } = card, n = W * H, c = card.data, o = old.data, nx = next.data;
  // Vùng người cũ: alpha > 0,08, nới ra ~2px và làm mềm.
  const hard = new Float32Array(n);
  for (let i = 0; i < n; i++) hard[i] = o[i * 4 + 3] > 20 ? 1 : 0;
  const HI = integral(hard, W, H), grow = Math.max(1, Math.round(H / 160));
  const m = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = boxSum(HI, W, H, x, y, grow) / ((2 * grow + 1) ** 2); m[y * W + x] = Math.min(1, a * 3); }
  const zm = zone ? zoneMasks(card, zone) : null;
  if (zm) for (let i = 0; i < n; i++) m[i] *= zm.base[i];
  // Nền lấp: trung bình có trọng số các điểm ngoài vùng người (bên trong thẻ), cỡ hộp tăng dần tới khi đủ điểm.
  const w = new Float32Array(n), ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const wi = (1 - m[i]) * c[i * 4 + 3] / 255; w[i] = wi; for (let k = 0; k < 3; k++) ch[k][i] = c[i * 4 + k] * wi; }
  const WI = integral(w, W, H), CI = ch.map(a => integral(a, W, H));
  const radii = [15, 30, 60, 120].map(r => Math.max(2, Math.round(r * H / 323)));
  const out = new Uint8ClampedArray(c);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, mi = m[i];
    let r0 = 0, g0 = 0, b0 = 0;
    if (mi > 0) {
      for (let j = 0; j < radii.length; j++) {
        const ws = boxSum(WI, W, H, x, y, radii[j]);
        if (ws > (j === radii.length - 1 ? 1e-6 : (2 * radii[j] + 1) ** 2 * .02)) { r0 = boxSum(CI[0], W, H, x, y, radii[j]) / ws; g0 = boxSum(CI[1], W, H, x, y, radii[j]) / ws; b0 = boxSum(CI[2], W, H, x, y, radii[j]) / ws; break; }
      }
      out[i * 4] = c[i * 4] * (1 - mi) + r0 * mi; out[i * 4 + 1] = c[i * 4 + 1] * (1 - mi) + g0 * mi; out[i * 4 + 2] = c[i * 4 + 2] * (1 - mi) + b0 * mi;
    }
    // Ảnh mới: alpha × độ mờ viền × alpha thẻ (không tràn ra ngoài khung).
    const u = (x - box.x) / box.t, v = (y - box.y) / box.t;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const edge = (d: number, f: number) => Math.min(1, Math.max(0, d / f));
    const fade = soft ? Math.min(edge(u, .1), edge(1 - u, .1), edge(v, .06), edge(1 - v, .14)) : edge(1 - v, .16);
    const a = nx[i * 4 + 3] / 255 * fade * c[i * 4 + 3] / 255 * (zm ? zm.inner[i] : 1);
    if (a <= 0) continue;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = out[i * 4 + k] * (1 - a) + nx[i * 4 + k] * a;
  }
  return out;
}

// Khung trống của mùa: vùng alpha của khung (z) lấy nền khung thay ảnh thẻ, miniface mới chỉ hiện trong vùng đó.
export function blankPixels(card: Img, blank: Img, next: Img, box: { x: number; y: number; t: number }, soft: boolean): Uint8ClampedArray {
  const { width: W, height: H } = card, c = card.data, b = blank.data, nx = next.data, out = new Uint8ClampedArray(c);
  const edge = (d: number, f: number) => Math.min(1, Math.max(0, d / f));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, z = b[i + 3] / 255;
    if (z <= 0) continue;
    for (let k = 0; k < 3; k++) out[i + k] = c[i + k] * (1 - z) + b[i + k] * z;
    const u = (x - box.x) / box.t, v = (y - box.y) / box.t;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const fade = soft ? Math.min(edge(u, .1), edge(1 - u, .1), edge(v, .06), edge(1 - v, .12)) : edge(1 - v, .12);
    const a = nx[i + 3] / 255 * fade * z;
    if (a > 0) for (let k = 0; k < 3; k++) out[i + k] = out[i + k] * (1 - a) + nx[i + k] * a;
  }
  return out;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = fail; im.src = src; });
const cache = new Map<string, Promise<string>>();

async function compose(cardFace: string, s: CardSwap): Promise<string> {
  if (s.blank && s.box) {
    const [card, blank, next] = await Promise.all([loadImage(cardFace), loadImage(s.blank), loadImage(s.next)]);
    const W = card.naturalWidth, H = card.naturalHeight, t = Math.round(s.box[0] * H);
    const box = { t, x: Math.round(s.box[1] * W - t / 2), y: Math.round(s.box[2] * H - t) };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    const grab = (im: HTMLImageElement, full: boolean): Img => { g.clearRect(0, 0, W, H); if (full) g.drawImage(im, 0, 0, W, H); else g.drawImage(im, box.x, box.y, box.t, box.t); return g.getImageData(0, 0, W, H); };
    const c = grab(card, true), bl = grab(blank, true), n = grab(next, false);
    g.putImageData(new ImageData(blankPixels(c, bl, n, box, s.soft), W, H), 0, 0);
    const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/webp', .9));
    return blob ? URL.createObjectURL(blob) : cv.toDataURL();
  }
  const [card, old, next] = await Promise.all([loadImage(cardFace), loadImage(s.old ?? s.mask!), loadImage(s.next)]);
  const W = card.naturalWidth, H = card.naturalHeight, [k, fx, fy] = s.tf;
  const box = { t: Math.round(k * H), x: Math.round(fx * W), y: Math.round(fy * H) };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const grab = (im: HTMLImageElement, full: boolean): Img => { g.clearRect(0, 0, W, H); if (full) g.drawImage(im, 0, 0, W, H); else g.drawImage(im, box.x, box.y, box.t, box.t); return g.getImageData(0, 0, W, H); };
  const c = grab(card, true), n = grab(next, false), o = grab(old, !!s.mask);
  // Mặt nạ người (ảnh xám cỡ thẻ): độ sáng → alpha, để swapPixels dùng như hình chân dung cũ.
  if (s.mask) for (let i = 0; i < o.data.length; i += 4) o.data[i + 3] = o.data[i];
  g.putImageData(new ImageData(swapPixels(c, o, n, box, s.soft, s.zone), W, H), 0, 0);
  const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/webp', .9));
  return blob ? URL.createObjectURL(blob) : cv.toDataURL();
}

// Ảnh thẻ để hiện: thẻ gốc, hoặc thẻ đã thay miniface (ghép xong mới đổi, lỗi thì giữ thẻ gốc).
export function useCardFace(p: Pick<Player, 'id' | 'name' | 'nation' | 'tier' | 'cardFace'>): string | undefined {
  const swap = cardSwapOf(p), key = swap?.key ?? '';
  const [done, setDone] = useState<{ key: string; src: string } | null>(null);
  useEffect(() => {
    if (!swap || !p.cardFace) return;
    let live = true;
    let job = cache.get(key);
    if (!job) { job = compose(p.cardFace, swap); cache.set(key, job); job.catch(() => cache.delete(key)); }
    job.then(src => { if (live) setDone({ key, src }); }, () => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return swap && done?.key === key ? done.src : p.cardFace;
}
