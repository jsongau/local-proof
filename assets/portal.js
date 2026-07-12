"use strict";
/* LocalProof portal — shared shell + page router. Seed data from data.js (window.LP_DATA).
   Every link resolves via R() to a real file, so nothing is a dead end. */
(function(){
const D = window.LP_DATA;
/* ---- County scope (LA / OC) ---- */
let LP_COUNTY='la'; try{LP_COUNTY=localStorage.getItem('lp_county')||'la';}catch(e){}
const COUNTY_NAME={la:'Greater Los Angeles',oc:'Orange County'};
const COUNTY_EDITION={la:'Greater Los Angeles Edition',oc:'Orange County Edition'};
const CITY_COUNTY={}; (D.cities||[]).forEach(c=>{CITY_COUNTY[c.name]=c.county||'la';});
D._full={housing:D.housing,jobs:D.jobs,marketplace:D.marketplace,providers:D.providers,community:D.community,cities:D.cities};
const _inC=x=>((x&&x.county)||CITY_COUNTY[x&&x.city]||'la')===LP_COUNTY;
D.housing=D._full.housing.filter(_inC);
D.jobs=D._full.jobs.filter(_inC);
D.marketplace=D._full.marketplace.filter(_inC);
D.providers=D._full.providers.filter(_inC);
D.community=D._full.community.filter(_inC);
D.cities=D._full.cities.filter(c=>(c.county||'la')===LP_COUNTY);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const P = new URLSearchParams(location.search);
const byId = (arr,id) => (arr||[]).find(x=>x.id===id);
const userByName = (u) => (D.users||[]).find(x=>x.username===u||x.id===u);
function stars(r){r=Math.round(r||0);let s='';for(let i=1;i<=5;i++)s+='<span style="color:'+(i<=r?'#b9770a':'#d5d9e0')+'">★</span>';return '<span class="stars" aria-label="'+r+' out of 5">'+s+'</span>';}
function reviewSnippet(rv,showProvider){
  return '<div class="review" itemscope itemtype="https://schema.org/Review">'+
   '<div class="rv-top"><a class="rv-author" href="user.html?u='+encodeURIComponent(rv.author)+'" itemprop="author">'+esc(rv.author)+'</a>'+
   (rv.verified?'<span class="rv-verified">'+svgCheck()+'Transaction confirmed</span>':'<span class="rv-comm">Community review</span>')+
   '<span class="rv-date" itemprop="datePublished">'+esc(rv.date)+'</span></div>'+
   '<div class="rv-stars" itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating"><meta itemprop="ratingValue" content="'+rv.rating+'"><meta itemprop="bestRating" content="5">'+stars(rv.rating)+'</div>'+
   (showProvider?'<div class="rv-prov"><a href="business.html?id='+rv.provider+'">'+esc(rv.provider_name)+'</a></div>':'')+
   '<p class="rv-body" itemprop="reviewBody">'+esc(rv.body)+'</p></div>';
}
function svgCheck(){return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true" style="vertical-align:-1px"><path d="M20 6 9 17l-5-5"/></svg>';}
function injectLd(obj){try{const s=document.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify(obj);document.head.appendChild(s);}catch(e){}}
function reviewsFor(pid){return (D.reviews||[]).filter(r=>r.provider===pid);}
function ratingBit(p){return (p.rating==null)?'<span style="color:var(--muted)">Not yet rated</span>':(stars(p.rating)+' '+p.rating.toFixed(1)+' · '+p.reviews+' reviews');}
function sourceLine(p){if(!p||!p.source||p.source==='LocalProof seed')return '';const url=p.source_url||'#';return '<div class="src-cite">Source: <a href="'+esc(url)+'" target="_blank" rel="noopener nofollow">'+esc(p.source)+'</a>'+(p.license?' · '+esc(p.license):'')+(p.sample?' (sample)':'')+'</div>';}
function claimCta(p){return p&&p.claimed===false?'<a class="adcta-sm" href="'+R('/business/claim')+'">Claim this business</a>':'';}

/* ---- Supabase (CoverCapy dentists, live read via publishable key) ---- */
const SUPA={url:'https://hfvbeqlefwwjlrbyxpbj.supabase.co',key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdmJlcWxlZnd3amxyYnl4cGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTk1NzQsImV4cCI6MjA5NTIzNTU3NH0.AIP9Y5rQ4Ey5gbvxZT5jEVfCL7mxEAJX0KfX50JWmDQ'};
const CC_BASE='https://covercapy.com'; // base for dentist profile_url (confirm domain)
async function fetchDentists(county,limit){
  const area=county==='oc'?'Orange County':'Los Angeles County';
  const cols='name,practice_name,city,neighborhood,rating_display,aggregate_rating,aggregate_review_count,specialties,open_weekends,accepting_new_patients,website,profile_url,slug,is_featured';
  const u=SUPA.url+'/rest/v1/dentists?select='+cols+'&market_area=eq.'+encodeURIComponent(area)+'&name=not.is.null&aggregate_rating=not.is.null&order=aggregate_review_count.desc.nullslast&limit='+(limit||24);
  const r=await fetch(u,{headers:{apikey:SUPA.key,Authorization:'Bearer '+SUPA.key}});
  if(!r.ok) throw new Error('supabase '+r.status);
  return r.json();
}
function dentistProfileUrl(d){return d.profile_url?(CC_BASE+d.profile_url):CC_BASE;}

/* ---- Supabase Auth + business-accounts client (lazy-loaded supabase-js UMD) ---- */
let _sb=null,_sbP=null;
function _loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=ok;s.onerror=()=>no(new Error('Could not load '+src));document.head.appendChild(s);});}
async function sbClient(){
 if(_sb)return _sb;
 if(!_sbP)_sbP=_loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
 await _sbP;
 _sb=window.supabase.createClient(SUPA.url,SUPA.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'lp-auth'}});
 return _sb;
}
async function currentUser(){try{const sb=await sbClient();const{data}=await sb.auth.getUser();return data.user||null;}catch(e){return null;}}
window.sbClient=sbClient;

/* ---- Live news (OC edition reads lp_news via REST; LA stays seed) ---- */
async function fetchNews(county,opts){
 opts=opts||{};
 let u=SUPA.url+'/rest/v1/lp_news?select=id,title,slug,dek,category,county,source_name,source_url,author,published_at&status=eq.published&county=eq.'+encodeURIComponent(county)+'&order=published_at.desc.nullslast';
 if(opts.category)u+='&category=eq.'+encodeURIComponent(opts.category);
 if(opts.limit)u+='&limit='+opts.limit;
 const r=await fetch(u,{headers:{apikey:SUPA.key,Authorization:'Bearer '+SUPA.key}});
 if(!r.ok)throw new Error('news '+r.status);
 return r.json();
}
async function fetchNewsOne(id){
 const u=SUPA.url+'/rest/v1/lp_news?select=*&id=eq.'+encodeURIComponent(id)+'&status=eq.published&limit=1';
 const r=await fetch(u,{headers:{apikey:SUPA.key,Authorization:'Bearer '+SUPA.key}});
 if(!r.ok)throw new Error('news '+r.status);
 const a=await r.json();return a[0]||null;
}
function timeAgo(iso){try{const d=new Date(iso),s=(Date.now()-d.getTime())/1000;if(s<3600)return Math.max(1,Math.round(s/60))+'m';if(s<86400)return Math.round(s/3600)+'h';return Math.round(s/86400)+'d';}catch(e){return '';}}

/* ---- Live business directory (OC reads lp_businesses; LA stays seed) ---- */
async function fetchBusinesses(county,opts){
 opts=opts||{};
 let u=SUPA.url+'/rest/v1/lp_businesses?select=id,name,slug,category,city,county,address,phone,website,source_name,source_url,is_claimed,verification_status,rating,review_count,google_place_id,google_maps_uri,business_status&county=eq.'+encodeURIComponent(county)+'&status=eq.published&order=name.asc';
 if(opts.category)u+='&category=eq.'+encodeURIComponent(opts.category);
 if(opts.city)u+='&city=eq.'+encodeURIComponent(opts.city);
 if(opts.limit)u+='&limit='+opts.limit;
 const r=await fetch(u,{headers:{apikey:SUPA.key,Authorization:'Bearer '+SUPA.key}});
 if(!r.ok)throw new Error('directory '+r.status);
 return r.json();
}
async function fetchBusinessOne(id){
 const u=SUPA.url+'/rest/v1/lp_businesses?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1';
 const r=await fetch(u,{headers:{apikey:SUPA.key,Authorization:'Bearer '+SUPA.key}});
 if(!r.ok)throw new Error('directory '+r.status);
 const a=await r.json();return a[0]||null;
}

/* ---- Zodi-style daily reading (combined Eastern + Western) ---- */
const CN_ANIMALS=['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig'];
const CN_ELEMENTS=['Metal','Metal','Water','Water','Wood','Wood','Fire','Fire','Earth','Earth'];
function chineseAnimal(y){return CN_ANIMALS[((y-4)%12+12)%12];}
function chineseElement(y){return CN_ELEMENTS[((y%10)+10)%10];}
function westernSign(m,d){const s=[['Capricorn',19],['Aquarius',18],['Pisces',20],['Aries',20],['Taurus',20],['Gemini',21],['Cancer',22],['Leo',22],['Virgo',22],['Libra',22],['Scorpio',21],['Sagittarius',21]];return d>s[m-1][1]?(m===12?'Capricorn':s[m][0]):s[m-1][0];}
const BLESSINGS=['Move gently today — the thing you have been putting off will go easier than you fear.','A small kindness you offer today returns to you within the week.','Trust the quiet instinct, not the loud worry.','What feels like a delay is protection. Let it be.','Say the honest thing kindly; it opens a door.','Rest is not idleness today — it is preparation.'];
function dailyReading(y,m,d){const an=chineseAnimal(y),el=chineseElement(y),w=westernSign(m,d);return {animal:el+' '+an,western:w,blessing:BLESSINGS[(y+m+d)%BLESSINGS.length]};}
function dailyReadingModule(){
  let yy='';for(let y=2012;y>=1940;y--)yy+='<option>'+y+'</option>';
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'].map((n,i)=>'<option value="'+(i+1)+'">'+n+'</option>').join('');
  let dd='';for(let i=1;i<=31;i++)dd+='<option>'+i+'</option>';
  return mod('Your Daily Reading',
   '<div class="dr"><div class="dr-intro">A moment for yourself. Enter your birthday to reveal your animal and today’s blessing.</div>'+
   '<div class="dr-fields"><label class="sr-only" for="dr-m">Month</label><select id="dr-m"><option value="">Month</option>'+months+'</select>'+
   '<label class="sr-only" for="dr-d">Day</label><select id="dr-d"><option value="">Day</option>'+dd+'</select>'+
   '<label class="sr-only" for="dr-y">Year</label><select id="dr-y"><option value="">Year</option>'+yy+'</select></div>'+
   '<button class="dr-go" id="dr-go">Reveal my reading</button>'+
   '<div class="dr-out" id="dr-out" hidden></div>'+
   '<div class="dr-foot">Powered by <a href="https://zodianimal.com" target="_blank" rel="noopener">Zodi Animal</a></div></div>','/readings','green');
}
function wireDailyReading(){
  const go=document.getElementById('dr-go'); if(!go) return;
  go.addEventListener('click',function(){
    const m=+document.getElementById('dr-m').value,d=+document.getElementById('dr-d').value,y=+document.getElementById('dr-y').value;
    const out=document.getElementById('dr-out');out.hidden=false;
    if(!m||!d||!y){out.innerHTML='<div class="dr-hint">Pick your month, day and year.</div>';return;}
    const r=dailyReading(y,m,d);
    out.innerHTML='<div class="dr-animal">'+esc(r.animal)+' <span>·</span> '+esc(r.western)+'</div><div class="dr-bless">“'+esc(r.blessing)+'”</div><a class="dr-cta" href="https://zodianimal.com" target="_blank" rel="noopener">Read your full reading</a>';
  });
}

