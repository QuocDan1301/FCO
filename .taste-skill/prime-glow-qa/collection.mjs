import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const preview = process.argv.includes('--preview');
const roster = JSON.parse(readFileSync('.taste-skill/prime-qa/roster.json', 'utf8'));
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve('mothe.html')).href;
  await page.goto(url);
  await page.eval(ids => {
    localStorage.setItem('arena-huyen-thoai-v1', JSON.stringify({ version:1, balance:15000000, cards:ids.map((playerId,i)=>({uid:`glow-${i}`,playerId,level:1,received:i})), history:[], daily:'', opened:0, upgrades:0, sound:false, reduced:false, light:true }));
  }, roster.map(p=>p.id));
  await page.goto(url);
  await page.eval(() => [...document.querySelectorAll('.main-nav button')].find(b=>b.textContent.includes('Kho cầu thủ')).click());
  await sleep(200);
  for (const width of [1440, 1007, 768, 390]) {
    await page.setViewport({width,height:900,mobile:width===390});
    await sleep(200);
    await page.eval(async()=>Promise.all([...document.querySelectorAll('.collection-card .face-art-img')].map(i=>i.decode())));
    if (preview) {
      await page.screenshot({path:`.taste-skill/prime-glow-qa/collection-before-${width}.jpg`});
      await page.eval(()=>{
        const style=document.createElement('style'); style.id='collection-fix';
        style.textContent='.view-collection .collection-card{overflow:visible}.view-collection .collection-grid{overflow:visible}.view-collection .collection-grid>.viewport-page-items{overflow:visible;padding:20px 16px 12px}';
        document.head.append(style);
      });
      await sleep(100);
    }
    const state=await page.eval(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
      clips:[...document.querySelectorAll('.collection-card')].map(c=>getComputedStyle(c).overflow),
      dimensions:[...document.querySelectorAll('.collection-card')].slice(0,4).map(c=>{
        const r=c.getBoundingClientRect(),im=c.querySelector('.face-art-img').getBoundingClientRect();
        return {box:[r.x,r.y,r.width,r.height],image:[im.x,im.y,im.width,im.height]};
      })
    }));
    assert.equal(state.overflow,false);
    assert.ok(state.clips.every(c=>c==='visible'));
    console.log(width,JSON.stringify(state));
    await page.screenshot({path:`.taste-skill/prime-glow-qa/collection-after-${width}.jpg`});
    if(preview) await page.eval(()=>document.querySelector('#collection-fix').remove());
  }
  await page.eval(()=>document.querySelector('.collection-card').click());
  await sleep(150);
  assert.ok(await page.eval(()=>!!document.querySelector('.modal-backdrop')));
  assert.deepEqual(page.consoleErrors,[]);
  console.log('PASS: collection glows visible, responsive layout and card detail click.');
} finally { await browser.close(); }
