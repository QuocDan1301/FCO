import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const preview=process.argv.includes('--preview');
mkdirSync('.taste-skill/ready-card-qa',{recursive:true});
const browser=await Browser.launch();
try {
  const page=await browser.newPage();
  await page.goto(pathToFileURL(resolve('mothe.html')).href);
  await page.eval(()=>[...document.querySelectorAll('.main-nav button')].find(b=>b.textContent.includes('Vật phẩm')).click());
  await sleep(200);
  await page.eval(()=>document.querySelector('[aria-label="Dùng INFINITE PRIME (ALL)"]').click());
  await sleep(400);
  await page.eval(async()=>{await document.querySelector('.ready-art .tm-back-img').decode();});
  for(const [width,height] of [[1440,900],[1007,900],[768,1024],[390,844],[844,390]]) {
    await page.setViewport({width,height,mobile:width<640});
    await sleep(200);
    if(preview) {
      await page.screenshot({path:`.taste-skill/ready-card-qa/before-${width}.jpg`});
      await page.eval(()=>{
        const style=document.createElement('style');style.id='ready-preview';
        style.textContent='.pack-ready-modal .ready-art{top:51%}.pack-ready-modal .ready-art .ready-flip,.pack-ready-modal .ready-art .ready-flip.tm-flip{width:min(140px,14.2vw);height:min(194px,27.3vh)}@media(max-width:640px){.pack-ready-modal .ready-art .ready-flip,.pack-ready-modal .ready-art .ready-flip.tm-flip{width:min(140px,33vw)}}@media(max-width:900px) and (orientation:landscape) and (max-height:500px){.pack-ready-modal .ready-art .ready-flip,.pack-ready-modal .ready-art .ready-flip.tm-flip{height:40dvh;width:28dvh}}';
        document.head.append(style);
      });
    }
    const result=await page.eval(()=>{
      const card=document.querySelector('.ready-art .ready-flip').getBoundingClientRect();
      const door=[...document.querySelectorAll('.rt-neon rect')].at(-1).getBoundingClientRect();
      return {card:{width:card.width,height:card.height,cx:card.x+card.width/2,cy:card.y+card.height/2},door:{cx:door.x+door.width/2,cy:door.y+door.height/2},overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(Math.abs(result.card.cx-result.door.cx)<1);
    assert.ok(Math.abs(result.card.cy-result.door.cy)<1);
    assert.equal(result.overflow,false);
    console.log(width,JSON.stringify(result));
    await page.screenshot({path:`.taste-skill/ready-card-qa/after-${width}.jpg`});
    if(preview) await page.eval(()=>document.querySelector('#ready-preview').remove());
  }
  assert.deepEqual(page.consoleErrors,[]);
  console.log('PASS: card centered on tunnel doorway at five viewport sizes.');
} finally {await browser.close();}