/* ---------- route → file map ---------- */
const FILE = {
 '/':'index.html','/news':'news.html','/community':'community.html','/housing':'housing.html',
 '/jobs':'jobs.html','/marketplace':'marketplace.html','/businesses':'businesses.html',
 '/deals':'deals.html','/guides':'guides.html','/events':'events.html','/video':'video.html',
 '/tools':'tools.html','/search':'search.html','/post':'post.html','/signin':'signin.html',
 '/signup':'signup.html','/account':'account.html','/saved':'saved.html','/messages':'messages.html',
 '/safety':'safety.html','/about':'about.html','/contact':'about.html','/advertise':'advertise.html',
 '/business/claim':'claim.html','/business/tools':'advertise.html','/language':'about.html','/app':'about.html',
 '/request/new':'post.html?type=request','/ask':'post.html?type=question','/home':'index.html',
 '/talent':'talent.html','/food':'food.html','/members':'members.html','/user':'user.html','/dental':'dental.html','/readings':'readings.html',
 '/dashboard':'dashboard.html','/for-business':'dashboard.html','/moderate':'moderate.html','/newsroom':'newsroom.html'
};
const NAV2MAP = {
 'Rooms':'housing.html?tab=Rooms','Apartments':'housing.html?tab=Apartments','Roommates':'housing.html?tab=Roommates',
 'Hiring':'jobs.html?tab=Hiring','Job Wanted':'jobs.html?tab=Job%20wanted',
 'Restaurants':'food.html','Legal':'businesses.html?cat=Legal','Auto':'businesses.html?cat=Auto',
 'Education':'businesses.html?cat=Education','Healthcare':'businesses.html?cat=Healthcare','Moving':'businesses.html?cat=Home%20Services',
 'Home Repair':'businesses.html?cat=Home%20Services','New to LA':'guides.html'
};
function R(path){
 if(!path) return 'index.html';
 if(/^https?:|^#/.test(path)) return path;
 const [p,q] = path.split('?');
 if(FILE[p]) return FILE[p] + (q?((FILE[p].includes('?')?'&':'?')+q):'');
 if(p.startsWith('/city/')) return 'city.html?c='+encodeURIComponent(p.split('/')[2]||'greater-los-angeles');
 if(p.startsWith('/legal/')) return 'legal.html?doc='+encodeURIComponent(p.split('/')[2]||'privacy');
 if(p.startsWith('/news')) return 'news.html';
 if(p.startsWith('/housing')) return 'housing.html'+(p.split('/')[2]?('?tab='+p.split('/')[2]):'');
 if(p.startsWith('/jobs')) return 'jobs.html';
 if(p.startsWith('/services')) return 'businesses.html';
 if(p.startsWith('/providers')) return 'businesses.html';
 if(p.startsWith('/offers')) return 'deals.html';
 if(p.startsWith('/outcomes')) return 'index.html#outcomes';
 if(p.startsWith('/tools')) return 'tools.html'+(p.split('/')[2]?('?tool='+p.split('/')[2]):'');
 if(p.startsWith('/business/')) return 'advertise.html';
 if(p.startsWith('/post/')) return 'post.html?type='+p.split('/')[2];
 const seg=p.split('/')[1]||'';
 return (seg?seg+'.html':'index.html');
}
window.R = R;

/* ---------- shared shell ---------- */
function utilityHTML(){return '<div class="utility"><div class="shell">'+
 '<span class="county-toggle" role="group" aria-label="Choose county"><a href="#" data-county="la"'+(LP_COUNTY==='la'?' class="on" aria-current="true"':'')+'>LA County</a><a href="#" data-county="oc"'+(LP_COUNTY==='oc'?' class="on" aria-current="true"':'')+'>Orange County</a></span><span class="sep">|</span>'+
 '<span class="edition">'+COUNTY_EDITION[LP_COUNTY]+'</span><span class="sep">|</span>'+
 '<span class="hide-sm">Friday, July 10, 2026</span><span class="sep hide-sm">|</span><span class="hide-sm">86°F Sunny</span>'+
 '<span class="spacer"></span>'+
 '<a class="hide-sm" href="'+R('/language')+'">English</a><a class="hide-sm" href="'+R('/app')+'">Mobile App</a>'+
 '<a href="'+R('/saved')+'">Saved</a><a href="'+R('/messages')+'">Messages</a>'+
 '<a href="'+R('/signup')+'">Register</a><a href="'+R('/signin')+'">Sign in</a>'+
 '<a class="live" href="'+R('/advertise')+'">Advertise</a></div></div>';}

function mastheadHTML(){const a=D.ads[0];return '<div class="masthead"><div class="shell">'+
 '<a class="logo" href="index.html" aria-label="LocalProof home"><span class="mk">L</span>'+
 '<span><span class="wm">LocalProof</span><span class="desc">'+(LP_COUNTY==='oc'?'Orange County':'Los Angeles')+' Community &amp; Classifieds</span></span></a>'+
 '<div class="mast-ad ad-slot ad-leader" style="width:728px;max-width:100%"><span class="ad-label">Advertisement</span>'+
 '<span class="adart" style="background:'+a.c+'">'+esc(a.advertiser)+'</span>'+
 '<span class="adtxt"><b>'+esc(a.title)+'</b><p>'+esc(a.body)+'</p></span>'+
 '<a class="adcta" href="'+R('/advertise')+'">Learn more</a></div></div></div>';}

function searchHTML(){return '<div class="searchband"><form class="shell" id="lpSearch" role="search" aria-label="Search LocalProof">'+
 '<div class="keyword"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>'+
 '<label class="sr-only" for="lpq">Search LocalProof</label><input id="lpq" name="q" type="text" placeholder="Search providers, rentals, jobs, businesses, marketplace…" autocomplete="off"></div>'+
 '<label class="sr-only" for="lpcat">Category</label><select id="lpcat" aria-label="Category"><option value="">All categories</option>'+D.categories.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select>'+
 '<label class="sr-only" for="lpcity">City</label><select id="lpcity" aria-label="City"><option value="'+(LP_COUNTY==='oc'?'orange-county':'greater-los-angeles')+'">'+COUNTY_NAME[LP_COUNTY]+'</option>'+D.cities.map(c=>'<option value="'+c.slug+'">'+esc(c.name)+'</option>').join('')+'</select>'+
 '<button class="go" type="submit">Search</button>'+
 '<span class="common">Popular: <a href="'+R('/search')+'?q=plumber">plumber</a><a href="'+R('/search')+'?q=movers">movers</a><a href="'+R('/search')+'?q=rooms">rooms</a><a href="'+R('/search')+'?q=jobs">jobs</a></span>'+
 '</form></div>';}

function navHTML(active){const r1=D.nav1.map(n=>{const href=R('/'+(n==='Home'?'':n.toLowerCase().replace(/ /g,'-')));const on=(active&&active.toLowerCase()===n.toLowerCase())?' class="on" aria-current="page"':'';return '<a href="'+href+'"'+on+'>'+esc(n)+'</a>';}).join('');
 const r2=D.nav2.map(n=>'<a href="'+(NAV2MAP[n]||'index.html')+'">'+esc(n)+'</a>').join('')+
   '<a href="'+R('/dental')+'" class="nav-feat">Dental</a><a href="'+R('/readings')+'" class="nav-feat">Readings</a>';
 return '<nav class="nav" aria-label="Primary"><div class="shell r1wrap"><div class="row1">'+r1+'</div></div><div class="row2"><div class="shell">'+r2+'</div></div></nav>';}

function mQuickHTML(){return '<div class="m-quickpost" aria-label="Quick post">'+
 '<a href="'+R('/post')+'?type=rental">Post rental</a><a href="'+R('/post')+'?type=job">Post job</a>'+
 '<a class="alt" href="'+R('/post')+'?type=item">Sell item</a><a class="alt" href="'+R('/ask')+'">Ask</a>'+
 '<a class="red" href="'+R('/request/new')+'">Request quotes</a></div>';}

function footerHTML(){const cols=[
 ['Discover',[['Local News','/news'],['Community','/community'],['Members','/members'],['Readings','/readings'],['Guides','/guides'],['Video','/video'],['Newsroom (staff)','/newsroom']]],
 ['Housing & Jobs',[['Rentals','/housing'],['Rooms','/housing/Rooms'],['Jobs','/jobs'],['Job Wanted','/jobs']]],
 ['Marketplace',[['Buy & Sell','/marketplace'],['Deals','/deals'],['Local Outcomes','/outcomes'],['Verified Offers','/deals']]],
 ['Businesses',[['Directory','/businesses'],['Post your business','/dashboard'],['Dental (CoverCapy)','/dental'],['Claim a business','/business/claim'],['Advertise','/advertise']]],
 ['Safety',[['Trust & Safety','/safety'],['Report a scam','/safety'],['What badges mean','/safety']]],
 ['About',[['About LocalProof','/about'],['Privacy','/legal/privacy'],['Terms','/legal/terms'],['Contact','/contact']]]
 ];
 return '<footer class="footer"><div class="shell"><div class="foot-grid">'+
 cols.map(c=>'<div><h4>'+esc(c[0])+'</h4><ul>'+c[1].map(l=>'<li><a href="'+R(l[1])+'">'+esc(l[0])+'</a></li>').join('')+'</ul></div>').join('')+
 '</div><div class="foot-cities"><h4>Cities & Neighborhoods</h4><div class="clist">'+
 D.cities.map(c=>'<a href="'+R('/city/'+c.slug)+'">'+esc(c.name)+'</a>').join('')+'<a href="'+R('/city/'+(LP_COUNTY==='oc'?'orange-county':'greater-los-angeles'))+'">All of '+esc(COUNTY_NAME[LP_COUNTY])+'</a></div></div>'+
 '<div class="foot-bottom"><span>© 2026 LocalProof — Greater Los Angeles &amp; Orange County. Demonstration portal, seeded data.</span><span>Sponsored placements are labeled</span></div><div class="foot-attr">Some business listings are community-sourced from OpenStreetMap — data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener nofollow">OpenStreetMap contributors</a>, licensed under <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener nofollow">ODbL</a>.</div></div></footer>';}

/* ---------- small shared pieces ---------- */
function mod(title,body,more,variant){return '<section class="module"><div class="module-titlebar '+(variant||'')+'"><h2>'+esc(title)+'</h2>'+(more?'<a class="more" href="'+R(more)+'">More</a>':'')+'</div>'+body+'</section>';}
function adRect(a){return '<section class="ad-slot ad-rect"><span class="ad-label">Advertisement</span><div class="adart" style="background:'+a.c+'">'+esc(a.advertiser)+'</div><b>'+esc(a.title)+'</b><p>'+esc(a.body)+'</p><a class="adcta-sm" href="'+R('/advertise')+'">Learn more</a></section>';}
function mostSearched(){return mod('Most Searched','<div class="chips">'+D.most_searched.map(s=>'<a href="'+R('/search')+'?q='+encodeURIComponent(s)+'">'+esc(s)+'</a>').join('')+'</div>');}
function safetyMini(){return mod('Scam & Safety','<div class="alert"><div class="hd"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>Before you pay</div><ul>'+D.alerts.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul></div>','/safety','red');}
function crumb(items){return '<nav class="crumb" aria-label="Breadcrumb"><a href="index.html">Home</a>'+items.map(i=>'<span class="sep">›</span>'+(i[1]?'<a href="'+R(i[1])+'">'+esc(i[0])+'</a>':esc(i[0]))).join('')+'</nav>';}
function pageHead(title,sub,right){return '<div class="page-head"><div><h1>'+esc(title)+'</h1>'+(sub?'<p class="sub">'+esc(sub)+'</p>':'')+'</div>'+(right||'')+'</div>';}
function statusPill(s){const L={open:'Open',matching:'Matching',quotes_received:'Quotes received',provider_selected:'Provider selected'};return '<span class="tag-pill green">'+esc(L[s]||s)+'</span>';}

/* ---------- dense inner-page helpers ---------- */
function subnav(items){return '<div class="subnav">'+items.map(i=>'<a href="'+R(i[1])+'"'+(i[2]?' class="'+i[2]+'"':'')+'>'+esc(i[0])+'</a>').join('')+'</div>';}
function facetPanel(id,facets){return '<div class="facets" id="'+id+'">'+facets.map((f,fi)=>'<div class="frow"><span class="flabel">'+esc(f[0])+'</span><div class="fopts" data-facet="'+fi+'">'+f[1].map((o,oi)=>'<a href="#" data-v="'+esc(o)+'" class="'+(oi===0?'on any':'')+'">'+esc(o)+'</a>').join('')+'</div></div>').join('')+'</div>';}
function pager(total,cur,base){cur=cur||1;let out='';const mk=(n,cls,lbl)=>'<a href="'+base+'?page='+n+'"'+(cls?' class="'+cls+'"':'')+'>'+(lbl||n)+'</a>';
 out+= cur>1?mk(cur-1,'','‹'):'<span>‹</span>';
 const pages=new Set([1,2,3,total]);for(let i=cur-1;i<=cur+1;i++)if(i>=1&&i<=total)pages.add(i);
 const arr=[...pages].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);let last=0;
 arr.forEach(n=>{if(n-last>1)out+='<span class="dots">…</span>';out+= n===cur?'<span class="cur">'+n+'</span>':mk(n);last=n;});
 out+= cur<total?mk(cur+1,'','›'):'<span>›</span>';
 return '<div class="pager">'+out+'</div>';}
function certRow(title,list){return '<div class="certrow"><div class="ch">'+esc(title)+'</div><div class="logos">'+list.map(p=>'<div class="cl"><div class="sq" style="background:'+p.c+'">'+esc(p.name[0])+'</div><a href="business.html?id='+p.id+'">'+esc(p.name)+'</a></div>').join('')+'</div></div>';}
function talentRail(){const seed=[['Data Analyst','DA','#1d3e73'],['Warehouse Lead','WL','#b9770a'],['Bookkeeper','BK','#1c7a4a'],['Front Desk','FD','#5b4a7a'],['Line Cook','LC','#b5341f'],['Nanny','NA','#1d6f8b']];
 return mod('Job Seekers','<div class="talent">'+seed.map((t,i)=>'<div class="tp"><div class="av" style="background:'+t[2]+'">'+t[1]+'</div><b>Candidate '+String.fromCharCode(65+i)+'***</b><span>'+esc(t[0])+'</span></div>').join('')+'</div>','/jobs');}

/* ---------- PAGES ---------- */
const PAGES = {};

PAGES.home = function(m){
 const D_=D;
 const leftHTML =
  mod('Post to LocalProof','<div class="quickpost"><a href="'+R('/post')+'?type=rental">Post a rental</a><a href="'+R('/post')+'?type=job">Post a job</a><a class="alt" href="'+R('/post')+'?type=item">Sell an item</a><a class="alt" href="'+R('/ask')+'">Ask community</a><a class="wide" href="'+R('/request/new')+'">Request quotes from local providers</a></div>')+
  mod('Popular Classifieds','<ul class="classified-list">'+D_.popular.map(p=>'<li><div class="t"><a href="'+R('/marketplace')+'">'+esc(p.item)+'</a><div class="sub">'+esc(p.city)+'</div></div><div class="price">'+esc(p.price)+'<span class="age">'+esc(p.age)+'</span></div></li>').join('')+'</ul>','/marketplace')+
  mod('Housing','<ul class="classified-list">'+D_.housing.slice(0,5).map(h=>'<li><div class="t"><a href="'+R('/housing')+'">'+esc(h.title)+'</a><div class="sub">'+esc(h.city)+' · '+esc(h.beds)+'</div></div><div class="price">'+esc(h.rent)+'<span class="age">'+esc(h.age)+'</span></div></li>').join('')+'</ul>','/housing')+
  mod('Jobs','<ul class="classified-list">'+D_.jobs.slice(0,5).map(j=>'<li><div class="t"><a href="'+R('/jobs')+'">'+esc(j.role)+'</a><div class="sub">'+esc(j.company)+' · '+esc(j.city)+'</div></div><div class="price">'+esc(j.pay)+'<span class="age">'+esc(j.age)+'</span></div></li>').join('')+'</ul>','/jobs')+
  mod('Neighborhoods','<div class="directory-list">'+D_.cities.map(c=>'<a href="'+R('/city/'+c.slug)+'">'+esc(c.name)+'</a>').join('')+'</div>')+
  mod('Service Directory','<div class="directory-list">'+D_.categories.map(c=>'<a href="'+R('/businesses')+'">'+esc(c)+'</a>').join('')+'</div>','/businesses')+
  '<section class="ad-slot ad-vert"><span class="ad-label">Advertisement</span><div class="adart" style="background:'+D_.ads[1].c+'">'+esc(D_.ads[1].advertiser)+'</div><div style="padding:8px 10px"><b>'+esc(D_.ads[1].title)+'</b><p style="color:var(--muted);margin:3px 0 8px;font-size:12px">'+esc(D_.ads[1].body)+'</p><a class="adcta-sm" href="'+R('/advertise')+'">Learn more</a></div></section>';

 const L=D_.news_lead;
 const centerHTML =
  mod('Local News','<div class="lead"><div class="art">'+esc(L.art)+'</div><span class="cat">'+esc(L.cat)+'</span><h3 class="head"><a href="article.html?id='+L.id+'">'+esc(L.title)+'</a></h3><p class="dek">'+esc(L.dek)+'</p><div class="time">'+esc(L.time)+'</div></div><div class="news-grid">'+D_.news.map(n=>'<a href="article.html?id='+n.id+'"><span class="cat">'+esc(n.cat)+'</span><span class="ti">'+esc(n.title)+'</span><span class="tm">'+esc(n.time)+' ago</span></a>').join('')+'</div>','/news','red')+
  mod('Community Discussions','<ul class="classified-list">'+D_.community.slice(0,5).map(q=>'<li><div class="t"><a href="thread.html?id='+q.id+'">'+esc(q.q)+'</a><div class="sub">'+esc(q.city)+' · '+esc(q.cat)+(q.accepted?' · <span style="color:var(--green);font-weight:700">Verified answer</span>':'')+'</div></div><div class="price" style="color:var(--navy)">'+q.replies+'<span class="age">'+esc(q.age)+'</span></div></li>').join('')+'</ul>','/community')+
  mod('Latest Rentals','<ul class="classified-list">'+D_.housing.slice(0,5).map(h=>'<li><div class="t"><a href="listing.html?type=rental&id='+h.id+'">'+esc(h.title)+'</a><div class="sub">'+esc(h.city)+' · '+esc(h.beds)+'</div></div><div class="price">'+esc(h.rent)+'<span class="age">'+esc(h.age)+'</span></div></li>').join('')+'</ul>','/housing')+
  '<section class="ad-slot ad-leader" style="border-left:1px solid var(--border);border-right:1px solid var(--border)"><span class="ad-label">Advertisement</span><span class="adart" style="background:'+D_.ads[2].c+'">'+esc(D_.ads[2].advertiser)+'</span><span class="adtxt"><b>'+esc(D_.ads[2].title)+'</b><p>'+esc(D_.ads[2].body)+'</p></span><a class="adcta" href="'+R('/advertise')+'">Learn more</a></section>'+
  mod('Latest Jobs','<ul class="classified-list">'+D_.jobs.slice(0,5).map(j=>'<li><div class="t"><a href="listing.html?type=job&id='+j.id+'">'+esc(j.role)+'</a><div class="sub">'+esc(j.company)+' · '+esc(j.city)+'</div></div><div class="price">'+esc(j.pay)+'<span class="age">'+esc(j.age)+'</span></div></li>').join('')+'</ul>','/jobs')+
  '<section class="module" id="outcomes"><div class="module-titlebar green"><h3>Real Local Outcomes</h3><a class="more" href="index.html#outcomes">Compare</a></div><table class="otable"><thead><tr><th>Type</th><th>Location</th><th>Asking</th><th>Final</th><th>Date</th></tr></thead><tbody>'+D_.outcomes.map(o=>'<tr><td><span class="ttag '+o.type+'">'+o.type+'</span></td><td>'+esc(o.loc)+'</td><td class="tnum">'+esc(o.ask)+'</td><td class="fin tnum">'+esc(o.fin)+'</td><td>'+esc(o.date)+'</td></tr>').join('')+'</tbody></table><div style="padding:6px 10px;font-size:10.5px;color:var(--faint)">Seeded demo records — verified reports, not production facts.</div></section>'+
  mod('Marketplace','<ul class="classified-list">'+D_.marketplace.map(x=>'<li><div class="t"><a href="listing.html?type=item&id='+x.id+'">'+esc(x.item)+'</a><div class="sub">'+esc(x.city)+' · '+esc(x.cond)+'</div></div><div class="price">'+esc(x.price)+'<span class="age">'+esc(x.age)+'</span></div></li>').join('')+'</ul>','/marketplace')+
  mod('Business Directory','<div class="acc">'+D_.business_dir.map((d,i)=>'<details'+(i<3?' open':'')+'><summary><span>'+esc(d.cat)+'</span><span style="display:flex;align-items:center;gap:8px"><span class="cnt">'+d.items.length+' listed</span><svg class="chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span></summary><ul class="acc-body">'+d.items.map(it=>'<li><a href="'+R('/businesses')+'">'+esc(it[0])+'</a>'+(it[1]?'<span class="spon-tag">Sponsored</span>':'')+'</li>').join('')+'</ul></details>').join('')+'</div>','/businesses');

 const rightHTML =
  mod('Sign in','<div class="acct"><div class="btnrow"><a class="b signin" href="'+R('/signin')+'">Sign in</a><a class="b reg" href="'+R('/signup')+'">Register</a></div><div class="links"><a href="'+R('/saved')+'">Saved</a><a href="'+R('/messages')+'">Messages</a><a href="'+R('/account')+'">Dashboard</a><a href="'+R('/post')+'">Post</a></div></div>')+
  dailyReadingModule()+
  '<section class="module"><div class="module-titlebar"><h2>Find Your Dentist</h2><a class="more" href="'+R('/dental')+'">Open</a></div><div class="fyd"><span class="cc-tag" style="background:#e0f0f4;border-color:#bfe0e8;color:#14536b">Powered by CoverCapy</span><b>Real ratings. Fair costs.</b><p>Browse trusted dentists in '+COUNTY_NAME[LP_COUNTY]+' and see what a visit should cost.</p><a class="dr-go" href="'+R('/dental')+'" style="text-decoration:none;display:block;text-align:center">Find a dentist</a></div></section>'+
  mod('Sponsored Businesses',D_.sponsored_biz.map(b=>'<div class="business-ad"><div class="logo-sq" style="background:'+b.c+'">'+esc(b.n[0])+'</div><div><b>'+esc(b.n)+'</b><p>'+esc(b.cat)+'</p><p>'+esc(b.body)+'</p><div class="ph">'+esc(b.ph)+'</div></div></div>').join(''),null,'gold')+
  '<section class="module"><div class="module-titlebar green"><h2>Featured: Dental</h2><a class="more" href="'+R('/dental')+'">Open</a></div><div class="cc-mini"><span class="cc-tag">Powered by CoverCapy</span><b>Know what your dental visit should cost.</b><p>Find a trusted local dentist and estimate your cost before you go.</p><a class="adcta-sm" href="'+R('/dental')+'">Dental hub</a></div></section>'+'<section class="module"><div class="module-titlebar" style="border-bottom-color:#5b2a7a"><h2 style="color:#5b2a7a">Featured: Readings</h2><a class="more" href="'+R('/readings')+'">Open</a></div><div class="cc-mini"><span class="cc-tag" style="background:#efe4f5;border-color:#ddc9ea;color:#5b2a7a">Powered by Zodi Animal</span><b>Your animal, your reading, your blessing.</b><p>A moment for yourself \u2014 discover your combined zodiac and a blessing for the week.</p><a class="adcta-sm" href="'+R('/readings')+'">Get a reading</a></div></section>'+
  adRect(D_.ads[3])+
  mod('Deals & Circulars','<ul class="deal-list">'+D_.deals.map(d=>'<li><span class="dcat">'+esc(d.cat)+'</span><div><b><a href="'+R('/deals')+'" style="color:var(--ink)">'+esc(d.title)+'</a></b><div class="adv">'+esc(d.advertiser)+'</div><div class="exp">'+esc(d.exp)+'</div></div></li>').join('')+'</ul>','/deals','gold')+
  mostSearched()+
  safetyMini()+
  mod('Featured Verified Offer',(function(){const o=D_.featured_offer;return '<div class="foffer"><span class="plabel">Platform-reviewed offer</span><h4>'+esc(o.title)+'</h4><div class="prov">'+esc(o.provider)+'</div>'+o.rows.map(r=>'<div class="trow"><span class="k">'+esc(r[0])+'</span><span class="v">'+esc(r[1])+'</span></div>').join('')+'<div class="note">Reviewed for this offer only — not a guarantee of the whole provider.</div><a class="adcta-sm" href="'+R('/deals')+'" style="margin-top:8px">See offer</a></div>';})(),null,'green')+
  mod('Video','<div class="video-feat"><div class="thumb"><span class="play"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span><span class="dur">'+esc(D_.video_feat.dur)+'</span></div><h4><a href="'+R('/video')+'">'+esc(D_.video_feat.title)+'</a></h4></div><ul class="hl-list">'+D_.videos.map(v=>'<li><a href="'+R('/video')+'">'+esc(v.title)+'<div class="meta">'+esc(v.dur)+'</div></a></li>').join('')+'</ul>','/video')+
  mod('Local Events','<ul class="events">'+D_.events.map(e=>'<li><span class="date"><span class="m">'+esc(e.m)+'</span><span class="d">'+esc(e.d)+'</span></span><div><b>'+esc(e.t)+'</b><div class="ev-meta">'+esc(e.meta)+'</div></div></li>').join('')+'</ul>','/events')+
  mod('New to Los Angeles','<div class="newla">'+D_.new_to_la.map(n=>'<a href="'+R('/guides')+'">'+esc(n)+'</a></div>').join('').replace('</div>','')+'</div>');

 m.innerHTML =
  '<div class="ticker" aria-label="Local updates"><div class="shell"><span class="tag">Local Now</span><div class="items">'+D_.ticker.map((t,i)=>(i?'<span class="dot">•</span>':'')+'<span class="ti"><b>'+esc(t.t)+':</b> '+esc(t.v)+'</span>').join('')+'</div></div></div>'+
  '<div class="portal"><div class="shell"><div class="grid"><div class="portal-column left">'+leftHTML+'</div><div class="portal-column center">'+centerHTML+'</div><div class="portal-column right">'+rightHTML+'</div></div></div></div>';
};

/* generic section wrapper */
function section(m,inner){m.innerHTML='<div class="page-wrap"><div class="shell">'+inner+'</div></div>';}
function twocol(main,side){return '<div class="twocol"><div class="maincol">'+main+'</div><div class="siderail">'+side+'</div></div>';}
function sideDefault(){return adRect(D.ads[3])+mostSearched()+safetyMini();}

PAGES.news = function(m){
 if(LP_COUNTY==='oc'){ return newsLive(m); }
 const L=D.news_lead;
 const lead='<div class="lead" style="border:1px solid var(--border);background:#fff"><div class="art">'+esc(L.art)+'</div><span class="cat">'+esc(L.cat)+'</span><h3 class="head"><a href="article.html?id='+L.id+'">'+esc(L.title)+'</a></h3><p class="dek">'+esc(L.dek)+'</p><div class="time">'+esc(L.time)+'</div></div>';
 const list='<ul class="result-list" style="border:1px solid var(--border)">'+D.news.map(n=>'<li><div class="thumb">'+esc(n.cat)+'</div><div class="rmain"><h3><a href="article.html?id='+n.id+'">'+esc(n.title)+'</a></h3><div class="rmeta"><span class="tag-pill">'+esc(n.cat)+'</span><span>'+esc(n.time)+' ago</span></div></div></li>').join('')+'</ul>';
 section(m, crumb([['Local News','']]) + pageHead('Local News','Original demonstration reporting for Greater Los Angeles.') + twocol(lead+list, sideDefault()));
};

/* OC live news hub — newest first, category filter, source-cited */
function newsLive(m){
 const cat=P.get('cat')||'';
 section(m, crumb([['Local News','']]) + pageHead('Orange County News','Live local news, newest first — curated with sources.','<span id="nCount" style="font-size:12px;color:var(--muted)"></span>') +
  '<div id="nSub"></div>' + twocol('<div id="nMain"><div class="empty">Loading news…</div></div>', sideDefault()));
 const main=document.getElementById('nMain'),sub=document.getElementById('nSub'),cnt=document.getElementById('nCount');
 fetchNews('oc',{}).then(list=>{
   const cats=[...new Set(list.map(a=>a.category))];
   sub.innerHTML='<div class="subnav"><a href="news.html"'+(!cat?' class="act"':'')+'>Newest</a>'+cats.map(c=>'<a href="news.html?cat='+encodeURIComponent(c)+'"'+(cat===c?' class="act"':'')+'>'+esc(c)+'</a>').join('')+'</div>';
   const shown=cat?list.filter(a=>a.category===cat):list;
   if(!shown.length){main.innerHTML='<div class="empty">No stories'+(cat?' in '+esc(cat):'')+' yet.</div>';cnt.textContent='';return;}
   const lead=shown[0],rest=shown.slice(1);
   const src=a=>a.source_name?' · '+esc(a.source_name):'';
   const leadHTML='<div class="lead" style="border:1px solid var(--border);background:#fff"><div class="art">'+esc(lead.category)+'</div><span class="cat">'+esc(lead.category)+'</span><h3 class="head"><a href="article.html?src=oc&id='+lead.id+'">'+esc(lead.title)+'</a></h3><p class="dek">'+esc(lead.dek||'')+'</p><div class="time">'+esc(timeAgo(lead.published_at))+' ago'+src(lead)+'</div></div>';
   const listHTML=rest.length?('<ul class="result-list" style="border:1px solid var(--border)">'+rest.map(n=>'<li><div class="thumb">'+esc(n.category)+'</div><div class="rmain"><h3><a href="article.html?src=oc&id='+n.id+'">'+esc(n.title)+'</a></h3><div class="rmeta"><span class="tag-pill">'+esc(n.category)+'</span><span>'+esc(timeAgo(n.published_at))+' ago</span><span>'+src(n)+'</span></div></div></li>').join('')+'</ul>'):'';
   main.innerHTML=leadHTML+listHTML;
   cnt.textContent=shown.length+' live';
 }).catch(e=>{main.innerHTML='<div class="empty">Couldn’t load live news: '+esc(e.message)+'</div>';});
}

PAGES.article = function(m){
 if(P.get('src')==='oc'){ return articleLive(m); }
 const id=P.get('id')||'n0';
 const a = id==='n0'? D.news_lead : byId(D.news,id) || D.news_lead;
 const body=(D.article_bodies[id]||D.article_bodies['n0']).map(p=>'<p>'+esc(p)+'</p>').join('');
 const more=D.news.filter(n=>n.id!==id).slice(0,5).map(n=>'<li><a href="article.html?id='+n.id+'">'+esc(n.title)+'<div class="meta">'+esc(n.cat)+' · '+esc(n.time)+' ago</div></a></li>').join('');
 section(m, crumb([['Local News','/news'],[a.cat||'Article','']]) +
  twocol('<article class="detail article"><span class="tag-pill">'+esc(a.cat)+'</span><h1 style="margin-top:8px">'+esc(a.title)+'</h1><div class="dmeta"><span>By LocalProof staff</span><span>'+esc(a.time||'Today')+'</span></div><div class="hero">'+esc(a.art||a.cat)+'</div><div class="body">'+body+'</div><p style="font-size:11.5px;color:var(--faint);margin-top:16px">Demonstration article — original fictional content for the LocalProof prototype.</p></article>',
  mod('More local news','<ul class="hl-list">'+more+'</ul>','/news')+sideDefault()));
};

/* OC live article — reads one lp_news row, cites its source */
function articleLive(m){
 const id=P.get('id');
 section(m, crumb([['Local News','/news'],['Article','']]) + '<div id="aWrap"><div class="empty">Loading…</div></div>');
 const wrap=()=>document.getElementById('aWrap');
 fetchNewsOne(id).then(a=>{
   if(!a){wrap().innerHTML='<div class="empty">Story not found. <a href="news.html">Back to Orange County news</a>.</div>';return;}
   const body=(a.body||'').split(/\n\n+/).filter(Boolean).map(p=>'<p>'+esc(p)+'</p>').join('');
   const srcLine=a.source_url?'<p style="font-size:12.5px;color:var(--muted);margin-top:16px;border-top:1px solid var(--hair);padding-top:10px">Source: <a href="'+esc(a.source_url)+'" target="_blank" rel="noopener nofollow">'+esc(a.source_name||'Original source')+'</a> · Summarized by LocalProof.</p>':'';
   const more=fetchNews('oc',{limit:6}).then(list=>{
     const items=(list||[]).filter(n=>n.id!==a.id).slice(0,5);
     const ul=items.length?('<ul class="hl-list">'+items.map(n=>'<li><a href="article.html?src=oc&id='+n.id+'">'+esc(n.title)+'<div class="meta">'+esc(n.category)+' · '+esc(timeAgo(n.published_at))+' ago</div></a></li>').join('')+'</ul>'):'<div class="empty">No other stories yet.</div>';
     const mm=document.getElementById('aMore'); if(mm)mm.innerHTML=ul;
   }).catch(()=>{});
   wrap().innerHTML = crumb([['Local News','/news'],[a.category||'Article','']]) +
     twocol('<article class="detail article"><span class="tag-pill">'+esc(a.category)+'</span><h1 style="margin-top:8px">'+esc(a.title)+'</h1><div class="dmeta"><span>By '+esc(a.author||'LocalProof')+'</span><span>'+esc(timeAgo(a.published_at))+' ago</span></div>'+(a.dek?'<p style="font-size:15px;color:var(--charcoal);font-weight:600;margin:2px 0 12px">'+esc(a.dek)+'</p>':'')+'<div class="hero">'+esc(a.category)+'</div><div class="body">'+body+'</div>'+srcLine+'</article>',
     mod('More Orange County news','<div id="aMore"><div class="empty" style="border:0">Loading…</div></div>','/news')+sideDefault());
   injectLd({"@context":"https://schema.org","@type":"NewsArticle","headline":a.title,"description":a.dek,"datePublished":a.published_at,"articleSection":a.category,"isBasedOn":a.source_url||undefined});
 }).catch(e=>{wrap().innerHTML='<div class="empty">Couldn’t load this story: '+esc(e.message)+'</div>';});
}

PAGES.community = function(m){
 const authors=['sgv_renter','pasadena_mom','koreatown_kev','arcadia_dad','movinglady','handyandy','irvine_grad','foodie_lin','newin_LA','careful_buyer'];
 const reads=[167,842,231,1290,455,678,92,540,214,388];
 const all=D.community;
 const page=Math.max(1,parseInt(P.get('page')||'1',10));const tab=P.get('sort')||'Latest';
 const sub=[['Forum Home','/community','act'],['Housing Talk','/community?sort=Latest'],['Jobs Talk','/community?sort=Latest'],['Deals & Reviews','/community'],['Newcomers','/community'],['Tags','/community'],['Rules','/safety'],['Ask a question','/ask']];
 const tabs=[['Latest','All discussions'],['Popular','Most active'],['Unanswered','Unanswered'],['Verified answers','Verified answers']];
 const tabbar='<div class="subnav" style="margin-top:-4px">'+tabs.map(t=>'<a href="community.html?sort='+encodeURIComponent(t[0])+'"'+(t[0]===tab?' class="act"':'')+'>'+esc(t[1])+'</a>').join('')+'<a class="newbtn" href="'+R('/ask')+'" style="margin-left:auto;text-decoration:none;color:#fff">Post a discussion</a></div>';
 function filt(list){let a=list.slice();if(tab==='Popular')a.sort((x,y)=>y.replies-x.replies);else if(tab==='Unanswered')a=a.filter(q=>!q.accepted);else if(tab==='Verified answers')a=a.filter(q=>q.accepted);return a;}
 const rowsHTML=a=>a.map(q=>'<tr><td class="role"><span class="doc">▤</span><a href="thread.html?id='+q.id+'">'+esc(q.q)+'</a><div style="font-size:11px;color:var(--faint);margin-top:2px">'+esc(q.city)+' · '+esc(q.cat)+(q.accepted?' · <span style="color:var(--green);font-weight:700">Verified answer</span>':'')+'</div></td><td class="co"><a href="user.html?u='+encodeURIComponent(q.author)+'">'+esc(q.author)+'</a><div class="upd">'+esc(q.age)+' ago</div></td><td class="rr">'+q.replies+' / '+q.reads+'</td></tr>').join('');
 const filtered=filt(all);const per=12,total=Math.ceil(filtered.length/per),cur=Math.min(page,total);
 const table='<table class="rtable"><thead><tr><th>Topic</th><th>Author</th><th style="text-align:right">Replies / Reads</th></tr></thead><tbody>'+rowsHTML(filtered.slice((cur-1)*per,cur*per))+'</tbody></table>';
 const legend='<div style="display:flex;flex-wrap:wrap;gap:12px;padding:10px;background:#fff;border:1px solid var(--border);border-bottom:0;font-size:12px"><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#5b4a7a"></span> community opinion</span><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--green)"></span> verified fact</span><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#1d3e73"></span> professional response</span><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--gold)"></span> provider recommendation</span></div>';
 const main=tabbar+legend+table+pager(total,cur,'community.html');
 const askBox=mod('Ask the community','<div style="padding:10px"><p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Get local answers before you rent, hire, or buy.</p><a href="'+R('/ask')+'" style="display:block;text-align:center;background:var(--navy);color:#fff;font-weight:700;padding:9px;border-radius:3px">Ask a question</a></div>');
 section(m, crumb([['Community','']]) + subnav(sub) + pageHead('Community Discussions','Answers labeled by kind: community opinion, verified fact, professional response, provider recommendation.') + twocol(main, askBox+talentRail()+mostSearched()+safetyMini()));
 if(P.get('compose')||P.get('ask')) location.href=R('/ask');
};

PAGES.thread = function(m){
 const id=P.get('id')||'t1'; const q=byId(D._full.community,id)||D._full.community[0];
 const replies=(D.thread_replies[id]||[{a:'Resident',type:'community opinion',body:'Thanks for asking — following this thread.'}]);
 const rep=replies.map(r=>'<div style="border:1px solid var(--hair);border-radius:4px;padding:11px;margin-bottom:8px;background:#fff"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:5px"><b style="font-size:12.5px">'+esc(r.a)+'</b><span class="tag-pill '+(r.type==='verified fact'?'green':r.type==='professional response'?'':'gold')+'">'+esc(r.type)+'</span></div><p style="font-size:13px;color:var(--charcoal)">'+esc(r.body)+'</p></div>').join('');
 section(m, crumb([['Community','/community'],[q.cat,'']]) +
  twocol('<article class="detail"><span class="tag-pill">'+esc(q.city)+'</span> <span class="tag-pill">'+esc(q.cat)+'</span><h1 style="margin-top:8px">'+esc(q.q)+'</h1><div class="dmeta"><span>'+q.replies+' replies</span><span>'+esc(q.age)+'</span>'+(q.accepted?'<span class="tag-pill green">Has a verified answer</span>':'')+'</div>'+rep+'<div class="formcard" style="margin-top:12px;max-width:none"><div class="field-row"><label for="reply">Add a reply</label><textarea id="reply" placeholder="Share what you know…"></textarea></div><button class="go" data-confirm="Reply posted (demo) — sign in to publish for real.">Post reply</button><div class="guest-note">You are browsing as a guest. Sign in to post so your reply is saved to your account.</div></div></article>',
  mostSearched()+safetyMini()));
};

function resultList(items,render){return '<ul class="result-list" style="border:1px solid var(--border)">'+items.map(render).join('')+'</ul>';}

PAGES.housing = function(m){
 const page=Math.max(1,parseInt(P.get('page')||'1',10));
 const streets=['Bright 1BR near','2BR w/ parking,','Room in shared house,','Studio, utilities incl.,','Renovated 2BR in','Cozy 1BR near','Large 3BR house,','Furnished room,'];
 const cities=D.cities.map(c=>c.name);const kinds=['Apartments','Rooms','Roommates','Housing wanted'];
 const rents=['$1,050','$1,650','$2,150','$2,500','$2,900','$3,400','$3,900','$950'];const bedsA=['Studio','1 bed','2 bed','3 bed','Room'];const ages=['2h','4h','6h','1d','2d'];
 const all=D.housing;
 const sub=[['Rentals Home','/housing','act'],['Rooms','/housing?tab=Rooms'],['Apartments','/housing?tab=Apartments'],['Roommates','/housing?tab=Roommates'],['Housing Wanted','/housing'],['Sublets','/housing'],['Vacation','/housing'],['Commercial','/housing'],['Post a Rental','/post?type=rental']];
 const vs='<div class="vsearch"><input type="text" placeholder="Neighborhood, city, or keyword" id="hq"><select id="hkind"><option value="">All types</option>'+kinds.map(k=>'<option>'+k+'</option>').join('')+'</select><select id="hbeds"><option value="">Any beds</option><option>Studio</option><option>1 bed</option><option>2 bed</option><option>3 bed</option><option>Room</option></select><button class="go" id="hsearch">Search</button><a class="newbtn" href="'+R('/post')+'?type=rental" style="text-decoration:none">Post a rental</a></div>';
 const facets=facetPanel('hfacets',[
  ['Rent',['Any','Under $1,500','$1,500–2,000','$2,000–2,500','$2,500–3,000','$3,000+']],
  ['Bedrooms',['Any','Studio','1','2','3','4+']],
  ['Type',['Any','Apartment','Room','Roommate','House','Housing wanted']],
  ['Move-in',['Any','Now','Within 30 days','Flexible']],
  ['Parking',['Any','Included','Available','None']]
 ]);
 const per=12,total=Math.ceil(all.length/per),cur=Math.min(page,total);
 const rowsHTML=a=>a.map(h=>'<tr><td class="role"><span class="doc">▤</span><a href="listing.html?type=rental&id='+h.id+'">'+esc(h.title)+'</a></td><td class="co">'+esc(h.kind)+'</td><td class="loc">'+esc(h.city)+'</td><td class="pay">'+esc(h.rent)+'</td><td class="upd">'+esc(h.beds)+' · '+esc(h.age)+' ago</td></tr>').join('');
 const table='<table class="rtable"><thead><tr><th>Listing</th><th>Type</th><th>City</th><th>Rent <span class="ar">↕</span></th><th>Details</th></tr></thead><tbody id="hbody">'+rowsHTML(all.slice((cur-1)*per,cur*per))+'</tbody></table>';
 const main=vs+facets+'<div style="font-size:11px;color:var(--faint);margin:-6px 0 10px">Showing '+all.length+' rentals · approximate areas only — exact addresses stay private.</div>'+table+pager(total,cur,'housing.html');
 section(m, crumb([['Housing','']]) + subnav(sub) + pageHead('Housing & Rentals','Rooms, apartments, roommates and housing wanted across Greater LA.') + twocol(main, adRect(D.ads[3])+mostSearched()+safetyMini()));
 m.querySelectorAll('#hfacets .fopts').forEach(g=>g.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();g.querySelectorAll('a').forEach(x=>x.classList.remove('on','any'));a.classList.add('on');}));
 const doS=()=>{const q=(document.getElementById('hq').value||'').toLowerCase();const k=document.getElementById('hkind').value;const b=document.getElementById('hbeds').value;let a=all;if(q)a=a.filter(h=>h.title.toLowerCase().includes(q)||h.city.toLowerCase().includes(q));if(k)a=a.filter(h=>h.kind===k);if(b)a=a.filter(h=>h.beds===b);document.getElementById('hbody').innerHTML=a.length?rowsHTML(a.slice(0,per)):'<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted)">No listings match.</td></tr>';};
 document.getElementById('hsearch').addEventListener('click',e=>{e.preventDefault();doS();});
 ['hkind','hbeds'].forEach(id=>document.getElementById(id).addEventListener('change',doS));
 document.getElementById('hq').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doS();}});
};

