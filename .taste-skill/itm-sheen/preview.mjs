import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, STORAGE_KEY } from '../../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const out = '.taste-skill/itm-sheen';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await page.goto(url, { settleMs: 350 });
  const state = { ...initialSave(), sound: false, reduced: false, cards: [[1, 1], [31, 8], [3, 13], [11, 1], [21, 13]].map(([id, level]) => ({ ...makeCard(id), level })) };
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  await page.goto(url, { settleMs: 350 });
  await page.eval(() => document.querySelector('.main-nav button:nth-child(3)').click());
  await sleep(150);
  const at = fraction => page.eval(fraction => {
    const values = [];
    for (const animation of document.getAnimations()) {
      if (animation.animationName !== 'itm-sheen-pass') continue;
      const timing = animation.effect.getTiming();
      animation.pause(); animation.currentTime = timing.delay + timing.duration * fraction;
      const style = getComputedStyle(animation.effect.target);
      values.push({ transform: style.transform, opacity: style.opacity });
    }
    return values;
  }, fraction);
  const first = await at(.12), next = await at(.22);
  const summary = await page.eval(() => ({
    itmCards: document.querySelectorAll('.collection-card .itm-sheen').length,
    ordinaryCards: [...document.querySelectorAll('.collection-card .player-card')].filter(card => !card.querySelector('.itm-sheen')).length,
    masked: [...document.querySelectorAll('.itm-sheen-masked')].every(el => getComputedStyle(el).maskImage.startsWith('url("data:')),
    clickThrough: [...document.querySelectorAll('.itm-sheen')].every(el => getComputedStyle(el).pointerEvents === 'none'),
  }));
  if (summary.itmCards !== 3 || summary.ordinaryCards !== 2 || !summary.masked || !summary.clickThrough || first[0].transform === next[0].transform) throw new Error(JSON.stringify({ summary, first, next }));
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await at(.17);
    await page.screenshot({ path: `${out}/collection-${width}.jpg`, fullPage: true });
    if (await page.eval(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
  }
  await page.eval(() => [...document.querySelectorAll('.collection-card')].find(el => el.querySelector('.player-card').getAttribute('aria-label').startsWith('Ronaldo,')).click());
  await sleep(350);
  await at(.17);
  await page.screenshot({ path: `${out}/detail-390.jpg` });
  await page.eval(() => document.querySelector('.app').classList.add('reduced-motion'));
  const appReduced = await page.eval(() => [...document.querySelectorAll('.itm-sheen')].every(el => getComputedStyle(el).display === 'none'));
  await page.eval(() => document.querySelector('.app').classList.remove('reduced-motion'));
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const systemReduced = await page.eval(() => [...document.querySelectorAll('.itm-sheen')].every(el => getComputedStyle(el).display === 'none'));
  if (!appReduced || !systemReduced || page.consoleErrors.length) throw new Error(JSON.stringify({ appReduced, systemReduced, errors: page.consoleErrors }));
  console.log(JSON.stringify({ ...summary, moving: true, appReduced, systemReduced, consoleErrors: page.consoleErrors.length, screenshots: out }));
} finally { await browser.close(); }
