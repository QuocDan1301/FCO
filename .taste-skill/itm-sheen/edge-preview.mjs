import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, players, STORAGE_KEY } from '../../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const out = `.taste-skill/itm-sheen/edge-${process.argv[3] || 'after'}`;
mkdirSync(out, { recursive: true });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const wait = async selector => {
    const started = Date.now();
    while (!await page.eval(s => !!document.querySelector(s), selector)) {
      if (Date.now() - started > 12000) throw new Error('Timeout: ' + selector);
      await sleep(60);
    }
  };
  await page.goto(url, { settleMs: 350 });
  await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state: { ...initialSave(), sound: false, reduced: false, light: true, quick: true } });
  await page.goto(url, { settleMs: 350 });
  await page.eval(() => document.querySelector('.hero-button').click());
  await wait('.ready-open-one:not(:disabled)');
  const icons = players.filter(player => player.tier === 'eternal');
  const value = Math.floor((icons.findIndex(player => player.id === 6) + .5) / icons.length * 4294967296);
  await page.eval(value => { let call = 0; crypto.getRandomValues = array => { array[0] = call++ % 2 === 0 ? 0 : value; return array; }; document.querySelector('.ready-open-one').click(); }, value);
  await sleep(100);
  await page.eval(() => document.querySelector('.ready-close,.opening-skip').click());
  await wait('.opening-finished .opening-best-card');
  await sleep(1000);
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(100);
    await page.eval(() => {
      for (const animation of document.getAnimations()) {
        if (animation.animationName !== 'itm-sheen-pass') continue;
        const timing = animation.effect.getTiming(); animation.pause(); animation.currentTime = timing.delay + timing.duration * .15;
      }
    });
    await page.screenshot({ path: `${out}/opening-${width}.jpg` });
  }
  console.log(JSON.stringify(await page.eval(() => {
    const card = document.querySelector('.opening-best-card');
    return { player: document.querySelector('.opening-result>h2').textContent, backingDisplay: getComputedStyle(card, '::before').display, genericEdge: !!card.querySelector('.card-edge-sweep'), maskedSheen: !!card.querySelector('.itm-sheen-masked'), horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  })));
  if (page.consoleErrors.length) throw new Error(JSON.stringify(page.consoleErrors));
} finally { await browser.close(); }