PAGES.jobs = function(m){
 const page=Math.max(1,parseInt(P.get('page')||'1',10));
 // expand seed jobs into a fuller board (deterministic variations) for real pagination
 const extraCos=['Evergreen Foods','Pacific Import Co.','Sunrise Care Center','Metro Logistics','Jade Garden Restaurant','Foothill Medical','TechBridge Solutions','Golden State Movers','Harbor Freight Depot','Lotus Bakery','Summit Auto Group','Bright Future Academy'];
 const roles=['Warehouse Associate','Customer Support','Bilingual Receptionist','Line Cook','Delivery Driver','Bookkeeper','Sales Associate','Medical Assistant','Barista','Office Clerk','Server','Cashier'];
 const cities=D.cities.map(c=>c.name);
 const pays=['$18/hr','$19–22/hr','$20–24/hr','$23–27/hr','$25–30/hr','$4k–6k/mo','$4k–8k/mo'];
 const types=['Full time','Part time','Internship','Temporary'];
 const ages=['2h','4h','6h','1d','2d','3d'];
 const all=D.jobs;
 const sub=[['Jobs Home','/jobs','act'],['Talent Pool','/talent'],['Post a Resume','/post?type=job'],['Employers','/advertise'],['Job Forum','/community'],['Featured Employers','/businesses'],['Work Visas','/guides'],['Agencies','/businesses'],['Licensing','/guides'],['Companies','/businesses']];
 const vs='<div class="vsearch"><input type="text" placeholder="Search title or company" id="jq"><input type="text" placeholder="Location" id="jloc"><select id="jind"><option>All industries</option><option>Food & Restaurant</option><option>Warehouse & Logistics</option><option>Office & Admin</option><option>Healthcare</option><option>Retail</option></select><select id="jtype"><option value="">All job types</option>'+types.map(t=>'<option>'+t+'</option>').join('')+'</select><button class="go" id="jsearch">Search</button><a class="newbtn" href="'+R('/post')+'?type=job" style="text-decoration:none">Post a resume</a></div>';
 const facets=facetPanel('jfacets',[
  ['Posted',['Any time','Past day','Past 3 days','Past week','Past month']],
  ['Monthly pay',['Any','$2k+','$4k+','$6k+','$8k+','$10k+']],
  ['Experience',['Any','No experience','Under 1 yr','1–3 yrs','3–5 yrs','5–10 yrs','10+ yrs']],
  ['Education',['Any','High school','Associate','Bachelor','Master','Other']],
  ['Company size',['Any','Under 5','5–10','10–30','30–50','50–100','100+']],
  ['Job type',['Any','Full time','Part time','Internship','Temporary']]
 ]);
 const per=12,total=Math.ceil(all.length/per),cur=Math.min(page,total);
 const rows=all.slice((cur-1)*per,cur*per).map(j=>'<tr><td class="role"><span class="doc">▤</span><a href="listing.html?type=job&id='+j.id+'">'+esc(j.role)+'</a></td><td class="co">'+esc(j.company)+'</td><td class="loc">'+esc(j.city)+', CA</td><td class="pay">'+esc(j.pay)+'</td><td class="upd">'+esc(j.age)+' ago</td></tr>').join('');
 const table='<table class="rtable"><thead><tr><th>Role <span class="ar">↕</span></th><th>Company</th><th>Location</th><th>Pay <span class="ar">↕</span></th><th>Updated <span class="ar">↕</span></th></tr></thead><tbody id="jbody">'+rows+'</tbody></table>';
 const certs=[D.providers[4],D.providers[3],D.providers[1],D.providers[0],D.providers[5]];
 const main=vs+facets+'<div style="font-size:11px;color:var(--faint);margin:-6px 0 10px">Showing '+all.length+' openings · facets marked here are illustrative in this demo build.</div>'+table+pager(total,cur,'jobs.html')+certRow('Verified employers hiring now',certs);
 section(m, crumb([['Jobs','']]) + subnav(sub) + pageHead('Local Jobs','Hiring and job-wanted posts across Greater LA. Confirmed hires appear in Real Local Outcomes.') + twocol(main, talentRail()+adRect(D.ads[3])+mostSearched()));
 // wire facet highlight + functional type/keyword
 m.querySelectorAll('#jfacets .fopts').forEach(g=>g.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();g.querySelectorAll('a').forEach(x=>x.classList.remove('on','any'));a.classList.add('on');}));
 const doSearch=()=>{const q=(document.getElementById('jq').value||'').toLowerCase();const ty=document.getElementById('jtype').value;let a=all;if(q)a=a.filter(j=>j.role.toLowerCase().includes(q)||j.company.toLowerCase().includes(q));if(ty)a=a.filter(j=>j.jtype===ty);document.getElementById('jbody').innerHTML=(a.length?a.slice(0,per):[]).map(j=>'<tr><td class="role"><span class="doc">▤</span><a href="listing.html?type=job&id='+j.id+'">'+esc(j.role)+'</a></td><td class="co">'+esc(j.company)+'</td><td class="loc">'+esc(j.city)+', CA</td><td class="pay">'+esc(j.pay)+'</td><td class="upd">'+esc(j.age)+' ago</td></tr>').join('')||'<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted)">No roles match.</td></tr>';};
 document.getElementById('jsearch').addEventListener('click',e=>{e.preventDefault();doSearch();});
 document.getElementById('jtype').addEventListener('change',doSearch);
 document.getElementById('jq').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch();}});
};

