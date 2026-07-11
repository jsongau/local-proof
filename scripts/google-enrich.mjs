#!/usr/bin/env node
/**
 * LocalProof — Google Places (New) business enrichment
 * ----------------------------------------------------
 * Fills google_place_id, rating, review_count, business_status, coordinates,
 * (and missing address/phone/website) onto lp_businesses rows — the same shape
 * as the dental data. You run this with YOUR OWN key; it is NOT run in the app.
 *
 * WHAT THIS IS / IS NOT
 *  - Uses the OFFICIAL Places API (New) — it does NOT scrape Google Maps pages.
 *  - Google policy: you may store the place_id INDEFINITELY, but rating / review
 *    count / status are cached content that must be REFRESHED periodically and
 *    shown WITH attribution + a Google Maps link (the app already does this).
 *    Re-run this script on a cadence (e.g. monthly) to refresh — that is why we
 *    stamp last_enriched_at.
 *  - Reviews text is intentionally NOT fetched or stored (Enterprise SKU + strict
 *    attribution rules). We store only the aggregate rating + count.
 *
 * COST (as of 2026, Places API "New", subject to change — check your console):
 *  - Text Search including rating/userRatingCount is the Enterprise+Atmosphere
 *    tier (~$20 / 1,000 calls). One call per business. 25 businesses ≈ a few cents.
 *    Requesting any high-tier field upgrades the WHOLE call to that tier.
 *
 * SETUP
 *   1. Google Cloud console → enable "Places API (New)" + billing.
 *   2. Create an API key (restrict it to Places API (New)).
 *   3. Get your Supabase SERVICE ROLE key (Project settings → API). Keep it secret.
 *   4. Export env and run:
 *
 *   export GOOGLE_MAPS_API_KEY=AIza...
 *   export SUPABASE_URL=https://hfvbeqlefwwjlrbyxpbj.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...        # service role, NOT the anon key
 *
 *   node scripts/google-enrich.mjs                 # enrich OC rows missing a place_id
 *   node scripts/google-enrich.mjs --all           # re-enrich ALL OC rows (refresh)
 *   node scripts/google-enrich.mjs --limit 10      # cap how many to process
 *   node scripts/google-enrich.mjs --county la     # different county
 *
 * Node 18+ (global fetch). No dependencies.
 */

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env. Need GOOGLE_MAPS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const li = args.indexOf("--limit");
const LIMIT = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;
const ci = args.indexOf("--county");
const COUNTY = ci >= 0 ? args[ci + 1] : "oc";

const sb = (path, init = {}) =>
  fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

// Field mask — everything we need in ONE Text Search call.
// NOTE: places.rating + places.userRatingCount push this to the Enterprise tier.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.websiteUri",
].join(",");

async function textSearch(query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, regionCode: "US", maxResultCount: 1 }),
  });
  if (!res.ok) throw new Error("Places " + res.status + " " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.places || [])[0] || null;
}

async function loadRows() {
  let q = `lp_businesses?select=id,name,city,address,phone,website,google_text_query&county=eq.${encodeURIComponent(COUNTY)}`;
  if (!ALL) q += "&google_place_id=is.null";
  q += "&order=name.asc";
  const r = await sb(q);
  if (!r.ok) throw new Error("load " + r.status + " " + (await r.text()));
  return r.json();
}

async function patch(id, body) {
  const r = await sb(`lp_businesses?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return r; // caller checks .ok / .status (409 = duplicate place_id)
}

function toUpdate(p, row) {
  const loc = p.location || {};
  const u = {
    google_place_id: p.id,
    google_maps_uri: p.googleMapsUri || null,
    latitude: loc.latitude ?? null,
    longitude: loc.longitude ?? null,
    business_status: p.businessStatus || null,
    rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null,
    review_fetch_status: "fetched",
    last_enriched_at: new Date().toISOString(),
  };
  // Only fill contact fields if we don't already have them (keep chamber data as primary).
  if (!row.address && p.formattedAddress) u.address = p.formattedAddress;
  if (!row.phone && p.nationalPhoneNumber) u.phone = p.nationalPhoneNumber;
  if (!row.website && p.websiteUri) u.website = p.websiteUri;
  return u;
}

async function run() {
  const rows = await loadRows();
  const todo = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.error(`Enriching ${todo.length} ${COUNTY.toUpperCase()} businesses (of ${rows.length} candidates)...`);
  let ok = 0, nomatch = 0, dup = 0, err = 0;

  for (const row of todo) {
    const query = row.google_text_query || `${row.name}, ${row.city || ""}, CA`;
    try {
      const p = await textSearch(query);
      if (!p) {
        await patch(row.id, { review_fetch_status: "no_match", last_enriched_at: new Date().toISOString() });
        nomatch++; console.error(`  no match: ${row.name}`);
      } else {
        const res = await patch(row.id, toUpdate(p, row));
        if (res.status === 409) { // unique google_place_id collision — another row already has it
          await patch(row.id, { review_fetch_status: "duplicate", last_enriched_at: new Date().toISOString() });
          dup++; console.error(`  duplicate place: ${row.name}`);
        } else if (!res.ok) {
          err++; console.error(`  write failed ${res.status}: ${row.name} — ${(await res.text()).slice(0,140)}`);
        } else {
          ok++; console.error(`  ok: ${row.name} — ${p.rating ?? "?"}★ (${p.userRatingCount ?? 0})`);
        }
      }
    } catch (e) {
      err++; console.error(`  error: ${row.name} — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite / smooth billing
  }
  console.error(`\nDone. enriched=${ok} no_match=${nomatch} duplicate=${dup} errors=${err}`);
  console.error(`Reminder: rating/review data is cached Google content — re-run to refresh, and keep the Google attribution + Maps link shown in the app.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
