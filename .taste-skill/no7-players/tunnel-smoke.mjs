import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialSave, STORAGE_KEY, packs } from '../../src/game.ts';
const { Browser, sleep } = await import(pathToFileURL(process.argv[2]).href);
const source = await readFile('public/assets/no7-tunnel.png');
assert.ok(source.equals(await readFile('C:/Users/Admin/OneDrive/Hình ảnh/Dòng chảy cẩm thạch ánh kim.png')));
assert.equal(packs[2].tunnel, '/assets/no7-tunnel.png');
assert.ok((await readFile('mothe.html', 'utf8')).includes('data:image/png;base64,' + source.toString('base64')));
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.no7Draws=0; const original=CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLImageElement && image.naturalWidth===1672 && image.naturalHeight===941)window.no7Draws++;return original.call(this,image,...args);};` });
  await page.send('Network.enable');
  await page.send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
  const url = pathToFileURL(resolve('mothe.html')).href;
  await page.goto(url);
  for (const light of [false,true]) {
    await page.eval(({key,save})=>localStorage.setItem(key,JSON.stringify(save)), {key:STORAGE_KEY,save:{...initialSave(),reduced:false,quick:false,light}});
    await page.goto(url);
    const click=async selector=>{await page.eval(s=>{const b=document.querySelector(s);if(!b || b.disabled)throw new Error(s);b.click();},selector);await sleep(100);};
    await click('.pack-option:nth-child(3) .pack-select');
    await click('.hero-button');
    const deadline=Date.now()+20000;
    while (!await page.eval(()=>!!document.querySelector('.ready-open-one:not(:disabled)'))) {assert.ok(Date.now()<deadline,'Scene ready');await sleep(100);}
    await click('.ready-open-one');
    while (!await page.eval(()=>!!document.querySelector('.opening-phase-1'))) {assert.ok(Date.now()<deadline,'Opening started');await sleep(80);}
    assert.ok(await page.eval(()=>window.no7Draws>0),'Marble image drawn on LED canvas');
    if(light)assert.ok(await page.eval(()=>!!document.querySelector('.light-cinema-canvas')));
    await page.screenshot({path:`.taste-skill/no7-players/tunnel-${light?'light':'3d'}.jpg`});
    await page.goto(url);
    assert.equal(await page.eval(key=>JSON.parse(localStorage.getItem(key)).opened,STORAGE_KEY),1);
  }
  assert.deepEqual(page.consoleErrors,[]);
  console.log('PASS: exact supplied image, embedded offline, drawn in 3D and light modes; NO.7 opening and saving work; no JS errors.');
} finally {await browser.close();}
