import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { initialSave, makeCard, players, STORAGE_KEY } from '../../src/game.ts';
const {Browser,sleep}=await import(pathToFileURL(process.argv[2]).href);
const dir='.taste-skill/no-scroll-layout'; mkdirSync(dir,{recursive:true});
const browser=await Browser.launch();
const findings=[];
try {
 const page=await browser.newPage();
 const url=pathToFileURL(resolve('mothe.html')).href;
 await page.goto(url);
 const fixture={...initialSave(),reduced:true,sound:false,quick:true};
 fixture.cards=players.slice(0,30).map(p=>makeCard(p.id));
 fixture.history=Array.from({length:30},(_,i)=>({id:`qa-${i}`,type:'gift',title:`Quà mỗi ngày ${i+1}`,detail:'Đã nhận 1.000.000 xu.',time:Date.now()-i*86400000}));
 await page.eval(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key:STORAGE_KEY,save:fixture});
 await page.goto(url);
 for(const [width,height] of [[1440,900],[1366,768],[768,1024],[390,844],[390,667]]) {
  await page.setViewport({width,height,mobile:width===390});
  for(const [index,name] of ['home','upgrade','collection','inventory','history','market'].entries()) {
   await page.eval(i=>document.querySelectorAll('.main-nav .nav-inner>button')[i].click(),index);
   await sleep(200);
   const layout=await page.eval(()=>{
    const selectors=['main','.hero-content','.inv-main','.inv-side','.inv-item','.viewport-page-items','.fco-left','.fco-right','.market-list','.market-preview'];
    const overflow=selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.clientHeight>0&&getComputedStyle(e).display!=='none').map(e=>({selector:s,h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}))).filter(e=>e.sh>e.h+2||e.sw>e.w+2);
    const scrollable=[...document.querySelectorAll('main,main *')].filter(e=>{const s=getComputedStyle(e);return /auto|scroll/.test(s.overflowY+s.overflowX)&&(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)}).map(e=>e.className);
    return {overflow,scrollable,root:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},pages:[...document.querySelectorAll('.viewport-pagination span,.market-pagination span')].map(e=>e.textContent)};
   });
   findings.push({width,height,name,...layout});
   await page.screenshot({path:`${dir}/${name}-${width}x${height}.jpg`});
  }
 }
 writeFileSync(`${dir}/measurements.json`,JSON.stringify(findings,null,2));
 console.log(JSON.stringify(findings.filter(x=>x.overflow.length||x.scrollable.length||x.root.w>x.width||x.root.h>x.height),null,2));
 assert.deepEqual(findings.filter(x=>x.overflow.length||x.scrollable.length||x.root.w>x.width||x.root.h>x.height),[]);
 assert.deepEqual(page.consoleErrors,[]);
 console.log('PASS: all six views fit without scrolling at five viewport sizes; no clipped layout regions or console errors.');
} finally { await browser.close(); }
