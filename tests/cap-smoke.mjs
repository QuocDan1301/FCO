// node --import tsx tests/cap-smoke.mjs <taste-skill/scripts/lib/cdp.mjs> [url]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch({ extraArgs: ['--disable-gpu', '--no-sandbox'] });
const url = process.argv[3] || 'http://127.0.0.1:5174/FCO/';
mkdirSync('outputs/cap-qa', { recursive: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url);
  const fixture = { ...initialSave(), reduced: true, quick: true, light: true, sound: false };
  fixture.cards = [3343, 3344, 3350, 3373, 3378, 3430, 3432].flatMap((id, i) => [1, 5, 13].map(level => ({ uid: `cap-${i}-${level}`, playerId: id, level, received: Date.now() })));
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: fixture });
  await page.goto(url);
  for (let i = 0; i < 150 && !await page.eval(() => !!document.querySelector('.app-dock')); i++) await sleep(200);
  const click = async selector => { await page.eval(s => { const b = document.querySelector(s); if (!b || b.disabled) throw new Error('Unavailable: ' + s); b.click(); }, selector); await sleep(250); };
  const select = async (selector, value) => { await page.eval(({ s, v }) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, { s: selector, v: value }); await sleep(200); };
  const nav = async text => { await page.eval(t => { const b = [...document.querySelectorAll('.app-dock button')].find(e => e.textContent.includes(t)); if (!b) throw new Error('Missing nav: ' + t); b.click(); }, text); await sleep(350); };
  await nav('Shop');
  await page.eval(() => document.querySelector('[data-pack="cap"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  assert.ok(await page.eval(() => document.querySelector('[data-pack="cap"] img').naturalWidth > 0));
  await page.screenshot({ path: 'outputs/cap-qa/shop-1440.jpg' });
  await click('[data-pack="cap"] .shop-art');
  assert.match(await page.eval(() => document.querySelector('.pack-preview-sub').textContent), /90 cầu thủ/);
  await page.screenshot({ path: 'outputs/cap-qa/preview-1440.jpg' });
  await click('[aria-label="Đóng xem trước gói"]');
  await nav('Quản lý CT');
  assert.match(await page.eval(() => document.body.innerText), /R. Gullit/);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(250);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    await page.screenshot({ path: `outputs/cap-qa/inventory-${width}.jpg` });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await click('[aria-label="Xem thẻ R. Gullit"]');
  assert.equal(await page.eval(() => document.querySelector('.detail-card .face-art-ovr').textContent), '132');
  assert.equal(await page.eval(() => document.querySelector('.detail-card .face-art-name').textContent), 'R. Gullit');
  await page.screenshot({ path: 'outputs/cap-qa/gullit-detail.jpg' });
  await click('[aria-label="Đóng chi tiết"]');
  await nav('TTCN');
  await select('[aria-label="Mùa thẻ trên thị trường"]', 'cap');
  await page.screenshot({ path: 'outputs/cap-qa/market-1440.jpg' });
  await page.eval(() => { const e = document.querySelector('.market-filters input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'Gullit'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300);
  await select('[aria-label="Cấp thẻ trên thị trường"]', '13');
  await click('.market-row-action');
  assert.equal(await page.eval(() => document.querySelector('.season-cap .face-art-ovr').textContent), '132');
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(250);
    assert.ok(await page.eval(() => [...document.images].filter(i => i.getBoundingClientRect().height > 0).every(i => i.complete && i.naturalWidth > 0)));
    await page.screenshot({ path: `outputs/cap-qa/gullit-${width}.jpg` });
  }
  await click('.trade-actions .secondary-button');
  await page.setViewport({ width: 1440, height: 900 });
  await nav('Shop');
  await click('[data-pack="cap"] .shop-open-now');
  for (let i = 0; i < 150 && !await page.eval(key => JSON.parse(localStorage.getItem(key)).opened > 0, STORAGE_KEY); i++) await sleep(100);
  await sleep(1200);
  const saved = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.opened, fixture.opened + 1);
  assert.equal(saved.cards.length, fixture.cards.length + 1);
  assert.ok(saved.cards.some(c => c.playerId >= 3343 && c.playerId <= 3432 && !c.uid.startsWith('cap-')));
  await page.screenshot({ path: 'outputs/cap-qa/opened.jpg' });
  console.log('CAP browser QA passed:', url);
} finally { await browser.close(); }