PAGES.marketplace = function(m){
 const page=Math.max(1,parseInt(P.get('page')||'1',10));
 const cats=[...new Set(D.marketplace.map(x=>x.category).filter(Boolean))];
 const sub=[['Marketplace Home','/marketplace','act']].concat(cats.map(c=>[c,'/marketplace?cat='+encodeURIComponent(c)])).concat([['Sell an item','/post?type=item']]);
 const cat=P.get('cat')||'';
 const card=x=>'<div class="mkt-card"><div class="ph">'+esc(x.price)+'</div><div class="bd"><h3><a href="listing.html?type=item&id='+x.id+'">'+esc(x.item)+'</a></h3><div class="mm">'+esc(x.city)+' · '+esc(x.cond)+' · '+esc(x.age)+' ago</div></div></div>';
 const vs='<div class="vsearch"><input type="text" placeholder="Search items" id="mq"><select id="mcat"><option value="">All categories</option>'+cats.map(c=>'<option'+(c===cat?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select><select id="mcity"><option value="">All cities</option>'+D.cities.map(c=>'<option>'+esc(c.name)+'</option>').join('')+'</select><button class="go" id="msearch">Search</button><a class="newbtn" href="'+R('/post')+'?type=item" style="text-decoration:none">Sell an item</a></div>';
 const facets=facetPanel('mfacets',[['Price',['Any','Under $50','$50–200','$200–500','$500+']],['Condition',['Any','New','Like new','Used · Excellent','Used · Good','Used · Fair']],['Category',['Any'].concat(cats)]]);
 let list=cat?D.marketplace.filter(x=>x.category===cat):D.marketplace;
 const per=18,total=Math.ceil(list.length/per),cur=Math.min(page,total);
 const main=vs+facets+'<div style="font-size:11px;color:var(--faint);margin:-6px 0 10px">Showing '+list.length+' items · meet in a safe public place; never wire money in advance.</div><div class="mkt-grid" id="mgrid">'+list.slice((cur-1)*per,cur*per).map(card).join('')+'</div>'+pager(total,cur,'marketplace.html');
 section(m, crumb([['Marketplace','']]) + subnav(sub) + pageHead('Marketplace','Buy and sell locally — furniture, autos, electronics and more across Greater LA.') + twocol(main, adRect(D.ads[3])+mostSearched()+safetyMini()));
 m.querySelectorAll('#mfacets .fopts').forEach(g=>g.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();g.querySelectorAll('a').forEach(x=>x.classList.remove('on','any'));a.classList.add('on');}));
 const doS=()=>{const q=(document.getElementById('mq').value||'').toLowerCase();const cc=document.getElementById('mcat').value;const ci=document.getElementById('mcity').value;let a=D.marketplace;if(cc)a=a.filter(x=>x.category===cc);if(ci)a=a.filter(x=>x.city===ci);if(q)a=a.filter(x=>x.item.toLowerCase().includes(q));document.getElementById('mgrid').innerHTML=a.length?a.slice(0,per).map(card).join(''):'<div class="empty" style="grid-column:1/-1">No items match.</div>';};
 document.getElementById('msearch').addEventListener('click',e=>{e.preventDefault();doS();});
 ['mcat','mcity'].forEach(id=>document.getElementById(id).addEventListener('change',doS));
 document.getElementById('mq').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doS();}});
};

PAGES.talent = function(m){
 const colors=['#1d3e73','#b9770a','#1c7a4a','#5b4a7a','#b5341f','#1d6f8b'];
 const sub=[['Talent Pool','/talent','act'],['Post a Resume','/post?type=job'],['Employers','/advertise'],['Back to Jobs','/jobs']];
 const grid='<div class="talent-grid">'+D.talent.map((t,i)=>'<div class="tcard"><div class="av" style="background:'+colors[i%colors.length]+'">'+esc(t.headline[0])+'</div><b>'+esc(t.headline)+'</b><div class="tm">'+esc(t.city)+' · '+esc(t.exp)+' · '+esc(t.edu)+'</div><div class="sm">'+esc(t.summary)+'</div><button class="adcta-sm" data-confirm="Sign in as an employer to contact this candidate (demo)." style="margin-top:8px">Contact</button></div>').join('')+'</div>';
 section(m, crumb([['Jobs','/jobs'],['Talent Pool','']]) + subnav(sub) + pageHead('Talent Pool','Local candidates seeking work. Employers sign in to view full resumes and contact.', '<a class="go" href="'+R('/post')+'?type=job" style="text-decoration:none;align-self:center">Post your resume</a>') + twocol(grid, adRect(D.ads[3])+mostSearched()));
};

PAGES.food = function(m){
 const rests=D.providers.filter(p=>p.group==='Restaurant');
 const cuisines=[['Cantonese','Dim sum','Seafood','BBQ'],['Sichuan','Hot pot','Noodles','Dumplings'],['Taiwanese','Boba','Beef noodle','Breakfast'],['Northern','Hand-pulled','Buns','Lamb skewers']];
 const left='<div class="catcol">'+cuisines.map((c,i)=>'<div class="catblock"><div class="ci">'+['粤','川','台','北'][i]+'</div><div style="flex:1"><div style="font-weight:700;font-size:12.5px;color:var(--navy);margin-bottom:3px">'+['Cantonese','Sichuan','Taiwanese','Northern'][i]+'</div><div class="cc">'+c.map(x=>'<a href="'+R('/search')+'?q='+encodeURIComponent(x)+'">'+esc(x)+'</a>').join('')+'</div></div></div>').join('')+'</div>';
 const feat=(rests.length?rests:D.providers).slice(0,6);
 const center='<section class="module"><div class="module-titlebar red"><h2>Food News & Spotlights</h2><a class="more" href="'+R('/news')+'">More</a></div><ul class="catnews">'+
   [['Old-school Cantonese lands in Hacienda Heights','A veteran chef brings classic roast meats and clay-pot rice to the SGV.'],['Late-night skewers in Rowland Heights','A new spot serves Northeastern-style barbecue past midnight.'],['Where to find hand-pulled noodles now','Our running list of the best fresh-pulled noodles across the valley.']].map(n=>'<li><div class="th">FOOD</div><div><h4><a href="'+R('/news')+'">'+esc(n[0])+'</a></h4><p>'+esc(n[1])+'</p></div></li>').join('')+'</ul></section>'+
   '<section class="module"><div class="module-titlebar"><h2>Restaurants on LocalProof</h2><a class="more" href="'+R('/businesses')+'?cat=Restaurants">All</a></div><div style="padding:12px"><div class="biz-cards">'+feat.map(p=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:'+p.c+'">'+esc(p.name[0])+'</div><div><h3><a href="business.html?id='+p.id+'">'+esc(p.name)+'</a></h3><div class="rmeta">'+esc(p.cat)+'</div></div></div><div style="font-size:12px">'+ratingBit(p)+'</div><a class="adcta-sm" href="business.html?id='+p.id+'">View</a></div>').join('')+'</div></div></section>';
 const right='<div class="catrail"><div class="rlabel">Food Deals</div>'+D.deals.filter(x=>x.cat==='Restaurant'||x.cat==='Supermarket').slice(0,5).map(x=>'<div class="business-ad" style="border:1px solid var(--border)"><div><b>'+esc(x.title)+'</b><p>'+esc(x.advertiser)+'</p><div class="exp" style="color:var(--red);font-size:10.5px">'+esc(x.exp)+'</div></div></div>').join('')+adRect(D.ads[2])+'</div>';
 const sub=[['Food Home','/food','act'],['Restaurants','/businesses?cat=Restaurants'],['Food Map','/businesses'],['Deals & Coupons','/deals'],['Food Forum','/community'],['Rankings','/businesses']];
 section(m, crumb([['Food','']]) + subnav(sub) + pageHead('Food & Restaurants','Local kitchens, reviews, deals and food news across Greater LA.') + '<div class="catland">'+left+center+right+'</div>');
};

PAGES.listing = function(m){
 const type=P.get('type')||'rental', id=P.get('id')||'';
 let title,meta,price,specs,area,back;
 let desc='';
 const expL={none:'No experience',under_1:'Under 1 yr','1_3':'1–3 yrs','3_5':'3–5 yrs','5_10':'5–10 yrs','10_plus':'10+ yrs'};
 const eduL={high_school:'High school',associate:'Associate',bachelor:'Bachelor',master:'Master',doctorate:'Doctorate',other:'Other'};
 if(type==='rental'){const h=byId(D._full.housing,id)||D._full.housing[0];title=h.title;area=h.city;price=h.rent;back=['Housing','/housing'];desc=h.desc||'';
  specs=[['Type',h.kind],['Bedrooms',h.beds],['Size',h.sqft||'—'],['City',h.city],['Rent',h.rent],['Deposit',h.deposit||'Ask'],['Parking',h.parking||'—'],['Pets',h.pets||'—'],['Available',h.available||'—'],['Posted',h.age+' ago']];}
 else if(type==='job'){const j=byId(D._full.jobs,id)||D._full.jobs[0];title=j.role;area=j.city;price=j.pay;back=['Jobs','/jobs'];desc=j.desc||'';
  specs=[['Company',j.company],['City',j.city],['Type',j.jtype],['Pay',j.pay],['Experience',expL[j.experience]||'—'],['Education',eduL[j.education]||'—'],['Company size',j.company_size||'—'],['Benefits',j.benefits||'—'],['Posted',j.age+' ago'],['Status',j.hiring?'Hiring':'Job wanted']];}
 else {const x=byId(D._full.marketplace,id)||D._full.marketplace[0];title=x.item;area=x.city;price=x.price;back=['Marketplace','/marketplace'];desc=x.desc||'';
  specs=[['Condition',x.cond],['Category',x.category||'—'],['City',x.city],['Price',x.price],['Posted',x.age+' ago']];}
 const specHTML='<div class="spec-grid">'+specs.map(s=>'<div class="s"><div class="k">'+esc(s[0])+'</div><div class="v">'+esc(s[1])+'</div></div>').join('')+'</div>';
 const contactBtn=type==='job'?'Apply / contact':'Contact poster';
 section(m, crumb([back,[title,'']]) +
  twocol('<article class="detail"><h1>'+esc(title)+'</h1><div class="dmeta"><span>'+esc(area)+'</span><span>Approximate area — exact address is private</span></div><div class="hero">'+esc(title)+'</div><div class="price-lg">'+esc(price)+'</div>'+specHTML+'<div class="body"><p>'+esc(desc)+'</p><p style="font-size:11.5px;color:var(--faint)">Demonstration listing from seeded data — the full build adds photos, poster reputation and messaging.</p></div><button class="go" data-confirm="Sign in to '+esc(contactBtn.toLowerCase())+' (demo).">'+esc(contactBtn)+'</button> <button class="adcta-sm" data-confirm="Saved to your list (demo).">Save</button><div class="guest-note">Never wire a deposit before touring in person. See our <a href="'+R('/safety')+'">safety guide</a>.</div></article>',
  adRect(D.ads[3])+safetyMini()));
};

PAGES.businesses = function(m){
 if(LP_COUNTY==='oc'){ return businessesLive(m); }
 const cat=P.get('cat')||'';
 const badge=(b)=>'<span class="badge2 '+b[1]+'">'+esc(b[0])+'</span>';
 const cats=D.business_dir.map(d=>d.cat);
 const sub=[['Directory Home','/businesses','act']].concat(cats.map(c=>[c,'/businesses?cat='+encodeURIComponent(c),cat===c?'on':''])).concat([['Claim a business','/business/claim']]);
 // LEFT: category columns (food-page style)
 const icons=['Ut','Lg','RE','Au','Hc','Ed','HS','Sh'];
 const left='<div class="catcol">'+D.business_dir.map((d,i)=>'<div class="catblock"><div class="ci">'+esc(icons[i%icons.length])+'</div><div style="flex:1"><div style="font-weight:700;font-size:12.5px;color:var(--navy);margin-bottom:3px"><a href="businesses.html?cat='+encodeURIComponent(d.cat)+'" style="color:var(--navy)">'+esc(d.cat)+'</a></div><div class="cc">'+d.items.map(it=>'<a href="business.html?id='+(D._full.providers.find(p=>p.name===it[0])?D._full.providers.find(p=>p.name===it[0]).id:'prov_sgv_plumbing')+'">'+esc(it[0])+'</a>').join('')+'</div></div></div>').join('')+'</div>';
 // CENTER: verified provider spotlight cards
 const shown=cat?D.providers.filter(p=>p.cat.toLowerCase().includes(cat.toLowerCase().split(' ')[0])):D.providers;
 const list=(shown.length?shown:D.providers);
 const card=p=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:'+p.c+'">'+esc(p.name[0])+'</div><div><h3><a href="business.html?id='+p.id+'">'+esc(p.name)+'</a></h3><div class="rmeta">'+esc(p.cat)+' · '+esc(p.area.split(',')[0])+'</div></div></div><div class="badges">'+p.badges.map(badge).join('')+'</div><div style="font-size:12px;color:var(--muted)">'+esc(p.prov)+'</div><div style="display:flex;justify-content:space-between;font-size:12px"><span>'+ratingBit(p)+'</span><span>'+p.outcomes+' outcomes</span></div>'+sourceLine(p)+'<div style="display:flex;gap:6px;flex-wrap:wrap">'+claimCta(p)+'<a class="adcta-sm" href="business.html?id='+p.id+'">View profile</a></div></div>';
 const center='<section class="module"><div class="module-titlebar"><h2>'+(cat?esc(cat):'Verified')+' — provider spotlight</h2><a class="more" href="'+R('/safety')+'">What badges mean</a></div><div style="padding:12px"><div class="biz-cards">'+list.map(card).join('')+'</div></div></section>'+certRow('Recently verified businesses',[D.providers[0],D.providers[3],D.providers[1],D.providers[5],D.providers[2]]);
 // RIGHT rail
 const right='<div class="catrail"><div class="rlabel">Sponsored Businesses</div>'+D.sponsored_biz.map(b=>'<div class="business-ad" style="border:1px solid var(--border)"><div class="logo-sq" style="background:'+b.c+'">'+esc(b.n[0])+'</div><div><b>'+esc(b.n)+'</b><p>'+esc(b.cat)+'</p><div class="ph">'+esc(b.ph)+'</div></div></div>').join('')+adRect(D.ads[3])+mod('List your business','<div style="padding:10px;font-size:12px;color:var(--charcoal)">Claiming is free. Promotion is always labeled. <a href="'+R('/business/claim')+'">Claim or add a business</a>.</div>')+'</div>';
 section(m, crumb([['Businesses',''],(cat?[cat,'']:['Directory',''])]) + subnav(sub) + pageHead('Business Directory','Provider profiles with dated evidence badges — never a single "trusted" label.', '<a class="go" href="'+R('/business/claim')+'" style="text-decoration:none;align-self:center">Claim a business</a>') + '<div class="catland">'+left+center+right+'</div>');
};

/* OC live business directory hub */
function bizSideLive(){
 return mod('List your business','<div style="padding:10px;font-size:12.5px;color:var(--charcoal)">Own one of these? Claiming is free and adds a verified badge once we confirm it. <a href="'+R('/business/claim')+'">Claim or add a business</a>.</div>')+
   mod('For businesses','<div style="padding:10px;font-size:12.5px;color:var(--charcoal)">Create a business account to post offers and updates. <a href="'+R('/dashboard')+'">Open the dashboard</a>.</div>','/dashboard')+
   adRect(D.ads[3])+safetyMini();
}
function bizBadges(b){
 let out='<span class="tag-pill">Community-listed</span>';
 if(b.verification_status==='verified')out+=' <span class="tag-pill green">Verified business</span>';
 else out+=' <span class="tag-pill">Unclaimed</span>';
 return out;
}
function gMapsUrl(b){return b.google_maps_uri||(b.google_place_id?('https://www.google.com/maps/place/?q=place_id:'+encodeURIComponent(b.google_place_id)):'');}
/* Google-sourced rating with required attribution + Maps link (only when enriched) */
function googleRating(b){
 if(b.rating==null)return '';
 const url=gMapsUrl(b);
 const rc=b.review_count?(' · '+Number(b.review_count).toLocaleString()+' reviews'):'';
 const inner=stars(b.rating)+' '+Number(b.rating).toFixed(1)+rc;
 return '<div style="font-size:12px">'+inner+'</div>'+
   '<div class="src-cite">Rating via '+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener nofollow">Google</a>':'Google')+'</div>';
}
function businessesLive(m){
 const city=P.get('city')||'';
 section(m, crumb([['Businesses','']]) + pageHead('Orange County Businesses','Local directory — community-listed from OC chambers. Own one? Claim it to get verified.','<a class="go" href="'+R('/business/claim')+'" style="text-decoration:none;align-self:center">Claim a business</a>') +
  '<div id="bSub"></div>' +
  '<div class="vsearch" style="margin-bottom:10px"><input type="text" id="bq" placeholder="Search name or category (e.g. dentist, Irvine, plumber)"><button class="go" id="bgo">Search</button></div>' +
  twocol('<div id="bMain"><div class="empty">Loading directory…</div></div>', bizSideLive()));
 const main=document.getElementById('bMain'),sub=document.getElementById('bSub');
 let ALL=[];
 const card=b=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:#16305c">'+esc((b.name||'B')[0])+'</div><div><h3><a href="business.html?src=oc&id='+b.id+'">'+esc(b.name)+'</a></h3><div class="rmeta">'+esc(b.category||'')+(b.city?' · '+esc(b.city):'')+'</div></div></div>'+
   '<div class="badges">'+bizBadges(b)+'</div>'+
   googleRating(b)+
   (b.phone?'<div style="font-size:12px;color:var(--muted)">'+esc(b.phone)+'</div>':'')+
   (b.address?'<div style="font-size:12px;color:var(--faint)">'+esc(b.address)+'</div>':'')+
   (b.source_name?'<div class="src-cite">Source: '+(b.source_url?'<a href="'+esc(b.source_url)+'" target="_blank" rel="noopener nofollow">'+esc(b.source_name)+'</a>':esc(b.source_name))+'</div>':'')+
   '<div style="display:flex;gap:6px;flex-wrap:wrap">'+(!b.is_claimed?'<a class="adcta-sm" href="business.html?src=oc&id='+b.id+'">Claim this business</a>':'')+'<a class="adcta-sm" href="business.html?src=oc&id='+b.id+'">View profile</a></div></div>';
 const draw=(list)=>{ main.innerHTML=list.length?('<section class="module"><div class="module-titlebar"><h2>'+list.length+' '+(city?esc(city):'Orange County')+' businesses</h2></div><div style="padding:12px"><div class="biz-cards">'+list.map(card).join('')+'</div></div></section>'):'<div class="empty">No businesses match.</div>'; };
 const apply=()=>{ const q=(document.getElementById('bq').value||'').toLowerCase().trim(); let l=city?ALL.filter(b=>b.city===city):ALL.slice(); if(q)l=l.filter(b=>(b.name||'').toLowerCase().includes(q)||(b.category||'').toLowerCase().includes(q)||(b.city||'').toLowerCase().includes(q)); draw(l); };
 fetchBusinesses('oc',{}).then(list=>{
   ALL=list;
   const cities=[...new Set(list.map(b=>b.city).filter(Boolean))].sort();
   sub.innerHTML='<div class="subnav"><a href="businesses.html"'+(!city?' class="act"':'')+'>All OC</a>'+cities.map(c=>'<a href="businesses.html?city='+encodeURIComponent(c)+'"'+(city===c?' class="act"':'')+'>'+esc(c)+'</a>').join('')+'<a href="'+R('/business/claim')+'">Claim a business</a></div>';
   apply();
   const go=document.getElementById('bgo'),q=document.getElementById('bq');
   if(go)go.addEventListener('click',e=>{e.preventDefault();apply();});
   if(q)q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});
 }).catch(e=>{main.innerHTML='<div class="empty">Couldn’t load the directory: '+esc(e.message)+'</div>';});
 injectLd({"@context":"https://schema.org","@type":"CollectionPage","name":"Orange County Business Directory","about":"Local Orange County businesses"});
}

