/**
 * Headless E2E for the business-accounts thin slice.
 * The real portal.js runs unmodified; only the supabase-js CDN request is
 * intercepted and replaced with an in-memory mock that mirrors the server
 * functions + RLS (already verified separately against the live DB via MCP).
 * This exercises the FRONT-END wiring: rendering, event binding, re-render flow.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8199';
const OWNER = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@e2e.test' };
const STAFF = { id: '00000000-0000-4000-8000-000000000002', email: 'staff@e2e.test' };

// The mock supabase-js served in place of the CDN script.
const MOCK = `
(function(){
  function load(){ try{return JSON.parse(localStorage.getItem('mockdb'))||null}catch(e){return null} }
  function save(db){ localStorage.setItem('mockdb', JSON.stringify(db)); }
  function seedIfEmpty(){
    if(load()) return;
    save({ lp_businesses:[], lp_business_members:[], lp_posts:[], lp_post_revisions:[],
           lp_staff_roles:[{user_id:'${STAFF.id}',role:'admin'}], lp_audit_events:[] });
  }
  seedIfEmpty();
  function uid(){ return localStorage.getItem('mockuid')||null; }
  function isStaff(u){ const db=load(); const r=(db.lp_staff_roles||[]).find(x=>x.user_id===u); return r?r.role:null; }
  function isMember(bid,u){ const db=load(); return !!(db.lp_business_members||[]).find(x=>x.business_id===bid&&x.user_id===u); }
  function table(name){
    let filters=[], ordering=null;
    const runner=()=>{ const db=load(); let out=(db[name]||[]).filter(r=>filters.every(f=>f(r))); if(ordering){out=out.slice().sort((a,b)=>((a[ordering.c]>b[ordering.c])?1:(a[ordering.c]<b[ordering.c]?-1:0))*(ordering.asc?1:-1));} return out; };
    const b={
      select(){return b;},
      eq(c,v){filters.push(r=>r[c]===v);return b;},
      in(c,v){filters.push(r=>v.includes(r[c]));return b;},
      order(c,o){ordering={c,asc:o?o.ascending!==false:true};return b;},
      insert(obj){ const db=load(); const arr=Array.isArray(obj)?obj:[obj]; const me=uid();
        for(const o of arr){
          // mirror lp_post_insert RLS
          if(name==='lp_posts'){
            if(!isMember(o.business_id,me)) return Promise.resolve({data:null,error:{message:'RLS: not a member'}});
            o.publish_status=o.publish_status||'draft'; o.moderation_status='unreviewed';
          }
          o.id=o.id||crypto.randomUUID(); o.created_at=new Date().toISOString(); (db[name]=db[name]||[]).push(o);
        }
        save(db); return Promise.resolve({data:arr,error:null});
      },
      then(res,rej){ try{res({data:runner(),error:null});}catch(e){res({data:null,error:{message:e.message}});} }
    };
    return b;
  }
  function rpc(fn,args){
    const db=load(), me=uid();
    try{
      if(fn==='lp_is_staff'){ return Promise.resolve({data:isStaff(args.uid||me),error:null}); }
      if(fn==='lp_create_business'){
        if(!me) throw new Error('sign in required');
        const biz={id:crypto.randomUUID(),name:args.p_name,category:args.p_category,city:args.p_city,county:args.p_county||'la',created_by:me,status:'published',created_at:new Date().toISOString()};
        db.lp_businesses.push(biz);
        db.lp_business_members.push({id:crypto.randomUUID(),business_id:biz.id,user_id:me,role:'owner',status:'active'});
        db.lp_audit_events.push({action:'create_business',entity_id:biz.id,actor_user_id:me});
        save(db); return Promise.resolve({data:biz,error:null});
      }
      const post=db.lp_posts.find(p=>p.id===args.p_post_id);
      if(fn==='lp_submit_post'){
        if(!post) throw new Error('post not found');
        if(!isMember(post.business_id,me)) throw new Error('not authorized');
        if(post.publish_status!=='draft') throw new Error('only drafts can be submitted');
        post.publish_status='pending'; post.submitted_at=new Date().toISOString();
        db.lp_audit_events.push({action:'submit_post',entity_id:post.id,actor_user_id:me}); save(db);
        return Promise.resolve({data:post,error:null});
      }
      if(fn==='lp_approve_post'){
        if(!isStaff(me)) throw new Error('staff only');
        if(!post) throw new Error('post not found');
        post.publish_status='published'; post.moderation_status='approved'; post.published_at=new Date().toISOString();
        db.lp_audit_events.push({action:'approve_post',entity_id:post.id,actor_user_id:me}); save(db);
        return Promise.resolve({data:post,error:null});
      }
      if(fn==='lp_reject_post'){ if(!isStaff(me)) throw new Error('staff only'); if(!args.p_reason) throw new Error('reason required'); post.publish_status='removed'; post.moderation_status='rejected'; save(db); return Promise.resolve({data:post,error:null}); }
      if(fn==='lp_request_changes'){ if(!isStaff(me)) throw new Error('staff only'); if(!args.p_reason) throw new Error('reason required'); post.publish_status='draft'; save(db); return Promise.resolve({data:post,error:null}); }
      throw new Error('unknown rpc '+fn);
    }catch(e){ return Promise.resolve({data:null,error:{message:e.message}}); }
  }
  const auth={
    async getUser(){ const id=uid(); if(!id) return {data:{user:null}}; return {data:{user:{id, email:localStorage.getItem('mockemail')}}}; },
    async signOut(){ localStorage.removeItem('mockuid'); return {error:null}; },
    async signInWithPassword(){ return {data:{session:{}},error:null}; },
    async signUp(){ return {data:{session:{}},error:null}; }
  };
  window.supabase={ createClient(){ return { from:table, rpc, auth }; } };
})();
`;

function log(ok, msg){ console.log((ok?'PASS  ':'FAIL  ')+msg); if(!ok) process.exitCode=1; }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
// Intercept the supabase-js CDN and serve our mock instead.
await ctx.route('**/@supabase/supabase-js**', route => route.fulfill({ status:200, contentType:'application/javascript', body: MOCK }));

