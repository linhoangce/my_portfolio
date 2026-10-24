import { roads } from "../components/train/roadNetwork";
import { getCityData } from "../components/train/cityData";
import { HEROES } from "../components/train/buildings/heroes";

const want = process.argv.slice(2);
const { edges } = roads();
for (const name of want) {
  const segs: string[] = [];
  for (const e of edges) {
    if (e.name !== name) continue;
    const n = e.pts.length / 2;
    segs.push(`[${e.pts[0].toFixed(0)},${e.pts[1].toFixed(0)}→${e.pts[(n - 1) * 2].toFixed(0)},${e.pts[(n - 1) * 2 + 1].toFixed(0)} c${e.cls}]`);
  }
  console.log(name, segs.length, segs.slice(0, 80).join(" "));
}
const city = getCityData(false);
const bc = HEROES.find((h) => h.name === "Broadway & Commercial")!;
const near = city.lots.filter((l) => Math.hypot(l.x - bc.x, l.z - bc.z) < 60).sort((a, b) => b.top - a.top).slice(0, 12);
console.log("lots near BC", near.map((l) => `${l.x.toFixed(0)},${l.z.toFixed(0)} top ${l.top.toFixed(0)} ${l.arch ?? "hero"}`).join("; "));
const arch = new Map<string, number>();
for (const l of city.lots) arch.set(l.arch ?? "-", (arch.get(l.arch ?? "-") ?? 0) + 1);
console.log([...arch.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
const bio = city.lots.filter((l) => l.arch === "biodome");
for (const [px, pz, nm] of [[177, -21, "yard"], [373, 303, "skyport"]] as const) console.log(nm, "biodomes within 260", bio.filter((l) => Math.hypot(l.x - px, l.z - pz) < 260).length, "200:", bio.filter((l) => Math.hypot(l.x - px, l.z - pz) < 200).length);
