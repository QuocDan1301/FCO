import { Browser } from 'file:///C:/Users/Admin/.codex/plugins/cache/taste-skill/taste-skill/2.1.4/skills/taste-skill/scripts/lib/cdp.mjs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const server = createServer((req,res) => {
  try {
    const file = resolve('dist', '.' + new URL(req.url, 'http://localhost').pathname.replace(/^\/FCO\//, '/').replace(/\/$/, '/index.html'));
    res.setHeader('content-type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('arena-huyen-thoai-v1', JSON.stringify({version:1,unopened:{eternal:15,stellar:15,origin:15,prime:15,vietnam:15,prm:15,mdl:15,amb:15},balance:15000000,cards:Array.from({length:8},(_,i)=>({uid:'qa-'+i,playerId:47,level:1,received:Date.now()})),history:[],daily:'',opened:0,upgrades:0,sound:false,reduced:false}));`});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.eval(() => document.querySelectorAll('.main-nav button')[1].click());
  await page.eval(() => document.querySelector('.fco-target-card').click());
  await page.eval(() => document.querySelector('.tp-row').click());
  for(let i=0;i<3;i++) {
    await page.eval(() => document.querySelector('.fco-line:not(.picked):not(:disabled)').click());
    await new Promise(r=>setTimeout(r,60));
  }
  const state = await page.eval(() => ({full:document.querySelector('.fco-energy').classList.contains('is-full'),picked:document.querySelectorAll('.fco-line.picked').length,available:document.querySelectorAll('.fco-line:not(.picked):not(:disabled)').length}));
  assert.equal(state.full,true); assert.equal(state.picked,3); assert.equal(state.available,0);
  const colors = await page.eval(() => {
    const bar = document.querySelector('.fco-energy');
    const anim = bar.getAnimations().find(a=>a.animationName==='fco-energy-full-colors');
    anim.pause();
    return [0,800,1500].map(time => {anim.currentTime=time;return getComputedStyle(bar).getPropertyValue('--fco-fill').trim()});
  });
  assert.equal(new Set(colors).size,3);
  await new Promise(r=>setTimeout(r,650));
  await page.screenshot({path:'outputs/energy-full-qa/full.png',format:'png'});
  await page.eval(() => document.querySelector('.fco-line.picked').click());
  const removed = await page.eval(() => ({full:document.querySelector('.fco-energy').classList.contains('is-full'),available:document.querySelectorAll('.fco-line:not(.picked):not(:disabled)').length}));
  assert.equal(removed.full,false); assert.ok(removed.available>0);
  await page.eval(() => document.querySelector('.fco-line:not(.picked):not(:disabled)').click());
  assert.equal(await page.eval(() => document.querySelector('.fco-energy').classList.contains('is-full')),true);
  const result={state,colors,removed,errors:page.consoleErrors};
  assert.equal(result.errors.length,0);
  writeFileSync('outputs/energy-full-qa/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();server.closeAllConnections();server.close();}
