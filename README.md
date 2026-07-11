# LocalProof — Full Multi-Page Site (10 JUL 26)

The complete, clickable LocalProof portal for Greater Los Angeles: a dense
newspaper/classifieds/directory/community site with every vertical listed out.
Static, self-contained, and Supabase-ready via a swappable data adapter.

## Run / view
Open `index.html` in a browser (keep the folder intact — pages share `assets/`).
Every link works: navigate the verticals, filter and paginate listings, open detail
pages, run the calculators, submit the forms. No backend required (seed mode).

## Pages (32) + hubs
- **Home** — dense 3-column portal (news, community, rentals, jobs, outcomes, marketplace, directory, deals, sponsored, events, video, new-to-LA).
- **Housing** — facet filters + results table + pagination over 60 rentals → rental detail.
- **Jobs** — sub-nav, facet panel, results table, pagination, verified-employer row, talent rail (60 jobs) → job detail. **Talent** pool (24 candidates).
- **Marketplace** — category sub-nav, facets, card grid, pagination (60 items) → item detail.
- **Businesses** — category-landing (columns + provider spotlight + verified rail, 40 providers) → business profile. **Food** — cuisine columns + food news + restaurant spotlight.
- **Community** — forum table with sort tabs + pagination (40 threads) → thread.
- **News** (19 articles) → article. **Deals** (15). **Guides** (14) → guide. **Events** (12). **Video** (11).
- **Tools** — rental / job-offer / quote calculators (they compute).
- **Search**, **Post** (rental/job/item/request/question), **Sign in/Register**, **Account**, **Saved**, **Messages**, **Safety**, **About**, **Advertise**, **Claim a business**, **City hub**, **Legal**.

## Architecture (Supabase-ready)
```
assets/data.js     all seed data (window.LP_DATA) with stable ids on every item
assets/portal.js   shared shell + page router; R() resolves every link to a real file
assets/portal.css  one stylesheet (newspaper palette + dense components)
*.html             thin per-page shells that set data-page and load the assets
```
To go live: swap `data.js` for the Supabase queries in the backend scaffold
(`localproof-backend-10JUL26`), set `LOCALPROOF_DATA_SOURCE=supabase`. Pages don't change.

## Tested
32 pages + parameter variants crawled: 0 dead links, 0 JS errors. Listings paginate,
filters work, detail pages resolve for generated ids, calculators compute, forms confirm.

## Push to GitHub
```
git remote add origin git@github.com:<you>/localproof.git
git push -u origin main
```
(Repo is already initialized with an initial commit.)
