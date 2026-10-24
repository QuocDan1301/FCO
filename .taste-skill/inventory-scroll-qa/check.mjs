import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Browser,sleep}=await import(pathToFileURL(process.argv[2]).href);
const before=process.argv.includes('--before'),dir='.taste-skill/inventory-scroll-qa';
mkdirSync(dir,{recursive:true});
const browser=await Browser.launch();
try {
  const page=await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  await page.eval(()=>[...document.querySelectorAll('.main-nav button')].find(b=>b.textContent.includes('Vật phẩm')).click());
  await sleep(250);
  const expected=await page.eval(()=>Number(document.querySelector('.inv-capacity b').textContent.split('/')[0]));
  const sizes={};
  for(const [width,height] of [[1440,900],[768,900],[390,844],[390,667]]) {
    const key=`${width}x${height}`;
    await page.setViewport({width,height,mobile:width<640});await sleep(200);
    await page.eval(()=>{const el=document.querySelector('.inv-main');el.scrollTop=0;document.activeElement?.blur();});
    const state=await page.eval(()=>{
      const scroller=document.querySelector('.inv-main'),art=document.querySelector('.inv-art .pack-art').getBoundingClientRect();
      return {count:document.querySelectorAll('.inv-item').length,packHeight:art.height,scrollHeight:scroller.scrollHeight,height:scroller.clientHeight,pagination:!!document.querySelector('.inv-grid .viewport-pagination'),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
    });sizes[key]=state;
    await page.screenshot({path:`${dir}/${before?'before':'after'}-${key}-top.jpg`});
    if(before)continue;
    assert.equal(state.count,expected);assert.equal(state.pagination,false);assert.equal(state.overflow,false);
    const old=JSON.parse(readFileSync(`${dir}/before.json`,'utf8'))[key];
    assert.ok(state.packHeight<old.packHeight,`Packs must shrink: ${key} ${state.packHeight} vs ${old.packHeight}`);
    if(state.scrollHeight>state.height) {
      await page.wheel(1800);await sleep(200);
      assert.ok(await page.eval(()=>document.querySelector('.inv-main').scrollTop>0),'Wheel scrolls the inventory');
    }
    await page.eval(()=>document.querySelector('.inv-item:last-child').scrollIntoView({block:'end'}));
    await sleep(100);
    assert.ok(await page.eval(()=>{const el=document.querySelector('.inv-art:last-child')??document.querySelector('.inv-item:last-child .inv-art');const r=el.getBoundingClientRect(),s=document.querySelector('.inv-main').getBoundingClientRect();return r.top>=s.top-1&&r.bottom<=s.bottom+1;}));
    assert.ok(await page.eval(()=>[...document.querySelectorAll('.inv-foot button')].every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})));
    await page.screenshot({path:`${dir}/after-${key}-bottom.jpg`});
  }
  writeFileSync(`${dir}/${before?'before':'after'}.json`,JSON.stringify(sizes,null,2));
  if(!before) {
    await page.eval(()=>document.querySelector('.inv-item:last-child .inv-art').click());
    assert.equal(await page.eval(()=>document.querySelector('.inv-open').disabled),false);
    await page.eval(()=>{const e=document.querySelector('[aria-label="Sắp xếp kho"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'old');e.dispatchEvent(new Event('change',{bubbles:true}));});
    await sleep(150);assert.equal(await page.eval(()=>document.querySelector('.inv-main').scrollTop),0);
    await page.eval(()=>{const e=document.querySelector('[aria-label="Loại sản phẩm trong kho"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'coach');e.dispatchEvent(new Event('change',{bubbles:true}));});
    await sleep(100);assert.ok(await page.eval(()=>!!document.querySelector('.inv-empty')));
    await page.eval(()=>{const e=document.querySelector('[aria-label="Loại sản phẩm trong kho"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'player');e.dispatchEvent(new Event('change',{bubbles:true}));});
    await sleep(100);assert.equal(await page.eval(()=>document.querySelectorAll('.inv-item').length),expected);
    await page.eval(()=>{const e=document.querySelector('.inv-item:last-child .inv-art');e.scrollIntoView({block:'center'});e.focus();});
    await sleep(100);await page.eval(()=>document.querySelector('.inv-item:last-child .inv-use').click());
    await sleep(300);assert.ok(await page.eval(()=>!!document.querySelector('.pack-ready-modal')));
    assert.deepEqual(page.consoleErrors,[]);
    console.log('PASS: all packs rendered; smaller artwork; wheel scroll; last pack reachable; fixed footer; sorting/filtering; selection and Use.');
  }else console.log('Captured baseline:',JSON.stringify(sizes));
}finally{await browser.close();}