/* OC live business profile + real claim funnel */
function businessLive(m){
 const id=P.get('id');
 section(m, crumb([['Businesses','/businesses'],['Profile','']]) + '<div id="bpWrap"><div class="empty">Loading…</div></div>');
 const wrap=()=>document.getElementById('bpWrap');
 fetchBusinessOne(id).then(b=>{
   if(!b){wrap().innerHTML='<div class="empty">Business not found. <a href="businesses.html">Back to directory</a>.</div>';return;}
   const specs=[['Category',b.category],['City',b.city],['Address',b.address],['Phone',b.phone],['Website',b.website?('<a href="'+esc(b.website)+'" target="_blank" rel="noopener">'+esc(b.website)+'</a>'):null],['Postal code',b.postal_code]].filter(s=>s[1]);
   const claimed=b.is_claimed||b.verification_status==='verified';
   const claimBox=claimed?'':'<div class="formcard" style="margin-top:12px"><b>Own this business?</b><p style="font-size:12.5px;color:var(--muted);margin:4px 0 8px">Claim it to manage the listing and earn a Verified badge once we confirm ownership. Claiming is free.</p><textarea id="cl_note" placeholder="Optional: how can we verify you own it? (role, business email, website)" style="width:100%;min-height:52px;margin-bottom:8px"></textarea><button class="go" id="cl_go">Claim this business</button><div id="cl_msg" class="form-ok" style="display:none;margin-top:8px"></div></div>';
   wrap().innerHTML = crumb([['Businesses','/businesses'],[b.name,'']]) +
     twocol('<article class="detail"><div style="display:flex;gap:14px;align-items:flex-start"><div class="bl" style="width:60px;height:60px;font-size:24px;background:#16305c">'+esc((b.name||'B')[0])+'</div><div><h1>'+esc(b.name)+'</h1><div class="dmeta"><span>'+esc(b.category||'')+'</span><span>'+esc(b.city||'')+'</span></div><div class="badges" style="display:flex;flex-wrap:wrap;gap:5px">'+bizBadges(b)+'</div>'+googleRating(b)+'</div></div>'+
       (b.source_name?'<div class="src-cite" style="margin-top:8px">Source: '+(b.source_url?'<a href="'+esc(b.source_url)+'" target="_blank" rel="noopener nofollow">'+esc(b.source_name)+'</a>':esc(b.source_name))+' · Community-listed, not yet verified by LocalProof.</div>':'')+
       '<div class="spec-grid">'+specs.map(s=>'<div class="s"><div class="k">'+esc(s[0])+'</div><div class="v">'+s[1]+'</div></div>').join('')+'</div>'+
       '<div class="body"><p style="font-size:12.5px;color:var(--muted)">This is a community-listed business profile. Once the owner claims and verifies it, this page shows their own description, hours, offers and responses.</p></div>'+
       claimBox+'</article>',
     mod('What claiming does','<div style="padding:10px;font-size:12px;color:var(--charcoal)">Claiming links the listing to the owner and starts verification. A Verified badge points to dated evidence — it never means "trusted" on its own. <a href="'+R('/safety')+'">Badge guide</a>.</div>')+bizSideLive());
   injectLd({"@context":"https://schema.org","@type":"LocalBusiness","name":b.name,"description":b.category,"address":b.address,"telephone":b.phone,"url":b.website||undefined,"areaServed":b.city});
   const go=document.getElementById('cl_go');
   if(go)go.addEventListener('click',async()=>{
     const u=await currentUser();
     if(!u){toast('Sign in to claim this business.');setTimeout(()=>location.href='signin.html',700);return;}
     go.disabled=true;go.textContent='Submitting…';
     try{const sb=await sbClient();const{error}=await sb.from('lp_business_claims').insert({business_id:b.id,user_id:u.id,evidence_note:(document.getElementById('cl_note').value||null)});if(error)throw error;
       const msg=document.getElementById('cl_msg');msg.textContent='Claim submitted. We’ll review ownership and email you next steps.';msg.style.display='block';go.style.display='none';}
     catch(err){toast(err.message||'Failed');go.disabled=false;go.textContent='Claim this business';}
   });
 }).catch(e=>{wrap().innerHTML='<div class="empty">Couldn’t load this business: '+esc(e.message)+'</div>';});
}

PAGES.business = function(m){
 if(P.get('src')==='oc'){ return businessLive(m); }
 const id=P.get('id')||'prov_sgv_plumbing'; const p=byId(D._full.providers,id)||D._full.providers[0];
 const badge=b=>'<span class="badge2 '+b[1]+'">'+esc(b[0])+'</span>';
 const specs=[['Service area',p.area],['Response time',p.response],['Availability',p.avail],['Completed outcomes',p.outcomes+''],['Pricing',p.price],['Phone',p.phone]];
 const revs=reviewsFor(p.id);
 const verifiedCount=revs.filter(r=>r.verified).length;
 const agg='<div class="agg"><div class="big">'+(p.rating||0).toFixed(1)+'</div><div>'+stars(p.rating)+'<div class="sub">'+p.reviews+' reviews · '+verifiedCount+' transaction-confirmed</div></div></div>';
 const noRevNote='<div class="empty">No reviews yet'+(p.source==='OpenStreetMap'?' — this business is community-sourced from OpenStreetMap. Are you the owner? <a href="'+R('/business/claim')+'">Claim &amp; verify it</a>.':'.')+'</div>';
 const reviewsBlock='<h2 style="font-family:var(--serif);font-size:17px;margin:16px 0 8px">Reviews</h2>'+(revs.length?(agg+revs.map(r=>reviewSnippet(r,false)).join('')):noRevNote);
 section(m, crumb([['Businesses','/businesses'],[p.name,'']]) +
  twocol('<article class="detail"><div style="display:flex;gap:14px;align-items:flex-start"><div class="bl" style="width:60px;height:60px;font-size:24px;background:'+p.c+'">'+esc(p.name[0])+'</div><div><h1>'+esc(p.name)+'</h1><div class="dmeta"><span>'+esc(p.cat)+'</span><span>'+ratingBit(p)+'</span></div><div class="badges" style="display:flex;flex-wrap:wrap;gap:5px">'+p.badges.map(badge).join('')+'</div></div></div><p style="font-size:12.5px;color:var(--muted);margin-top:10px">Review provenance: '+esc(p.prov)+'</p>'+sourceLine(p)+
  '<div class="spec-grid">'+specs.map(s=>'<div class="s"><div class="k">'+esc(s[0])+'</div><div class="v">'+esc(s[1])+'</div></div>').join('')+'</div>'+
  '<div class="body"><p>Demonstration provider profile. The full build shows services and fees, completed outcomes, and community answers this business has given.</p></div>'+
  '<button class="go" data-confirm="Request sent (demo) — sign in to receive quotes.">Request a quote</button> <button class="adcta-sm" data-confirm="Saved (demo).">Save</button>'+
  reviewsBlock+'</article>',
  mod('What badges mean','<div style="padding:10px;font-size:12px;color:var(--charcoal)">Each badge points to specific, dated evidence and says what it does <b>not</b> prove. <a href="'+R('/safety')+'">Full badge guide</a>.</div>')+safetyMini()));
 // SEO/GEO: LocalBusiness + AggregateRating + Review rich-snippet schema
 injectLd({"@context":"https://schema.org","@type":"LocalBusiness","name":p.name,"description":p.cat,"areaServed":p.area,"telephone":p.phone,
   "aggregateRating":{"@type":"AggregateRating","ratingValue":p.rating,"reviewCount":p.reviews,"bestRating":5},
   "review":revs.slice(0,8).map(r=>({"@type":"Review","author":{"@type":"Person","name":r.author},"datePublished":r.date,"reviewBody":r.body,"reviewRating":{"@type":"Rating","ratingValue":r.rating,"bestRating":5}}))});
};

PAGES.deals = function(m){
 const list='<ul class="result-list" style="border:1px solid var(--border)">'+D.deals.map(d=>'<li><div class="thumb" style="background:linear-gradient(135deg,#b9770a,#8a5906)">'+esc(d.cat)+'</div><div class="rmain"><h3>'+esc(d.title)+'</h3><div class="rmeta"><span class="tag-pill gold">'+esc(d.cat)+'</span><span>'+esc(d.advertiser)+'</span><span class="tag-pill red">'+esc(d.exp)+'</span></div></div><button class="adcta-sm" data-confirm="Deal saved (demo).">Save deal</button></li>').join('')+'</ul>';
 section(m, crumb([['Deals','']]) + pageHead('Deals & Circulars','Local supermarket, restaurant, service and hiring offers. Every deal shows its expiration.') + twocol(list, adRect(D.ads[3])+mostSearched()));
};

PAGES.guides = function(m){
 const list='<ul class="result-list" style="border:1px solid var(--border)">'+D.guides.map(g=>'<li><div class="thumb" style="background:linear-gradient(135deg,#1c7a4a,#145634)">GUIDE</div><div class="rmain"><h3><a href="guide.html?id='+g.id+'">'+esc(g.title)+'</a></h3><div class="rmeta"><span class="tag-pill">'+esc(g.jurisdiction)+'</span>'+(g.sources?'<span class="tag-pill green">Official sources</span>':'')+'<span>'+esc(g.reviewed)+'</span></div></div></li>').join('')+'</ul>';
 section(m, crumb([['Guides','']]) + pageHead('Local Guides & Newcomer Resources','Written and reviewed with dates, named reviewers, and official sources where it matters.') + twocol(list, mod('New to Los Angeles','<div class="newla">'+D.new_to_la.map(n=>'<a href="'+R('/guides')+'">'+esc(n)+'</a>').join('')+'</div>')+sideDefault()));
};

PAGES.guide = function(m){
 const id=P.get('id')||'g1'; const g=byId(D.guides,id)||D.guides[0];
 const body=(g.body||'').split('\n\n').map(p=>'<p>'+esc(p)+'</p>').join('');
 section(m, crumb([['Guides','/guides'],[g.jurisdiction,'']]) +
  twocol('<article class="detail article"><h1>'+esc(g.title)+'</h1><div class="dmeta"><span>'+esc(g.reviewer)+'</span><span>'+esc(g.reviewed)+'</span><span class="tag-pill">'+esc(g.jurisdiction)+'</span>'+(g.sources?'<span class="tag-pill green">Official sources</span>':'')+'</div><div class="body">'+body+'</div></article>',
  mod('More guides','<ul class="hl-list">'+D.guides.filter(x=>x.id!==id).slice(0,5).map(x=>'<li><a href="guide.html?id='+x.id+'">'+esc(x.title)+'</a></li>').join('')+'</ul>','/guides')+safetyMini()));
};

PAGES.events = function(m){
 const list='<ul class="events" style="border:1px solid var(--border);background:#fff">'+D.events.map(e=>'<li><span class="date"><span class="m">'+esc(e.m)+'</span><span class="d">'+esc(e.d)+'</span></span><div><b>'+esc(e.t)+'</b><div class="ev-meta">'+esc(e.meta)+'</div></div><button class="adcta-sm" data-confirm="Added to your calendar (demo)." style="margin-left:auto">Add</button></li>').join('')+'</ul>';
 section(m, crumb([['Events','']]) + pageHead('Local Events','Hiring events, markets and community workshops across Greater LA.') + twocol(list, adRect(D.ads[3])+mostSearched()));
};

PAGES.video = function(m){
 const feat='<div class="video-feat" style="border:1px solid var(--border);background:#fff"><div class="thumb"><span class="play"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span class="dur">'+esc(D.video_feat.dur)+'</span></div><h4>'+esc(D.video_feat.title)+'</h4></div>';
 const list='<ul class="result-list" style="border:1px solid var(--border);margin-top:14px">'+D.videos.map(v=>'<li><div class="thumb" style="background:linear-gradient(135deg,#3a2140,#20122a)">▶</div><div class="rmain"><h3>'+esc(v.title)+'</h3><div class="rmeta"><span>'+esc(v.dur)+'</span></div></div></li>').join('')+'</ul>';
 section(m, crumb([['Video','']]) + pageHead('LocalProof Video','Short explainers and neighborhood tours.') + twocol(feat+list, adRect(D.ads[3])+mostSearched()));
};

