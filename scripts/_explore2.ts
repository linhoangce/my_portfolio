import { sdfAt } from "../components/train/terrain";
import { NO_SAIL } from "../components/train/waterfrontHub";

const [x0, x1, z0, z1, step] = process.argv.slice(2).map(Number);
const rows: string[] = [];
let hdr = "      ";
for (let x = x0; x <= x1; x += step) hdr += Math.abs(x) % (step * 10) === 0 ? "|" : " ";
rows.push(hdr);
for (let z = z0; z <= z1; z += step) {
  let r = `${String(z).padStart(5)} `;
  for (let x = x0; x <= x1; x += step) {
    const s = sdfAt(x, z);
    const ns = NO_SAIL.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    r += ns ? "x" : s < 0 ? (s < -20 ? "~" : "-") : ".";
  }
  rows.push(r);
}
console.log(`x from ${x0} step ${step}; | every ${step * 10}`);
console.log(rows.join("\n"));
