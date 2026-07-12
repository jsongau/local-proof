/** Mobile overflow check: no page should scroll horizontally at 390px. */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const BASE='http://localhost:8199';
const W=390, H=844;
const PAGES=['index.html','housing.html','jobs.html','businesses.html','marketplace.html','community.html','article.html','business.html','talent.html','food.html','dashboard.html'];

function log(ok,msg){ console.log((ok?'PASS  ':'FAIL  ')+msg); if(!ok) process.exitCode=1; }
const browser=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx=await browser.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:2, isMobile:true });
const page=await ctx.newPage();
for(const p of PAGES){
  await page.goto(BASE+'/'+p);
  await page.waitForTimeout(350);
  const m=await page.evaluate(()=>{
    const de=document.documentElement;
    // find the widest offending element, if any
    let worst=null,ww=0;
    document.querySelectorAll('body *').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.right>ww){ww=r.right;worst=el.className||el.tagName;}
    });
    return {scrollW:de.scrollWidth, clientW:de.clientWidth, worst, ww:Math.round(ww)};
  });
  const overflow=m.scrollW - m.clientW;
  log(overflow<=1, `${p} no horizontal overflow (scrollW ${m.scrollW} vs ${m.clientW}${overflow>1?' | widest: '+m.worst+' @'+m.ww:''})`);
}
await browser.close();
console.log(process.exitCode?'\nRESULT: OVERFLOW FOUND':'\nRESULT: ALL LOCKED');
