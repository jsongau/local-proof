/**
 * Headless E2E for the OC live-news vertical.
 *  - Public OC news hub + article: portal.js uses raw fetch() to PostgREST,
 *    which we intercept and serve canned rows.
 *  - Newsroom (staff): uses the supabase-js client, which we replace with an
 *    in-memory mock (now supports select/insert/update/delete).
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8199';
const STAFF = { id: '00000000-0000-4000-8000-000000000002', email: 'staff@e2e.test' };
const OWNER = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@e2e.test' };

const NEWS = [
  { id:'11111111-1111-4111-8111-111111111111', title:'OC cities are overspending', dek:'Structural deficits countywide.', category:'Government', county:'oc', source_name:'Voice of OC', source_url:'https://voiceofoc.org/budget', author:'LocalProof', published_at:'2026-07-09T15:00:00Z', body:'First paragraph about the budget.\n\nSecond paragraph with detail.' },
  { id:'22222222-2222-4222-8222-222222222222', title:'Santa Ana sales-tax vote in November', dek:'Temporary tax may become permanent.', category:'Government', county:'oc', source_name:'Voice of OC', source_url:'https://voiceofoc.org/tax', author:'LocalProof', published_at:'2026-07-08T15:00:00Z', body:'Tax story body.' },
  { id:'33333333-3333-4333-8333-333333333333', title:'OC police expand surveillance', dek:'Drones and cameras grow.', category:'Public Safety', county:'oc', source_name:'Voice of OC', source_url:'https://voiceofoc.org/surveil', author:'LocalProof', published_at:'2026-07-07T15:00:00Z', body:'Surveillance story body.' },
];

const MOCK = `
(function(){
  function load(){try{return JSON.parse(localStorage.getItem('mockdb'))||null}catch(e){return null}}
  function save(db){localStorage.setItem('mockdb',JSON.stringify(db));}
  if(!load()) save({lp_news:[], lp_staff_roles:[{user_id:'${STAFF.id}',role:'admin'}]});
  function uid(){return localStorage.getItem('mockuid')||null;}
  function isStaff(u){const db=load();const r=(db.lp_staff_roles||[]).find(x=>x.user_id===u);return r?r.role:null;}
  function table(name){
    let filters=[],ordering=null,mode='select',payload=null;
    const exec=()=>{ const db=load();
      if(mode==='insert'){const arr=Array.isArray(payload)?payload:[payload];for(const o of arr){o.id=o.id||crypto.randomUUID();o.created_at=o.created_at||new Date().toISOString();(db[name]=db[name]||[]).push(o);}save(db);return{data:arr,error:null};}
      let rows=(db[name]||[]).filter(r=>filters.every(f=>f(r)));
      if(mode==='update'){rows.forEach(r=>Object.assign(r,payload));save(db);return{data:rows,error:null};}
      if(mode==='delete'){db[name]=(db[name]||[]).filter(r=>!filters.every(f=>f(r)));save(db);return{data:null,error:null};}
      if(ordering)rows=rows.slice().sort((a,b)=>((a[ordering.c]>b[ordering.c])?1:(a[ordering.c]<b[ordering.c]?-1:0))*(ordering.asc?1:-1));
      return{data:rows,error:null};
    };
    const b={ select(){mode='select';return b;}, insert(o){mode='insert';payload=o;return b;},
      update(o){mode='update';payload=o;return b;}, delete(){mode='delete';return b;},
      eq(c,v){filters.push(r=>r[c]===v);return b;}, in(c,v){filters.push(r=>v.includes(r[c]));return b;},
      order(c,o){ordering={c,asc:o?o.ascending!==false:true};return b;},
      then(res){try{res(exec());}catch(e){res({data:null,error:{message:e.message}});}} };
    return b;
  }
  function rpc(fn,args){ if(fn==='lp_is_staff')return Promise.resolve({data:isStaff(args.uid||uid()),error:null}); return Promise.resolve({data:null,error:{message:'unknown rpc'}}); }
  const auth={ async getUser(){const id=uid();return {data:{user:id?{id,email:localStorage.getItem('mockemail')}:null}};}, async signOut(){localStorage.removeItem('mockuid');return{error:null};} };
  window.supabase={createClient(){return {from:table,rpc,auth};}};
})();
`;

function log(ok,msg){ console.log((ok?'PASS  ':'FAIL  ')+msg); if(!ok) process.exitCode=1; }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
await ctx.route('**/@supabase/supabase-js**', r => r.fulfill({ status:200, contentType:'application/javascript', body:MOCK }));
// PostgREST interception for the public hub + article (raw fetch)
await ctx.route('**/rest/v1/lp_news**', route => {
  const url = route.request().url();
  const idm = url.match(/id=eq\.([0-9a-fA-F-]+)/);
  if (idm) { const one = NEWS.find(n=>n.id===idm[1]); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(one?[one]:[])}); }
  let list = NEWS.slice();
  const cm = url.match(/category=eq\.([^&]+)/);
  if (cm) { const cat = decodeURIComponent(cm[1]); list = list.filter(n=>n.category===cat); }
  list.sort((a,b)=> a.published_at<b.published_at?1:-1);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(list)});
});

