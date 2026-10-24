import "../components/train/track";
import { airspaceFor, type Flight, type Round } from "../components/train/airspace";
import { airTaxis, flyTaxis, floatplaneAt } from "../components/train/airways";
import { deliveryDrones, flyDrones } from "../components/train/droneways";
import { getCityData } from "../components/train/cityData";
import { sdfAt } from "../components/train/terrain";
import { trackDist, trackNearest } from "../components/train/track";
import { HARBOUR, LONSDALE } from "../components/train/vertiports";
import { skyportAt } from "../components/train/buildings/heroes";

const args = new Set(process.argv.slice(2));
const STEP = 0.5;

/** Whether a round is on a spot or straight over it (climbing off, coming down) at τ, and which spot. */
function spotAt(r: Round, tau: number): { spot: boolean; x?: number; z?: number } {
  let leg = r.legs[r.legs.length - 1];
  for (const l of r.legs) if (tau < l.at + l.dur) { leg = l; break; }
  if (leg.hidden) return { spot: false };
  if (leg.spot) return { spot: true, x: leg.spot.x, z: leg.spot.z };
  const f = leg.flight as Flight;
  const u = tau - leg.at;
  if (u < f.up) return { spot: true, x: f.p[0], z: f.p[2] };
  if (u > f.down) return { spot: true, x: f.p[(f.n - 1) * 3], z: f.p[(f.n - 1) * 3 + 2] };
  return { spot: false };
}

/** Least clearance over what stands under each sample (straight climbs and descents over their own spots aside), Expo rule, altitude range. */
function inspect(fs: Flight[], air: ReturnType<typeof airspaceFor>) {
  let clear = Infinity;
  let at = "";
  let expoBad = 0;
  let expoMin = Infinity;
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of fs) {
    for (let i = 0; i < f.n; i++) {
      const x = f.p[i * 3];
      const y = f.p[i * 3 + 1];
      const z = f.p[i * 3 + 2];
      if (!f.spot[i]) {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
        for (const o of air.under(x, z)) {
          if (y - o.top < clear) {
            clear = y - o.top;
            at = `${x.toFixed(0)},${y.toFixed(1)},${z.toFixed(0)} over top ${o.top.toFixed(1)}`;
          }
        }
      }
      if (trackDist(x, z) < 25) {
        const m = y - (trackNearest(x, z).p.y + 25);
        expoMin = Math.min(expoMin, m);
        if (m < 0) expoBad++;
      }
    }
  }
  return { clear, at, expoBad, expoMin, lo, hi };
}

