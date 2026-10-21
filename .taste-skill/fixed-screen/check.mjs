import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Browser,sleep}=await import(pathToFileURL(process.argv[2]).href);
const browser=await Browser.launch();
try {
  const page=await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
    await page.setViewport({width,height,mobile:width===390});
    for(const index of [0,1,2,3,4,5]) {
      await page.eval(i=>document.querySelectorAll('.main-nav .nav-inner > button')[i].click(),index);
      await sleep(150);
      const state=await page.eval(()=>{
        const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
        return {docH:document.documentElement.scrollHeight,docW:document.documentElement.scrollWidth,header:rect(document.querySelector('.topbar')),footer:rect(document.querySelector('footer')),main:rect(document.querySelector('main')),mainTop:document.querySelector('main').scrollTop,invFoot:document.querySelector('.inv-foot')?rect(document.querySelector('.inv-foot')):null};
      });
      assert.ok(state.docH<=height+1,`Document too tall ${width} tab ${index}`);
      assert.ok(state.docW<=width,`Document too wide ${width} tab ${index}`);
      assert.equal(state.header.top,0);
      assert.ok(state.footer.bottom<=height+1);
      assert.equal(state.mainTop,0,'View starts at top');
      if(state.invFoot) assert.ok(state.invFoot.bottom<=state.main.bottom+1,'Inventory actions remain visible');
      if([0,3].includes(index)) {
        await sleep(1100);
        await page.screenshot({path:`.taste-skill/fixed-screen/${index===0?'home':'inventory'}-${width}.jpg`});
      }
      if(index===0) {
        const overflow=await page.eval(()=>{const m=document.querySelector('main');return m.scrollHeight>m.clientHeight});
        await page.eval(()=>document.querySelector('main').scrollTo(0,9999));
        if(overflow) assert.ok(await page.eval(()=>document.querySelector('main').scrollTop>0),'Long content can scroll');
        assert.equal(await page.eval(()=>window.scrollY),0);
      }
    }
  }
  await page.eval(()=>document.querySelectorAll('.main-nav .nav-inner > button')[3].click());
  await page.eval(()=>document.querySelector('.inv-use').click());
  await sleep(150);
  assert.ok(await page.eval(()=>!!document.querySelector('.pack-ready-modal')));
  assert.deepEqual(page.consoleErrors,[]);
  console.log('PASS: all six views fixed at desktop/tablet/phone; content scroll, tab reset, visible inventory actions and opening.');
} finally {await browser.close();}
