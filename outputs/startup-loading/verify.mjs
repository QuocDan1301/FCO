import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Browser } from 'file:///C:/Users/Admin/.codex/plugins/cache/taste-skill/taste-skill/2.1.5/skills/taste-skill/scripts/lib/cdp.mjs';

const browser = await Browser.launch();
const page = await browser.newPage();
const wait = async (fn, label) => {
  for (let n = 0; n < 300; n++) {
    if (await page.eval(fn)) { console.log('PASS', label); return; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timeout: ' + label);
};
try {
  let held, attempts = 0;
  browser.on(page.sessionId, 'Fetch.requestPaused', p => { held = p.requestId; attempts++; });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*TABI.mp3*', requestStage: 'Request' }] });
  await page.goto('http://127.0.0.1:5176/FCO/', { settleMs: 300 });
  await wait(() => document.querySelector('#boot-progress')?.getAttribute('aria-valuenow') === '99', 'progress waits for last audio file');
  assert(held);
  assert(await page.eval(() => !document.querySelector('#root').hasChildNodes() && !!document.querySelector('#startup')));
  console.log('PASS game stays hidden until all resources finish');
  for (const [width, height] of [[1440,900],[768,1024],[390,844]]) {
    await page.setViewport({ width, height });
    await page.screenshot({ path: `outputs/startup-loading/${width}.png`, format: 'png' });
    assert(await page.eval(() => { const r = document.querySelector('.boot-content').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    console.log('PASS loading fits', width);
  }
  await page.send('Fetch.failRequest', { requestId: held, errorReason: 'ConnectionReset' }); held = null;
  await wait(() => document.querySelector('#boot-retry')?.hidden === false, 'failed download shows retry');
  assert(await page.eval(() => !document.querySelector('#root').hasChildNodes()));
  await page.eval(() => document.querySelector('#boot-retry').click());
  for (let i = 0; !held && i < 100; i++) await new Promise(r => setTimeout(r, 100));
  assert(held); assert.equal(attempts, 2);
  assert(await page.eval(() => document.querySelector('#boot-progress').getAttribute('aria-valuenow') === '99'));
  console.log('PASS retry retains completed downloads');
  await page.send('Fetch.continueRequest', { requestId: held });
  await wait(() => !document.querySelector('#startup') && !!document.querySelector('.topbar'), 'game appears after all resources loaded');
  assert.equal(page.consoleErrors.length, 0, page.consoleErrors.join('\n'));
  console.log('PASS no browser exceptions');
  await page.send('Fetch.disable');
  await page.goto(pathToFileURL(resolve('mothe.html')).href, { timeoutMs: 30000, settleMs: 300 });
  await wait(() => window.__FCO_STANDALONE__ === true && !document.querySelector('#startup') && !!document.querySelector('.topbar'), 'standalone opens with embedded resources');
} finally { await browser.close(); }
