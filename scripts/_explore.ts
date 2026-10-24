import "../components/train/track";
import { sdfAt, groundAt } from "../components/train/terrain";
import { STATION_XZ, trackNearest, trackDist } from "../components/train/track";
import { LANDMARKS } from "../components/train/sites";
import { busNetwork } from "../components/train/buses";
import { roads } from "../components/train/roadNetwork";
import { MILL_LINE, BROADWAY_LINE } from "../components/train/rail";
import { WCE_PTS, WCE_S, WCE_LEN } from "../components/train/wce";
import { YARD, YARD_BOX, yardPoint } from "../components/train/railYard";
import { HEROES } from "../components/train/buildings/heroes";
import { HUB_AT } from "../components/train/waterfrontHub";
const SEABUS_A = [HUB_AT.x + 4, HUB_AT.z - 71]; const SEABUS_B = [225, -271];
import { NO_SAIL } from "../components/train/waterfrontHub";
import { stations } from "@/data";

// water map
const rows: string[] = [];
for (let z = -460; z <= 420; z += 20) {
  let r = `${String(z).padStart(5)} `;
  for (let x = -640; x <= 1000; x += 12) {
    const s = sdfAt(x, z);
    const st = STATION_XZ.some(([sx, sz]) => Math.abs(sx - x) < 6 && Math.abs(sz - z) < 10);
    r += st ? "S" : trackDist(x, z) < 6 ? "#" : s < 0 ? (s < -20 ? "~" : "-") : ".";
  }
  rows.push(r);
}
console.log(rows.join("\n"));
console.log("stations", stations.map((s, i) => `${s.name} ${STATION_XZ[i].map((v) => v.toFixed(0)).join(",")} deck ${trackNearest(...STATION_XZ[i]).p.y.toFixed(1)}`).join("\n"));
console.log("landmarks", LANDMARKS.map((l) => `${l.key} ${l.px.toFixed(0)},${l.pz.toFixed(0)} r${l.r} h${l.h} pad${l.padY.toFixed(1)}`).join("; "));
const { routes } = busNetwork();
const { edges } = roads();
for (const r of routes) {
  if (!["99 ", "3 ", "22 "].some((p) => r.name.startsWith(p))) continue;
  const pts: string[] = [];
  for (const [k, dir] of r.path) {
    const e = edges[k].pts;
    const n = e.length / 2;
    const i0 = dir > 0 ? 0 : n - 1;
    pts.push(`${e[i0 * 2].toFixed(0)},${e[i0 * 2 + 1].toFixed(0)}`);
  }
  console.log(r.name, r.len.toFixed(0), pts.join(" "));
}
const m = MILL_LINE.curve.getSpacedPoints(30);
console.log("MILL", MILL_LINE.len.toFixed(0), m.map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)},${p.y.toFixed(0)}`).join(" "));
console.log("MILL stations s", MILL_LINE.stationS.map((s) => s.toFixed(0)).join(","));
const b = BROADWAY_LINE.curve.getSpacedPoints(10);
console.log("BWAY", b.map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)},${p.y.toFixed(0)}`).join(" "));
console.log("WCE", WCE_LEN.toFixed(0), WCE_PTS.filter((_, i) => i % 20 === 0).map(([x, z], i) => `${(WCE_S[i * 20] ?? 0).toFixed(0)}:${x.toFixed(0)},${z.toFixed(0)}`).join(" "));
console.log("YARD", YARD, YARD_BOX.map((v) => v.toFixed(0)), "shed", [126, 146, 166].map((s) => [23.3, 34.4].map((l) => yardPoint(s, l).map((v) => v.toFixed(0)).join(",")).join(" ")).join(" | "));
const bc = HEROES.find((h) => h.name === "Broadway & Commercial")!;
console.log("BC hero", bc.x, bc.z, "ground", groundAt(bc.x, bc.z).toFixed(1), "trackDist tallest", trackDist(bc.x + 5, bc.z - 6).toFixed(1), trackNearest(bc.x + 5, bc.z - 6).p);
console.log("seabus", SEABUS_A, SEABUS_B, "nosail", NO_SAIL.map((b) => b.map((v) => v.toFixed(0)).join(",")).join(" | "));
for (const [x, z] of [[78, -78], [258, -262], [40, -300], [-520, -200], [920, -110], [-40, -160]]) console.log("sdf", x, z, sdfAt(x, z).toFixed(1));