PAGES.tools = function(m){
 const which=P.get('tool')||'rent';
 const tabs=[['rent','Rental cost'],['offer','Job offer'],['quote','Quote comparator']];
 section(m, crumb([['Tools','']]) + pageHead('Practical Local Tools','Turn a confusing offer into a number you can compare.') +
  '<div class="calc-tabs">'+tabs.map(t=>'<a href="tools.html?tool='+t[0]+'"'+(t[0]===which?' class="on"':'')+'>'+t[1]+'</a>').join('')+'</div><div id="calcArea"></div>');
 const area=document.getElementById('calcArea');
 function money(n){return isFinite(n)?'$'+Math.round(n).toLocaleString():'—';}
 if(which==='rent'){
  area.innerHTML='<div class="formcard" style="max-width:none"><div class="calc"><div><div class="field-row"><label>Monthly rent</label><input id="r_rent" type="number" value="2150"></div><div class="field-row"><label>Security deposit</label><input id="r_dep" type="number" value="2150"></div><div class="field-row"><label>Application & admin fees</label><input id="r_fee" type="number" value="95"></div><div class="field-row"><label>Free months (concession)</label><input id="r_free" type="number" value="0" step="0.5"></div><div class="field-row"><label>Lease length (months)</label><input id="r_len" type="number" value="12"></div></div><div class="out"><div class="k" style="font-size:11px;color:var(--muted)">TRUE FIRST-MONTH COST</div><div class="big" id="r_first"></div><div class="line"><span>Effective monthly rent</span><span id="r_eff"></span></div><div class="line"><span>Total cost of lease</span><span id="r_total"></span></div><div class="line"><span>Move-in cash needed</span><span id="r_movein"></span></div></div></div></div>';
  const f=()=>{const rent=+r_rent.value||0,dep=+r_dep.value||0,fee=+r_fee.value||0,free=+r_free.value||0,len=+r_len.value||12;
   const total=rent*(len-free)+fee;const eff=total/len;const first=rent+dep+fee;const movein=rent+dep+fee;
   r_first.textContent=money(first);r_eff.textContent=money(eff);r_total.textContent=money(total);r_movein.textContent=money(movein);};
  ['r_rent','r_dep','r_fee','r_free','r_len'].forEach(id=>document.getElementById(id).addEventListener('input',f));f();
 } else if(which==='offer'){
  area.innerHTML='<div class="formcard" style="max-width:none"><div class="calc"><div><div class="field-row"><label>Base pay (per hour)</label><input id="o_rate" type="number" value="26"></div><div class="field-row"><label>Hours per week</label><input id="o_hrs" type="number" value="40"></div><div class="field-row"><label>Benefits value (per month)</label><input id="o_ben" type="number" value="450"></div><div class="field-row"><label>Commute (miles each way)</label><input id="o_mi" type="number" value="12"></div><div class="field-row"><label>Days on-site / week</label><input id="o_days" type="number" value="3"></div></div><div class="out"><div class="k" style="font-size:11px;color:var(--muted)">ANNUAL VALUE</div><div class="big" id="o_year"></div><div class="line"><span>Monthly gross</span><span id="o_mo"></span></div><div class="line"><span>+ Benefits / year</span><span id="o_beny"></span></div><div class="line"><span>− Commute cost / year</span><span id="o_comm"></span></div><div class="line"><span>Effective hourly (after commute)</span><span id="o_eff"></span></div></div></div></div>';
  const f=()=>{const rate=+o_rate.value||0,hrs=+o_hrs.value||0,ben=+o_ben.value||0,mi=+o_mi.value||0,days=+o_days.value||0;
   const gross=rate*hrs*52;const beny=ben*12;const commute=mi*2*days*50*0.67;const net=gross+beny-commute;
   const effHours=hrs*52+days*50*(mi*2/30);const eff=(gross+beny-commute)/effHours;
   o_year.textContent=money(net);o_mo.textContent=money(gross/12);o_beny.textContent=money(beny);o_comm.textContent=money(commute);o_eff.textContent=money(eff)+'/hr';};
  ['o_rate','o_hrs','o_ben','o_mi','o_days'].forEach(id=>document.getElementById(id).addEventListener('input',f));f();
 } else {
  area.innerHTML='<div class="formcard" style="max-width:none"><p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Paste two quotes to see which is really cheaper once fees and exclusions are counted.</p><div class="calc"><div><div class="field-row"><label>Quote A — price</label><input id="qa" type="number" value="1250"></div><div class="field-row"><label>Quote A — extra fees</label><input id="qaf" type="number" value="0"></div><div class="field-row"><label>Quote A — excluded add-ons</label><input id="qax" type="number" value="130"></div></div><div><div class="field-row"><label>Quote B — price</label><input id="qb" type="number" value="1180"></div><div class="field-row"><label>Quote B — extra fees</label><input id="qbf" type="number" value="140"></div><div class="field-row"><label>Quote B — excluded add-ons</label><input id="qbx" type="number" value="90"></div></div></div><div class="out" style="margin-top:12px"><div class="line"><span>Quote A true total</span><span id="qat"></span></div><div class="line"><span>Quote B true total</span><span id="qbt"></span></div><div class="big" id="qwin" style="margin-top:8px"></div></div></div>';
  const f=()=>{const a=(+qa.value||0)+(+qaf.value||0)+(+qax.value||0);const b=(+qb.value||0)+(+qbf.value||0)+(+qbx.value||0);
   qat.textContent=money(a);qbt.textContent=money(b);qwin.textContent=a===b?'Even':(a<b?('Quote A is cheaper by '+money(b-a)):('Quote B is cheaper by '+money(a-b)));};
  ['qa','qaf','qax','qb','qbf','qbx'].forEach(id=>document.getElementById(id).addEventListener('input',f));f();
 }
};

PAGES.search = function(m){
 const q=(P.get('q')||'').toLowerCase();
 const has=s=>s.toLowerCase().includes(q);
 const groups=[];
 const prov=D.providers.filter(p=>!q||has(p.name)||has(p.cat));if(prov.length)groups.push(['Providers',prov.map(p=>'<li><div class="thumb" style="background:'+p.c+'">'+esc(p.name[0])+'</div><div class="rmain"><h3><a href="business.html?id='+p.id+'">'+esc(p.name)+'</a></h3><div class="rmeta">'+esc(p.cat)+'</div></div></li>').join('')]);
 const rent=D.housing.filter(h=>!q||has(h.title)||has(h.city));if(rent.length)groups.push(['Rentals',rent.slice(0,5).map(h=>'<li><div class="thumb">'+esc(h.beds)+'</div><div class="rmain"><h3><a href="listing.html?type=rental&id='+h.id+'">'+esc(h.title)+'</a></h3><div class="rmeta">'+esc(h.city)+'</div></div><div class="rprice">'+esc(h.rent)+'</div></li>').join('')]);
 const job=D.jobs.filter(j=>!q||has(j.role)||has(j.company));if(job.length)groups.push(['Jobs',job.slice(0,5).map(j=>'<li><div class="thumb" style="background:#1d3e73">JOB</div><div class="rmain"><h3><a href="listing.html?type=job&id='+j.id+'">'+esc(j.role)+'</a></h3><div class="rmeta">'+esc(j.company)+' · '+esc(j.city)+'</div></div><div class="rprice">'+esc(j.pay)+'</div></li>').join('')]);
 const mk=D.marketplace.filter(x=>!q||has(x.item)||has(x.city));if(mk.length)groups.push(['Marketplace',mk.slice(0,5).map(x=>'<li><div class="thumb" style="background:#5b4a7a">'+esc(x.price)+'</div><div class="rmain"><h3><a href="listing.html?type=item&id='+x.id+'">'+esc(x.item)+'</a></h3><div class="rmeta">'+esc(x.city)+'</div></div></li>').join('')]);
 const body=groups.length?groups.map(g=>mod(g[0],'<ul class="result-list">'+g[1]+'</ul>')).join(''):'<div class="empty">No results for “'+esc(q)+'”. Try a broader term, or browse <a href="'+R('/businesses')+'">businesses</a>, <a href="'+R('/housing')+'">housing</a>, or <a href="'+R('/jobs')+'">jobs</a>.</div>';
 section(m, crumb([['Search','']]) + pageHead(q?('Results for “'+q+'”'):'Search LocalProof','Providers, rentals, jobs and marketplace items in one place.') + twocol(body, adRect(D.ads[3])+mostSearched()));
 const box=document.getElementById('lpq'); if(box) box.value=P.get('q')||'';
};

PAGES.post = function(m){
 const type=P.get('type')||'';
 const forms={
  rental:['Post a rental',[['Title','text','Bright 1BR near Old Pasadena'],['City','city',''],['Monthly rent','number','2150'],['Bedrooms','text','1 bed'],['Description','area','']]],
  job:['Post a job',[['Role','text','Customer Support Specialist'],['Company','text',''],['City','city',''],['Pay range','text','$23–27/hr'],['Description','area','']]],
  item:['Sell an item',[['Item','text','IKEA sectional sofa'],['City','city',''],['Price','number','360'],['Condition','text','Used · Excellent'],['Description','area','']]],
  request:['Request quotes',[['What do you need?','text','My ceiling is leaking'],['City','city',''],['When','text','This weekend'],['Budget (optional)','text',''],['Details','area','']]],
  question:['Ask the community',[['Your question','text','Is this application fee normal?'],['City','city',''],['Category','cat',''],['Details','area','']]]
 };
 if(!type||!forms[type]){
  section(m, crumb([['Post','']]) + pageHead('Post to LocalProof','Pick what you want to post.') +
   '<div class="chooser">'+[['rental','Post a rental','List a room or apartment'],['job','Post a job','Hire locally'],['item','Sell an item','List something for sale'],['request','Request quotes','Describe a job, get matched'],['question','Ask the community','Get local answers']].map(c=>'<a href="post.html?type='+c[0]+'"><span class="ci">+</span><span><b>'+esc(c[1])+'</b><p>'+esc(c[2])+'</p></span></a>').join('')+'</div>');
  return;
 }
 const [title,fields]=forms[type];
 const fh=fields.map((f,i)=>{const id='f_'+i;let ctrl;
  if(f[1]==='area')ctrl='<textarea id="'+id+'" placeholder="'+esc(f[2])+'"></textarea>';
  else if(f[1]==='city')ctrl='<select id="'+id+'">'+D.cities.map(c=>'<option>'+esc(c.name)+'</option>').join('')+'</select>';
  else if(f[1]==='cat')ctrl='<select id="'+id+'">'+D.categories.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select>';
  else ctrl='<input id="'+id+'" type="'+f[1]+'" placeholder="'+esc(f[2])+'" value="'+esc(f[2])+'">';
  return '<div class="field-row"><label for="'+id+'">'+esc(f[0])+'</label>'+ctrl+'</div>';}).join('');
 section(m, crumb([['Post','/post'],[title,'']]) + pageHead(title,'Demonstration form — fills in, validates, and confirms. Publishing needs an account.') +
  '<div class="formcard"><div id="postOk" class="form-ok" style="display:none">Posted (demo). In the full build this publishes to '+esc(type)+' after you sign in.</div>'+fh+'<button class="go" id="postBtn">'+esc(title)+'</button><div class="guest-note">You are browsing as a guest. Sign in to publish and manage your post. <a href="'+R('/signin')+'">Sign in</a></div></div>');
 const btn=document.getElementById('postBtn');
 if(btn)btn.addEventListener('click',()=>{document.getElementById('postOk').style.display='block';window.scrollTo({top:0,behavior:'smooth'});});
};

function authPage(m,mode){
 const other=mode==='signin'?['Create a free business account','/signup']:['Sign in','/signin'];
 section(m, crumb([[mode==='signin'?'Sign in':'Register','']]) +
  '<div style="max-width:440px;margin:0 auto"><div class="formcard">'+
  '<h1 style="font-family:var(--serif);font-size:22px;margin-bottom:4px">'+(mode==='signin'?'Sign in to LocalProof':'Create your business account')+'</h1>'+
  '<p style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Post and manage your business listings. '+esc(COUNTY_NAME[LP_COUNTY])+' edition.</p>'+
  '<div id="authMsg" class="form-ok" style="display:none"></div>'+
  '<div id="authErr" style="display:none;background:#fdecea;border:1px solid #f5c6cb;color:#8a1c1c;padding:9px 11px;border-radius:4px;font-size:12.5px;margin-bottom:10px"></div>'+
  '<div class="field-row"><label for="a_email">Email</label><input id="a_email" type="email" placeholder="you@business.com" autocomplete="email"></div>'+
  '<div class="field-row"><label for="a_pw">Password</label><input id="a_pw" type="password" autocomplete="'+(mode==='signin'?'current-password':'new-password')+'"'+(mode==='signup'?' placeholder="At least 6 characters"':'')+'></div>'+
  '<button class="go btn-block" id="authBtn" style="width:100%">'+(mode==='signin'?'Sign in':'Create account')+'</button>'+
  '<p style="font-size:12.5px;color:var(--muted);margin-top:12px;text-align:center">'+(mode==='signin'?'New here? ':'Have an account? ')+'<a href="'+R(other[1])+'">'+esc(other[0])+'</a></p>'+
  '<div class="guest-note" style="margin-top:10px">Business accounts let you create listings that go live after a quick review.</div>'+
  '</div></div>');
 const btn=document.getElementById('authBtn');
 const errB=document.getElementById('authErr'), msgB=document.getElementById('authMsg');
 const showErr=t=>{errB.textContent=t;errB.style.display='block';msgB.style.display='none';};
 const showMsg=t=>{msgB.textContent=t;msgB.style.display='block';errB.style.display='none';};
 if(btn)btn.addEventListener('click',async()=>{
   const email=(document.getElementById('a_email').value||'').trim();
   const pw=document.getElementById('a_pw').value||'';
   if(!email||!pw){showErr('Enter your email and password.');return;}
   btn.disabled=true;btn.textContent='Working…';
   try{
     const sb=await sbClient();
     if(mode==='signup'){
       const{data,error}=await sb.auth.signUp({email,password:pw});
       if(error)throw error;
       if(data.session){showMsg('Account created. Redirecting…');setTimeout(()=>location.href='dashboard.html',700);}
       else{showMsg('Account created. Check your email to confirm, then sign in.');btn.disabled=false;btn.textContent='Create account';}
     }else{
       const{error}=await sb.auth.signInWithPassword({email,password:pw});
       if(error)throw error;
       showMsg('Signed in. Redirecting…');setTimeout(()=>location.href='dashboard.html',600);
     }
   }catch(err){showErr(err.message||'Something went wrong.');btn.disabled=false;btn.textContent=(mode==='signin'?'Sign in':'Create account');}
 });
}
PAGES.signin=m=>authPage(m,'signin');
PAGES.signup=m=>authPage(m,'signup');

/* ---------- Business dashboard (owner-facing, real Supabase) ---------- */
PAGES.dashboard = function(m){
 section(m, crumb([['For businesses','/advertise'],['Dashboard','']]) + pageHead('Business dashboard','Create your business, post listings, and submit them for review.','<span id="dashUser"></span>') + '<div id="dashBody"><div class="empty">Loading…</div></div>');
 const body=()=>document.getElementById('dashBody');
 const CATS=(D.categories||['Home Services','Legal','Healthcare','Auto','Education','Restaurants']);
 const CITIES=(D._full&&D._full.cities)||D.cities||[];
 const TYPES=[['service','Service listing'],['rental','Rental'],['job','Job'],['marketplace','Marketplace item'],['deal','Deal'],['offer','Verified offer']];
 const pill=p=>{const map={draft:['Draft','#6b7280'],pending:['Pending review','#b9770a'],published:['Live','#1c7a4a'],removed:['Removed','#b5341f'],paused:['Paused','#6b7280'],expired:['Expired','#6b7280']};const x=map[p]||[p,'#6b7280'];return '<span class="tag-pill" style="background:'+x[1]+'1a;color:'+x[1]+';border-color:'+x[1]+'66">'+esc(x[0])+'</span>';};

 async function guard(){
   const u=await currentUser();
   if(!u){ body().innerHTML='<div class="formcard" style="max-width:520px"><h3 style="margin-bottom:6px">Sign in to manage your business</h3><p style="font-size:12.5px;color:var(--muted);margin-bottom:12px">Create a free business account to post listings on LocalProof.</p><div style="display:flex;gap:8px"><a class="go" href="'+R('/signin')+'" style="text-decoration:none">Sign in</a><a class="adcta-sm" href="'+R('/signup')+'">Create account</a></div></div>'; return null; }
   const uEl=document.getElementById('dashUser');
   if(uEl){uEl.innerHTML='<span style="font-size:12px;color:var(--muted)">'+esc(u.email)+' · <a href="#" id="signout">Sign out</a></span>';
     document.getElementById('signout').addEventListener('click',async e=>{e.preventDefault();const sb=await sbClient();await sb.auth.signOut();location.reload();});}
   return u;
 }
 async function load(u){
   const sb=await sbClient();
   const{data:mems,error:e1}=await sb.from('lp_business_members').select('business_id,role').eq('user_id',u.id);
   if(e1)throw e1;
   const ids=(mems||[]).map(x=>x.business_id);
   let bizs=[],posts=[];
   if(ids.length){
     const b=await sb.from('lp_businesses').select('*').in('id',ids); if(b.error)throw b.error; bizs=b.data||[];
     const p=await sb.from('lp_posts').select('*').in('business_id',ids).order('created_at',{ascending:false}); if(p.error)throw p.error; posts=p.data||[];
   }
   return {bizs,posts};
 }
 function postRow(p){
   return '<div class="dpost"><div><b>'+esc(p.title)+'</b> '+pill(p.publish_status)+' <span style="font-size:11px;color:var(--faint)">'+esc(p.post_type)+'</span>'+
     (p.summary?'<div style="font-size:11.5px;color:var(--muted)">'+esc(p.summary)+'</div>':'')+'</div>'+
     (p.publish_status==='draft'?'<button class="adcta-sm submitpost" data-id="'+p.id+'">Submit for review</button>':'')+'</div>';
 }
 function postForm(bid){
   return '<div class="formcard" style="margin-top:8px" data-biz="'+bid+'">'+
     '<div class="field-row"><label>Title</label><input class="np_title" type="text" placeholder="e.g. 20% off first plumbing visit"></div>'+
     '<div class="field-row"><label>Type</label><select class="np_type">'+TYPES.map(t=>'<option value="'+t[0]+'">'+t[1]+'</option>').join('')+'</select></div>'+
     '<div class="field-row"><label>Summary</label><input class="np_summary" type="text" placeholder="One line customers see first"></div>'+
     '<div class="field-row"><label>Details</label><textarea class="np_desc" placeholder="Describe the offer, service, or listing"></textarea></div>'+
     '<button class="go createpost" data-biz="'+bid+'">Save draft</button>'+
     '<div class="guest-note">Saved as a draft — submit it when ready and it goes live after review.</div></div>';
 }
 function bizCard(b,posts){
   const bp=posts.filter(p=>p.business_id===b.id);
   const rows=bp.length?bp.map(postRow).join(''):'<div style="font-size:12px;color:var(--muted);padding:6px 0">No posts yet.</div>';
   return '<div class="biz-card" style="grid-column:1/-1"><div class="bt"><div class="bl" style="background:#16305c">'+esc((b.name||'B')[0])+'</div><div><h3>'+esc(b.name)+'</h3><div class="rmeta">'+esc(b.category||'')+' · '+esc(b.city||'')+' · '+esc((b.county||'').toUpperCase())+'</div></div></div>'+
     '<div class="dposts">'+rows+'</div>'+
     '<details class="newpost"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--navy)">+ New post</summary>'+postForm(b.id)+'</details></div>';
 }
 function newBizForm(){
   return '<section class="module"><div class="module-titlebar"><h2>Add a business</h2></div><div class="formcard" style="margin:0;border:0">'+
     '<div class="field-row"><label>Business name</label><input id="nb_name" type="text"></div>'+
     '<div class="field-row"><label>Category</label><select id="nb_cat">'+CATS.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div>'+
     '<div class="field-row"><label>City</label><select id="nb_city">'+CITIES.map(c=>'<option>'+esc(c.name)+'</option>').join('')+'</select></div>'+
     '<div class="field-row"><label>County</label><select id="nb_county"><option value="la">Los Angeles County</option><option value="oc">Orange County</option></select></div>'+
     '<button class="go" id="nb_go">Create business</button></div></section>';
 }
 async function render(){
   const u=await guard(); if(!u)return;
   let data;
   try{data=await load(u);}catch(err){body().innerHTML='<div class="empty">Could not load your data: '+esc(err.message)+'</div>';return;}
   const cards=data.bizs.length?('<div class="biz-cards">'+data.bizs.map(b=>bizCard(b,data.posts)).join('')+'</div>'):'<div class="empty" style="margin-bottom:14px">You have no businesses yet. Create one below to start posting.</div>';
   body().innerHTML=cards+newBizForm();
   wire(u);
 }
 function wire(u){
   const go=document.getElementById('nb_go');
   if(go)go.addEventListener('click',async()=>{
     const name=(document.getElementById('nb_name').value||'').trim();
     if(!name){toast('Enter a business name.');return;}
     const cat=document.getElementById('nb_cat').value,city=document.getElementById('nb_city').value,county=document.getElementById('nb_county').value;
     go.disabled=true;go.textContent='Creating…';
     try{const sb=await sbClient();const{error}=await sb.rpc('lp_create_business',{p_name:name,p_category:cat,p_city:city,p_county:county});if(error)throw error;toast('Business created.');render();}
     catch(err){toast(err.message||'Failed');go.disabled=false;go.textContent='Create business';}
   });
   body().querySelectorAll('.createpost').forEach(btn=>btn.addEventListener('click',async()=>{
     const card=btn.closest('.formcard'),bid=btn.getAttribute('data-biz');
     const title=(card.querySelector('.np_title').value||'').trim();
     if(!title){toast('Add a title.');return;}
     const post={business_id:bid,post_type:card.querySelector('.np_type').value,title:title,summary:card.querySelector('.np_summary').value||null,description:card.querySelector('.np_desc').value||null,created_by:u.id,publish_status:'draft'};
     btn.disabled=true;btn.textContent='Saving…';
     try{const sb=await sbClient();const{error}=await sb.from('lp_posts').insert(post);if(error)throw error;toast('Draft saved.');render();}
     catch(err){toast(err.message||'Failed');btn.disabled=false;btn.textContent='Save draft';}
   }));
   body().querySelectorAll('.submitpost').forEach(btn=>btn.addEventListener('click',async()=>{
     const id=btn.getAttribute('data-id');btn.disabled=true;btn.textContent='Submitting…';
     try{const sb=await sbClient();const{error}=await sb.rpc('lp_submit_post',{p_post_id:id});if(error)throw error;toast('Submitted for review.');render();}
     catch(err){toast(err.message||'Failed');btn.disabled=false;btn.textContent='Submit for review';}
   }));
 }
 render();
};

