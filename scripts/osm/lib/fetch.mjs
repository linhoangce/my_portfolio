/**
 * Data access for the map bakes. Overpass queries go to the public mirrors in turn with exponential backoff and jitter
 * (the main instance is often at capacity); City of Vancouver Open Data exports come whole as GeoJSON. Every response
 * is cached in scripts/osm/.cache by a hash of its request, so a rerun is offline and gives the same output.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CACHE = path.resolve(HERE, "../.cache");
fs.mkdirSync(CACHE, { recursive: true });

const UA = "vancouver-2100-portfolio-bake/1.0";
const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

/** Runs an Overpass QL query (cached); returns the parsed JSON. */
export async function overpass(query, label = "query") {
  const file = path.join(CACHE, `op-${key(query)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  let wait = 5000;
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(200000),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith("{")) {
        const json = JSON.parse(text);
        // a query that ran out of time or memory still answers 200, with a remark and a partial result
        if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
        fs.writeFileSync(file, text);
        console.log(`  ${label}: ${json.elements.length} elements from ${new URL(url).host}`);
        return json;
      }
      console.log(`  ${label}: ${new URL(url).host} answered ${res.status}, retrying`);
    } catch (e) {
      console.log(`  ${label}: ${new URL(url).host} failed (${e.message.slice(0, 80)}), retrying`);
    }
    await sleep(wait * (0.75 + Math.random() * 0.5));
    wait = Math.min(wait * 2, 60000);
  }
  throw new Error(`overpass: gave up on ${label}`);
}

/** A whole City of Vancouver Open Data dataset as GeoJSON (cached). */
export async function vancouver(dataset) {
  const file = path.join(CACHE, `van-${dataset}.geojson`);
  if (!fs.existsSync(file)) {
    const url = `https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/${dataset}/exports/geojson`;
    let wait = 4000;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(300000) });
        if (!res.ok) throw new Error(`${res.status}`);
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        break;
      } catch (e) {
        if (attempt >= 5) throw new Error(`${dataset}: ${e.message}`);
        console.log(`  ${dataset}: ${e.message}, retrying`);
        await sleep(wait);
        wait *= 2;
      }
    }
  }
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`  ${dataset}: ${json.features.length} features`);
  return json;
}
