// node tests/upgrade-failure-smoke.mjs <path-to-taste-skill/scripts/lib/cdp.mjs>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, makeCard, STORAGE_KEY } from '../src/game.ts';

const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  const click = async selector => {
    await page.eval(s => {
      const button = document.querySelector(s);
      if (!button || button.disabled) throw new Error('Unavailable: ' + s);
      button.click();
    }, selector);
    await sleep(80);
  };
  const until = async predicate => {
    const deadline = Date.now() + 8000;
    while (!(await page.eval(predicate))) {
      if (Date.now() >= deadline) throw new Error('Timed out waiting for upgrade phase');
      await sleep(40);
    }
  };
  await page.goto(url, { settleMs: 250 });
  for (const fixture of [
    { materials: [[34, 1]], drop: 0, level: 1, reduced: true },
    { materials: [[34, 1]], drop: .999999, level: 7, reduced: true },
    { materials: [[33, 3]], drop: 0, level: 3, reduced: false },
    { materials: [[33, 3]], drop: .8, level: 6, reduced: true },
    { materials: [[33, 2], [33, 5], [34, 12]], drop: 0, level: 5, reduced: true },
  ]) {
    const target = { ...makeCard(33), level: 8 };
    const cards = [target, ...fixture.materials.map(([playerId, level]) => ({ ...makeCard(playerId), level }))];
    const state = { ...initialSave(), cards, reduced: fixture.reduced, sound: false };
    await page.eval(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
    await page.goto(url, { settleMs: 250 });
    await click('.main-nav button:nth-child(2)');
    for (let n = 1; n < cards.length; n++) await click(`.fco-line:nth-child(${n})`);
    await page.eval(drop => {
      const rolls = [.999999, drop];
      crypto.getRandomValues = array => { array[0] = Math.floor((rolls.shift() ?? 0) * 4294967296); return array; };
    }, fixture.drop);
    await click('.fco-go');
    if (!fixture.reduced) {
      await until(() => !!document.querySelector('.upgrade-phase-3'));
      assert.match(await page.eval(() => document.querySelector('.upgrade-result-copy').textContent), /rớt về \+1/);
      assert.equal(await page.eval(() => !!document.querySelector('.is-finished')), false);
    }
    await until(() => !!document.querySelector('.is-finished'));
    const saved = await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(saved.cards.length, 1);
    assert.equal(saved.cards[0].uid, target.uid);
    assert.equal(saved.cards[0].level, fixture.level);
    assert.equal(saved.upgrades, 1);
    assert.equal(saved.history[0].success, false);
    const copy = await page.eval(() => document.querySelector('.upgrade-result-copy').textContent);
    assert.ok(copy.includes(`+${fixture.level}`), copy);
    assert.doesNotMatch(copy, /giữ nguyên cấp/);
    const recoveryFloor = Math.max(0, ...fixture.materials.filter(([id]) => id === target.playerId).map(([, level]) => level));
    const droppedLevel = 1 + Math.floor(fixture.drop * 7);
    if (recoveryFloor > droppedLevel) assert.match(copy, /phục hồi/i);
    else assert.doesNotMatch(copy, /phục hồi/i);
    await page.goto(url, { settleMs: 250 });
    assert.deepEqual(await page.eval(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY), saved);
  }
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: random downgrade, duplicate recovery, highest matching material, staged animation, consumption, and reload persistence.');
} finally { await browser.close(); }
