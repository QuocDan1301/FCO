import { readFile, readdir, writeFile, open, copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Đóng gói ứng dụng React đã biên dịch thành một HTML mở được bằng file://.
// Không cần CDN, máy chủ, node_modules hoặc thư mục assets khi sử dụng file này.
const root = fileURLToPath(new URL('../', import.meta.url));
const assetsDir = path.join(root, 'dist/assets');
let html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
// Bản build có thể chạy dưới base (vd. /FCO/ cho GitHub Pages); đưa mọi đường dẫn về /assets/ trước khi nhúng.
const base = html.match(/src="([^"]*?)assets\/[^"]+\.js"/)?.[1] ?? '/';
if (base !== '/') html = html.replaceAll(`${base}assets/`, '/assets/');
const jsFile = html.match(/src="\/assets\/([^\"]+\.js)"/)?.[1];
const cssFile = html.match(/href="\/assets\/([^\"]+\.css)"/)?.[1];
if (!jsFile || !cssFile) throw new Error('Cần chạy vite build trước khi đóng gói HTML độc lập.');
let js = await readFile(path.join(assetsDir, jsFile), 'utf8');
let css = await readFile(path.join(assetsDir, cssFile), 'utf8');
if (base !== '/') { js = js.replaceAll(`${base}assets/`, '/assets/'); css = css.replaceAll(`${base}assets/`, '/assets/'); }
const resources = [
  ['background-music.mp3', 'audio/mpeg'],
  ['NAMGAO.mp3', 'audio/mpeg'],
  ['TABI.mp3', 'audio/mpeg'],
  ['HSM.mp3', 'audio/mpeg'],
  ['RTI.mp3', 'audio/mpeg'],
  ['SGD.mp3', 'audio/mpeg'],
  ['NenChill.mp3', 'audio/mpeg'],
  ['fco-vip-logo.png', 'image/png'],
  ['fco-vip-opening-logo.png', 'image/png'],
  ['silhouette.svg', 'image/svg+xml'],
  ['messi.jpg', 'image/jpeg'],
  ['icon-tm.svg', 'image/svg+xml'],
  ['icon-tm-back.webp', 'image/webp'],
  ['ts26-back.webp', 'image/webp'],
  ['no7-back.webp', 'image/webp'],
  ['no7-team.webp', 'image/webp'],
  ['no7-jairzinho-card.webp', 'image/webp'],
  ['no7-nakata-card.webp', 'image/webp'],
  ['no7-mahrez-card.webp', 'image/webp'],
  ['no7-neto-card.webp', 'image/webp'],
  ['no7-ramires-card.webp', 'image/webp'],
  ['no7-diaz-card.webp', 'image/webp'],
  ['no7-rosicky-card.webp', 'image/webp'],
  ['no7-larsson-card.webp', 'image/webp'],
  ['no7-kante-card.webp', 'image/webp'],
  ['no7-beckham-card.webp', 'image/webp'],
  ['no7-park-card.webp', 'image/webp'],
  ['no7-raul-card.webp', 'image/webp'],
  ['no7-saka-card.webp', 'image/webp'],
  ['no7-dalglish-card.webp', 'image/webp'],
  ['no7-pires-card.webp', 'image/webp'],
  ['no7-forlan-card.webp', 'image/webp'],
  ['no7-ribery-card.webp', 'image/webp'],
  ['no7-cantona-card.webp', 'image/webp'],
  ['no7-butragueno-card.webp', 'image/webp'],
  ['no7-son-card.webp', 'image/webp'],
  ['no7-best-card.webp', 'image/webp'],
  ['no7-figo-card.webp', 'image/webp'],
  ['no7-shevchenko-card.webp', 'image/webp'],
  ['no7-ronaldo-card.webp', 'image/webp'],
  ['itm-tunnel.webp', 'image/webp'],
  ['ts26-tunnel.webp', 'image/webp'],
  ['no7-tunnel.webp', 'image/webp'],
  ['prime-tunnel.webp', 'image/webp'],
  ['vietnam-back.webp', 'image/webp'],
  ['vietnam-team.webp', 'image/webp'],
  ['vietnam-tunnel.webp', 'image/webp'],
  ['prm-back.webp', 'image/webp'],
  ['prm-team.webp', 'image/webp'],
  ['prm-tunnel.webp', 'image/webp'],
  ['mdl-back.webp', 'image/webp'],
  ['mdl-team.webp', 'image/webp'],
  ['mdl-tunnel.webp', 'image/webp'],
  ['amb-back.webp', 'image/webp'],
  ['amb-team.webp', 'image/webp'],
  ['amb-tunnel.webp', 'image/webp'],
  ['ts-kane-card.webp', 'image/webp'],
  ['ts-mbappe-card.webp', 'image/webp'],
  ['ts-yamal-card.webp', 'image/webp'],
  ['ts-olise-card.webp', 'image/webp'],
  ['ts-haaland-card.webp', 'image/webp'],
  ['ts-bruno-card.webp', 'image/webp'],
  ['ts-vitinha-card.webp', 'image/webp'],
  ['ts-pedri-card.webp', 'image/webp'],
  ['ts-diaz-card.webp', 'image/webp'],
  ['ts-rice-card.webp', 'image/webp'],
  ['ts-gabriel-card.webp', 'image/webp'],
  ['ts-modric-card.webp', 'image/webp'],
  ['ts-nicopaz-card.webp', 'image/webp'],
  ['ts-igorthiago-card.webp', 'image/webp'],
  ['ts-saliba-card.webp', 'image/webp'],
  ['ts-dimarco-card.webp', 'image/webp'],
  ['ts-messi-card.webp', 'image/webp'],
  ['ts-cr7-card.webp', 'image/webp'],
  ['ts-yildiz-card.webp', 'image/webp'],
  ['ts-suarez-card.webp', 'image/webp'],
  ['ts-valverde-card.webp', 'image/webp'],
  ['ts-lautaro-card.webp', 'image/webp'],
  ['ts-llorente-card.webp', 'image/webp'],
  ['ts-muriqi-card.webp', 'image/webp'],
  ['ts-kimmich-card.webp', 'image/webp'],
  ['ts-vandijk-card.webp', 'image/webp'],
  ['ts-veerman-card.webp', 'image/webp'],
  ['ts-nunomendes-card.webp', 'image/webp'],
  ['ts-joaopedro-card.webp', 'image/webp'],
  ['ts-guimaraes-card.webp', 'image/webp'],
  ['ts-schlotterbeck-card.webp', 'image/webp'],
  ['ts-kvara-card.webp', 'image/webp'],
  ['ts-semenyo-card.webp', 'image/webp'],
  ['ts-szoboszlai-card.webp', 'image/webp'],
  ['ts-raum-card.webp', 'image/webp'],
  ['ts-dembele-card.webp', 'image/webp'],
  ['ts-jacoboramon-card.webp', 'image/webp'],
  ['ts-vuskovic-card.webp', 'image/webp'],
  ['ts-raya-card.webp', 'image/webp'],
  ['ts-godts-card.webp', 'image/webp'],
  ['ts-alvarez-card.webp', 'image/webp'],
  ['ts-undav-card.webp', 'image/webp'],
  ['ts-gnabry-card.webp', 'image/webp'],
  ['ts-xhaka-card.webp', 'image/webp'],
  ['ts-carlosromero-card.webp', 'image/webp'],
  ['ts-saibari-card.webp', 'image/webp'],
  ['ts-timber-card.webp', 'image/webp'],
  ['ts-cherki-card.webp', 'image/webp'],
  ['ts-enzo-card.webp', 'image/webp'],
  ['ts-ericgarcia-card.webp', 'image/webp'],
  ['ts-felix-card.webp', 'image/webp'],
  ['ts-tchouameni-card.webp', 'image/webp'],
  ['ts-bremer-card.webp', 'image/webp'],
  ['ts-mctominay-card.webp', 'image/webp'],
  ['ts-oyarzabal-card.webp', 'image/webp'],
  ['ts-locatelli-card.webp', 'image/webp'],
  ['ts-tah-card.webp', 'image/webp'],
  ['ts-rabiot-card.webp', 'image/webp'],
  ['ts-casemiro-card.webp', 'image/webp'],
  ['ts-oreilly-card.webp', 'image/webp'],
  ['ts-mourino-card.webp', 'image/webp'],
  ['ts-pavlovic-card.webp', 'image/webp'],
  ['ts-sangare-card.webp', 'image/webp'],
  ['ts-james-card.webp', 'image/webp'],
  ['ts-sarr-card.webp', 'image/webp'],
  ['ts-raphinha-card.webp', 'image/webp'],
  ['ts-upamecano-card.webp', 'image/webp'],
  ['ts-grimaldo-card.webp', 'image/webp'],
  ['ts-thauvin-card.webp', 'image/webp'],
  ['ts-joangarcia-card.webp', 'image/webp'],
  ['ts-maurojunior-card.webp', 'image/webp'],
  ['ts-donnarumma-card.webp', 'image/webp'],
  ['ts-udol-card.webp', 'image/webp'],
  ['ts-courtois-card.webp', 'image/webp'],
  ['ts-toney-card.webp', 'image/webp'],
  ['ts-son-card.webp', 'image/webp'],
  ['ts-milla-card.webp', 'image/webp'],
  ['ts-mckennie-card.webp', 'image/webp'],
  ['ts-quinones-card.webp', 'image/webp'],
  ['ts-aleixgarcia-card.webp', 'image/webp'],
  ['ts-bouanga-card.webp', 'image/webp'],
  ['ts-neves-card.webp', 'image/webp'],
  ['ts-bednarek-card.webp', 'image/webp'],
  ['ts-guirassy-card.webp', 'image/webp'],
  ['ts-zielinski-card.webp', 'image/webp'],
  ['ts-cucurella-card.webp', 'image/webp'],
  ['ts-ndicka-card.webp', 'image/webp'],
  ['ts-ryerson-card.webp', 'image/webp'],
  ['ts-akanji-card.webp', 'image/webp'],
  ['ts-fornals-card.webp', 'image/webp'],
  ['ts-rongier-card.webp', 'image/webp'],
  ['ts-wilson-card.webp', 'image/webp'],
  ['ts-tolisso-card.webp', 'image/webp'],
  ['ts-thomasson-card.webp', 'image/webp'],
  ['ts-wesley-card.webp', 'image/webp'],
  ['ts-karl-card.webp', 'image/webp'],
  ['ts-maignan-card.webp', 'image/webp'],
  ['ts-koffi-card.webp', 'image/webp'],
  ['ts-svilar-card.webp', 'image/webp'],
  ['itm-team.webp', 'image/webp'],
  ...(await readdir(path.join(root, 'public/assets/clubs'))).filter(name => name.endsWith('.png')).map(name => [`clubs/${name}`, 'image/png']),
  ['zidane-card.webp', 'image/webp'],
  ['ronaldo-card.webp', 'image/webp'],
  ['pele-card.webp', 'image/webp'],
  ['gullit-card.webp', 'image/webp'],
  ['ballack-card.webp', 'image/webp'],
  ['kaka-card.webp', 'image/webp'],
  ['torres-card.webp', 'image/webp'],
  ['ferdinand-card.webp', 'image/webp'],
  ['vidic-card.webp', 'image/webp'],
  ['henry-card.webp', 'image/webp'],
  ['eusebio-card.webp', 'image/webp'],
  ['gerrard-card.webp', 'image/webp'],
  ['rooney-card.webp', 'image/webp'],
  ['vieira-card.webp', 'image/webp'],
  ['vandersar-card.webp', 'image/webp'],
  ['cech-card.webp', 'image/webp'],
  ['cruyff-card.webp', 'image/webp'],
  ['beckham-card.webp', 'image/webp'],
  ['ronaldinho-card.webp', 'image/webp'],
  ['drogba-card.webp', 'image/webp'],
  ['yashin-card.webp', 'image/webp'],
  ['maldini-card.webp', 'image/webp'],
  ['maradona-card.webp', 'image/webp'],
  ['vanbasten-card.webp', 'image/webp'],
  ['muller-card.webp', 'image/webp'],
  ['beckenbauer-card.webp', 'image/webp'],
  ['matthaus-card.webp', 'image/webp'],
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
  ['levels/lv-1.webp', 'image/webp'],
  ['levels/lv-2.webp', 'image/webp'],
  ['levels/lv-3.webp', 'image/webp'],
  ['levels/lv-4.webp', 'image/webp'],
  ['levels/lv-5.webp', 'image/webp'],
  ['levels/lv-6.webp', 'image/webp'],
  ['levels/lv-7.webp', 'image/webp'],
  ['levels/lv-8.webp', 'image/webp'],
  ['levels/lv-9.webp', 'image/webp'],
  ['levels/lv-10.webp', 'image/webp'],
  ['levels/lv-11.webp', 'image/webp'],
  ['levels/lv-12.webp', 'image/webp'],
  ['levels/lv-13.webp', 'image/webp'],
  ...['crowd', 'cue', 'gate', 'impact', 'cheer'].map(name => [`cinema-${name}.wav`, 'audio/wav']),
];
// Resolve asset references before inserting base64 so the large HTML is scanned once.

