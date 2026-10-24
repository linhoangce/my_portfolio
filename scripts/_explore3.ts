import { samples, LEN, stationS } from "../components/train/track";
import { roads } from "../components/train/roadNetwork";

const pts: string[] = [];
for (let s = 0; s < 1200; s += 20) {
  const f = samples[Math.round((s / LEN) * 1600)];
  pts.push(`${s}:${f.p.x.toFixed(0)},${f.p.z.toFixed(0)},${f.p.y.toFixed(0)}`);
}
console.log("EXPO", pts.join(" "));
console.log("stationS", stationS.map((s) => s.toFixed(0)).join(","));
const { edges } = roads();
const names = new Map<string, { n: number; x0: number; x1: number; z0: number; z1: number; cls: number }>();
for (const e of edges) {
  if (!e.name) continue;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < e.pts.length; i += 2) {
    xs.push(e.pts[i]);
    zs.push(e.pts[i + 1]);
  }
  const cur = names.get(e.name) ?? { n: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, cls: e.cls };
  cur.n++;
  cur.x0 = Math.min(cur.x0, ...xs);
  cur.x1 = Math.max(cur.x1, ...xs);
  cur.z0 = Math.min(cur.z0, ...zs);
  cur.z1 = Math.max(cur.z1, ...zs);
  cur.cls = Math.min(cur.cls, e.cls);
  names.set(e.name, cur);
}
const list = [...names.entries()].filter(([, v]) => v.x1 > 40 && v.x0 < 400 && v.z1 > 100 && v.z0 < 320 && v.cls <= 1);
for (const [k, v] of list) console.log(k, v.cls, `x ${v.x0.toFixed(0)}..${v.x1.toFixed(0)} z ${v.z0.toFixed(0)}..${v.z1.toFixed(0)}`);
console.log("main", [...names.entries()].filter(([k]) => /Main|Great Northern|Clark|Prior|Venables|Glen|Industrial|National|Station|Hastings|Powell|Cordova|Commercial/.test(k)).map(([k, v]) => `${k} c${v.cls} x ${v.x0.toFixed(0)}..${v.x1.toFixed(0)} z ${v.z0.toFixed(0)}..${v.z1.toFixed(0)}`).join("\n"));
