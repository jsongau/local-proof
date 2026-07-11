/**
 * Headless E2E for the OC live business directory.
 *  - Hub + profile use raw fetch() to PostgREST (intercepted, canned rows).
 *  - The claim funnel uses the supabase-js client (mocked): auth check + insert.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const BASE='http://localhost:8199';
const OWNER={ id:'00000000-0000-4000-8000-000000000001', email:'owner@e2e.test' };

const BIZ=[
 { id:'aaa11111-1111-4111-8111-111111111111', name:'Fullerton Smile Dentistry', category:'Dentist', city:'Fullerton', county:'oc', address:'1321 N Harbor Blvd', phone:'(714) 526-4867', website:null, postal_code:'92835', source_name:'North Orange County Chamber', source_url:'https://business.nocchamber.com/x', is_claimed:false, verification_status:'unverified', rating:4.7, review_count:213, google_place_id:'ChIJtest123', google_maps_uri:'https://maps.google.com/?cid=123' },
 { id:'bbb22222-2222-4222-8222-222222222222', name:'Carbon Health', category:'Urgent Care / Medical Clinic', city:'Irvine', county:'oc', address:'14443 Culver Drive', phone:'(310) 848-8259', website:null, postal_code:'92604', source_name:'Greater Irvine Chamber', source_url:'https://business.greaterirvinechamber.com/x', is_claimed:false, verification_status:'unverified' },
 { id:'ccc33333-3333-4333-8333-333333333333', name:'Irvine Lock & Key', category:'Locksmith', city:'Irvine', county:'oc', address:'16585 Von Karman', phone:'(949) 476-1077', website:null, postal_code:'92606', source_name:'Greater Irvine Chamber', source_url:'https://business.greaterirvinechamber.com/y', is_claimed:false, verification_status:'unverified' },
];

const MOCK=`
(function(){
 function load(){try{return JSON.parse(localStorage.getItem('mockdb'))||null}catch(e){return null}}
 function save(db){localStorage.setItem('mockdb',JSON.stringify(db));}
 if(!load()) save({lp_business_claims:[]});
 function uid(){return localStorage.getItem('mockuid')||null;}
 function table(name){ let filters=[],mode='select',payload=null;
  const exec=()=>{const db=load();
   if(mode==='insert'){const arr=Array.isArray(payload)?payload:[payload];for(const o of arr){o.id=o.id||crypto.randomUUID();(db[name]=db[name]||[]).push(o);}save(db);return{data:arr,error:null};}
   let rows=(db[name]||[]).filter(r=>filters.every(f=>f(r)));return{data:rows,error:null};};
  const b={select(){return b;},insert(o){mode='insert';payload=o;return b;},eq(c,v){filters.push(r=>r[c]===v);return b;},in(c,v){filters.push(r=>v.includes(r[c]));return b;},order(){return b;},then(res){try{res(exec());}catch(e){res({data:null,error:{message:e.message}});}}};
  return b; }
 function rpc(){return Promise.resolve({data:null,error:null});}
 const auth={async getUser(){const id=uid();return {data:{user:id?{id,email:localStorage.getItem('mockemail')}:null}};},async signOut(){localStorage.removeItem('mockuid');return{error:null};}};
 window.supabase={createClient(){return {from:table,rpc,auth};}};
})();
`;

function log(ok,msg){ console.log((ok?'PASS  ':'FAIL  ')+msg); if(!ok) process.exitCode=1; }

const browser=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx=await browser.newContext();
await ctx.route('**/@supabase/supabase-js**', r=>r.fulfill({status:200,contentType:'application/javascript',body:MOCK}));
await ctx.route('**/rest/v1/lp_businesses**', route=>{
 const url=route.request().url();
 const idm=url.match(/id=eq\.([0-9a-fA-F-]+)/);
 if(idm){const one=BIZ.find(b=>b.id===idm[1]);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(one?[one]:[])});}
 const cm=url.match(/city=eq\.([^&]+)/); let list=BIZ.slice();
 if(cm){const city=decodeURIComponent(cm[1]);list=list.filter(b=>b.city===city);}
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(list)});
});

