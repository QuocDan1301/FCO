import { Browser } from 'file:///C:/Users/Admin/.codex/plugins/cache/taste-skill/taste-skill/2.1.4/skills/taste-skill/scripts/lib/cdp.mjs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const phase=process.argv[2]||'before';
const out=`outputs/mobile-qa/${phase}`;mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{const file=resolve('dist','.'+new URL(req.url,'http://localhost').pathname.replace(/^\/FCO\//,'/').replace(/\/$/,'/index.html'));res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await Browser.launch();const results=[];
try{
 for(const [width,height] of [[360,740],[390,844],[844,390],[1440,900]]){
  const page=await browser.newPage({width,height,mobile:width<900});
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('arena-huyen-thoai-v1',JSON.stringify({version:1,unopened:{eternal:15,stellar:15,origin:15,prime:15,vietnam:15,prm:15,mdl:15,amb:15},balance:15000000,cards:Array.from({length:20},(_,i)=>({uid:'qa-'+i,playerId:[47,1,3,6,38,39,40,41][i%8],level:1,received:Date.now()})),history:[],daily:'',opened:0,upgrades:0,sound:false,reduced:false}));`});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for(const index of [0,1,2,3,5,6]){
   await page.eval(i=>document.querySelectorAll('.main-nav button')[i].click(),index);
   await new Promise(r=>setTimeout(r,350));
   if(index===1){await page.eval(()=>document.querySelector('.fco-target-card').click());await new Promise(r=>setTimeout(r,100));await page.eval(()=>document.querySelector('.tp-row').click());await new Promise(r=>setTimeout(r,100));}
   const result=await page.eval(()=>{const root=document.querySelector('.main-content');const r=root.getBoundingClientRect();return {view:root.className,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,mainHeight:r.height,mainScroll:root.scrollHeight>root.clientHeight+2,smallButtons:[...root.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<40}).length,clipped:[...root.querySelectorAll('button')].filter(b=>{const a=b.getBoundingClientRect();return a.width>0&&a.height>0&&(a.right>innerWidth+2||a.left< -2)}).map(b=>b.textContent.slice(0,35))};});
   results.push({...result,width,height});
   await page.screenshot({path:`${out}/${width}-${index}.png`,format:'png'});
   if(phase !== 'before' && index===1 && width<900){
    await page.eval(()=>{document.querySelector('.main-content').scrollTop=9999});
    for(let i=0;i<5;i++){
     await page.eval(()=>document.querySelector('.fco-line:not(.picked):not(:disabled)')?.click());
     await new Promise(r=>setTimeout(r,80));
    }
    const energy=await page.eval(()=>({full:document.querySelector('.fco-energy').classList.contains('is-full'),picked:document.querySelectorAll('.fco-line.picked').length,available:document.querySelectorAll('.fco-line:not(.picked):not(:disabled)').length}));
    if(!energy.full||energy.available)throw Error('Energy selection regression '+JSON.stringify(energy));
    await page.screenshot({path:`${out}/${width}-upgrade-selected.png`,format:'png'});
    await page.eval(()=>document.querySelector('.fco-go').click());
    await new Promise(r=>setTimeout(r,400));
    if(!await page.eval(()=>!!document.querySelector('.uc-go')))throw Error('Upgrade confirmation missing');
    await page.screenshot({path:`${out}/${width}-upgrade-confirm.png`,format:'png'});
    await page.eval(()=>document.querySelector('.uc-back').click());
    results.push({width,energy,upgradeConfirmation:true});
   }
   if(phase !== 'before' && index===2 && width<900){
    await page.eval(()=>document.querySelector('.squad-right .squad-move').click());
    await new Promise(r=>setTimeout(r,100));
    if(!await page.eval(()=>!!document.querySelector('.squad-left .squad-row')))throw Error('Touch squad move failed');
    results.push({width,squadMove:true});
   }
  }
  results.push({width,height,errors:page.consoleErrors});
  await page.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});
 }
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.closeAllConnections();server.close();}
