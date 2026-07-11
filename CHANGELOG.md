# Changelog

## Portal site v1 (10 JUL 26)
- Turned the single homepage into a 30-page working site with shared shell + router.
- Every nav item, footer link, CTA and card resolves to a real rendered page (no toasts, no dead ends).
- Dense inner pages to match ChineseInLA reference:
  - Jobs: sub-nav, keyword/location/industry/type search, 6-facet panel, Role/Company/Location/Pay/Updated table, pagination, verified-employer logo row, Job Seekers talent rail.
  - Housing: sub-nav, facet panel, listing table, pagination.
  - Businesses: category-landing (category columns + provider spotlight + verified-business rail), per-category views.
  - Community: forum table (Topic/Author/Replies-Reads), sort tabs, answer-type legend, pagination.
- Tools calculators compute (rental cost, job-offer value, quote comparator).
- Post/claim/auth forms validate and confirm; auth pages redirect to the dashboard.
- Preserved: brand, search, Greater LA city system, seeded English data, SEO, mobile, safety labels, Supabase-ready data layer.

## Full site build (10 JUL 26)
- Expanded data to 60 rentals, 60 jobs, 60 marketplace items, 40 providers, 40 threads,
  19 news, 15 deals, 14 guides, 12 events, 11 videos, 24 talent — all with stable ids.
- Every listing now clicks through to a working detail page (rich specs + description).
- New hubs: Marketplace dense card grid (facets+pagination), Talent pool, Food/Restaurants landing.
- Jobs/Housing/Community now read the full seed arrays directly (real pagination).
- Fixed title double-escaping; git initialized; push-ready.
