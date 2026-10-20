// node tests/sorting-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, getPlayer, ovr, MAX_LEVEL, STORAGE_KEY } from '../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const fixture = initialSave();
fixture.reduced = true;
fixture.cards = fixture.cards.map((card, i) => ({ ...card, uid: `sort-${i}`, level: [1, 13, 4, 10, 2, 7][i % 6], received: 1000 + i }));
const metadata = fixture.cards.map(card => ({ name: getPlayer(card).name, position: getPlayer(card).pos, ovr: ovr(card), level: card.level }));
const modes = ['ovr', 'ovr-asc', 'name', 'name-desc', 'position', 'position-desc', 'level', 'level-asc'];
const browser = await Browser.launch();
mkdirSync('.taste-skill/sorting-qa', { recursive: true });
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  await page.goto(url);
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: fixture });
  await page.goto(url);
  const click = async selector => { await page.eval(s => document.querySelector(s).click(), selector); await sleep(100); };
  const select = async (selector, value) => {
    await page.eval(({ selector, value }) => { const el = document.querySelector(selector); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, { selector, value });
    await sleep(100);
  };
  const checkOrder = async (mode, picker = false) => {
    const rows = await page.eval(isPicker => [...document.querySelectorAll(isPicker ? '.picker-row' : '.collection-card .player-card')].map(el => isPicker ? {
      name: el.querySelector('.picker-name>b').textContent,
      position: el.querySelector('.picker-name small').textContent.split(' · ')[0],
      ovr: Number(el.querySelector('.picker-ovr').textContent),
      level: Number(el.querySelector('.picker-name small').textContent.match(/\+(\d+)/)[1]),
    } : (() => { const parts = el.getAttribute('aria-label').split(', '); return { name: parts[0], ovr: Number(parts[1].slice(4)), position: parts[2], level: Number(parts[4].slice(5)) }; })()), picker);
    assert.ok(rows.length > 1);
    const key = mode.startsWith('ovr') ? 'ovr' : mode.startsWith('name') ? 'name' : mode.startsWith('position') ? 'position' : 'level';
    const ascending = mode.endsWith('asc') || mode === 'name' || mode === 'position';
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1][key], b = rows[i][key];
      const delta = typeof a === 'string' ? a.localeCompare(b, key === 'name' ? 'vi' : undefined) : a - b;
      assert.ok(ascending ? delta <= 0 : delta >= 0, `${picker ? 'picker' : 'collection'}: ${mode}, ${a}, ${b}`);
    }
    return rows;
  };
  await click('.main-nav button:nth-child(3)');
  for (const mode of modes) { await select('#sort', mode); assert.equal((await checkOrder(mode)).length, fixture.cards.length); }
  const pos = metadata[0].position;
  await select('#position', pos);
  await select('#sort', 'ovr-asc');
  assert.ok((await checkOrder('ovr-asc')).every(row => row.position === pos));
  await click('.collection-count .text-action');
  assert.equal(await page.eval(() => document.querySelector('#sort').value), 'ovr');
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.taste-skill/sorting-qa/collection-${width}.jpg` });
  }
  await click('.main-nav button:nth-child(2)');
  await click('.target-button');
  for (const mode of modes) {
    await select('#picker-sort', mode);
    const rows = await checkOrder(mode, true);
    assert.equal(rows.length, fixture.cards.filter(card => card.level < MAX_LEVEL).length);
    assert.ok(rows.every(row => row.level < MAX_LEVEL));
  }
  await click('.picker-row');
  await click('.material-slot:not(.filled)');
  await click('.picker-row');
  const chosen = await page.eval(() => document.querySelector('.picker-row.selected .picker-name>b').textContent);
  for (const mode of modes) {
    await select('#picker-sort', mode);
    assert.equal((await checkOrder(mode, true)).length, fixture.cards.length - 1);
    assert.equal(await page.eval(() => document.querySelector('.picker-row.selected .picker-name>b').textContent), chosen);
  }
  await page.screenshot({ path: '.taste-skill/sorting-qa/picker-390.jpg' });
  assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY), fixture, 'Sorting never modifies the saved collection');
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: 8 sort modes in collection and both upgrade pickers; filters, reset, selection, max level, save integrity; 1440/768/390px; no JavaScript errors.');
} finally { await browser.close(); }
