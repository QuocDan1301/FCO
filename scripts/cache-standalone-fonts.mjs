import { writeFile } from 'node:fs/promises';
// User-Agent Chrome đầy đủ để Google Fonts trả font biến thiên woff2 chia theo bảng mã (thiếu thì trả TTF tĩnh từng độ đậm, nặng gấp ~5 lần).
const endpoint = 'https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,100..900;1,100..900&display=swap';
const response = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
if (!response.ok) throw new Error(`Không tải được font CSS: ${response.status}`);
let css = await response.text();
const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(match => match[1]))];
for (const url of urls) {
  const resource = await fetch(url);
  if (!resource.ok) throw new Error(`Không tải được tệp font: ${resource.status}`);
  const mime = url.includes('.woff2') ? 'font/woff2' : 'font/ttf';
  const data = Buffer.from(await resource.arrayBuffer()).toString('base64');
  css = css.replaceAll(url, `data:${mime};base64,${data}`);
}
await writeFile(new URL('../public/assets/fonts-inline.css', import.meta.url), css, 'utf8');
console.log(`Đã nhúng ${urls.length} tệp font vào bộ nhớ đệm cục bộ.`);
