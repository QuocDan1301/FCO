import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, ovr, STORAGE_KEY } from '../../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const fixtures = JSON.parse(readFileSync(new URL('./cards.json', import.meta.url), 'utf8'));
const browser = await Browser.launch({ width: 1600, height: 1200 });
try {
  const page = await browser.newPage({ width: 1600, height: 1200 });
  const url = pathToFileURL(resolve('mothe.html')).href;
  await page.goto(url, { settleMs: 400 });
  const cards = fixtures.map(p => makeCard(p.id));
  const state = { ...initialSave(), cards, sound: false, reduced: true };
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  await page.goto(url, { settleMs: 400 });
  await page.eval(() => [...document.querySelectorAll('.main-nav button')].find(b => b.textContent.includes('Kho cầu thủ')).click());
  await sleep(300);
  const seen = new Set();
  for (let index = 0; index < 10; index++) {
    const rendered = await page.eval(() => [...document.querySelectorAll('.collection-card .player-card')].map(card => ({
      id: Number([...card.classList].find(c => /^face-\d+$/.test(c)).slice(5)),
      label: card.getAttribute('aria-label'), rating: card.querySelector('.face-art-ovr').textContent,
      images: [...card.querySelectorAll('img')].map(image => ({ loaded: image.complete && image.naturalWidth > 0, inline: image.src.startsWith('data:') })),
    })));
    for (const card of rendered) {
      const fixture = fixtures.find(p => p.id === card.id);
      assert.ok(fixture, card.id);
      assert.equal(Number(card.rating), ovr({ playerId: card.id, level: 1 }));
      assert.ok(card.label.includes(fixture.name));
      assert.ok(card.images.every(image => image.loaded && image.inline));
      seen.add(card.id);
    }
    await page.screenshot({ path: resolve(`outputs/26ts-midfielders/collection-${index + 1}.png`), format: 'png' });
    const next = await page.eval(() => {
      const button = [...document.querySelectorAll('.viewport-pagination button')].find(b => b.textContent === 'Sau');
      if (!button || button.disabled) return false;
      button.click(); return true;
    });
    if (!next) break;
    await sleep(200);
  }
  assert.equal(seen.size, 17);
  await page.eval(() => document.querySelector('.collection-card').click());
  await sleep(200);
  await page.screenshot({ path: resolve('outputs/26ts-midfielders/detail-level-1.png'), format: 'png' });
  const upgraded = { ...state, cards: cards.map(card => ({ ...card, level: 2 })) };
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state: upgraded });
  await page.goto(url, { settleMs: 300 });
  await page.eval(() => [...document.querySelectorAll('.main-nav button')].find(b => b.textContent.includes('Kho cầu thủ')).click());
  await sleep(200);
  const shown = await page.eval(() => [...document.querySelectorAll('.collection-card .player-card')].map(card => ({
    id: Number([...card.classList].find(c => /^face-\d+$/.test(c)).slice(5)),
    rating: card.querySelector('.face-art-ovr').textContent, level: card.querySelector('.face-art-level').alt,
  })));
  for (const card of shown) {
    assert.equal(Number(card.rating), ovr({ playerId: card.id, level: 2 }));
    assert.equal(card.level, '+2');
  }
  await page.eval(() => document.querySelector('.collection-card').click());
  await sleep(200);
  await page.screenshot({ path: resolve('outputs/26ts-midfielders/detail-level-2.png'), format: 'png' });
  assert.deepEqual(page.consoleErrors, []);
  writeFileSync(resolve('outputs/26ts-midfielders/browser-report.json'), JSON.stringify({ cards: seen.size, upgraded: shown.length, consoleErrors: page.consoleErrors }, null, 2));
  console.log('PASS: 17 cards render offline; images and badges embedded; save/reload and upgraded OVR verified.');
} finally { await browser.close(); }