for (const lowEnd of [false, true]) {
  const Q = lowEnd ? "LITE" : "FULL";
  getCityData(lowEnd);
  const air = airspaceFor(lowEnd);
  const t0 = performance.now();
  const a = airTaxis(lowEnd);
  const t1 = performance.now();
  const net = deliveryDrones(lowEnd);
  const t2 = performance.now();
  console.log(`\n===== ${Q}: ${a.taxis.length} taxis (built in ${(t1 - t0).toFixed(0)} ms), ${net.drones.length} drones (${(t2 - t1).toFixed(0)} ms), period ${a.period} s`);
  console.log("taxi report:", a.report.join(" | ") || "none");
  console.log("drone report:", net.report.join(" | ") || "none");
  // taxis: clearance, the Expo, altitudes per directed route
  let tc = { clear: Infinity, at: "", expoBad: 0, expoMin: Infinity };
  for (const s of a.services) {
    const outs = s.rounds.map((r) => r.legs[1].flight as Flight);
    const backs = s.rounds.map((r) => r.legs[3].flight as Flight);
    const io = inspect(outs, air);
    const ib = inspect(backs, air);
    for (const q of [io, ib]) {
      if (q.clear < tc.clear) tc = { ...tc, clear: q.clear, at: `${s.name}: ${q.at}` };
      tc.expoBad += q.expoBad;
      tc.expoMin = Math.min(tc.expoMin, q.expoMin);
    }
    console.log(`  ${s.name.padEnd(17)} n ${String(s.n).padStart(2)} cycle ${s.c} s  out ${io.lo.toFixed(1)}..${io.hi.toFixed(1)}  back ${ib.lo.toFixed(1)}..${ib.hi.toFixed(1)}`);
  }
  console.log(`taxis: least clearance over a roof or landmark, en route: ${tc.clear.toFixed(2)} [${tc.at}]`);
  console.log(`taxis: samples within 25 of the Expo below its deck + 25: ${tc.expoBad} (least margin ${Number.isFinite(tc.expoMin) ? tc.expoMin.toFixed(1) : "none within 25"})`);
  for (const name of ["trunk", "harbour–lonsdale"]) {
    const s = a.services.find((q) => q.name === name)!;
    let land = 0;
    let tot = 0;
    for (const l of s.rounds[0].legs) {
      const f = l.flight;
      if (!f) continue;
      for (let i = 0; i < f.n; i++) {
        if (f.spot[i]) continue;
        tot++;
        if (sdfAt(f.p[i * 3], f.p[i * 3 + 2]) >= 0) land++;
      }
    }
    console.log(`  ${name}: ${land} of ${tot} samples over land`);
  }
  // drones: clearance, the Expo, altitudes, destinations per port
  for (const [pi, p] of net.ports.entries()) {
    const ds = net.drones.filter((d) => d.port === pi);
    const fl = ds.flatMap((d) => d.r.legs.filter((l) => l.flight).map((l) => l.flight as Flight));
    const io = inspect(fl.filter((_, i) => i % 2 === 0), air);
    const ib = inspect(fl.filter((_, i) => i % 2 === 1), air);
    console.log(`  drones from the ${p.name}: ${p.drones} drones, ${p.trips} trips a cycle (${net.cycle} s), ${p.docks} docks, ${p.dests} destinations; out ${io.lo.toFixed(1)}..${io.hi.toFixed(1)}, back ${ib.lo.toFixed(1)}..${ib.hi.toFixed(1)}; least clearance ${Math.min(io.clear, ib.clear).toFixed(2)} [${io.clear < ib.clear ? io.at : ib.at}]; Expo violations ${io.expoBad + ib.expoBad} (least margin ${Math.min(io.expoMin, ib.expoMin).toFixed(1)})`);
  }
  // one whole period, every half second: separations, pads and docks, the floatplane
  const P = a.period;
  const portPads = [...HARBOUR.pads, ...LONSDALE.pads, ...skyportAt(lowEnd).pads];
  const near = (x: number, y: number, z: number) => portPads.some((p) => Math.hypot(x - p.x, z - p.z) < 26 && y < p.y + 36);
  const m = { en: Infinity, enAt: "", term: Infinity, termAt: "", dd: Infinity, ddAt: "", dt: Infinity, dtAt: "", plane: Infinity, planeD: Infinity, spot: 0, spotAt: "" };
  let viol = 0;
  for (let t = 0; t < P; t += STEP) {
    flyTaxis(a, t);
    flyDrones(net, t);
    const T = a.taxis;
    const D = net.drones;
    for (let i = 0; i < T.length; i++) {
      if (!T[i].shown) continue;
      for (let j = i + 1; j < T.length; j++) {
        if (!T[j].shown) continue;
        const d = Math.hypot(T[i].x - T[j].x, T[i].y - T[j].y, T[i].z - T[j].z);
        const both = near(T[i].x, T[i].y, T[i].z) && near(T[j].x, T[j].y, T[j].z);
        const what = `t ${t} ${a.services[T[i].service].name}#${T[i].j} & ${a.services[T[j].service].name}#${T[j].j} at ${T[i].x.toFixed(0)},${T[i].y.toFixed(0)},${T[i].z.toFixed(0)}`;
        if (both) {
          if (d < m.term) [m.term, m.termAt] = [d, what];
          if (d < 7) viol++;
        } else {
          if (d < m.en) [m.en, m.enAt] = [d, what];
          if (d < 15) viol++;
        }
      }
    }
    for (let i = 0; i < D.length; i++) {
      for (let j = i + 1; j < D.length; j++) {
        const d = Math.hypot(D[i].x - D[j].x, D[i].y - D[j].y, D[i].z - D[j].z);
        if (d < m.dd) [m.dd, m.ddAt] = [d, `t ${t} drones ${i} & ${j} at ${D[i].x.toFixed(0)},${D[i].y.toFixed(1)},${D[i].z.toFixed(0)}`];
        if (d < 3) viol++;
      }
      for (const tx of T) {
        if (!tx.shown) continue;
        const d = Math.hypot(D[i].x - tx.x, D[i].y - tx.y, D[i].z - tx.z);
        if (d < m.dt) [m.dt, m.dtAt] = [d, `t ${t} drone ${i} & ${a.services[tx.service].name}#${tx.j} at ${D[i].x.toFixed(0)},${D[i].y.toFixed(1)},${D[i].z.toFixed(0)}`];
        if (d < 6) viol++;
      }
    }
    // who holds each pad or dock: on it, or straight over it climbing off or coming down
    const held = new Map<string, number>();
    const hold = (s: { spot: boolean; x?: number; z?: number }) => {
      if (!s.spot) return;
      const k = `${Math.round((s.x ?? 0) * 2)},${Math.round((s.z ?? 0) * 2)}`;
      held.set(k, (held.get(k) ?? 0) + 1);
    };
    T.forEach((tx) => {
      const s = a.services[tx.service];
      if (tx.shown) hold(spotAt(s.rounds[tx.j % s.rounds.length], (((t + s.offsets[tx.j]) % s.c) + s.c) % s.c));
    });
    D.forEach((d) => hold(spotAt(d.r, (((t + d.o) % d.c) + d.c) % d.c)));
    for (const [k, n] of held) if (n > m.spot) [m.spot, m.spotAt] = [n, `t ${t} at ${k}`];
    const fp = floatplaneAt(t);
    for (const tx of T) if (tx.shown) m.plane = Math.min(m.plane, Math.hypot(tx.x - fp.x, tx.y - fp.y, tx.z - fp.z));
    for (const d of D) m.planeD = Math.min(m.planeD, Math.hypot(d.x - fp.x, d.y - fp.y, d.z - fp.z));
  }
  console.log(`taxis en route: least separation ${m.en.toFixed(2)} [${m.enAt}]`);
  console.log(`taxis both in a vertiport's airspace: least separation ${m.term.toFixed(2)} [${m.termAt}]`);
  console.log(`drones: least separation ${m.dd.toFixed(2)} [${m.ddAt}]`);
  console.log(`drone to taxi: least separation ${m.dt.toFixed(2)} [${m.dtAt}]`);
  console.log(`most fliers holding one pad or dock at once: ${m.spot} [${m.spotAt}]`);
  console.log(`samples under the minimum (taxis 15, 7 at a vertiport; drones 3; drone-taxi 6): ${viol}`);
  const vp = [...HARBOUR.pads, ...LONSDALE.pads];
  let vpMin = Infinity;
  for (let k = 0; k < 720; k++) {
    const f = floatplaneAt((k / 720) * ((Math.PI * 2) / 0.12));
    for (const p of vp) vpMin = Math.min(vpMin, Math.hypot(f.x - p.x, f.z - p.z));
  }
  console.log(`floatplane: nearest taxi ${m.plane.toFixed(1)}, nearest drone ${m.planeD.toFixed(1)}, nearest vertiport pad (horizontal) ${vpMin.toFixed(1)}`);
  if (args.has("--legs")) for (const s of a.services) s.rounds.forEach((r, k) => console.log(s.name, k, r.legs.map((l) => (l.flight ? `fly ${l.flight.dur.toFixed(1)}` : `${l.hidden ? "hidden" : "stay"} ${l.dur.toFixed(1)}`)).join(" ")));
}
