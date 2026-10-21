import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, players, makeCard, STORAGE_KEY } from '../../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const fixture = { ...initialSave(), reduced: true, quick: true, sound: false };
fixture.cards = players.filter(p => p.tier === 'origin').map(p => makeCard(p.id));
fixture.cards.push({ ...makeCard(235), level: 13 });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const requests = [];
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => { if (/^https?:/.test(e.request.url)) requests.push(e.request.url); });
  await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.goto(url);
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: fixture });
  await page.goto(url);
  const click = async selector => { await page.eval(s => { const el = document.querySelector(s); if (!el || el.disabled) throw new Error('Unavailable: ' + s); el.click(); }, selector); await sleep(150); };
  await click('.main-nav button:nth-child(3)');
  assert.equal(await page.eval(() => document.querySelectorAll('.collection-card').length), 25);
  assert.equal(await page.eval(() => document.querySelector('.collection-card .face-art-ovr').textContent), '146');
  await page.eval(() => Promise.all([...document.images].map(i => i.decode())));
  assert.ok(await page.eval(() => [...document.querySelectorAll('.collection-card img')].every(i => i.complete && i.naturalWidth > 0)));
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000, mobile: width === 390 });
    await page.screenshot({ path: `.taste-skill/no7-players/collection-${width}.jpg`, fullPage: true });
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await click('.main-nav button:nth-child(1)');
  await click('.pack-option:nth-child(3) .pack-select');
  assert.match(await page.eval(() => document.querySelector('.pack-option:nth-child(3)').textContent), /OVR 115–119/);
  await click('.hero-button');
  const deadline = Date.now() + 15000;
  while (await page.eval(() => document.querySelector('.ready-open-batch')?.disabled)) { assert.ok(Date.now() < deadline, 'Opening ready timed out'); await sleep(100); }
  await click('.ready-open-batch');
  while (await page.eval(key => JSON.parse(localStorage.getItem(key)).opened, STORAGE_KEY) < 10) { assert.ok(Date.now() < deadline, 'Opening timed out'); await sleep(100); }
  const saved = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.cards.length, 35);
  assert.equal(saved.unopened.origin, 5);
  assert.ok(saved.cards.slice(-10).every(c => c.playerId >= 212 && c.playerId <= 235));
  while (!(await page.eval(() => !!document.querySelector('.opening-batch-grid')))) { assert.ok(Date.now() < deadline, 'Result timed out'); await sleep(150); }
  await page.eval(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: '.taste-skill/no7-players/opened.jpg' });
  await page.goto(url);
  assert.equal(await page.eval(key => JSON.parse(localStorage.getItem(key)).cards.length, STORAGE_KEY), 35);
  assert.deepEqual(requests, []);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: 24 NO.7 faces, +13 OVR/level, desktop/mobile, offline images, open 10, stock, save/reload; no HTTP or JS errors.');
} finally { await browser.close(); }
