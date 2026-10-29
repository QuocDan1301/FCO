import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch({ extraArgs: ['--no-proxy-server'] });
mkdirSync('outputs/currency-qa', { recursive: true });
try {
  const page = await browser.newPage();
  const url = process.argv[3] || 'http://127.0.0.1:5174/FCO/';
  await page.goto(url);
  const saved = { ...initialSave(), balance: 987654321, fc: 12500, reduced: true };
  delete saved.bpReset;
  await page.eval(({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)), { key: STORAGE_KEY, saved });
  await page.goto(url);
  for (let i = 0; i < 150 && !await page.eval(() => !!document.querySelector('.topbar .wallet')); i++) await sleep(200);
  const persisted = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(persisted.balance, 0);
  assert.equal(persisted.fc, 12500);
  assert.deepEqual(persisted.cards, saved.cards);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(300);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    const icons = await page.eval(() => [...document.querySelectorAll('.wallet .currency-icon')].map(i => ({ loaded: i.complete && i.naturalWidth > 0, width: i.getBoundingClientRect().width, fit: getComputedStyle(i).objectFit, background: getComputedStyle(i).backgroundImage })));
    assert.equal(icons.length, 2);
    assert.ok(icons.every(i => i.loaded && i.width > 0 && i.fit === 'contain' && i.background === 'none'));
    await page.screenshot({ path: `outputs/currency-qa/wallet-${width}.png` });
  }
  await page.eval(key => { const s = JSON.parse(localStorage.getItem(key)); s.balance = 456789; localStorage.setItem(key, JSON.stringify(s)); }, STORAGE_KEY);
  await page.goto(url);
  for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector('.topbar .wallet')); i++) await sleep(200);
  assert.equal(await page.eval(key => JSON.parse(localStorage.getItem(key)).balance, STORAGE_KEY), 456789);
  console.log('PASS: BP resets once and persists; FC/cards preserved; both icons loaded at 1440, 768, 390px without overflow.');
} finally { await browser.close(); }
