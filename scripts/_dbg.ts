import "../components/train/track";
import { airTaxis } from "../components/train/airways";
import { deliveryDrones, flyDrones } from "../components/train/droneways";
import type { Track } from "../components/train/airspace";

const lowEnd = true;
airTaxis(lowEnd);
const net = deliveryDrones(lowEnd);
const c = net.cycle;
type D = (typeof net.drones)[number] & { dbg: { d: number; tr: Track }[] };
const ds = net.drones as D[];
// first violation
outer: for (let t = 0; t < c; t += 0.5) {
  flyDrones(net, t);
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const d = Math.hypot(ds[i].x - ds[j].x, ds[i].y - ds[j].y, ds[i].z - ds[j].z);
      if (d < 3) {
        console.log("violation t", t, "drones", i, j, "d", d.toFixed(2), "at", ds[i].x.toFixed(1), ds[i].y.toFixed(1), ds[i].z.toFixed(1));
        for (const k of [i, j]) {
          const q = ds[k];
          console.log(" drone", k, "o", q.o, "trips", q.dbg.map((x) => x.d % c).join(","));
          // where its trip tracks say it is at t
          for (const x of q.dbg) {
            const u = Math.floor((((t - x.d) % c) + c) % c);
            const tr = x.tr;
            console.log("   trip at", x.d % c, "u", u, "track", Number.isNaN(tr.x[u]) ? "off" : `${tr.x[u].toFixed(1)},${tr.y[u].toFixed(1)},${tr.z[u].toFixed(1)}`);
          }
          console.log("   round says", q.x.toFixed(1), q.y.toFixed(1), q.z.toFixed(1));
        }
        break outer;
      }
    }
  }
}
