#!/usr/bin/env node
/**
 * Merge assets/osm-businesses.json (from osm-ingest.mjs) into the live directory
 * (assets/data.js -> window.LP_DATA.providers). Idempotent: re-running replaces
 * previously merged OSM records (matched by id) and leaves seed/claimed ones alone.
 *
 *   node scripts/merge-osm.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const dataPath = new URL("../assets/data.js", import.meta.url);
const osmPath = new URL("../assets/osm-businesses.json", import.meta.url);

const raw = readFileSync(dataPath, "utf8");
const json = raw.slice(raw.indexOf("=") + 1).trim().replace(/;\s*$/, "");
const D = JSON.parse(json);

const osm = JSON.parse(readFileSync(osmPath, "utf8"));
const COLORS = ["#153a63", "#b9770a", "#1c7a4a", "#5b4a7a", "#b5341f", "#1d6f8b", "#2a5b7a", "#7a4e05"];

// drop any previously-merged OSM providers, keep seed + claimed
D.providers = (D.providers || []).filter(p => p.source !== "OpenStreetMap");

osm.businesses.forEach((b, i) => {
  D.providers.push({
    ...b,
    c: COLORS[i % COLORS.length],
    response: "—",
    avail: b.hours || "Hours on OpenStreetMap",
    price: "See profile",
  });
});

writeFileSync(dataPath, "window.LP_DATA = " + JSON.stringify(D) + ";\n");
console.error(`Merged ${osm.businesses.length} OpenStreetMap businesses into the directory.`);
console.error(`Providers total: ${D.providers.length}. Attribution: ${osm.attribution} (${osm.license}).`);
