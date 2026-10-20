// node tests/space-skip-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const waitFor = async selector => {
    const start = Date.now();
    while (!await page.eval(s => !!document.querySelector(s), selector)) {
      if (Date.now() - start > 12000) throw new Error('Timed out: ' + selector);
      await sleep(60);
    }
  };
  const click = async selector => {
    await waitFor(selector + ':not(:disabled)');
    await page.eval(s => document.querySelector(s).click(), selector);
    await sleep(100);
  };
  const saved = () => page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const keyDown = (autoRepeat = false) => page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat, text: ' ', unmodifiedText: ' ' });
  const keyUp = () => page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  const space = async () => { await keyDown(); await keyUp(); await sleep(120); };
  await page.goto(url, { settleMs: 400 });
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: { ...initialSave(), reduced: false, sound: false, light: true } });
  await page.goto(url, { settleMs: 400 });

  await click('.hero-button');
  await space();
  assert.ok(await page.eval(() => !!document.querySelector('.pack-ready-modal')));
  assert.equal((await saved()).opened, 0, 'Space on preparation never opens a pack');
  await click('.ready-open-one');
  const firstResult = await saved();
  await page.eval(() => document.querySelector('.ready-close')?.focus());
  await keyDown();
  await sleep(120);
  await keyDown(true);
  await keyUp();
  await waitFor('.opening-finished');
  await sleep(600);
  assert.ok(await page.eval(() => !!document.querySelector('.opening-finished')), 'Holding Space keeps the result visible');
  assert.deepEqual(await saved(), firstResult, 'Skipping during entry preserves the saved reward');

  await click('.open-next');
  await click('.ready-open-batch');
  await waitFor('.opening-skip');
  assert.equal(await page.eval(() => !!document.querySelector('.opening-finished')), false);
  const batchResult = await saved();
  await page.eval(() => {
    const input = document.createElement('input'); input.id = 'shortcut-input';
    document.querySelector('.modal-panel').append(input); input.focus();
  });
  await space();
  assert.equal(await page.eval(() => !!document.querySelector('.opening-finished')), false, 'Space in an input does not skip');
  await page.eval(() => { document.querySelector('#shortcut-input').remove(); document.querySelector('.opening-icon-button').focus(); });
  await space();
  await waitFor('.opening-finished');
  assert.deepEqual(await saved(), batchResult, 'Space skips without toggling the focused sound control or changing rewards');
  await click('.opening-skip');

  await click('.main-nav button:nth-child(2)');
  await click('.material-slot:not(.filled)');
  await click('.picker-row');
  await click('.picker-modal .modal-bottom-button');
  await click('.upgrade-controls>.primary-button');
  const upgradeResult = await saved();
  await page.eval(() => document.querySelector('.cinema-top .secondary-button').focus());
  await keyDown();
  await sleep(100);
  await keyDown(true);
  await keyUp();
  await waitFor('.is-finished .upgrade-cinema');
  assert.deepEqual(await saved(), upgradeResult, 'Space preserves upgrade outcome and costs');
  await click('.upgrade-result-copy .primary-button');
  await sleep(450);
  await page.eval(() => document.activeElement?.blur());
  await space();
  assert.equal(await page.eval(() => !!document.querySelector('.cinema-modal')), false);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: Space skips pack entry, batch cinematic and upgrades; held key preserves result; inputs and preparation remain usable; rewards unchanged; no JavaScript errors.');
} finally { await browser.close(); }
