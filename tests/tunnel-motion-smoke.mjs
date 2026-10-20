import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('mothe.html')).href, { settleMs: 500 });
  await page.eval(() => {
    const samples = []; window.motionSamples = samples;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => original.call(window, t => {
      const scene = document.querySelector('.three-stadium');
      if (scene?.dataset.cameraZ && document.querySelector('.icon-opening')) samples.push({ t, z: Number(scene.dataset.cameraZ), phase: Number(document.querySelector('.icon-opening')?.className.match(/opening-phase-(\d+)/)?.[1]) });
      cb(t);
    });
    document.querySelector('.hero-button').click();
  });
  while (!(await page.eval(() => !!document.querySelector('.ready-open-one:not(:disabled)')))) await sleep(40);
  await page.eval(() => { window.openClicked = performance.now(); document.querySelector('.ready-open-one').click(); });
  const deadline = Date.now() + 16000;
  while (Date.now() < deadline && !(await page.eval(() => !!document.querySelector('.opening-phase-9')))) await sleep(100);
  await sleep(300);
  const report = await page.eval(() => {
    const samples = window.motionSamples.filter((v, i, a) => !i || v.t !== a[i - 1].t);
    const deltas = samples.slice(1).map((v, i) => ({ dt: v.t - samples[i].t, dz: Math.abs(v.z - samples[i].z), phase: v.phase, t: v.t }));
    const intervals = deltas.map(v => v.dt).sort((a, b) => a - b);
    return { frames: samples.length, firstFrameMs: Math.round(samples[0]?.t - window.openClicked), p95Ms: Math.round(intervals[Math.floor(intervals.length * .95)]), longFrames: deltas.filter(v => v.dt > 50).length, biggestStep: Math.max(...deltas.filter(v => v.dt < 60).map(v => v.dz)), calls: document.querySelector('.three-stadium')?.dataset.drawCalls, ready: document.querySelector('.icon-opening')?.dataset.sceneReady, phase: samples.at(-1)?.phase };
  });
  console.log(JSON.stringify(report));
  if (!process.argv.includes('--measure')) {
    assert.ok(report.frames > 100); assert.equal(report.phase, 9);
    assert.equal(report.ready, 'true');
    assert.ok(report.biggestStep < 2, 'Không nhảy camera ở nhịp công bố');
    assert.ok(Number(report.calls) < 120, 'Đã gộp hình học để giảm lệnh vẽ');
    assert.deepEqual(page.consoleErrors, []);
  }
} finally { await browser.close(); }
