import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, players, STORAGE_KEY, ovr } from '../../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const roster = players.filter(p => p.tier === 'prime');
const sources = JSON.parse(readFileSync('.taste-skill/prime-qa/roster.json', 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const html = readFileSync('mothe.html', 'utf8');
for (const p of sources) {
  const data = readFileSync(`public${p.cardFace}`);
  assert.equal(hash(data), hash(readFileSync(resolve('C:/Users/Admin/OneDrive/Hình ảnh', p.sourceFile))), p.name);
  assert.ok(html.includes(data.toString('base64')), `Nhúng ảnh ${p.name}`);
}
console.log('PASS: 60 ảnh gốc được giữ nguyên và nhúng trong mothe.html.');
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const waitFor = async (fn, label) => {
    for (let i = 0; i < 80; i++) { if (await page.eval(fn)) return; await sleep(150); }
    throw new Error(`Timeout: ${label}; ${await page.eval(() => document.body.innerText.slice(-1500))}`);
  };
  const click = async selector => {
    await page.eval(s => { const b = document.querySelector(s); if (!b || b.disabled) throw new Error(`Không bấm được ${s}`); b.click(); }, selector);
    await sleep(180);
  };
  const nav = async text => {
    await page.eval(text => { const b = [...document.querySelectorAll('.main-nav button')].find(b => b.textContent.includes(text)); if (!b) throw new Error(`Missing nav ${text}`); b.click(); }, text);
    await sleep(200);
  };
  const setValue = async (selector, value) => {
    await page.eval(({ selector, value }) => {
      const el = document.querySelector(selector);
      const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }, { selector, value });
    await sleep(150);
  };
  const save = { ...initialSave(), reduced: true, light: true, quick: true };
  if (!process.argv.includes('--collection-only')) {
  await page.goto(url, { settleMs: 300 });
  await page.eval(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save });
  await page.goto(url, { settleMs: 300 });
  await nav('Vật phẩm');
  assert.equal(await page.eval(() => document.querySelectorAll('.inv-item').length), 4);
  await click('[aria-label="Dùng INFINITE PRIME (ALL)"]');
  await waitFor(() => !!document.querySelector('.ready-open-batch:not(:disabled)'), 'Chuẩn bị gói PRIME');
  await click('.ready-open-batch');
  await waitFor(() => !!document.querySelector('.opening-finished'), 'Kết quả PRIME');
  const opened = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(opened.cards.length, save.cards.length + 10);
  assert.equal(opened.unopened.prime, 5);
  assert.ok(opened.cards.slice(0, 10).every(c => roster.some(p => p.id === c.playerId)));
  assert.match(await page.eval(() => document.querySelector('.opening-finished').textContent), /Chưa có giá/);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(350);
    await page.screenshot({ path: `.taste-skill/prime-qa/reveal-${width}.jpg` });
  }
  await click('.opening-skip');
  console.log('PASS: mở 10 PRIME, nhận đúng mùa, lưu thẻ và trừ kho; kết quả chưa có giá.');

  await page.setViewport({ width: 1440, height: 900 });
  await nav('Thị trường');
  await setValue('[aria-label="Mùa thẻ trên thị trường"]', 'prime');
  assert.match(await page.eval(() => document.querySelector('.market-count [role="status"]').textContent), /\/ 60 thẻ/);
  assert.equal(await page.eval(() => document.querySelector('.market-primary').disabled), true);
  await setValue('[aria-label="Tìm cầu thủ trên thị trường"]', 'Nguyễn Quang Hải');
  assert.equal(await page.eval(() => document.querySelectorAll('.market-row').length), 1);
  await waitFor(() => [...document.querySelectorAll('.market-preview-card img')].every(i => i.complete && i.naturalWidth > 0), 'Ảnh Quang Hải');
  assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.market-preview-card .face-art-ovr')).visibility), 'hidden');
  await page.screenshot({ path: '.taste-skill/prime-qa/quang-hai-base.jpg' });
  await setValue('[aria-label="Cấp thẻ trên thị trường"]', '13');
  const expected = ovr({ playerId: roster.find(p => p.name === 'Nguyễn Quang Hải').id, level: 13 });
  assert.equal(await page.eval(() => document.querySelector('.market-preview-card .face-art-ovr').textContent), String(expected));
  assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.market-preview-card .face-art-ovr')).visibility), 'visible');
  assert.equal(await page.eval(() => document.querySelector('.market-primary').disabled), true);
  assert.match(await page.eval(() => document.querySelector('.market-preview').textContent), /Chưa có giá/);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(300);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.taste-skill/prime-qa/market-${width}.jpg` });
  }
  console.log('PASS: lọc đủ 60 thẻ; Quang Hải +1/+13 đúng OVR, ảnh và giá trống; khóa mua.');

  }
  const fixture = { ...save, cards: roster.map((p, i) => ({ ...makeCard(p.id), level: [1, 5, 13][i % 3] })) };
  await page.goto(url, { settleMs: 100 });
  await page.eval(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key: STORAGE_KEY, fixture });
  await page.setViewport({ width: 1440, height: 2300 });
  await page.goto(url, { settleMs: 200 });
  await nav('Kho cầu thủ');
  await setValue('#season', 'prime');
  await waitFor(() => document.querySelectorAll('.collection-card').length > 0, 'Hiện thẻ trong kho');
  const seen = new Set();
  for (let n = 1; n <= 4; n++) {
    await page.eval(async () => { await Promise.all([...document.querySelectorAll('.collection-card img')].map(i => i.decode().catch(() => {}))); });
    const data = await page.eval(() => ({
      broken: [...document.querySelectorAll('.collection-card img')].filter(i => !i.complete || i.naturalWidth === 0).length,
      ids: [...document.querySelectorAll('.collection-card .player-card')].map(card => [...card.classList].find(c => /^face-[0-9]+$/.test(c))),
      nextDisabled: document.querySelector('.collection-grid .viewport-pagination button:last-child').disabled
    }));
    assert.equal(data.broken, 0);
    data.ids.forEach(id => { assert.ok(!seen.has(id), id); seen.add(id); });
    await page.screenshot({ path: `.taste-skill/prime-qa/collection-page-${n}.jpg` });
    for (const [label, y, height] of [['top', 170, 730], ['middle', 900, 730], ['bottom', 1630, 640]]) {
      await page.screenshot({ path: `.taste-skill/prime-qa/cards-${n}-${label}.jpg`, clip: { x: 0, y, width: 1440, height } });
    }
    if (data.nextDisabled) break;
    await click('.collection-grid .viewport-pagination button:last-child');
  }
  assert.equal(seen.size, 60, 'Đủ 60 thẻ qua các trang của kho');
  assert.ok(await page.eval(() => !!document.querySelector('.music-button')));
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: đủ 60 thẻ trong kho với +1/+5/+13, không ảnh lỗi và không lỗi JavaScript.');
} finally { await browser.close(); }
