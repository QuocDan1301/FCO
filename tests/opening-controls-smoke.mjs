// node tests/opening-controls-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const until = async predicate => {
    const deadline = Date.now() + 16000;
    while (!(await page.eval(predicate))) {
      if (Date.now() >= deadline) throw new Error('Timed out waiting for opening controls');
      await sleep(30);
    }
  };
  const visibleButtons = () => page.eval(() => [...document.querySelectorAll('.cinema-modal button')].filter(button => {
    const style = getComputedStyle(button);
    return button.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none';
  }).map(button => button.className));
  const space = async () => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  };
  await page.goto(url, { settleMs: 250 });
  for (const quick of [true, false]) {
    const state = { ...initialSave(), light: true, quick, sound: false, reduced: false };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 250 });
    await page.eval(() => document.querySelector('.hero-button').click());
    await until(() => !!document.querySelector('.ready-open-one:not(:disabled)'));
    const count = quick ? 10 : 1;
    await page.eval(selector => document.querySelector(selector).click(), quick ? '.ready-open-batch' : '.ready-open-one');
    assert.deepEqual(await visibleButtons(), [], 'Ẩn tất cả nút ngay sau khi nhấn Mở, kể cả nút Mở');
    const saved = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(saved.opened, count);
    await space();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await page.eval(() => !!document.querySelector('.pack-ready-modal')), true, 'Không bỏ qua sớm bằng phím');
    await until(() => !!document.querySelector('.is-flipping'));
    assert.deepEqual(await visibleButtons(), [], 'Không có nút trong lúc lật');
    await until(() => !!document.querySelector('.opening-phase-3'));
    assert.deepEqual(await visibleButtons(), [], 'Chưa hiện nút ở bước quốc tịch');
    await until(() => !!document.querySelector('.opening-phase-4 .opening-position'));
    assert.deepEqual(await visibleButtons(), [], 'Vị trí xuất hiện trước nút Bỏ qua');
    await until(() => !!document.querySelector('.opening-skip'));
    assert.deepEqual(await visibleButtons(), ['opening-skip'], 'Chỉ hiện nút Bỏ qua sau vị trí');
    assert.equal(await page.eval(() => !!document.querySelector('.opening-phase-4')), true);
    await space();
    await until(() => !!document.querySelector('.opening-finished'));
    assert.ok(await page.eval(() => !!document.querySelector('.reveal-done')));
    assert.deepEqual(await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY), saved, 'Bỏ qua giữ nguyên kết quả');
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: hide every opening button immediately; no early keyboard skip; show only Skip after position; quick batch and standard single; results preserved.');
} finally { await browser.close(); }