/* ---------- Staff moderation queue (staff-only, real Supabase) ---------- */
PAGES.moderate = function(m){
 section(m, crumb([['Staff','/moderate'],['Moderation','']]) + pageHead('Moderation queue','Review business posts before they go live.','<span id="modUser"></span>') + '<div id="modBody"><div class="empty">Loading…</div></div>');
 const body=()=>document.getElementById('modBody');
 async function signoutLink(sb,id){const el=document.getElementById(id);if(el)el.addEventListener('click',async e=>{e.preventDefault();await sb.auth.signOut();location.reload();});}
 async function render(){
   const u=await currentUser();
   if(!u){body().innerHTML='<div class="empty">Staff only. <a href="'+R('/signin')+'">Sign in</a> with a moderator account.</div>';return;}
   const sb=await sbClient();
   const{data:role}=await sb.rpc('lp_is_staff',{uid:u.id});
   if(!role){body().innerHTML='<div class="empty">Your account ('+esc(u.email)+') is not a moderator. Ask an admin to grant access. · <a href="#" id="soA">Sign out</a></div>';signoutLink(sb,'soA');return;}
   const uEl=document.getElementById('modUser');
   if(uEl){uEl.innerHTML='<span style="font-size:12px;color:var(--muted)">'+esc(u.email)+' · '+esc(role)+' · <a href="#" id="soB">Sign out</a></span>';signoutLink(sb,'soB');}
   const{data:posts,error}=await sb.from('lp_posts').select('*').eq('publish_status','pending').order('submitted_at',{ascending:true});
   if(error){body().innerHTML='<div class="empty">'+esc(error.message)+'</div>';return;}
   if(!posts||!posts.length){body().innerHTML='<div class="empty">Nothing waiting for review.</div>';return;}
   const bids=[...new Set(posts.map(p=>p.business_id))];
   let bmap={};
   if(bids.length){const{data:bz}=await sb.from('lp_businesses').select('id,name,city').in('id',bids);(bz||[]).forEach(b=>bmap[b.id]=b);}
   body().innerHTML='<div class="biz-cards">'+posts.map(p=>{const b=bmap[p.business_id]||{};
     return '<div class="biz-card" style="grid-column:1/-1" data-id="'+p.id+'"><div class="bt"><div class="bl" style="background:#b9770a">'+esc((b.name||'?')[0])+'</div><div><h3>'+esc(p.title)+'</h3><div class="rmeta">'+esc(b.name||'Unknown business')+' · '+esc(p.post_type)+' · '+esc(b.city||p.city||'')+'</div></div></div>'+
      (p.summary?'<p style="font-size:12.5px;color:var(--charcoal);margin:4px 0">'+esc(p.summary)+'</p>':'')+(p.description?'<p style="font-size:12px;color:var(--muted)">'+esc(p.description)+'</p>':'')+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="go approve" data-id="'+p.id+'" style="padding:7px 12px;font-size:12px">Approve</button><button class="adcta-sm act-changes" data-id="'+p.id+'">Request changes</button><button class="adcta-sm act-reject" data-id="'+p.id+'" style="border-color:#b5341f;color:#b5341f">Reject</button></div>'+
      '<div class="reasonbox" hidden style="margin-top:8px"><textarea class="reason" placeholder="Reason (required)" style="width:100%;min-height:56px"></textarea><button class="go confirmreason" style="margin-top:6px;padding:6px 12px;font-size:12px">Confirm</button> <button class="adcta-sm cancelreason">Cancel</button></div></div>';
   }).join('')+'</div>';
   wire(sb);
 }
 function wire(sb){
   const act=async(fn,args,ok)=>{try{const{error}=await sb.rpc(fn,args);if(error)throw error;toast(ok);render();}catch(err){toast(err.message||'Failed');}};
   body().querySelectorAll('.approve').forEach(b=>b.addEventListener('click',()=>act('lp_approve_post',{p_post_id:b.getAttribute('data-id')},'Approved — now live.')));
   const showReason=(card,mode)=>{card.dataset.mode=mode;const rb=card.querySelector('.reasonbox');rb.hidden=false;rb.querySelector('.reason').focus();};
   body().querySelectorAll('.act-reject').forEach(b=>b.addEventListener('click',()=>showReason(b.closest('.biz-card'),'reject')));
   body().querySelectorAll('.act-changes').forEach(b=>b.addEventListener('click',()=>showReason(b.closest('.biz-card'),'changes')));
   body().querySelectorAll('.cancelreason').forEach(b=>b.addEventListener('click',()=>{const rb=b.closest('.reasonbox');rb.hidden=true;}));
   body().querySelectorAll('.confirmreason').forEach(b=>b.addEventListener('click',()=>{
     const card=b.closest('.biz-card'),id=card.getAttribute('data-id'),mode=card.dataset.mode;
     const reason=(card.querySelector('.reason').value||'').trim();
     if(!reason){toast('A reason is required.');return;}
     if(mode==='reject')act('lp_reject_post',{p_post_id:id,p_reason:reason},'Rejected.');
     else act('lp_request_changes',{p_post_id:id,p_reason:reason},'Sent back to the owner.');
   }));
 }
 render();
};

/* ---------- Newsroom (staff-only) — write & publish OC news ---------- */
PAGES.newsroom = function(m){
 section(m, crumb([['Staff','/newsroom'],['Newsroom','']]) + pageHead('Newsroom','Write and publish Orange County news. Newest stories show first on the OC hub.','<span id="nrUser"></span>') + '<div id="nrBody"><div class="empty">Loading…</div></div>');
 const body=()=>document.getElementById('nrBody');
 const CATS=['Government','Public Safety','Housing','Business','Community','Education','Transportation','Local'];
 let editing=null;
 async function guard(){
   const u=await currentUser();
   if(!u){body().innerHTML='<div class="empty">Staff only. <a href="'+R('/signin')+'">Sign in</a> with a moderator account.</div>';return null;}
   const sb=await sbClient();
   const{data:role}=await sb.rpc('lp_is_staff',{uid:u.id});
   if(!role){body().innerHTML='<div class="empty">Your account ('+esc(u.email)+') is not staff. Ask an admin for access.</div>';return null;}
   const uEl=document.getElementById('nrUser');
   if(uEl){uEl.innerHTML='<span style="font-size:12px;color:var(--muted)">'+esc(u.email)+' · '+esc(role)+' · <a href="#" id="nrSo">Sign out</a></span>';document.getElementById('nrSo').addEventListener('click',async e=>{e.preventDefault();await sb.auth.signOut();location.reload();});}
   return {u,sb};
 }
 function form(){
   const e=editing||{};
   return '<section class="module"><div class="module-titlebar red"><h2>'+(editing?'Edit story':'Write a story')+'</h2></div><div class="formcard" style="margin:0;border:0">'+
     '<div class="field-row"><label>Headline</label><input id="nr_title" type="text" value="'+esc(e.title||'')+'"></div>'+
     '<div class="field-row"><label>Dek (one-line summary)</label><input id="nr_dek" type="text" value="'+esc(e.dek||'')+'"></div>'+
     '<div class="field-row"><label>Category</label><select id="nr_cat">'+CATS.map(c=>'<option'+(e.category===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
     '<div class="field-row"><label>Body (separate paragraphs with a blank line)</label><textarea id="nr_body" style="min-height:170px">'+esc(e.body||'')+'</textarea></div>'+
     '<div class="field-row"><label>Source name</label><input id="nr_src" type="text" placeholder="e.g. Voice of OC" value="'+esc(e.source_name||'')+'"></div>'+
     '<div class="field-row"><label>Source URL</label><input id="nr_srcurl" type="url" placeholder="https://…" value="'+esc(e.source_url||'')+'"></div>'+
     '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="go" id="nr_publish">'+(editing?'Save &amp; publish':'Publish')+'</button><button class="adcta-sm" id="nr_draft">Save as draft</button>'+(editing?'<button class="adcta-sm" id="nr_cancel">Cancel edit</button>':'')+'</div></div></section>';
 }
 function listHTML(items){
   if(!items.length)return '<div class="empty">No stories yet. Write your first one above.</div>';
   return '<section class="module"><div class="module-titlebar"><h2>Your stories</h2></div><table class="rtable"><thead><tr><th>Headline</th><th>Category</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody>'+
     items.map(a=>'<tr><td class="role"><a href="article.html?src=oc&id='+a.id+'">'+esc(a.title)+'</a><div style="font-size:11px;color:var(--faint)">'+esc(String(a.published_at||a.created_at||'').slice(0,10))+'</div></td><td>'+esc(a.category)+'</td><td>'+(a.status==='published'?'<span class="tag-pill green">Live</span>':'<span class="tag-pill">'+esc(a.status)+'</span>')+'</td><td style="text-align:right;white-space:nowrap"><a href="#" class="nr-edit" data-id="'+a.id+'">Edit</a> · '+(a.status==='published'?'<a href="#" class="nr-unpub" data-id="'+a.id+'">Unpublish</a>':'<a href="#" class="nr-pub" data-id="'+a.id+'">Publish</a>')+' · <a href="#" class="nr-del" data-id="'+a.id+'" style="color:#b5341f">Delete</a></td></tr>').join('')+
     '</tbody></table></section>';
 }
 async function render(){
   const ctx=await guard(); if(!ctx)return; const {u,sb}=ctx;
   const{data:items,error}=await sb.from('lp_news').select('*').eq('county','oc').order('published_at',{ascending:false,nullsFirst:false});
   if(error){body().innerHTML='<div class="empty">'+esc(error.message)+'</div>';return;}
   body().innerHTML=form()+listHTML(items||[]);
   wire(u,sb,items||[]);
 }
 function collect(){return {title:(document.getElementById('nr_title').value||'').trim(),dek:document.getElementById('nr_dek').value||null,category:document.getElementById('nr_cat').value,body:document.getElementById('nr_body').value||null,source_name:document.getElementById('nr_src').value||null,source_url:document.getElementById('nr_srcurl').value||null};}
 function wire(u,sb,items){
   const save=async(status)=>{
     const d=collect(); if(!d.title){toast('Add a headline.');return;}
     const row=Object.assign({},d,{county:'oc',status:status,created_by:u.id});
     if(status==='published')row.published_at=new Date().toISOString();
     try{
       if(editing){const{error}=await sb.from('lp_news').update(row).eq('id',editing.id);if(error)throw error;}
       else{const{error}=await sb.from('lp_news').insert(row);if(error)throw error;}
       toast(status==='published'?'Published.':'Saved draft.');editing=null;render();window.scrollTo({top:0,behavior:'smooth'});
     }catch(err){toast(err.message||'Failed');}
   };
   const pb=document.getElementById('nr_publish'); if(pb)pb.addEventListener('click',()=>save('published'));
   const db=document.getElementById('nr_draft'); if(db)db.addEventListener('click',()=>save('draft'));
   const cb=document.getElementById('nr_cancel'); if(cb)cb.addEventListener('click',()=>{editing=null;render();});
   const setStatus=async(id,st)=>{try{const patch={status:st};if(st==='published')patch.published_at=new Date().toISOString();const{error}=await sb.from('lp_news').update(patch).eq('id',id);if(error)throw error;toast(st==='published'?'Published.':'Unpublished.');render();}catch(err){toast(err.message||'Failed');}};
   body().querySelectorAll('.nr-edit').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();editing=items.find(x=>x.id===a.getAttribute('data-id'));render();window.scrollTo({top:0,behavior:'smooth'});}));
   body().querySelectorAll('.nr-pub').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();setStatus(a.getAttribute('data-id'),'published');}));
   body().querySelectorAll('.nr-unpub').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();setStatus(a.getAttribute('data-id'),'draft');}));
   body().querySelectorAll('.nr-del').forEach(a=>a.addEventListener('click',async e=>{e.preventDefault();const tr=a.closest('tr');tr.style.opacity='.5';try{const{error}=await sb.from('lp_news').delete().eq('id',a.getAttribute('data-id'));if(error)throw error;toast('Deleted.');render();}catch(err){toast(err.message||'Failed');tr.style.opacity='1';}}));
 }
 render();
};

PAGES.account = function(m){
 const tabs='<div class="calc-tabs"><a class="on">Overview</a><a href="'+R('/messages')+'">Messages</a><a href="'+R('/saved')+'">Saved</a><a href="'+R('/post')+'">Post</a></div>';
 const cards='<div class="biz-cards">'+[['Your posts','0 active — post a rental, job, or item','/post'],['Requests','No open requests — describe a job to get quotes','/request/new'],['Saved','Nothing saved yet','/saved'],['Messages','No messages yet','/messages']].map(c=>'<div class="biz-card"><h3>'+esc(c[0])+'</h3><p style="font-size:12.5px;color:var(--muted)">'+esc(c[1])+'</p><a class="adcta-sm" href="'+R(c[2])+'">Open</a></div>').join('')+'</div>';
 section(m, crumb([['Account','']]) + pageHead('Your dashboard','Demonstration account view (guest). Sign in to load real data.') + tabs + cards);
};

PAGES.saved = function(m){
 section(m, crumb([['Saved','']]) + pageHead('Saved','Places, listings and providers you save appear here.') +
  '<div class="empty">You have not saved anything yet. Browse <a href="'+R('/housing')+'">rentals</a>, <a href="'+R('/businesses')+'">providers</a>, or <a href="'+R('/marketplace')+'">marketplace</a> and tap Save.</div>');
};

PAGES.messages = function(m){
 const sample=[['Arcadia Careful Movers','Re: 1BR Arcadia → Irvine','Yes, Saturday works. Flat $740 all-in.','2h'],['Valley Ridge Property Mgmt','Re: 2BR Downtown Alhambra','The unit is available for an Aug 15 move-in.','1d']];
 const list='<ul class="result-list" style="border:1px solid var(--border)">'+sample.map(s=>'<li><div class="thumb" style="background:#16305c">'+esc(s[0][0])+'</div><div class="rmain"><h3>'+esc(s[0])+'</h3><div class="rmeta">'+esc(s[1])+' — '+esc(s[2])+'</div></div><span style="font-size:11px;color:var(--faint)">'+esc(s[3])+'</span></li>').join('')+'</ul>';
 section(m, crumb([['Messages','']]) + pageHead('Messages','Demonstration inbox. Sign in to load your conversations.') + list);
};

