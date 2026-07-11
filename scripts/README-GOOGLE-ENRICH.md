# Google Places enrichment — how to run it (3 minutes)

This fills **rating, review count, business status, coordinates, and the Google Place ID**
onto your Orange County business rows in Supabase — the same idea as your dentist data.
The site already shows these with the required "Rating via Google" attribution + Maps link.

> It runs on **your** machine (or any server) with **your** Google key. It is NOT run inside
> the website, and it does not scrape Google — it uses the official **Places API (New)**.

## One-time setup

1. **Enable the API + billing** — Google Cloud Console → *APIs & Services* → enable **"Places API (New)"**. Make sure billing is on for the project.
2. **Restrict your key** — *Credentials* → your API key → *API restrictions* → restrict to **Places API (New)**. (Do this now — the key you shared in chat should be restricted and ideally rotated.)
3. **Get your Supabase service-role key** — Supabase → *Project Settings → API → service_role* (secret). This is different from the anon key the website uses. Keep it private.

## Run it

From the site folder:

```bash
export GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_KEY
export SUPABASE_URL=https://hfvbeqlefwwjlrbyxpbj.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

node scripts/google-enrich.mjs            # enrich OC rows that don't have a Place ID yet
```

Other options:

```bash
node scripts/google-enrich.mjs --limit 5  # try 5 first to sanity-check + see the cost
node scripts/google-enrich.mjs --all      # re-enrich ALL OC rows (use this to REFRESH ratings)
node scripts/google-enrich.mjs --county la
```

You'll see a line per business, e.g. `ok: Carbon Health — 4.4★ (1,210)`, then a summary.
Refresh the site (OC → Businesses) and the stars appear on the cards + profiles.

## What it costs

Places API (New), 2026, per the current pricing — **check your own console, it changes**:

| Fields requested | Tier | ~Cost / 1,000 calls |
|---|---|---|
| Place ID, address, coordinates | Essentials | ~$5 |
| + hours, phone, types | Pro | ~$17 |
| **+ rating, review count** (what we use) | **Enterprise** | **~$20** |

One call per business. **25 businesses ≈ 50¢. Requesting rating upgrades the whole call** to the Enterprise tier, so we make a single call per business rather than two.

## The rules we're respecting (important)

- **Place ID** can be stored **forever** — it's the stable hook.
- **Rating / review count / status** are *cached Google content*. Google's policy is that you don't warehouse it indefinitely — you **refresh** it (re-run `--all` on a cadence, e.g. monthly; we stamp `last_enriched_at`) and you **display it with attribution + a Maps link** (the site already does).
- We deliberately **do not fetch or store review text** — that's the strict-attribution, most-expensive path. Aggregate rating + count only.
- **Child-care listings:** enrichment gives you a Google rating, *not* a license check. Do not show a "Licensed"/"Verified" badge for child care without checking the California licensing site first.

## After it runs

- Rows that matched get `review_fetch_status = fetched`.
- No Google match → `no_match` (still shows as community-listed, just no stars).
- Same place matched twice → `duplicate` (dedup by Place ID protects you).

Re-run any time to refresh. The script is safe to run repeatedly.
