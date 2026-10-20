// node tests/mobile-layout-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, players, makeCard, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
mkdirSync('.taste-skill/mobile-qa', { recursive: true });
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const state = { ...initialSave(), reduced: true, sound: false, light: true, cards: players.slice(0, 70).map((p, i) => ({ ...makeCard(p.id), level: [1, 3, 7][i % 3] })) };
  await page.goto(url, { settleMs: 250 });
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  await page.goto(url, { settleMs: 250 });
  const click = async selector => { await page.eval(s => document.querySelector(s).click(), selector); await sleep(100); };
  const inspect = async label => {
    const report = await page.eval(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; };
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        fields: [...document.querySelectorAll('input:not([type=checkbox]),select')].filter(el => el.getClientRects().length).map(el => ({ size: parseFloat(getComputedStyle(el).fontSize) })),
        actions: [...document.querySelectorAll('.fco-actions button,.ready-actions button,.reveal-actions button')].filter(el => el.getClientRects().length).map(rect),
        row: document.querySelector('.fco-line') ? [...document.querySelector('.fco-line').children].filter(el => getComputedStyle(el).display !== 'none').map(rect) : [],
      };
    });
    check(report.scrollWidth <= report.width + 1, `${label}: page overflows (${report.scrollWidth}/${report.width})`);
    if (report.width <= 640) {
      check(report.fields.every(f => f.size >= 16), `${label}: mobile fields trigger input zoom`);
      check(report.actions.every(r => r.left >= 0 && r.right <= report.width && r.height >= 44), `${label}: action clipped or too small: ${JSON.stringify(report.actions)}`);
    }
    check(report.row.every((r, i, rows) => !i || rows[i - 1].right <= r.left + 1), `${label}: player fields overlap`);
    return report;
  };
  for (const [width, height] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
    await page.setViewport({ width, height, mobile: width <= 640 });
    for (const [index, name] of ['packs', 'upgrade', 'collection', 'history', 'market'].entries()) {
      await click(`.main-nav button:nth-child(${index + 1})`);
      await page.eval(() => scrollTo(0, 0));
      await inspect(`${width}/${name}`);
      if (width === 390) await page.screenshot({ path: `.taste-skill/mobile-qa/${name}-${width}.jpg`, fullPage: false });
      if (width === 390 && name === 'collection') {
        await click('.collection-filter-toggle');
        check(await page.eval(() => document.querySelector('.collection-filter-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#position').getClientRects().length > 0), 'Collection filters expand');
        await inspect('390/collection-filters');
        await click('.collection-filter-toggle');
        await click('.collection-card');
        await sleep(250);
        await inspect('390/card-detail');
        await page.screenshot({ path: '.taste-skill/mobile-qa/detail-390.jpg' });
        await click('.detail-modal .modal-heading .icon-button');
        await sleep(350);
      }
      if (width === 390 && name === 'market') {
        await click('.market-filter-toggle');
        await inspect('390/market-filters');
        await click('.market-filter-toggle');
      }
      if (name === 'upgrade') {
        if (width === 390) {
          await click('.fco-change');
          await inspect('390/player-picker');
          await click('.picker-modal .modal-heading .icon-button');
          await sleep(350);
        }
        await click('.fco-line:not(:disabled)');
        await page.eval(() => document.querySelector('.fco-actions').scrollIntoView({ block: 'end' }));
        if (width === 390) await page.screenshot({ path: `.taste-skill/mobile-qa/upgrade-actions-${width}.jpg` });
        const footer = await page.eval(() => {
          const body = document.querySelector('.fco-body');
          const button = document.querySelector('.fco-go').getBoundingClientRect();
          body.scrollTop = body.scrollHeight;
          return { top: button.top, bottom: button.bottom, height: innerHeight, scroll: body.scrollTop };
        });
        check(footer.top >= 0 && footer.bottom <= footer.height + 1 && footer.scroll > 0, `${width}/upgrade: footer inaccessible or list not scrollable`);
      }
    }
    await click('.main-nav button:first-child');
    await click('.hero-button');
    for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector('.ready-open-one:not(:disabled)')); i++) await sleep(100);
    await sleep(350);
    await inspect(`${width}/ready`);
    if (width === 390) await page.screenshot({ path: `.taste-skill/mobile-qa/ready-${width}.jpg` });
    await click('.ready-open-one');
    check(await page.eval(() => ![...document.querySelectorAll('.pack-ready-modal button')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')), `${width}/ready: buttons not hidden during opening`);
    for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector('.reveal-done')); i++) await sleep(100);
    await sleep(350);
    await inspect(`${width}/result`);
    if (width === 390) await page.screenshot({ path: `.taste-skill/mobile-qa/result-${width}.jpg`, fullPage: false });
    const result = await page.eval(() => [...document.querySelectorAll('.reveal-actions button')].map(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }));
    check(result.length >= 3 && result.every(Boolean), `${width}/result: footer outside viewport`);
    await click('.reveal-done');
    await sleep(350);
  }
  assert.deepEqual(page.consoleErrors, []);
  assert.deepEqual(failures, []);
  console.log('PASS: six phone/tablet/landscape sizes; five views; scrollable upgrade list, distinct player fields, accessible actions, ready/result controls, input zoom and horizontal overflow.');
} finally { await browser.close(); }
