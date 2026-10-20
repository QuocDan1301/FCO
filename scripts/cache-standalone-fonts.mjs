import { writeFile } from 'node:fs/promises';
const endpoint = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap';
const response = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36' } });
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
