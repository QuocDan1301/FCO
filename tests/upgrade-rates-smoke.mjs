// node tests/upgrade-rates-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, getPlayer, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
mkdirSync('.taste-skill/upgrade-rates-qa', { recursive: true });
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const saved = () => page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const click = async selector => { await page.eval(s => { const el = document.querySelector(s); if (!el || el.disabled) throw new Error('Unavailable: ' + s); el.click(); }, selector); await sleep(100); };
  const noChance = selector => page.eval(s => { const el = document.querySelector(s); return !!el && !/tỷ lệ|xác suất/i.test(el.textContent) && !el.querySelector('.chance-display'); }, selector);
  const seed = async level => {
    const state = { ...initialSave(), reduced: false, sound: false, light: true };
    state.cards = Array.from({ length: 4 }, () => ({ ...makeCard(1), level }));
    state.history = [{ id: 'old-upgrade', time: 1, type: 'upgrade', title: 'Nâng cấp cũ', detail: '+3 → +4 · Tỷ lệ 64% · 3 nguyên liệu' }];
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 350 });
    await click('.main-nav button:nth-child(2)');
    await click('.material-slot:not(.filled)');
    for (let i = 1; i <= 3; i++) await click(`.picker-row:nth-child(${i})`);
    await click('.picker-modal .modal-bottom-button');
    await sleep(350);
    return state;
  };
  const skip = async () => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await sleep(180);
  };
  await page.goto(url, { settleMs: 350 });
  const before = await seed(12);
  assert.ok(await noChance('.upgrade-workspace'));
  assert.equal(await page.eval(() => document.querySelector('.level-transition strong').textContent), '+13');
  assert.equal(await page.eval(() => document.querySelector('.energy-label b').textContent), '100%');
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.taste-skill/upgrade-rates-qa/setup-${width}.jpg`, fullPage: true });
  }
  await page.eval(() => { crypto.getRandomValues = array => { array[0] = 0; return array; }; });
  await click('.upgrade-controls>.primary-button');
  assert.ok(await noChance('.cinema-modal'));
  await skip();
  assert.match(await page.eval(() => document.querySelector('.upgrade-result-copy h2').textContent), /thành công/);
  assert.ok(await noChance('.cinema-modal'));
  assert.equal((await saved()).cards[0].level, 13);
  assert.equal(await page.eval(() => Number(document.querySelector('.upgrade-reveal-card .face-art-ovr').textContent)), getPlayer(before.cards[0]).ovr + 27);
  assert.doesNotMatch((await saved()).history[0].detail, /Tỷ lệ|%/);
  await page.screenshot({ path: '.taste-skill/upgrade-rates-qa/result-390.jpg' });
  await click('.upgrade-result-copy .primary-button');
  await sleep(350);
  assert.equal(await page.eval(() => document.querySelector('.upgrade-controls>.primary-button').disabled), true);
  await click('.main-nav button:nth-child(4)');
  assert.ok(await noChance('.history-workspace'), 'New and legacy history never shows the upgrade chance');
  await click('.main-nav button:nth-child(1)');
  assert.doesNotMatch(await page.eval(() => document.querySelector('.recent-panel').textContent), /Tỷ lệ/);
  const reloaded = await saved();
  await page.goto(url, { settleMs: 350 });
  assert.deepEqual(await saved(), reloaded);

  await seed(7);
  await page.eval(() => { crypto.getRandomValues = array => { array[0] = 4294967295; return array; }; });
  await click('.upgrade-controls>.primary-button');
  await skip();
  assert.match(await page.eval(() => document.querySelector('.upgrade-result-copy h2').textContent), /thất bại/);
  assert.ok(await noChance('.cinema-modal'));
  assert.equal((await saved()).cards[0].level, 7);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: hidden upgrade chance before/during/after, new and legacy history; +12 to +13 preview and +27 cumulative OVR; success/failure; Space skip; reload; desktop/mobile.');
} finally { await browser.close(); }
