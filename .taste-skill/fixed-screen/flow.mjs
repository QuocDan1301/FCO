import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initialSave,makeCard,players,STORAGE_KEY} from '../../src/game.ts';
const {Browser,sleep}=await import(pathToFileURL(process.argv[2]).href);
const browser=await Browser.launch();
try {
 const page=await browser.newPage({width:390,height:667,mobile:true});
 const url=pathToFileURL(resolve('mothe.html')).href;
 await page.goto(url);
 const save={...initialSave(),reduced:true,sound:false,quick:true,cards:players.slice(0,30).map(p=>makeCard(p.id))};
 await page.eval(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key:STORAGE_KEY,save});
 await page.goto(url);
 const click=async s=>{await page.eval(s=>document.querySelector(s).click(),s);await sleep(100)};
 await click('.main-nav .nav-inner>button:nth-child(3)');
 const cards=new Set();
 for(let i=0;i<40;i++){
  for(const name of await page.eval(()=>[...document.querySelectorAll('.collection-card')].map(e=>e.querySelector('.player-card')?.getAttribute('aria-label')||e.textContent)))cards.add(name);
  if(await page.eval(()=>document.querySelector('.collection-grid .viewport-pagination button:last-child').disabled))break;
  await click('.collection-grid .viewport-pagination button:last-child');
 }
 assert.equal(cards.size,30,'All collection cards remain reachable');
 await click('.main-nav .nav-inner>button:nth-child(4)');
 const packs=new Set();
 for(let i=0;i<10;i++){
  for(const name of await page.eval(()=>[...document.querySelectorAll('.inv-item h3')].map(e=>e.textContent)))packs.add(name);
  assert.ok(await page.eval(()=>[...document.querySelectorAll('.inv-use')].every(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight})), 'Use buttons visible');
  if(await page.eval(()=>document.querySelector('.inv-grid .viewport-pagination button:last-child').disabled))break;
  await click('.inv-grid .viewport-pagination button:last-child');
 }
 assert.equal(packs.size,3);
 await click('.inv-use');
 const deadline=Date.now()+20000;
 while(await page.eval(()=>document.querySelector('.ready-open-batch')?.disabled)){assert.ok(Date.now()<deadline);await sleep(100)}
 await click('.ready-open-batch');
 while(!(await page.eval(()=>!!document.querySelector('.opening-batch-grid')))){assert.ok(Date.now()<deadline);await sleep(100)}
 const count=await page.eval(()=>document.querySelector('.batch-caption>span').textContent);
 assert.match(count,/10/);
 let shown=0;
 for(let i=0;i<15;i++){
  shown+=await page.eval(()=>document.querySelectorAll('.opening-batch-grid .viewport-page-items>div').length);
  if(await page.eval(()=>document.querySelector('.opening-batch-grid .viewport-pagination button:last-child').disabled))break;
  await click('.opening-batch-grid .viewport-pagination button:last-child');
 }
 assert.equal(shown,10,'Every batch result is reachable');
 await page.screenshot({path:'.taste-skill/no-scroll-layout/opened-390x667.jpg'});
 console.log('Batch layout:',JSON.stringify(await page.eval(()=>['.modal-panel','.icon-opening','.opening-result','.opening-batch','.viewport-page-items'].flatMap(s=>[...document.querySelectorAll(s)].map(e=>({s,h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}))).filter(e=>e.sh>e.h+2||e.sw>e.w+2))));
 await click('.opening-skip');
 await click('.main-nav .nav-inner>button:nth-child(2)');
 await click('.fco-change');
 assert.ok(await page.eval(()=>{const e=document.querySelector('.picker-list .viewport-page-items');return e.clientHeight>0&&e.scrollHeight<=e.clientHeight+2}),'Picker fits without scrolling');
 assert.ok(await page.eval(()=>!document.querySelector('.picker-list .viewport-pagination button:last-child').disabled),'More picker cards are reachable');
 await click('.picker-list .viewport-pagination button:last-child');
 await click('.picker-list .picker-row');
 await sleep(250);
 assert.equal(await page.eval(()=>!!document.querySelector('.picker-modal')),false);
 assert.deepEqual(page.consoleErrors,[]);
 console.log('PASS: all 30 cards, all 3 packs, visible Use buttons, open 10 and reach every batch result; no console errors.');
}finally{await browser.close();}
