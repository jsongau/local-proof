# OpenStreetMap business ingestion

Seed the LocalProof directory with real, openly-licensed businesses from
OpenStreetMap (via the Overpass API), then let owners claim + verify them.

## Why OSM
- **Free & open** (ODbL license) — data you can store and own, unlike Google/Yelp.
- **Real local coverage** — restaurants, healthcare, auto, legal, home services, shops.
- **No reviews** — which is the point: OSM gives the *directory*, LocalProof adds the
  *evidence layer* (dated badges, outcomes, transaction-confirmed reviews) on top.

## Run it
```bash
node scripts/osm-ingest.mjs                 # all configured LA + OC cities
node scripts/osm-ingest.mjs Irvine Anaheim  # specific cities
node scripts/osm-ingest.mjs --limit 40      # cap per city
node scripts/merge-osm.mjs                  # fold results into assets/data.js
```
`osm-ingest.mjs` writes `assets/osm-businesses.json`; `merge-osm.mjs` merges it into
`window.LP_DATA.providers`. Commit + push and the new businesses are live.

Requires Node 18+ (global `fetch`). No dependencies. The public Overpass instance is
rate-limited — the script paces itself; for large runs use a self-hosted Overpass or a
provider like Geofabrik.

## Attribution is REQUIRED (do not remove)
Every OSM record carries `source`, `source_url`, and `license: "ODbL"`. The site shows
"Source: OpenStreetMap" + a link on each record and an ODbL credit in the footer.
Keep both — it's the license condition and it doubles as your GEO/citation signal.

## The claim funnel (your moat)
Ingested businesses start `claimed: false` and show a **Claim this business** CTA.
When an owner claims and you verify, flip `claimed: true` and add your evidence badges —
that's the upgrade from "community-listed" to a verified LocalProof profile.

## Production (later)
Port this to a Supabase Edge Function on a cron (see the backend scaffold): ingest per
city on a schedule, upsert into `provider_profiles` with `source`/`source_url`/`fetched_at`,
and expire stale rows. Same pattern, server-side, with freshness + provenance built in.
