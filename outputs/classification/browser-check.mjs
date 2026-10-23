import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href, { settleMs: 500 });
  await page.eval(() => {
    const button = [...document.querySelectorAll('.main-nav button')].find(b => /Thị trường/.test(b.textContent));
    if (!button) throw Error('Không thấy TTCN');
    button.click();
  });
  await sleep(200);
  for (const level of ['5', '8', '13']) {
    await page.eval(value => {
      const el = document.querySelector('[aria-label="Cấp thẻ trên thị trường"]');
      el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, level);
    await sleep(200);
    const state = await page.eval(() => ({ count: document.querySelectorAll('.market-row').length,
      price: document.querySelector('.market-preview dd')?.textContent,
      note: document.querySelector('.market-preview>small')?.textContent,
      provisional: [...document.querySelectorAll('.market-row .market-price small')].some(el => /Tạm tính/.test(el.textContent)) }));
    assert.ok(state.count > 0);
    assert.ok(state.price?.includes('BP'));
    assert.equal(state.provisional, false);
    console.log(JSON.stringify({ level, ...state }));
  }
  await page.screenshot({ path: 'outputs/classification/market-plus13.jpg' });
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: standalone TTCN +5/+8/+13 and CSV classification');
} finally { await browser.close(); }
