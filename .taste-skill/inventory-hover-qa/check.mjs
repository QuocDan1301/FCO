import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const before = process.argv.includes('--before');
const out = '.taste-skill/inventory-hover-qa';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  await page.eval(() => [...document.querySelectorAll('.main-nav button')].find(b => b.textContent.includes('Kho vật phẩm')).click());
  await sleep(250);
  assert.ok(await page.eval(() => document.querySelectorAll('.inv-item').length > 0));
  const state = () => page.eval(() => {
    const item = document.querySelector('.inv-item');
    const title = item.querySelector('h3');
    const button = item.querySelector('.inv-use');
    const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
    return { item:rect(item), title:rect(title), button:rect(button), titleVisible:getComputedStyle(title).visibility !== 'hidden', buttonVisible:getComputedStyle(button).display !== 'none' && getComputedStyle(button).visibility !== 'hidden', art:rect(item.querySelector('.inv-art')) };
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height:1000, mobile:width === 390 });
    await page.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:0, y:0 });
    await page.eval(() => document.activeElement?.blur());
    await sleep(100);
    const idle = await state();
    await page.screenshot({ path:`${out}/${before ? 'before' : 'after'}-${width}-idle.jpg`, fullPage:true });
    await page.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:idle.item.x + idle.item.width / 2, y:idle.item.y + 20 });
    await sleep(100);
    const hover = await state();
    await page.screenshot({ path:`${out}/${before ? 'before' : 'after'}-${width}-hover.jpg`, fullPage:true });
    if (!before) {
      assert.equal(hover.titleVisible, false);
      assert.equal(hover.buttonVisible, true);
      assert.deepEqual(hover.item, idle.item, 'Hover must not resize the card');
      assert.deepEqual(hover.art, idle.art, 'Hover must not shift the artwork');
      assert.ok(hover.button.y >= hover.art.y + hover.art.height - 1, 'Button stays below artwork');
      if (width > 850) {
        assert.equal(idle.titleVisible, true);
        assert.equal(idle.buttonVisible, false);
        assert.equal(hover.button.y, idle.title.y + (idle.title.height - hover.button.height) / 2);
      } else {
        assert.equal(idle.titleVisible, false);
        assert.equal(idle.buttonVisible, true);
      }
    }
  }
  if (!before) {
    await page.setViewport({ width:1440, height:1000 });
    await page.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:0, y:0 });
    await page.eval(() => document.querySelector('.inv-art').focus());
    assert.equal((await state()).buttonVisible, true);
    assert.equal((await state()).titleVisible, false);
    await page.eval(() => document.querySelector('.inv-use').click());
    await sleep(300);
    assert.ok(await page.eval(() => !!document.querySelector('.pack-ready-modal')), 'Use opens pack preparation');
    assert.deepEqual(page.consoleErrors, []);
  }
  console.log(before ? 'Captured before screenshots.' : 'PASS: desktop/tablet/mobile states, stable card/artwork, keyboard focus, Use action, no console errors.');
} finally { await browser.close(); }