const imageTypes = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav' };

const assetPattern = /\/assets\/[\w./-]+\.(?:png|webp|jpe?g|svg|mp3|wav)/g;

const referenced = [...new Set((js + css + html).match(assetPattern) ?? [])];

const embedded = new Map(), unembedded = [];

for (const ref of referenced) {

  const name = ref.slice('/assets/'.length);

  const bytes = await readFile(path.join(root, 'public/assets', name)).catch(() => null);

  if (!bytes) { unembedded.push(ref); continue; }

  embedded.set(ref, `data:${imageTypes[name.split('.').pop().toLowerCase()]};base64,${bytes.toString('base64')}`);

}

if (unembedded.length) throw new Error(`Missing assets: ${unembedded.join(', ')}`);

const flagLicense = await readFile(path.join(root, 'src/flag-assets.LICENSE'), 'utf8');

let fonts = '';

try { fonts = await readFile(path.join(root, 'public/assets/fonts-inline.css'), 'utf8'); } catch {}

html = html.replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, '');

html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, '');

html = html.replace(/<link\b[^>]*\bhref="\/assets\/[^" ]+\.css"[^>]*>/g, '');

html = html.replace('</head>', '\n<!-- Flag artwork: flag-icons 7.5.0 — https://github.com/lipis/flag-icons\n' + flagLicense + '\n-->\n<style>\n__FCO_FONTS__\n__FCO_CSS__\n</style>\n</head>');

