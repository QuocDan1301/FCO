// node --import tsx tests/bdo-smoke.mjs <taste-skill/scripts/lib/cdp.mjs> [url]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
const url = process.argv[3] || 'http://127.0.0.1:5174/FCO/';
mkdirSync('outputs/bdo-qa', { recursive: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url);
  const fixture = { ...initialSave(), reduced: true, sound: false };
  fixture.cards = [2021, 2022, 2023, 2034, 2072, 2119, 2128].flatMap((id, i) => [1, 5, 13].map(level => ({ uid: `bdo-${i}-${level}`, playerId: id, level, received: Date.now() })));
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: fixture });
  await page.goto(url);
  for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector('.app-dock')); i++) await sleep(200);
  console.log('screen', (await page.eval(() => document.body.innerText)).slice(0, 500));
  await page.screenshot({ path: 'outputs/bdo-qa/start.jpg' });
  const click = async selector => { await page.eval(s => { const b = document.querySelector(s); if (!b || b.disabled) throw new Error('Unavailable: ' + s); b.click(); }, selector); await sleep(250); };
  const select = async (selector, value) => { await page.eval(({ s, v }) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, { s: selector, v: value }); await sleep(200); };
  // Use real navigation names so the test survives navigation order changes.
  const nav = async text => { await page.eval(t => { const b = [...document.querySelectorAll('.app-dock button')].find(e => e.textContent.includes(t)); if (!b) throw new Error('Missing nav: ' + t); b.click(); }, text); await sleep(350); };
  console.log('nav', await page.eval(() => [...document.querySelectorAll('.app-dock button')].map(e => e.textContent)));
  await nav('Shop');
  await page.eval(() => document.querySelector('[data-pack="bdo"]').scrollIntoView({ block: 'center' }));
  assert.ok(await page.eval(() => document.querySelector('[data-pack="bdo"] img').naturalWidth > 0));
  await page.screenshot({ path: 'outputs/bdo-qa/shop-1440.jpg' });
  await click('[data-pack="bdo"] .shop-art');
  assert.match(await page.eval(() => document.querySelector('.pack-preview-sub').textContent), /108 cầu thủ/);
  await page.screenshot({ path: 'outputs/bdo-qa/preview-1440.jpg' });
  await click('[aria-label="Đóng xem trước gói"]');
  await nav('Quản lý CT');
  await page.screenshot({ path: 'outputs/bdo-qa/inventory-1440.jpg' });
  assert.match(await page.eval(() => document.body.innerText), /R\. Ferdinand/);
  assert.ok(await page.eval(() => [...document.querySelectorAll('.season-bdo img')].every(i => i.complete && i.naturalWidth > 0)));
  for (const width of [768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(300);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    await page.screenshot({ path: `outputs/bdo-qa/inventory-${width}.jpg` });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await nav('TTCN');
  await select('[aria-label="Mùa thẻ trên thị trường"]', 'bdo');
  assert.ok(await page.eval(() => document.querySelectorAll('.market-row').length > 0));
  await page.screenshot({ path: 'outputs/bdo-qa/market-1440.jpg' });
  assert.ok(await page.eval(() => [...document.images].filter(i => i.getBoundingClientRect().height > 0).every(i => i.complete && i.naturalWidth > 0)));
  await page.eval(() => { const e = document.querySelector('.market-filters input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'Ferdinand'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300);
  await click('.market-row-action');
  assert.ok(await page.eval(() => !!document.querySelector('.season-bdo.face-2119')));
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(250);
    await page.screenshot({ path: `outputs/bdo-qa/ferdinand-${width}.jpg` });
  }
  console.log('BDO browser QA passed:', url);
} finally { await browser.close(); }