// ---- N1: public OC news hub ----
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.addInitScript(()=>localStorage.setItem('lp_county','oc'));
await page.goto(BASE+'/news.html'); await page.waitForTimeout(600);
let hub = await page.textContent('#nMain');
log(/OC cities are overspending/.test(hub), 'N1 hub shows the newest story as lead');
log(/OC police expand surveillance/.test(hub), 'N1 hub lists the other stories');
let sub = await page.textContent('#nSub');
log(/Newest/.test(sub) && /Government/.test(sub) && /Public Safety/.test(sub), 'N1 category filter bar is built from the data');
let head = await page.textContent('#lp-main');
log(/Orange County News/.test(head), 'N1 page uses the OC live headline');

// ---- N2: category filter ----
await page.goto(BASE+'/news.html?cat=Public%20Safety'); await page.waitForTimeout(500);
let filtered = await page.textContent('#nMain');
log(/OC police expand surveillance/.test(filtered) && !/overspending/.test(filtered), 'N2 category filter narrows to Public Safety only');

// ---- N3: OC live article ----
await page.goto(BASE+'/article.html?src=oc&id=11111111-1111-4111-8111-111111111111'); await page.waitForTimeout(600);
let art = await page.textContent('#aWrap');
log(/OC cities are overspending/.test(art), 'N3 article renders the live headline');
log(/First paragraph about the budget/.test(art), 'N3 article renders the body');
const srcHref = await page.getAttribute('#aWrap a[href="https://voiceofoc.org/budget"]','href').catch(()=>null);
log(srcHref==='https://voiceofoc.org/budget', 'N3 article cites the source link');

// ---- N4: Newsroom (staff) create + publish + unpublish + delete ----
const p2 = await ctx.newPage();
const errs2=[]; p2.on('pageerror',e=>errs2.push(e.message));
await p2.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); localStorage.setItem('lp_county','oc'); }, [STAFF.id,STAFF.email]);
await p2.goto(BASE+'/newsroom.html'); await p2.waitForTimeout(500);
let nr = await p2.textContent('#nrBody');
log(/Write a story/.test(nr), 'N4 staff sees the write form');
await p2.fill('#nr_title','Test story from newsroom');
await p2.fill('#nr_dek','a dek');
await p2.fill('#nr_body','Body para.');
await p2.click('#nr_publish'); await p2.waitForTimeout(400);
let afterPub = await p2.textContent('#nrBody');
log(/Test story from newsroom/.test(afterPub) && /Live/.test(afterPub), 'N4 publish adds a Live story to the list');
// unpublish
await p2.click('.nr-unpub'); await p2.waitForTimeout(400);
let afterUnpub = await p2.textContent('#nrBody');
log(/draft/.test(afterUnpub), 'N4 unpublish flips it to draft');
// delete
await p2.click('.nr-del'); await p2.waitForTimeout(400);
let afterDel = await p2.textContent('#nrBody');
log(/No stories yet/.test(afterDel), 'N4 delete removes the story');

// ---- N5: non-staff refused ----
const p3 = await ctx.newPage();
await p3.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); }, [OWNER.id,OWNER.email]);
await p3.goto(BASE+'/newsroom.html'); await p3.waitForTimeout(500);
let guard = await p3.textContent('#nrBody');
log(/not staff/i.test(guard), 'N5 non-staff user is refused at the newsroom');

log(errs.length===0, 'C1 news pages raised no JS errors'+(errs.length?': '+errs.join('; '):''));
log(errs2.length===0, 'C2 newsroom raised no JS errors'+(errs2.length?': '+errs2.join('; '):''));

await browser.close();
console.log(process.exitCode?'\nRESULT: FAILURES ABOVE':'\nRESULT: ALL PASS');