html = html.replace('</body>', '\n<script>\n(function(){\nwindow.__FCO_STANDALONE__ = true;\n__FCO_JS__\n})();\n</script>\n</body>');

html = html.replace('<!doctype html>', '<!doctype html>\n<!-- BẢN ĐỘC LẬP: mở trực tiếp mothe.html. -->');

const assetIndexes = new Map([...embedded.keys()].map((ref, i) => [ref, i]));
// Keep image data in separate script blocks: the browser must never parse a
// single script exceeding V8's string length limit.
js = js.replace(/(["'])(\/assets\/[\w./-]+\.(?:png|webp|jpe?g|svg|mp3|wav))\1/g, (literal, quote, ref) =>
  assetIndexes.has(ref) ? `window.__FCO_EMBEDDED__[${assetIndexes.get(ref)}]` : literal);
html = html.replace('<script>\n(function()', '__FCO_DATA__\n<script>\n(function()');
const sections = { __FCO_FONTS__: fonts, __FCO_CSS__: css.replace(/<\/style/gi, '<\\/style'), __FCO_JS__: js.replace(/<\/script/gi, '<\\/script') };

const target = path.join(root, 'mothe.html');

const output = await open(target + '.tmp', 'w');

try {

  // Write each asset separately to avoid V8's maximum string length.

  const writeSection = async text => {

    let offset = 0;

    for (const match of text.matchAll(assetPattern)) {

      await output.write(text.slice(offset, match.index));

      await output.write(embedded.get(match[0]) ?? match[0]);

      offset = match.index + match[0].length;

    }

    await output.write(text.slice(offset));

  };

  let offset = 0;

  for (const match of html.matchAll(/__FCO_(?:FONTS|CSS|JS|DATA)__/g)) {

    await writeSection(html.slice(offset, match.index));

    if (match[0] === '__FCO_DATA__') {
      await output.write('<script>window.__FCO_EMBEDDED__=[];</script>\n');
      for (const [ref, data] of embedded) {
        await output.write(`<script>window.__FCO_EMBEDDED__[${assetIndexes.get(ref)}]=${JSON.stringify(data)};</script>\n`);
      }
    } else {
      await writeSection(sections[match[0]]);
    }

    offset = match.index + match[0].length;

  }

  await writeSection(html.slice(offset));

} finally { await output.close(); }

const { rename } = await import('node:fs/promises');

await rename(target + '.tmp', target);

await copyFile(target, path.join(root, 'dist/mothe.html'));

console.log(`Nhúng ${embedded.size} tài nguyên; mothe.html: ${Math.round((await stat(target)).size / 1024)} KB.`);

