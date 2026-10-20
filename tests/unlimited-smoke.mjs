import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(path.resolve('mothe.html')).href;
  await page.goto(url, { settleMs: 500 });
  const click = async selector => { await page.eval(s => { const b = document.querySelector(s); if (!b || b.disabled) throw new Error('Không bấm được: ' + s); b.click(); }, selector); await sleep(100); };
  await click('.sound-button'); // Ghi bản lưu khởi đầu để mô phỏng tiến trình cũ hết xu.
  await page.eval(() => { const key = 'arena-huyen-thoai-v1'; const data = JSON.parse(localStorage.getItem(key)); data.balance = 0; data.reduced = true; data.sound = false; localStorage.setItem(key, JSON.stringify(data)); });
  await page.goto(url, { settleMs: 300 });
  assert.match(await page.eval(() => document.querySelector('.wallet').textContent), /∞/);
  await click('.batch-bar button');
  await sleep(100);
  assert.equal(await page.eval(() => document.querySelectorAll('.batch-results>div').length), 10);
  await click('.cinema-top button');
  await click('.main-nav button:nth-child(2)');
  await click('.material-slot');
  await click('.picker-row');
  await click('.picker-modal .modal-bottom-button');
  await click('.upgrade-controls>.primary-button');
  await sleep(150);
  const data = await page.eval(() => JSON.parse(localStorage.getItem('arena-huyen-thoai-v1')));
  assert.equal(data.balance, 0);
  assert.equal(data.opened, 10);
  assert.equal(data.upgrades, 1);
  assert.equal(data.cards.length, 21);
  assert.match(data.history[0].detail, /Không trừ xu/);
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: tiến trình cũ 0 xu vẫn mở 10 gói và nâng cấp; ví hiển thị ∞; số dư gốc được giữ nguyên.');
} finally { await browser.close(); }
