import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Browser } from 'file:///C:/Users/Admin/.codex/plugins/cache/taste-skill/taste-skill/2.1.5/skills/taste-skill/scripts/lib/cdp.mjs';
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href, { timeoutMs: 30000, settleMs: 1000 });
  const state = await page.eval(() => ({ embedded: window.__FCO_STANDALONE__, loading: !!document.querySelector('#startup'), status: document.querySelector('#boot-status')?.textContent, ready: !!document.querySelector('.topbar') }));
  console.log(JSON.stringify({ state, errors: page.consoleErrors }));
  assert(state.embedded && state.ready && !state.loading);
  console.log('PASS standalone uses embedded data and opens the game');
} finally { await browser.close(); }
