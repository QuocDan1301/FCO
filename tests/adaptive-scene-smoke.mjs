import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('mothe.html')).href, { settleMs: 400 });
  await page.eval(() => document.querySelector('.hero-button').click());
  const started = Date.now();
  while (!(await page.eval(() => !!document.querySelector('.ready-open-one:not(:disabled)')))) {
    if (Date.now() - started > 8000) throw new Error('Chờ cảnh quá lâu');
    await sleep(50);
  }
  await page.eval(() => {
    const original = window.requestAnimationFrame;
    window.restoreRaf = () => { window.requestAnimationFrame = original; };
    window.requestAnimationFrame = callback => original.call(window, () => { setTimeout(() => callback(performance.now()), 32); });
    document.querySelector('.ready-open-one').click();
  });
  await sleep(4500);
  const quality = await page.eval(() => ({ scale: Number(document.querySelector('.three-stadium')?.dataset.renderScale), frameMs: Number(document.querySelector('.three-stadium')?.dataset.frameMs) }));
  assert.ok(quality.scale <= .85 && quality.scale >= .8, 'Giảm độ phân giải nền khi nhịp khung hình bị chậm');
  await page.eval(() => { window.restoreRaf(); document.querySelector('.opening-quality').click(); });
  await sleep(200);
  assert.ok(await page.eval(() => Number(document.querySelector('.light-cinema-canvas')?.dataset.progress) > .2), 'Đổi chế độ giữ nguyên tiến độ camera');
  assert.equal(await page.eval(() => JSON.parse(localStorage.getItem('arena-huyen-thoai-v1')).opened), 1);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: nhịp khung chậm tự giảm nền; thẻ/thưởng không đổi; chuyển 2D giữ tiến độ. ' + JSON.stringify(quality));
} finally { await browser.close(); }
