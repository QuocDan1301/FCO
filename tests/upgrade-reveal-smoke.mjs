// npx tsx tests/upgrade-reveal-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, STORAGE_KEY } from '../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const saved = () => page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const until = async predicate => {
    const deadline = Date.now() + 7000;
    while (!(await page.eval(predicate))) {
      if (Date.now() > deadline) throw new Error('Upgrade reveal timed out');
      await sleep(40);
    }
  };
  await page.goto(url, { settleMs: 200 });
  for (const fixture of [
    { reduced: false, before: 1, success: true, materialId: 102, materialLevel: 1, after: 2 },
    { reduced: true, before: 1, success: true, materialId: 102, materialLevel: 1, after: 2 },
    { reduced: true, before: 8, success: false, materialId: 102, materialLevel: 1, after: 1 },
    { reduced: true, before: 8, success: false, materialId: 101, materialLevel: 3, after: 3 },
  ]) {
    const target = { ...makeCard(101), level: fixture.before };
    const state = { ...initialSave(), reduced: fixture.reduced, sound: false, cards: [target, { ...makeCard(fixture.materialId), level: fixture.materialLevel }] };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 200 });
    await page.eval(() => document.querySelector('.main-nav button:nth-child(2)').click());
    await sleep(80);
    await page.eval(() => document.querySelector('.fco-line').click());
    await sleep(40);
    await page.eval(success => {
      const rolls = [success ? 0 : .999999, 0];
      crypto.getRandomValues = array => { array[0] = Math.floor((rolls.shift() ?? 0) * 4294967296); return array; };
      const button = document.querySelector('.fco-go'); button.click(); button.click();
    }, fixture.success);
    await sleep(350);
    assert.equal(await page.eval(() => !!document.querySelector('.upgrade-phase-0.is-pending')), true, 'No immediate result, including reduced motion');
    assert.equal(await page.eval(() => document.querySelector('.upgrade-reveal-card .player-card').getAttribute('aria-label').split('cộng ')[1]), String(fixture.before));
    assert.equal(await page.eval(() => document.querySelector('.fco-target-card .player-card').getAttribute('aria-label').split('cộng ')[1]), String(fixture.before), 'Background card must not reveal the saved result');
    assert.equal((await saved()).upgrades, 1, 'Double click consumes materials only once');
    assert.equal((await saved()).cards[0].level, fixture.after, 'Save result immediately so refresh cannot reroll');
    await until(() => !!document.querySelector('.upgrade-phase-1'));
    assert.equal(await page.eval(() => !!document.querySelector('.is-finished')), false);
    await until(() => !!document.querySelector('.upgrade-phase-2'));
    assert.equal(await page.eval(() => !!document.querySelector('.is-finished')), false);
    if (fixture.after === 3) {
      await until(() => !!document.querySelector('.upgrade-phase-3'));
      assert.equal(await page.eval(() => !!document.querySelector('.is-finished')), false);
      assert.match(await page.eval(() => document.querySelector('.upgrade-result-copy').textContent), /rớt về \+1/);
    }
    await until(() => !!document.querySelector('.is-finished'));
    assert.match(await page.eval(() => document.querySelector('.upgrade-result-copy h2').textContent), fixture.success ? /thành công/ : /thất bại/);
    assert.equal(await page.eval(() => document.querySelector('.fco-target-card .player-card').getAttribute('aria-label').split('cộng ')[1]), String(fixture.after));
    assert.equal((await saved()).cards.length, 1);
    const after = await saved();
    await page.goto(url, { settleMs: 200 });
    assert.deepEqual(await saved(), after);
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: staged upgrade success/failure/recovery with normal and reduced motion; no early result; no duplicate consumption; refresh preserves result.');
} finally { await browser.close(); }
