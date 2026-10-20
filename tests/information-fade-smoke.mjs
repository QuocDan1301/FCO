// node tests/information-fade-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY } from '../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
mkdirSync('.taste-skill/information-fade', { recursive: true });
try {
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.audioCreated=0; const NativeAudioContext=window.AudioContext; window.AudioContext=class extends NativeAudioContext { constructor(...args){ super(...args); window.audioCreated++; } };` });
  const url = pathToFileURL(resolve('mothe.html')).href;
  const wait = async (selector, timeout = 16000) => {
    const started = Date.now();
    while (!await page.eval(s => !!document.querySelector(s), selector)) {
      if (Date.now() - started > timeout) throw new Error('Timed out: ' + selector);
      await sleep(25);
    }
  };
  const click = async selector => { await page.eval(s => { const el = document.querySelector(s); if (!el || el.disabled) throw new Error('Unavailable: ' + s); el.click(); }, selector); await sleep(80); };
  await page.goto(url, { settleMs: 300 });
  for (const quick of [false, true]) {
    const state = { ...initialSave(), sound: true, reduced: false, light: true, quick };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 300 });
    assert.equal(await page.eval(() => document.querySelector('.sound-button').disabled), true);
    await click('.hero-button');
    await wait('.ready-open-one:not(:disabled)');
    await click('.ready-open-one');
    const phases = [], durations = [];
    for (const phase of [3, 4, 5]) {
      await wait(`.information-${phase}`);
      const report = await page.eval(({ phase, quick }) => {
        const info = document.querySelector('.information-' + phase);
        const animation = info.getAnimations().find(item => item.animationName === 'opening-information-fade');
        if (!animation) throw new Error('Missing fade animation for phase ' + phase);
        const duration = animation.effect.getTiming().duration;
        const originalTime = animation.currentTime;
        animation.pause();
        const samples = [0, .15, .5, .85, 1].map(fraction => {
          animation.currentTime = fraction * duration;
          return Number(getComputedStyle(info).opacity);
        });
        animation.currentTime = originalTime; animation.play();
        return { phase, duration, samples, flag: !!info.querySelector('.flag'), position: !!info.querySelector('.opening-position'), logo: !!info.querySelector('.team-logo'), soundDisabled: document.querySelector('.opening-icon-button').disabled };
      }, { phase, quick });
      assert.ok(report.duration > 0);
      assert.equal(report.samples[0], 0);
      assert.ok(report.samples[1] > 0 && report.samples[1] < 1);
      assert.equal(report.samples[2], 1);
      assert.ok(report.samples[3] > 0 && report.samples[3] < 1);
      assert.equal(report.samples[4], 0);
      assert.equal(report[phase === 3 ? 'flag' : phase === 4 ? 'position' : 'logo'], true);
      assert.equal(report.soundDisabled, true);
      phases.push(phase); durations.push(report.duration);
      if (!quick) {
        await page.eval(phase => { const animation = document.querySelector('.information-' + phase).getAnimations()[0]; animation.pause(); animation.currentTime = animation.effect.getTiming().duration * .5; }, phase);
        await page.screenshot({ path: `.taste-skill/information-fade/stage-${phase}.jpg` });
      }
    }
    assert.deepEqual(phases, [3, 4, 5]);
    assert.equal(new Set(durations).size, 1, 'Flag, position and logo share the exact same fade duration');
    await wait('.opening-finished');
    assert.equal(await page.eval(() => window.audioCreated), 0, 'No sound even with legacy sound:true');
    await click('.opening-skip');
    await sleep(350);
    await click('.main-nav button:nth-child(2)');
    await click('.material-slot:not(.filled)');
    await click('.picker-row');
    await click('.picker-modal .modal-bottom-button');
    await click('.upgrade-controls>.primary-button');
    await click('.cinema-top .secondary-button');
    assert.equal(await page.eval(() => window.audioCreated), 0, 'Upgrade effects are silent too');
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: flag → position → logo fade fully in and out in standard and quick modes; legacy sound:true stays silent for pack and upgrade; no JavaScript errors.');
} finally { await browser.close(); }
