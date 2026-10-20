import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
const out = '.taste-skill/cinema-ending';
mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>16});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});` });
  const url = pathToFileURL(resolve('mothe.html')).href;
  const wait = async selector => {
    const started = Date.now();
    while (!await page.eval(s => !!document.querySelector(s), selector)) {
      if (Date.now() - started > 15000) throw new Error('Timeout: ' + selector);
      await sleep(30);
    }
  };
  const summary = [];
  await page.goto(url, { settleMs: 300 });
  for (const light of [false, true]) {
    const state = { ...initialSave(), reduced: false, sound: true, quick: false, light };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.setViewport({ width: light ? 390 : 1440, height: 900, mobile: light });
    await page.goto(url, { settleMs: 300 });
    await page.eval(() => document.querySelector('.hero-button').click());
    await wait('.ready-open-one:not(:disabled)');
    await page.eval(() => document.querySelector('.ready-open-one').click());
    for (const phase of [7, 8]) {
      await wait('.opening-phase-' + phase);
      await sleep(70);
      assert.equal(await page.eval(() => !!document.querySelector('.opening-gate-message')), false);
      assert.equal(await page.eval(() => document.querySelector('.opening-reveal')?.textContent.includes('Cánh cửa')), false);
      assert.equal(await page.eval(() => !!document.querySelector('.opening-reveal img')), false);
      await page.screenshot({ path: `${out}/${light ? 'light' : 'three'}-phase-${phase}.jpg` });
    }
    await wait('.opening-finished');
    await sleep(500);
    const result = await page.eval(key => ({ renderer: document.querySelector('[data-renderer]')?.dataset.renderer, owned: JSON.parse(localStorage.getItem(key)).cards.length, opened: JSON.parse(localStorage.getItem(key)).opened, resultVisible: !!document.querySelector('.opening-result>h2'), name: document.querySelector('.opening-result>h2').textContent, overflow: document.documentElement.scrollWidth > innerWidth }), STORAGE_KEY);
    assert.equal(result.owned, state.cards.length + 1);
    assert.equal(result.opened, 1);
    assert.equal(result.resultVisible, true);
    assert.equal(result.overflow, false);
    summary.push(result);
    await page.eval(() => document.querySelector('.save-reward').click());
    await sleep(400);
    assert.ok(await page.eval(() => !!document.querySelector('.collection-grid')));
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log(JSON.stringify({ result: 'PASS: no gate or white-shirt card at ending; inventory and save controls work', modes: summary }));
} finally { await browser.close(); }