const page = await ctx.newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));

// ---- Scenario A: business owner ----
await page.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); }, [OWNER.id, OWNER.email]);
await page.goto(BASE+'/dashboard.html');
await page.waitForTimeout(600);

let emptyTxt = await page.textContent('#dashBody').catch(()=>'');
log(/no businesses yet/i.test(emptyTxt), 'A1 owner with no businesses sees empty state');

await page.fill('#nb_name','Sunrise Plumbing');
await page.selectOption('#nb_county','oc').catch(()=>{});
await page.click('#nb_go');
await page.waitForTimeout(400);
let afterBiz = await page.textContent('#dashBody');
log(/Sunrise Plumbing/.test(afterBiz), 'A2 create-business renders the business card');

// open new-post details and create a draft
await page.click('.newpost > summary');
await page.fill('.np_title','20% off first drain cleaning');
await page.fill('.np_summary','New customer intro offer');
await page.click('.createpost');
await page.waitForTimeout(400);
let afterDraft = await page.textContent('#dashBody');
log(/20% off first drain cleaning/.test(afterDraft) && /Draft/.test(afterDraft), 'A3 save-draft renders the post as Draft');
log(/Submit for review/.test(afterDraft), 'A4 draft shows a Submit button');

// submit for review
await page.click('.submitpost');
await page.waitForTimeout(400);
let afterSubmit = await page.textContent('#dashBody');
log(/Pending review/.test(afterSubmit), 'A5 submit flips the post to Pending review');
log(!/Submit for review/.test(afterSubmit), 'A6 submitted post no longer offers Submit');

// ---- Scenario B: staff moderator (same origin, shared mockdb) ----
const page2 = await ctx.newPage();
const errors2=[]; page2.on('pageerror', e=>errors2.push(e.message));
await page2.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); }, [STAFF.id, STAFF.email]);
await page2.goto(BASE+'/moderate.html');
await page2.waitForTimeout(600);
let queue = await page2.textContent('#modBody');
log(/20% off first drain cleaning/.test(queue), 'B1 staff sees the pending post in the queue');
log(/Sunrise Plumbing/.test(queue), 'B2 queue shows the owning business name');

await page2.click('.approve');
await page2.waitForTimeout(400);
let afterApprove = await page2.textContent('#modBody');
log(/Nothing waiting for review/i.test(afterApprove), 'B3 after approve the queue is empty');

// verify final DB state via the mock store
const finalPost = await page2.evaluate(()=>{ const db=JSON.parse(localStorage.getItem('mockdb')); return db.lp_posts[0]; });
log(finalPost && finalPost.publish_status==='published' && finalPost.moderation_status==='approved', 'B4 post is published + approved in the store');

// non-staff guard: an owner visiting /moderate must be refused
const page3 = await ctx.newPage();
await page3.addInitScript(([id,email])=>{ localStorage.setItem('mockuid',id); localStorage.setItem('mockemail',email); }, [OWNER.id, OWNER.email]);
await page3.goto(BASE+'/moderate.html');
await page3.waitForTimeout(500);
let guardTxt = await page3.textContent('#modBody');
log(/not a moderator/i.test(guardTxt), 'B5 non-staff owner is refused at the moderation queue');

log(errors.length===0, 'C1 dashboard raised no uncaught JS errors'+(errors.length?': '+errors.join('; '):''));
log(errors2.length===0, 'C2 moderate raised no uncaught JS errors'+(errors2.length?': '+errors2.join('; '):''));

await browser.close();
console.log(process.exitCode?'\nRESULT: FAILURES ABOVE':'\nRESULT: ALL PASS');
