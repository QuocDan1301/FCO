import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Đóng gói ứng dụng React đã biên dịch thành một HTML mở được bằng file://.
// Không cần CDN, máy chủ, node_modules hoặc thư mục assets khi sử dụng file này.
const root = fileURLToPath(new URL('../', import.meta.url));
const assetsDir = path.join(root, 'dist/assets');
let html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const jsFile = html.match(/src="\/assets\/([^\"]+\.js)"/)?.[1];
const cssFile = html.match(/href="\/assets\/([^\"]+\.css)"/)?.[1];
if (!jsFile || !cssFile) throw new Error('Cần chạy vite build trước khi đóng gói HTML độc lập.');
let js = await readFile(path.join(assetsDir, jsFile), 'utf8');
let css = await readFile(path.join(assetsDir, cssFile), 'utf8');
const resources = [
  ['mark.svg', 'image/svg+xml'],
  ['silhouette.svg', 'image/svg+xml'],
  ['messi.jpg', 'image/jpeg'],
  ['icon-tm.svg', 'image/svg+xml'],
  ['icon-tm-back.png', 'image/png'],
  ['itm-team.png', 'image/png'],
  ['zidane-card.webp', 'image/webp'],
  ['ronaldo-card.png', 'image/png'],
  ['pele-card.png', 'image/png'],
  ['gullit-card.png', 'image/png'],
  ['ballack-card.png', 'image/png'],
  ['kaka-card.png', 'image/png'],
  ['torres-card.png', 'image/png'],
  ['ferdinand-card.png', 'image/png'],
  ['vidic-card.png', 'image/png'],
  ['henry-card.png', 'image/png'],
  ['eusebio-card.png', 'image/png'],
  ['gerrard-card.png', 'image/png'],
  ['rooney-card.png', 'image/png'],
  ['vieira-card.png', 'image/png'],
  ['vandersar-card.png', 'image/png'],
  ['cech-card.png', 'image/png'],
  ['cruyff-card.png', 'image/png'],
  ['beckham-card.png', 'image/png'],
  ['ronaldinho-card.png', 'image/png'],
  ['drogba-card.png', 'image/png'],
  ['yashin-card.png', 'image/png'],
  ['maldini-card.png', 'image/png'],
  ['maradona-card.webp', 'image/webp'],
  ['vanbasten-card.webp', 'image/webp'],
  ['muller-card.webp', 'image/webp'],
  ['beckenbauer-card.webp', 'image/webp'],
  ['puskas-card.webp', 'image/webp'],
  ['best-card.webp', 'image/webp'],
  ['baggio-card.webp', 'image/webp'],
  ['jairzinho-card.webp', 'image/webp'],
  ['garrincha-card.webp', 'image/webp'],
  ['charlton-card.webp', 'image/webp'],
  ['baresi-card.webp', 'image/webp'],
  ['zico-card.webp', 'image/webp'],
  ['iniesta-card.webp', 'image/webp'],
  ['xavi-card.webp', 'image/webp'],
  ['buffon-card.webp', 'image/webp'],
  ['cantona-card.webp', 'image/webp'],
  ['ibrahimovic-card.webp', 'image/webp'],
  ['shevchenko-card.webp', 'image/webp'],
  ['totti-card.webp', 'image/webp'],
  ['batistuta-card.webp', 'image/webp'],
  ['pirlo-card.webp', 'image/webp'],
  ['casillas-card.webp', 'image/webp'],
  ['rijkaard-card.webp', 'image/webp'],
  ['sanchez-card.webp', 'image/webp'],
  ['nistelrooy-card.webp', 'image/webp'],
  ['etoo-card.webp', 'image/webp'],
  ['figo-card.webp', 'image/webp'],
  ['rivaldo-card.webp', 'image/webp'],
  ['bergkamp-card.webp', 'image/webp'],
  ['nesta-card.webp', 'image/webp'],
  ['shearer-card.webp', 'image/webp'],
  ['cafu-card.webp', 'image/webp'],
  ['cannavaro-card.webp', 'image/webp'],
  ['kahn-card.webp', 'image/webp'],
  ['dalglish-card.webp', 'image/webp'],
  ['dunga-card.webp', 'image/webp'],
  ['bcha-card.webp', 'image/webp'],
  ['kroos-card.webp', 'image/webp'],
  ['rcarlos-card.webp', 'image/webp'],
  ['marcelo-card.webp', 'image/webp'],
  ['klose-card.webp', 'image/webp'],
  ['vanpersie-card.webp', 'image/webp'],
  ['nedved-card.webp', 'image/webp'],
  ['lampard-card.webp', 'image/webp'],
  ['delpiero-card.webp', 'image/webp'],
  ['rush-card.webp', 'image/webp'],
  ['moore-card.webp', 'image/webp'],
  ['koeman-card.webp', 'image/webp'],
  ['carlosalberto-card.webp', 'image/webp'],
  ['lahm-card.webp', 'image/webp'],
  ['raul-card.webp', 'image/webp'],
  ['xabialonso-card.webp', 'image/webp'],
  ['puyol-card.webp', 'image/webp'],
  ['owen-card.webp', 'image/webp'],
  ['thuram-card.webp', 'image/webp'],
  ['zanetti-card.webp', 'image/webp'],
  ['scholes-card.webp', 'image/webp'],
  ['schmeichel-card.webp', 'image/webp'],
  ['toure-card.webp', 'image/webp'],
  ['laudrup-card.webp', 'image/webp'],
  ['lineker-card.webp', 'image/webp'],
  ['butragueno-card.webp', 'image/webp'],
  ['bale-card.webp', 'image/webp'],
  ['hagi-card.webp', 'image/webp'],
  ['ribery-card.webp', 'image/webp'],
  ['chiellini-card.webp', 'image/webp'],
  ['crespo-card.webp', 'image/webp'],
  ['trezeguet-card.webp', 'image/webp'],
  ['stoichkov-card.webp', 'image/webp'],
  ['seedorf-card.webp', 'image/webp'],
  ['desailly-card.webp', 'image/webp'],
  ['blanc-card.webp', 'image/webp'],
  ['hierro-card.webp', 'image/webp'],
  ['schweinsteiger-card.webp', 'image/webp'],
  ['makelele-card.webp', 'image/webp'],
  ['keane-card.webp', 'image/webp'],
  ['ruicosta-card.webp', 'image/webp'],
  ['park-card.webp', 'image/webp'],
  ['levels/lv-1.png', 'image/png'],
  ['levels/lv-2.png', 'image/png'],
  ['levels/lv-3.png', 'image/png'],
  ['levels/lv-4.png', 'image/png'],
  ['levels/lv-5.png', 'image/png'],
  ['levels/lv-6.png', 'image/png'],
  ['levels/lv-7.png', 'image/png'],
  ['levels/lv-8.png', 'image/png'],
  ['levels/lv-9.png', 'image/png'],
  ['levels/lv-10.png', 'image/png'],
  ['levels/lv-11.png', 'image/png'],
  ['levels/lv-12.png', 'image/png'],
  ['levels/lv-13.png', 'image/png'],
  ...['crowd', 'cue', 'gate', 'impact', 'cheer'].map(name => [`cinema-${name}.wav`, 'audio/wav']),
];
for (const [name, mime] of resources) {
  const bytes = await readFile(path.join(root, 'public/assets', name));
  const data = `data:${mime};base64,${bytes.toString('base64')}`;
  js = js.replaceAll(`/assets/${name}`, data);
  css = css.replaceAll(`/assets/${name}`, data);
  html = html.replaceAll(`/assets/${name}`, data);
}
// Font trực tuyến là phần trang trí; bản độc lập dùng font nhúng nếu có sẵn.
html = html.replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, '');
let fonts = '';
try { fonts = await readFile(path.join(root, 'public/assets/fonts-inline.css'), 'utf8'); } catch { /* Có font hệ thống thay thế khi chưa tải font. */ }
html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, '');
html = html.replace(/<link\b[^>]*\bhref="\/assets\/[^" ]+\.css"[^>]*>/g, '');
html = html.replace('</head>', () => `\n<style>\n${fonts}\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>\n</head>`);
html = html.replace('</body>', () => `\n<!-- React, Motion và toàn bộ logic trò chơi đã nhúng bên dưới. -->\n<script>\n(function(){\n${js.replace(/<\/script/gi, '<\\/script')}\n})();\n</script>\n</body>`);
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- BẢN ĐỘC LẬP: mở trực tiếp mothe.html. CSS, JavaScript, hình ảnh đã nhúng. -->\n');
if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"|(?:src|href)="\/assets\//.test(html)) throw new Error('HTML vẫn còn phụ thuộc tài nguyên ngoài.');
await writeFile(path.join(root, 'mothe.html'), html, 'utf8');
await writeFile(path.join(root, 'dist/mothe.html'), html, 'utf8');
console.log(`Đã tạo mothe.html độc lập: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, CSS + JavaScript + hình ảnh nhúng.`);
