// node tests/upgrade-layout-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initialSave, players, makeCard, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
mkdirSync('.taste-skill/upgrade-layout-qa', { recursive: true });
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const state = { ...initialSave(), reduced: true, sound: false, cards: players.slice(0, 70).map((p, i) => ({ ...makeCard(p.id), level: [7, 1, 4, 2, 13][i % 5] })) };
  await page.goto(url, { settleMs: 250 });
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  await page.goto(url, { settleMs: 250 });
  await page.eval(() => document.querySelector('.main-nav button:nth-child(2)').click());
  await sleep(100);
  for (const [width, height] of [[1440, 900], [1280, 650]]) {
    await page.setViewport({ width, height });
    await sleep(100);
    const report = await page.eval(() => {
      const body = document.querySelector('.fco-body');
      const button = document.querySelector('.fco-go').getBoundingClientRect();
      const panel = document.querySelector('.fco-upgrade').getBoundingClientRect();
      const before = body.scrollTop; body.scrollTop = body.scrollHeight;
      const scrollable = body.scrollTop > before;
      return { buttonBottom: button.bottom, buttonTop: button.top, panelBottom: panel.bottom, height: innerHeight, scrollbar: getComputedStyle(body).scrollbarWidth, scrollable };
    });
    assert.ok(report.buttonTop >= 0 && report.buttonBottom <= report.height, JSON.stringify(report));
    assert.ok(report.panelBottom <= report.height, JSON.stringify(report));
    assert.equal(report.scrollbar, 'none');
    assert.equal(report.scrollable, true, 'Vẫn cuộn được danh sách khi ẩn thanh cuộn');
    await page.eval(() => { document.querySelector('.fco-body').scrollTop = 0; });
    await page.screenshot({ path: `.taste-skill/upgrade-layout-qa/${width}-${height}.jpg`, fullPage: false });
  }
  for (const [index, attribute] of ['position', 'name', 'ovr', 'level', 'price'].entries()) {
    for (const direction of [1, -1, 1]) {
    await page.eval(({ key, arrow }) => {
      const button = document.querySelector(`[data-sort="${key}"]`);
      if (arrow) button.querySelector('svg').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else button.click();
    }, { key: attribute, arrow: index % 2 === 0 });
    await sleep(50);
    assert.equal(await page.eval(() => !!document.querySelector('.fco-menu')), false, 'Mũi tên sắp xếp ngay, không mở menu');
    const values = await page.eval(key => [...document.querySelectorAll('.fco-line')].map(row => {
      if (key === 'position') return row.querySelector('.fco-pos').textContent;
      if (key === 'name') return row.querySelector('.fco-name b').textContent;
      if (key === 'ovr') return Number(row.querySelector('.fco-ovr').textContent);
      if (key === 'level') return Number(row.querySelector('.fco-badge').alt.slice(1));
      const price = row.querySelector('.fco-cost').textContent;
      return /[BM]$/.test(price) ? parseFloat(price) * (price.endsWith('B') ? 1e9 : 1e6) : Number(price.replace(/\./g, ''));
    }), attribute);
    assert.ok(values.length > 20);
    for (let i = 1; i < values.length; i++) {
      const comparison = typeof values[i] === 'string' ? values[i - 1].localeCompare(values[i], attribute === 'name' ? 'vi' : 'en') : values[i - 1] - values[i];
      assert.ok(direction * comparison <= 0, `${attribute}, direction ${direction}: ${values[i - 1]}, ${values[i]}`);
    }
    assert.equal(await page.eval(key => document.querySelector(`[data-sort="${key}"]`).parentElement.getAttribute('aria-sort'), attribute), direction === 1 ? 'ascending' : 'descending');
    }
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: upgrade button stays visible at normal/short heights; hidden scrollbar remains scrollable; column names and arrows toggle ascending/descending without menus.');
} finally { await browser.close(); }
