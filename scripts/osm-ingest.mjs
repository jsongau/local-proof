#!/usr/bin/env node
/**
 * LocalProof — OpenStreetMap business ingester (Overpass API)
 * -----------------------------------------------------------
 * Pulls real businesses/POIs for LA + Orange County cities, maps OSM tags to the
 * LocalProof provider shape, tags each with source + source_url + ODbL license,
 * and writes assets/osm-businesses.json (ready to merge into the directory).
 *
 * Node 18+ (uses global fetch). No dependencies.
 *
 *   node scripts/osm-ingest.mjs                 # all configured cities
 *   node scripts/osm-ingest.mjs Irvine Anaheim  # just these cities
 *   node scripts/osm-ingest.mjs --limit 40      # cap per city
 *
 * ATTRIBUTION IS REQUIRED: data is © OpenStreetMap contributors, licensed ODbL.
 * The site shows "Source: OpenStreetMap" + a link on every OSM record, and an
 * ODbL credit in the footer. Do not strip these.
 */
import { writeFileSync } from "node:fs";

const OVERPASS = "https://overpass-api.de/api/interpreter";

// City -> county. Add/adjust freely.
const CITIES = {
  // Los Angeles County
  "Pasadena": "la", "Monterey Park": "la", "Alhambra": "la", "San Gabriel": "la",
  "Arcadia": "la", "Rowland Heights": "la", "West Covina": "la",
  // Orange County
  "Irvine": "oc", "Anaheim": "oc", "Santa Ana": "oc", "Huntington Beach": "oc",
  "Newport Beach": "oc", "Costa Mesa": "oc", "Fullerton": "oc", "Orange": "oc",
  "Tustin": "oc", "Mission Viejo": "oc", "Garden Grove": "oc", "Fountain Valley": "oc",
};

// OSM tag -> LocalProof category. First match wins.
const CATEGORY_RULES = [
  [t => /restaurant|cafe|fast_food|food_court|ice_cream/.test(t.amenity || ""), "Restaurants"],
  [t => t.office === "lawyer" || t.office === "notary", "Legal"],
  [t => t.office === "estate_agent", "Real Estate"],
  [t => t.office === "accountant" || t.office === "tax_advisor", "Legal & Tax"],
  [t => /dentist|doctors|clinic|pharmacy|hospital|veterinary/.test(t.amenity || "") || t.healthcare, "Healthcare"],
  [t => /car_repair|car_parts|tyres/.test(t.shop || "") || t.amenity === "car_repair" || t.amenity === "fuel", "Auto"],
  [t => /school|language_school|driving_school|music_school/.test(t.amenity || "") || t.office === "educational_institution", "Education"],
  [t => /plumber|electrician|hvac|carpenter|painter|roofer/.test(t.craft || "") || t.shop === "hardware" || t.shop === "doityourself", "Home Services"],
  [t => t.shop === "beauty" || t.shop === "hairdresser" || t.amenity === "spa", "Beauty & Wellness"],
  [t => !!t.shop, "Shopping"],
];

function categorize(tags) {
  for (const [test, cat] of CATEGORY_RULES) if (test(tags)) return cat;
  return null;
}

// Build an Overpass QL query for one city (admin area by name, US only via ISO3166-2).
function query(city) {
  return `[out:json][timeout:90];
area["name"="${city}"]["boundary"="administrative"]["ISO3166-2"~"^US-CA"]->.a;
(
  nwr["amenity"~"restaurant|cafe|fast_food|dentist|doctors|clinic|pharmacy|veterinary|car_repair|spa|school|language_school"]["name"](area.a);
  nwr["shop"]["name"](area.a);
  nwr["office"~"lawyer|notary|estate_agent|accountant|tax_advisor|educational_institution"]["name"](area.a);
  nwr["craft"~"plumber|electrician|hvac|carpenter|painter|roofer"]["name"](area.a);
);
out center tags 400;`;
}

async function overpass(q) {
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
  return res.json();
}

function toProvider(el, city, county) {
  const t = el.tags || {};
  const cat = categorize(t);
  if (!cat || !t.name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const addr = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return {
    id: `osm_${el.type}_${el.id}`,
    name: t.name,
    cat: cat + (t.cuisine ? ` · ${t.cuisine.split(";")[0]}` : ""),
    group: cat,
    area: city,
    county,
    address: addr || null,
    phone: t.phone || t["contact:phone"] || null,
    website: t.website || t["contact:website"] || null,
    hours: t.opening_hours || null,
    lat, lon,
    // Provenance / attribution (required by ODbL)
    source: "OpenStreetMap",
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    license: "ODbL",
    claimed: false,          // becomes true when an owner claims + verifies
    badges: [["Community-listed", "spon"]],
    rating: null, reviews: 0, outcomes: 0,
    prov: "Community-sourced from OpenStreetMap — unclaimed and unverified.",
  };
}

async function run() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const perCity = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const cityArgs = args.filter(a => !a.startsWith("--") && !/^\d+$/.test(a));
  const cities = cityArgs.length ? cityArgs : Object.keys(CITIES);

  const out = [];
  const seen = new Set();
  for (const city of cities) {
    const county = CITIES[city] || "la";
    process.stderr.write(`Querying ${city} (${county})... `);
    try {
      const data = await overpass(query(city));
      let n = 0;
      for (const el of data.elements || []) {
        if (n >= perCity) break;
        const p = toProvider(el, city, county);
        if (!p) continue;
        const key = p.name.toLowerCase() + "|" + city;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
        n++;
      }
      process.stderr.write(`${n} businesses\n`);
    } catch (e) {
      process.stderr.write(`ERROR ${e.message}\n`);
    }
    // Be polite to the public Overpass instance.
    await new Promise(r => setTimeout(r, 1500));
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source: "OpenStreetMap",
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    count: out.length,
    businesses: out,
  };
  writeFileSync(new URL("../assets/osm-businesses.json", import.meta.url), JSON.stringify(payload, null, 2));
  process.stderr.write(`\nWrote assets/osm-businesses.json — ${out.length} businesses.\n`);
  process.stderr.write(`Next: node scripts/merge-osm.mjs   (folds them into the live directory)\n`);
}

run();
