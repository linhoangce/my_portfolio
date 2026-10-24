import { writeFileSync } from "fs";
import { buildCity } from "../components/train/buildings/city";
import { Rng } from "../components/train/cityModel";
const out: string[] = [];
for (const lowEnd of [false, true]) {
  const c = buildCity(new Rng(1), lowEnd);
  out.push(...c.lots.map((l) => `${lowEnd ? "L" : "F"} ${l.x.toFixed(2)} ${l.z.toFixed(2)} ${l.arch ?? "-"} ${(l.ry ?? 0).toFixed(3)}`));
}
writeFileSync(process.argv[2], out.join("\n"));
console.log("lots written", out.length);