PAGES.safety = function(m){
 const badges=[['Contact verified','A contact channel (email, phone, or domain) was confirmed. Not ownership or quality.'],['Business ownership verified','The claimant\'s control of the business was verified. Does not imply quality.'],['License checked on [date]','A professional license was checked against a source on that date. Licenses expire.'],['Transaction confirmed','Both parties confirmed completion, or we hold fulfillment evidence. Not a quality guarantee.'],['Community recommended','Surfaced through accepted answers and helpful votes. Community opinion, not verified fact.'],['Platform-reviewed offer','A specific offer was reviewed for complete terms and fees — the offer only, not the whole provider.'],['Sponsored','Paid placement, shown separately. Not organic ranking, quality, or trust.']];
 const bg='<div class="glossary">'+badges.map(b=>'<div class="gitem"><span class="bname">'+esc(b[0])+'</span><p>'+esc(b[1])+'</p></div>').join('')+'</div>';
 const tips='<div class="alert" style="border:1px solid #f0cdc7"><div class="hd">Before you pay a deposit</div><ul>'+D.alerts.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul></div>';
 section(m, crumb([['Safety','']]) + pageHead('Clear evidence. Honest limits.','How LocalProof shows what it knows — and what verification does not promise.') +
  '<h2 style="font-family:var(--serif);font-size:17px;margin:6px 0 10px">What each badge actually means</h2>'+bg+
  '<h2 style="font-family:var(--serif);font-size:17px;margin:16px 0 10px">Avoiding scams</h2>'+tips+
  '<p style="font-size:12px;color:var(--muted);margin-top:14px">Report a scam or inaccurate listing anytime — every report is reviewed. LocalProof does not guarantee outcomes; badges prove specific facts, not that work will be good.</p>');
};

PAGES.about = function(m){
 section(m, crumb([['About','']]) + pageHead('About LocalProof','The Greater Los Angeles community, classifieds and local-business portal.') +
  '<div class="detail article"><div class="body"><p>LocalProof helps Los Angeles residents find local help, understand what is fair, and see real evidence before they act. It combines a business directory, community Q&A, rentals, jobs, a marketplace, structured quote requests, and completed local outcomes in one place.</p><p>This is a demonstration build with seeded data. Sponsored placements are labeled, exact home addresses stay private, and provider evidence is dated.</p><p id="contact"><b>Contact:</b> hello@localproof.example · Advertise with us on the <a href="'+R('/advertise')+'">advertising page</a>.</p></div></div>');
};

PAGES.advertise = function(m){
 const packs='<div class="biz-cards">'+D.ad_packages.map(p=>'<div class="biz-card"><h3>'+esc(p.name)+'</h3><div style="font-size:20px;font-weight:800;color:var(--navy)">'+esc(p.price)+'</div><p style="font-size:12.5px;color:var(--muted)">'+esc(p.desc)+'</p><button class="go" data-confirm="Thanks — our team will follow up (demo).">'+esc(p.cta)+'</button></div>').join('')+'</div>';
 section(m, crumb([['Advertise','']]) + pageHead('Advertise on LocalProof','Reach Greater LA residents where they search, rent, hire and buy. All paid placements are labeled.') + twocol(packs, mod('Why it works','<div style="padding:10px;font-size:12.5px;color:var(--charcoal)">Ads and sponsored listings are clearly labeled and never change review scores or organic ranking. That transparency is why residents trust the placements.</div>')+adRect(D.ads[3])));
};

PAGES.claim = function(m){
 section(m, crumb([['For businesses','/advertise'],['Claim','']]) + pageHead('Claim or add your business','Build a record customers can actually evaluate. Claiming is free.') +
  '<div class="formcard"><div id="claimOk" class="form-ok" style="display:none">Request received (demo). We\'ll verify ownership and email you next steps.</div><div class="field-row"><label for="c_name">Business name</label><input id="c_name" type="text"></div><div class="field-row"><label for="c_cat">Category</label><select id="c_cat">'+D.categories.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div><div class="field-row"><label for="c_city">City</label><select id="c_city">'+D.cities.map(c=>'<option>'+esc(c.name)+'</option>').join('')+'</select></div><div class="field-row"><label for="c_email">Your email</label><input id="c_email" type="email"></div><button class="go" id="claimBtn">Submit claim</button><div class="guest-note">Claiming is free. Promotion is always labeled and never changes review scores.</div></div>');
 const b=document.getElementById('claimBtn'); if(b)b.addEventListener('click',()=>{document.getElementById('claimOk').style.display='block';window.scrollTo({top:0,behavior:'smooth'});});
};

PAGES.city = function(m){
 const slug=P.get('c')||'greater-los-angeles';
 const city=D.cities.find(c=>c.slug===slug)||{name:'Greater Los Angeles',slug:'greater-los-angeles'};
 const links=[['Rentals','/housing'],['Jobs','/jobs'],['Providers','/businesses'],['Marketplace','/marketplace'],['Community','/community'],['Guides','/guides'],['Deals','/deals'],['Events','/events']];
 const grid='<div class="biz-cards">'+links.map(l=>'<div class="biz-card"><h3><a href="'+R(l[1])+'">'+esc(l[0])+' in '+esc(city.name)+'</a></h3><p style="font-size:12px;color:var(--muted)">Browse '+esc(l[0].toLowerCase())+' near '+esc(city.name)+'.</p><a class="adcta-sm" href="'+R(l[1])+'">Open</a></div>').join('')+'</div>';
 const rentals=mod('Latest rentals in '+city.name,'<ul class="classified-list">'+D.housing.slice(0,4).map(h=>'<li><div class="t"><a href="listing.html?type=rental&id='+h.id+'">'+esc(h.title)+'</a><div class="sub">'+esc(h.city)+'</div></div><div class="price">'+esc(h.rent)+'</div></li>').join('')+'</ul>','/housing');
 section(m, crumb([['Cities',''],[city.name,'']]) + pageHead(city.name,'Everything local: rentals, jobs, providers, outcomes, community and guides.') + twocol(grid, rentals+mostSearched()));
};

PAGES.user = function(m){
 const u=userByName(P.get('u')||P.get('id')||'foodie_lin')||D.users[0];
 const tab=P.get('tab')||'all';
 const posts=D._full.community.filter(q=>q.author===u.username);
 const revs=D.reviews.filter(r=>r.author===u.username);
 const biz=D._full.providers.filter(p=>p.owner===u.username);
 const guides=D.guides.slice(0, u.guides||0);
 const tabs=[['all','All'],['posts','Posts ('+posts.length+')'],['reviews','Reviews ('+revs.length+')'],['businesses','Businesses ('+biz.length+')'],['guides','Guides ('+guides.length+')']];
 const tabbar='<div class="subnav">'+tabs.map(t=>'<a href="user.html?u='+encodeURIComponent(u.username)+'&tab='+t[0]+'"'+(t[0]===tab?' class="act"':'')+'>'+esc(t[1])+'</a>').join('')+'</div>';
 const postsHTML=posts.length?'<ul class="classified-list" style="border:1px solid var(--border)">'+posts.map(q=>'<li><div class="t"><a href="thread.html?id='+q.id+'">'+esc(q.q)+'</a><div class="sub">'+esc(q.city)+' · '+esc(q.cat)+'</div></div><div class="price" style="color:var(--navy)">'+q.replies+'</div></li>').join('')+'</ul>':'<div class="empty">No posts yet.</div>';
 const revsHTML=revs.length?revs.map(r=>reviewSnippet(r,true)).join(''):'<div class="empty">No reviews yet.</div>';
 const bizHTML=biz.length?'<div class="biz-cards">'+biz.map(p=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:'+p.c+'">'+esc(p.name[0])+'</div><div><h3><a href="business.html?id='+p.id+'">'+esc(p.name)+'</a></h3><div class="rmeta">'+esc(p.cat)+'</div></div></div><div style="font-size:12px">★ '+(p.rating||0).toFixed(1)+' · '+p.reviews+' reviews</div></div>').join('')+'</div>':'<div class="empty">No businesses claimed.</div>';
 const guidesHTML=guides.length?'<ul class="hl-list" style="border:1px solid var(--border)">'+guides.map(g=>'<li><a href="guide.html?id='+g.id+'">'+esc(g.title)+'</a></li>').join('')+'</ul>':'<div class="empty">No guide contributions yet.</div>';
 let body='';
 if(tab==='posts')body=postsHTML;
 else if(tab==='reviews')body=revsHTML;
 else if(tab==='businesses')body=bizHTML;
 else if(tab==='guides')body=guidesHTML;
 else body=mod('Recent posts',postsHTML)+mod('Recent reviews','<div style="padding:10px">'+revsHTML+'</div>');
 const card='<div class="pcard"><div class="pav" style="background:'+u.color+'">'+esc(u.display[0])+'</div>'+
   '<h1>'+esc(u.username)+'</h1><div class="rank">'+esc(u.rank)+'</div><div class="bio">'+esc(u.bio)+'</div>'+
   '<div class="pstats"><div class="s"><div class="n">'+u.posts+'</div><div class="l">Posts</div></div><div class="s"><div class="n">'+u.replies+'</div><div class="l">Replies</div></div><div class="s"><div class="n">'+u.reviews+'</div><div class="l">Reviews</div></div></div>'+
   '<a class="pmsg" href="'+R('/messages')+'">Private message</a>'+
   '<div class="meta">Member of '+esc(u.city)+'<br>Joined '+esc(u.join)+'<br>Last seen '+esc(u.last_login)+'</div></div>';
 section(m, crumb([['Members','/members'],[u.username,'']]) + pageHead(esc(u.username)+' — member profile','Local contributor in '+esc(u.city)+'. '+u.posts+' posts · '+u.reviews+' reviews.') + '<div class="profile">'+card+'<div class="maincol">'+tabbar+body+'</div></div>');
 // SEO/GEO: Person schema
 injectLd({"@context":"https://schema.org","@type":"Person","name":u.username,"description":u.bio,"homeLocation":{"@type":"Place","name":u.city},"url":"https://www.localproof.com/user/"+u.username});
};

PAGES.members = function(m){
 const grid='<div class="members">'+D.users.map(u=>'<div class="mcard"><div class="av" style="background:'+u.color+'">'+esc(u.display[0])+'</div><a href="user.html?u='+encodeURIComponent(u.username)+'">'+esc(u.username)+'</a><div class="rk">'+esc(u.rank)+'</div><div class="st">'+esc(u.city)+' · '+u.posts+' posts · '+u.reviews+' reviews</div></div>').join('')+'</div>';
 section(m, crumb([['Members','']]) + pageHead('Community Members','Residents who post, answer and review across Greater LA.') + twocol(grid, mostSearched()+safetyMini()));
};

PAGES.dental = function(m){
 // Blended featured strip (civic palette, not a loud gradient)
 const cc='<section class="cc-strip"><div><span class="cc-tag">Powered by CoverCapy</span><b>Know what your visit should cost.</b> <span class="cc-sub">Real ratings and fair-cost help for dentists across '+esc(COUNTY_NAME[LP_COUNTY])+'.</span></div>'+
   '<a class="go" href="'+CC_BASE+'" target="_blank" rel="noopener">Estimate your cost</a></section>';
 const sub=[['Dental Home','/dental','act'],['Find a Dentist','/dental'],['Cost Estimator',CC_BASE],['Open Weekends','/dental?weekend=1'],['Insurance Help',CC_BASE]];
 section(m, crumb([['Dental','']]) + subnav(sub) + pageHead('Dentists in '+COUNTY_NAME[LP_COUNTY],'Trusted local dentists with real ratings — and what a visit should cost, powered by CoverCapy.') +
   twocol(cc+'<section class="module"><div class="module-titlebar"><h2>Top dentists near you</h2><span class="more" id="dcount"></span></div><div style="padding:12px" id="dwrap"><div class="dloading">Loading dentists…</div></div></section>',
   mostSearched()+safetyMini()));
 injectLd({"@context":"https://schema.org","@type":"CollectionPage","name":"Dentists in "+COUNTY_NAME[LP_COUNTY],"about":"Local dentists and dental cost transparency"});
 const wrap=document.getElementById('dwrap'), cnt=document.getElementById('dcount');
 const dcard=d=>{const nm=d.practice_name||d.name;const rev=d.aggregate_review_count?(' · '+d.aggregate_review_count.toLocaleString()+' reviews'):'';
   return '<div class="biz-card"><div class="bt"><div class="bl" style="background:#1d6f8b">'+esc(nm[0]||'D')+'</div><div><h3><a href="'+dentistProfileUrl(d)+'" target="_blank" rel="noopener">'+esc(nm)+'</a></h3><div class="rmeta">'+esc(d.city||'')+(d.neighborhood?' · '+esc(d.neighborhood):'')+'</div></div></div>'+
    '<div style="font-size:12px">'+(d.aggregate_rating?stars(d.aggregate_rating)+' '+d.aggregate_rating+rev:'<span style="color:var(--muted)">Not yet rated</span>')+'</div>'+
    (d.specialties?'<div class="rmeta">'+esc(Array.isArray(d.specialties)?d.specialties.join(', '):d.specialties)+'</div>':'')+
    '<div style="display:flex;gap:5px;flex-wrap:wrap">'+(d.open_weekends?'<span class="tag-pill green">Open weekends</span>':'')+(d.accepting_new_patients?'<span class="tag-pill">New patients</span>':'')+'</div>'+
    '<div class="src-cite">Source: <a href="'+dentistProfileUrl(d)+'" target="_blank" rel="noopener">CoverCapy</a> · live</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap"><a class="go" href="'+CC_BASE+'" target="_blank" rel="noopener" style="font-size:12px;padding:7px 12px">Estimate cost</a><a class="adcta-sm" href="'+dentistProfileUrl(d)+'" target="_blank" rel="noopener">View profile</a></div></div>';};
 fetchDentists(LP_COUNTY, 24).then(list=>{
   const weekend=P.get('weekend')==='1'; if(weekend)list=list.filter(d=>d.open_weekends);
   if(!list.length){wrap.innerHTML='<div class="empty">No dentists found for this county right now.</div>';return;}
   wrap.innerHTML='<div class="biz-cards">'+list.map(dcard).join('')+'</div>';
   cnt.textContent=list.length+' live from CoverCapy';
 }).catch(e=>{
   // fallback: seed dentistry providers
   const seed=D.providers.filter(x=>/dent/i.test(x.cat||''));
   wrap.innerHTML=seed.length?('<div class="biz-cards">'+seed.map(x=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:'+x.c+'">'+esc(x.name[0])+'</div><div><h3><a href="business.html?id='+x.id+'">'+esc(x.name)+'</a></h3><div class="rmeta">'+esc(x.cat)+'</div></div></div><div style="font-size:12px">'+ratingBit(x)+'</div><a class="adcta-sm" href="business.html?id='+x.id+'">View profile</a></div>').join('')+'</div>'):'<div class="empty">Couldn’t load live dentists. '+esc(e.message)+'</div>';
   cnt.textContent='showing samples';
 });
};

PAGES.readings = function(m){
 const feat='<section class="zodi-feature"><div class="cc-badge">Featured · Powered by Zodi Animal</div>'+
   '<h2>Your animal. Your reading. Your blessing.</h2>'+
   '<p>Discover your combined Eastern and Western zodiac, read what today holds, and receive a blessing for the week ahead — a moment of calm before you get back to local life.</p>'+
   '<div class="cc-cta"><a class="go" href="https://zodianimal.com" target="_blank" rel="noopener">Get your reading</a> <a class="adcta-sm" href="https://zodianimal.com" target="_blank" rel="noopener">Today’s blessing</a></div>'+
   '<div class="cc-note">Placeholder — final copy, link and branding come from the Zodi Animal profile.</div></section>';
 const cards=[['Your Primal Animal','Find the animal that carries your Eastern and Western signs together.'],
   ['Today’s Blessing','A short blessing and focus for the day, made for your sign.'],
   ['Compatibility','See how your animal meets another — in love, work, or family.'],
   ['This Year’s Forecast','What the year ahead holds for your animal.']];
 const grid='<div class="biz-cards">'+cards.map((c,i)=>'<div class="biz-card"><div class="bt"><div class="bl" style="background:'+['#5b2a7a','#2a3f7a','#7a2a52','#2a6a5b'][i%4]+'">✨</div><div><h3><a href="https://zodianimal.com" target="_blank" rel="noopener">'+esc(c[0])+'</a></h3></div></div><p style="font-size:12.5px;color:var(--muted)">'+esc(c[1])+'</p><a class="adcta-sm" href="https://zodianimal.com" target="_blank" rel="noopener">Open</a></div>').join('')+'</div>';
 const sub=[['Readings Home','/readings','act'],['Your Animal','https://zodianimal.com'],['Daily Blessing','https://zodianimal.com'],['Compatibility','https://zodianimal.com'],['Forecast','https://zodianimal.com']];
 section(m, crumb([['Readings','']]) + subnav(sub) + pageHead('Readings & Blessings','A moment for yourself — your zodiac animal, your reading, and a blessing for the week.') +
   twocol(feat+'<section class="module"><div class="module-titlebar"><h2>Explore your readings</h2></div><div style="padding:12px">'+grid+'</div></section>',
   mostSearched()+safetyMini()));
 injectLd({"@context":"https://schema.org","@type":"CollectionPage","name":"Readings & Blessings","about":"Combined Eastern and Western zodiac animal readings and blessings"});
};

PAGES.legal = function(m){
 const doc=P.get('doc')||'privacy';
 const title=doc==='terms'?'Terms of Use':'Privacy Policy';
 section(m, crumb([[title,'']]) + pageHead(title,'Demonstration document for the LocalProof prototype.') +
  '<div class="detail article"><div class="body"><p>This is placeholder '+esc(title.toLowerCase())+' text for the LocalProof demonstration build. The production version will describe how listings, accounts, messages and advertising data are handled, how addresses are kept private, and how disputes and reports are reviewed.</p><p>Questions? See the <a href="'+R('/about')+'">about page</a>.</p></div></div>');
};

/* ---------- boot ---------- */
function boot(){
 document.getElementById('lp-top').innerHTML = utilityHTML()+mastheadHTML()+searchHTML()+navHTML(document.body.dataset.nav||'')+mQuickHTML();
 document.getElementById('lp-foot').innerHTML = footerHTML();
 const main=document.getElementById('lp-main');
 const page=document.body.dataset.page||'home';
 try{ (PAGES[page]||PAGES.home)(main); }catch(err){ main.innerHTML='<div class="shell page-wrap"><div class="empty">This page failed to render: '+esc(err.message)+'</div></div>'; console.error(err); }
 wireDailyReading();
 // search submit
 const sf=document.getElementById('lpSearch');
 if(sf)sf.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('lpq').value.trim();location.href='search.html'+(q?('?q='+encodeURIComponent(q)):'');});
 // county toggle
 document.body.addEventListener('click',e=>{const c=e.target.closest('[data-county]');if(c){e.preventDefault();const v=c.getAttribute('data-county');try{localStorage.setItem('lp_county',v);}catch(err){}location.reload();}});
 // confirm buttons (demo actions)
 document.body.addEventListener('click',e=>{const b=e.target.closest('[data-confirm]');if(b){e.preventDefault();toast(b.getAttribute('data-confirm'));}});
 // toast
 let tEl=document.createElement('div');tEl.className='toast';tEl.setAttribute('role','status');tEl.setAttribute('aria-live','polite');document.body.appendChild(tEl);
 window._tEl=tEl;
}
let tt; function toast(msg){const t=window._tEl;if(!t)return;t.textContent=msg;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2400);}
window.toast=toast;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
