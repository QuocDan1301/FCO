import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const out = '.taste-skill/prime-glow-qa';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href, { settleMs: 500 });
  await page.eval(() => [...document.querySelectorAll('.main-nav button')].find(b => b.textContent.includes('Thị trường')).click());
  await sleep(300);
  await page.eval(() => {
    const el = document.querySelector('[aria-label="Mùa thẻ trên thị trường"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'prime');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);
  await page.eval(async () => Promise.all([...document.querySelectorAll('.season-prime>.face-art-img')].map(i => i.decode())));
  const filter = await page.eval(() => getComputedStyle(document.querySelector('.season-prime>.face-art-img')).filter);
  assert.match(filter, /drop-shadow/);
  const sheen = await page.eval(() => {
    const card = document.querySelector('.season-prime');
    const mask = card.querySelector('.itm-sheen-masked');
    const streak = card.querySelector('.itm-sheen-streak');
    const animation = streak.getAnimations()[0];
    animation.pause();
    const { delay, duration } = animation.effect.getTiming();
    animation.currentTime = delay + duration * 3.1;
    const start = getComputedStyle(streak).transform;
    animation.currentTime = delay + duration * 3.3;
    return { mask: getComputedStyle(mask).maskImage !== 'none', name: getComputedStyle(streak).animationName, opacity: Number(getComputedStyle(streak).opacity), moving: start !== getComputedStyle(streak).transform };
  });
  assert.equal(sheen.mask, true);
  assert.equal(sheen.name, 'itm-sheen-pass');
  assert.equal(sheen.moving, true);
  assert.ok(sheen.opacity > 0);
  assert.equal(await page.eval(() => {
    const app = document.querySelector('.app');
    app.classList.add('reduced-motion');
    const hidden = getComputedStyle(document.querySelector('.season-prime .itm-sheen')).display === 'none';
    app.classList.remove('reduced-motion');
    return hidden;
  }), true);
  assert.equal(await page.eval(() => [...document.querySelectorAll('.player-card:not(.season-prime)>.face-art-img')].some(i => getComputedStyle(i).filter.includes('drop-shadow'))), false);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await sleep(200);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${out}/after-${width}.jpg` });
    await page.eval(() => {
      const style = document.createElement('style');
      style.id = 'glow-before';
      style.textContent = '.player-card.face-art.season-prime>.face-art-img{filter:drop-shadow(0 0 4px #f3c78940) drop-shadow(0 0 12px #e0473f26)}.season-prime .itm-sheen{display:none}';
      document.head.append(style);
    });
    await page.screenshot({ path: `${out}/before-${width}.jpg` });
    await page.eval(() => document.querySelector('#glow-before').remove());
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: PRIME glow rendered; no horizontal overflow at 1440/768/390; no JavaScript errors. Filter:', filter);
} finally {
  await browser.close();
}
