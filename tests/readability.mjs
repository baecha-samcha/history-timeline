import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.READABILITY_OUTPUT || '/tmp/history-readability-test';
fs.mkdirSync(output, { recursive: true });
// In-memory fixtures and intercepted API calls: this test cannot write to the database.
const data = process.env.READABILITY_DATA ? JSON.parse(fs.readFileSync(process.env.READABILITY_DATA)) : {
 colorTags: [{id:'black',name:'독일',color:'#000000'},{id:'orange',name:'중국',color:'#ff9900'}],
 periods: Array.from({length:15},(_,i)=>({id:`p${i}`,title:`긴 기간 제목 ${i} — 뉘른베르크 전당대회 개최`,startDate:`193${i%7}-09-05`,endDate:`193${i%7}-09-10`,category:i%2?'일본사':'유럽사',colorTagIds:['black']})),
 events: Array.from({length:95},(_,i)=>({id:`e${i}`,title:`밀집 사건 ${i} — 블롬베르크-그루엔 결혼 및 국제연맹 탈퇴`,date:`193${3+i%7}-03-${String(1+i%28).padStart(2,'0')}`,category:i%2?'일본사':'유럽사',colorTagIds:[i%2?'orange':'black']})),
 flows: Array.from({length:13},(_,i)=>({id:`f${i}`,title:`흐름 ${i} A → B → C`,colorTagIds:['black'],items:[{type:'event',id:`e${i}`},{type:'event',id:`e${i+20}`}]}))
};
const allowed = new Set(['index.html','app.js','styles.css','logo.png','manifest.json','sw.js','favicon.ico','robots.txt']);
const server = http.createServer((req,res)=>{
 const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
 if (!allowed.has(file)) { res.writeHead(404).end(); return; }
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.txt':'text/plain'};
 res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
 res.end(fs.readFileSync(path.join(root,file)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let activeBrowser;
(async()=>{
 const b=activeBrowser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 const context=await b.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
 await context.addInitScript(()=>localStorage.setItem('ibhistory.session.v1',JSON.stringify({token:'local-browser-fixture',username:'preview'})));
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/auth/me')?{username:'preview'}:{data,version:1}}));
 await p.goto(base);await p.waitForSelector('.event-label');await p.evaluate(()=>document.fonts.ready);
 console.log('computed',await p.evaluate(()=>Object.fromEntries(['.event-label','.period-label','.flow-label','.tick-label.year','.tick-label:not(.year)'].map(sel=>{const s=getComputedStyle(document.querySelector(sel));return [sel,{size:s.fontSize,weight:s.fontWeight,fill:s.fill}]}))));
 const results=[];
 for(const theme of ['light','dark']){
  await p.evaluate(t=>{applyTheme(t);render()},theme);
  for(const zoom of [12,6,3,1,.5,.333,.1,.033]){
   const result=await p.evaluate(z=>{
    setZoom(z);
    const svg=document.querySelector('#timeline-svg');
    const boxes=[...svg.querySelectorAll('.event-label,.period-label')].map(n=>({title:n.textContent,b:n.getBBox()}));
    let collisions=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
     const a=boxes[i].b,b=boxes[j].b;
     if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)collisions.push([boxes[i].title,boxes[j].title]);
    }
    const clipped=boxes.filter(({b})=>b.x<0||b.x+b.width>Number(svg.getAttribute('width')));
    const root=getComputedStyle(document.documentElement),cream=root.getPropertyValue('--cream').trim(),white=root.getPropertyValue('--white').trim(),text=root.getPropertyValue('--clay-black').trim(),muted=root.getPropertyValue('--warm-silver').trim();
    const tagFailures=State.data.colorTags.filter(t=>contrastRatio(readableTagTextColor(t.color),cream)<4.5);
    return {zoom:z,labels:boxes.length,collisions,clipped:clipped.length,contrast:{title:contrastRatio(text,cream),canvas:contrastRatio(text,white),muted:Math.min(contrastRatio(muted,cream),contrastRatio(muted,white))},tagFailures:tagFailures.length,layers:[...svg.children].map(n=>n.getAttribute('class')).filter(Boolean)};
   },zoom);
   assert.equal(result.labels,data.events.length+data.periods.length);
   assert.ok(result.layers.indexOf('flows') < result.layers.indexOf('periods'));
   assert.ok(result.layers.indexOf('periods') < result.layers.indexOf('events'));
   results.push({theme,...result});
  }
  await p.evaluate(()=>{setZoom(6);document.querySelector('#timeline-scroll').scrollLeft=xFromYear(1933,getPxPerMonth())-50});
  await p.screenshot({path:`${output}/${theme}-1933.png`});
 }
 await p.locator('#legend-search').fill('독일');console.log('search count',await p.locator('.legend li').count());await p.locator('#legend-search').fill('');
 await p.evaluate(()=>{setZoom(6);openEventDetail(State.data.events[0])});console.log('modal',await p.locator('.modal-backdrop').evaluate(n=>({blur:getComputedStyle(n).backdropFilter,dim:getComputedStyle(n).backgroundColor})));await p.screenshot({path:`${output}/modal.png`});await p.evaluate(()=>closeModal());
 await p.setViewportSize({width:390,height:844});
 const mobile = await p.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,sidebar:getComputedStyle(document.querySelector('#legend')).display,header:document.querySelector('.toolbar').getBoundingClientRect().height}));
 assert.equal(mobile.width,390); assert.equal(mobile.sidebar,'none'); assert.ok(mobile.header<140);
 await p.locator('#btn-list').click();assert.equal(await p.locator('#legend').isVisible(),true);await p.locator('#legend-close').click();
 await p.screenshot({path:`${output}/mobile.png`});
 await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>{applyTheme('light');setZoom(6)});
 const download= p.waitForEvent('download');await p.locator('#btn-export').click();const d=await download;await d.saveAs(`${output}/export.png`);
 fs.writeFileSync(`${output}/results.json`,JSON.stringify({results,errors},null,2));
 console.log(`${results.length} theme/zoom combinations checked; artifacts: ${output}`);
 await b.close();
 server.close();
 if(results.some(r=>r.collisions.length||r.clipped||r.tagFailures||Math.min(...Object.values(r.contrast))<4.5)||errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);await activeBrowser?.close();server.close();process.exitCode=1});
