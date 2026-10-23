import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const html = readFileSync('mothe.html', 'utf8');
const embedded = html.match(/data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)/);
assert.ok(embedded, 'Nhạc được nhúng vào HTML độc lập');
assert.equal(hash(Buffer.from(embedded[1], 'base64')), hash(readFileSync('public/assets/background-music.mp3')));
mkdirSync('.taste-skill/music-qa', { recursive: true });
const allowedBrowser = await Browser.launch({ extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await allowedBrowser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  for (let i = 0; i < 30 && !await page.eval(() => document.querySelector('audio').currentTime > 0); i++) await sleep(200);
  assert.equal(await page.eval(() => document.querySelector('audio').paused), false);
  assert.equal(await page.eval(() => document.querySelector('.music-button').getAttribute('aria-pressed')), 'true');
  console.log('PASS: music starts on entry without interaction when autoplay is allowed.');
} finally { await allowedBrowser.close(); }
const browser = await Browser.launch({ extraArgs: ['--autoplay-policy=user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  const status = () => page.eval(() => {
    const audio = document.querySelector('audio');
    const button = document.querySelector('.music-button');
    return { paused: audio.paused, time: audio.currentTime, duration: audio.duration, loop: audio.loop,
      volume: audio.volume, error: audio.error?.code, label: button.getAttribute('aria-label'),
      pressed: button.getAttribute('aria-pressed'), disabled: button.disabled };
  });
  const click = async selector => {
    const p = await page.eval(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, selector);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p });
  };
  assert.equal((await status()).paused, true);
  assert.equal(await page.eval(() => document.querySelector('.topbar [role="status"]').textContent), '');
  await click('.brand');
  for (let i = 0; i < 30 && (await status()).time < 0.1; i++) await sleep(200);
  let s = await status();
  assert.equal(s.paused, false); assert.equal(s.pressed, 'true'); assert.equal(s.label, 'Tắt nhạc');
  assert.ok(s.time > 0); assert.ok(s.duration > 0); assert.equal(s.loop, true); assert.equal(s.volume, 0.35); assert.equal(s.error, undefined);
  await click('.music-button');
  await sleep(150);
  const stopped = await status();
  await sleep(400);
  assert.equal((await status()).time, stopped.time); assert.equal(stopped.paused, true); assert.equal(stopped.pressed, 'false');
  await click('.brand');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await sleep(200);
  assert.equal((await status()).paused, true, 'Nhạc không tự bật lại sau khi người dùng đã tắt');
  await page.eval(() => document.querySelector('.music-button').focus());
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  assert.ok((await status()).time > stopped.time, 'Bật lại bằng bàn phím phát tiếp từ chỗ đã dừng');
  await page.eval(() => { window.musicElement = document.querySelector('audio'); document.querySelectorAll('.main-nav button')[2].click(); });
  await sleep(250);
  assert.equal(await page.eval(() => window.musicElement === document.querySelector('audio')), true);
  assert.equal((await status()).paused, false);
  await page.eval(() => { const audio = document.querySelector('audio'); audio.currentTime = audio.duration - 0.25; });
  await sleep(1300);
  assert.ok((await status()).time < 5, 'Nhạc lặp lại khi kết thúc');
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    await page.eval(() => document.querySelector('.main-nav button').click());
    await sleep(300);
    const rect = await page.eval(() => {
      const b = document.querySelector('.music-button'); const r = b.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, height: r.height,
        hit: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(rect.x >= 0 && rect.right <= width && rect.width >= 36 && rect.height >= 36 && rect.hit, JSON.stringify(rect));
    assert.equal(rect.overflow, false);
    await page.screenshot({ path: `.taste-skill/music-qa/${width}.jpg` });
  }
  await click('.music-button');
  await sleep(100);
  await page.eval(() => { document.querySelector('audio').play = () => Promise.reject(new DOMException('Playback blocked', 'NotAllowedError')); });
  await click('.music-button');
  await sleep(100);
  s = await status();
  assert.equal(s.paused, true); assert.equal(s.pressed, 'false'); assert.equal(s.disabled, false);
  assert.match(await page.eval(() => document.querySelector('.topbar [role="status"]').textContent), /Không phát được nhạc/);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: exact embedded MP3; play/pause/resume; keyboard; loop; navigation; playback failure; visible control at 1440/768/390; no JS errors.');
} finally { await browser.close(); }
