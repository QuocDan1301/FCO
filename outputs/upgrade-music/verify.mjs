import assert from 'node:assert/strict';
import { Browser } from 'file:///C:/Users/Admin/.codex/plugins/cache/taste-skill/taste-skill/2.1.5/skills/taste-skill/scripts/lib/cdp.mjs';
const browser = await Browser.launch();
const page = await browser.newPage();
const url = 'http://127.0.0.1:5175/FCO/outputs/upgrade-music/preview.html';
const wait = async (fn, label) => {
  for (let n = 0; n < 100; n++) {
    if (await page.eval(fn)) { console.log('PASS', label); return; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timeout: ' + label);
};
const choose = async name => {
  await page.eval(() => { if (!document.querySelector('.uc-music-list')) document.querySelector('.uc-music-toggle').click(); });
  await page.eval(name => [...document.querySelectorAll('.uc-music-list button')].find(b => b.textContent === name).click(), name);
};
try {
  await page.goto(url);
  await wait(() => !document.querySelector('audio').paused, 'game music initially playing');
  for (const name of ['NAMGAO', 'TABI', 'HSM']) {
    await choose(name);
    await wait(() => document.querySelectorAll('audio')[0].paused && !document.querySelectorAll('audio')[1].paused && document.querySelector('.uc-music-status').textContent.startsWith('Đang phát:'), name + ' plays alone');
  }
  await page.eval(() => document.querySelector('.uc-music-stop').click());
  await wait(() => !document.querySelectorAll('audio')[0].paused && document.querySelectorAll('audio')[1].paused, 'stop resumes game music');
  await page.eval(() => document.querySelector('.music-button').click());
  await choose('TABI');
  await wait(() => !document.querySelectorAll('audio')[1].paused, 'upgrade music when game manually muted');
  await page.eval(() => document.querySelector('.uc-music-stop').click());
  await new Promise(r => setTimeout(r, 200));
  assert(await page.eval(() => document.querySelector('audio').paused)); console.log('PASS manually muted game stays muted');
  await page.eval(() => document.querySelector('.music-button').click());
  await page.eval(() => { const a = document.querySelectorAll('audio')[1]; const play = a.play; a.play = function () { this.play = play; return Promise.reject(new Error('test playback rejection')); }; });
  await choose('HSM');
  await wait(() => document.querySelector('.uc-music-status').textContent.includes('Không phát được') && !document.querySelector('audio').paused, 'playback failure restores game music');
  await choose('NAMGAO');
  await wait(() => !document.querySelectorAll('audio')[1].paused, 'retry succeeds');
  await wait(() => Number.isFinite(document.querySelectorAll('audio')[1].duration), 'track metadata loaded');
  await page.eval(() => { const a = document.querySelectorAll('audio')[1]; a.currentTime = a.duration - 0.1; });
  await wait(() => document.querySelectorAll('audio')[1].paused && !document.querySelector('audio').paused, 'track ending restores game music');
  await choose('NAMGAO');
  await wait(() => !document.querySelectorAll('audio')[1].paused, 'play again after ending');
  await page.eval(() => document.querySelector('.uc-music-toggle').click());
  for (const [width, height] of [[1440,900],[768,1024],[390,844]]) {
    await page.setViewport({ width, height });
    await page.screenshot({ path: `outputs/upgrade-music/${width}.png`, format: 'png' });
    const fit = await page.eval(() => { const el = document.querySelector('.uc-music-list'), r = el.getBoundingClientRect(), panel = el.closest('.uc-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= panel.top && r.bottom <= panel.bottom && document.querySelector('.uc-music-toggle').getBoundingClientRect().top >= panel.top; });
    assert(fit, 'music list fits at ' + width); console.log('PASS layout', width);
  }
  await page.eval(() => { window.detachedMusic = document.querySelectorAll('audio')[1]; document.querySelector('.uc-back').click(); });
  await wait(() => window.detachedMusic.paused && !document.querySelector('audio').paused, 'leaving upgrade stops track and restores game music');
  assert.equal(page.consoleErrors.length, 0, page.consoleErrors.join('\n'));
  console.log('PASS no browser exceptions');
} finally { await browser.close(); }