// ---- BZ1: OC directory hub ----
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.addInitScript(()=>localStorage.setItem('lp_county','oc'));
await page.goto(BASE+'/businesses.html'); await page.waitForTimeout(600);
let hub=await page.textContent('#bMain');
log(/Fullerton Smile Dentistry/.test(hub)&&/Carbon Health/.test(hub)&&/Irvine Lock/.test(hub), 'BZ1 hub lists all OC businesses');
let head=await page.textContent('#lp-main');
log(/Orange County Businesses/.test(head), 'BZ1 uses the OC directory heading');
let sub=await page.textContent('#bSub');
log(/All OC/.test(sub)&&/Fullerton/.test(sub)&&/Irvine/.test(sub), 'BZ1 city filter chips built from data');
log(/Community-listed/.test(hub)&&/Unclaimed/.test(hub), 'BZ1 cards show community-listed / unclaimed badges');
log(/213 reviews/.test(hub)&&/Rating via/.test(hub), 'BZ1 enriched card shows Google rating + attribution');
const gLink=await page.getAttribute('#bMain a[href="https://maps.google.com/?cid=123"]','href').catch(()=>null);
log(gLink==='https://maps.google.com/?cid=123', 'BZ1 rating links to Google Maps (attribution)');

// ---- BZ2: city filter ----
await page.goto(BASE+'/businesses.html?city=Irvine'); await page.waitForTimeout(500);
let irv=await page.textContent('#bMain');
log(/Carbon Health/.test(irv)&&!/Fullerton Smile/.test(irv), 'BZ2 city filter shows only Irvine');

// ---- BZ3: keyword search ----
await page.goto(BASE+'/businesses.html'); await page.waitForTimeout(500);
await page.fill('#bq','locksmith'); await page.click('#bgo'); await page.waitForTimeout(300);
let kw=await page.textContent('#bMain');
log(/Irvine Lock/.test(kw)&&!/Carbon Health/.test(kw), 'BZ3 keyword search matches category');

// ---- BZ4: profile page + claim requires sign-in ----
await page.goto(BASE+'/business.html?src=oc&id=aaa11111-1111-4111-8111-111111111111'); await page.waitForTimeout(600);
let prof=await page.textContent('#bpWrap');
log(/Fullerton Smile Dentistry/.test(prof), 'BZ4 profile renders the business');
log(/1321 N Harbor Blvd/.test(prof), 'BZ4 profile shows the address spec');
log(/Own this business/.test(prof), 'BZ4 unclaimed profile shows the claim box');
const srcLink=await page.getAttribute('#bpWrap a[href="https://business.nocchamber.com/x"]','href').catch(()=>null);
log(srcLink==='https://business.nocchamber.com/x', 'BZ4 profile cites the chamber source');

// claim while signed OUT -> should not insert, should prompt sign in (no success msg)
await page.click('#cl_go'); await page.waitForTimeout(400);
let claimsAfterAnon = await page.evaluate(()=>{const db=JSON.parse(localStorage.getItem('mockdb')||'{}');return (db.lp_business_claims||[]).length;});
log(claimsAfterAnon===0, 'BZ4 signed-out claim does NOT create a claim row');

// ---- BZ5: claim while signed IN inserts a claim ----
const p2=await ctx.newPage(); const errs2=[]; p2.on('pageerror',e=>errs2.push(e.message));
await p2.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); localStorage.setItem('lp_county','oc'); }, [OWNER.id,OWNER.email]);
await p2.goto(BASE+'/business.html?src=oc&id=bbb22222-2222-4222-8222-222222222222'); await p2.waitForTimeout(600);
await p2.fill('#cl_note','I am the owner, email on domain'); await p2.click('#cl_go'); await p2.waitForTimeout(400);
let claimMsg=await p2.textContent('#bpWrap');
log(/Claim submitted/.test(claimMsg), 'BZ5 signed-in claim shows submitted confirmation');
let claimRow=await p2.evaluate(()=>{const db=JSON.parse(localStorage.getItem('mockdb'));return (db.lp_business_claims||[])[0];});
log(claimRow && claimRow.business_id==='bbb22222-2222-4222-8222-222222222222' && claimRow.user_id==='00000000-0000-4000-8000-000000000001', 'BZ5 claim row has business_id + user_id');

log(errs.length===0, 'C1 directory pages raised no JS errors'+(errs.length?': '+errs.join('; '):''));
log(errs2.length===0, 'C2 claim page raised no JS errors'+(errs2.length?': '+errs2.join('; '):''));

await browser.close();
console.log(process.exitCode?'\nRESULT: FAILURES ABOVE':'\nRESULT: ALL PASS');
