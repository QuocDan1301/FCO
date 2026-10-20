// node tests/upgrade-energy-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, STORAGE_KEY } from '../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const click = async selector => {
    await page.eval(s => {
      const button = document.querySelector(s);
      if (!button || button.disabled) throw new Error('Unavailable: ' + s);
      button.click();
    }, selector);
    await sleep(80);
  };
  await page.goto(url, { settleMs: 250 });
  for (const [playerId, energy] of [[1, 20], [33, 20], [5, 25], [3, 30], [47, 40], [21, 100]]) {
    const state = { ...initialSave(), reduced: true, sound: false, cards: Array.from({ length: 6 }, () => makeCard(playerId)) };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 250 });
    await click('.main-nav button:nth-child(2)');
    assert.equal(await page.eval(() => document.querySelector('.fco-boost').getAttribute('aria-label')), `Tăng ${energy}% năng lượng`);
    await click('.fco-line');
    const report = await page.eval(() => ({
      energy: document.querySelector('.fco-energy').getAttribute('aria-label'),
      full: document.querySelectorAll('.fco-energy .full').length,
      partial: document.querySelector('.fco-energy .part') ? parseFloat(getComputedStyle(document.querySelector('.fco-energy .part'), '::before').width) / document.querySelector('.fco-energy .part').getBoundingClientRect().width * 100 : null,
      mini: document.querySelector('.fco-boost .part') ? getComputedStyle(document.querySelector('.fco-boost .part')).backgroundImage : null,
    }));
    assert.equal(report.energy, `Năng lượng ${energy}%`);
    assert.equal(report.full, Math.floor(energy / 20));
    if (energy % 20) {
      const fill = `${energy % 20 * 5}%`;
      assert.ok(Math.abs(report.partial - parseFloat(fill)) < .2, JSON.stringify(report));
      assert.ok(report.mini.includes(fill), report.mini);
    }
    await click('.fco-line:nth-child(2)');
    assert.equal(await page.eval(() => document.querySelector('.fco-energy').getAttribute('aria-label')), `Năng lượng ${Math.min(100, energy * 2)}%`);
    await click('.fco-actions .fco-ghost');
    assert.equal(await page.eval(() => document.querySelector('.fco-energy').getAttribute('aria-label')), 'Năng lượng 0%');
    for (let n = 1; n <= 5; n++) await click(`.fco-line:nth-child(${n})`);
    assert.equal(await page.eval(() => document.querySelector('.fco-energy').getAttribute('aria-label')), 'Năng lượng 100%');
    assert.equal(await page.eval(() => document.querySelectorAll('.fco-energy .full').length), 5);
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: equal-OVR energy, duplicate players, partial bars, material preview, add/remove, and 5-bar cap in standalone HTML.');
} finally { await browser.close(); }
