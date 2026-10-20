import { writeFile, mkdir } from 'node:fs/promises';
const rate = 22050;
const target = new URL('../public/assets/', import.meta.url);
await mkdir(target, { recursive: true });
let seed = 70613;
function noise() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; }
function wav(seconds, sample) {
  const count = Math.round(seconds * rate), out = Buffer.alloc(44 + count * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40);
  let low = 0;
  for (let i = 0; i < count; i++) { const t = i / rate; low = .84 * low + .16 * noise(); const value = sample(t, seconds, low, noise()); out.writeInt16LE(Math.round(Math.max(-.95, Math.min(.95, value)) * 32767), 44 + i * 2); }
  return out;
}
const definitions = [
  ['crowd', 4, (t, d, low) => low * (.45 + .15 * Math.sin(t * Math.PI / 2)) + .018 * Math.sin(2 * Math.PI * 115 * t)],
  ['cue', .7, (t) => (Math.sin(2 * Math.PI * 392 * t) * .15 + Math.sin(2 * Math.PI * 784 * t) * .06) * (1 - Math.exp(-t * 70)) * Math.exp(-t * 7)],
  ['gate', 1.6, (t, d, low, raw) => (low * .45 + raw * .04 + Math.sin(2 * Math.PI * (43 * t + 18 * t * t)) * .13) * Math.sin(Math.PI * t / d) ** 2],
  ['impact', 2.4, (t, d, low, raw) => (Math.sin(2 * Math.PI * (42 * t + 5 * (1 - Math.exp(-t * 12)))) * .5 + low * .35 + raw * .08) * (1 - Math.exp(-t * 140)) * Math.exp(-t * 3) + .08 * (Math.sin(2 * Math.PI * 261.63 * t) + Math.sin(2 * Math.PI * 329.63 * t) + Math.sin(2 * Math.PI * 392 * t)) * Math.exp(-t * 1.7)],
  ['cheer', 3, (t, d, low, raw) => (low * .8 + raw * .065 + Math.sin(2 * Math.PI * 470 * t) * .015) * Math.sin(Math.PI * t / d) ** .65 * (.75 + .1 * Math.sin(t * 9))],
];
for (const [name, duration, sample] of definitions) await writeFile(new URL(`cinema-${name}.wav`, target), wav(duration, sample));
console.log('Đã tạo 5 âm thanh PCM riêng: đám đông, nhịp hé lộ, cửa, bùng nổ và reo hò.');
