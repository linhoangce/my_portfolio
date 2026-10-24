import "../components/train/track";
import { airTaxis } from "../components/train/airways";
import { getCityData } from "../components/train/cityData";

for (const lowEnd of [false, true]) {
  const t0 = performance.now();
  getCityData(lowEnd);
  const t1 = performance.now();
  const a = airTaxis(lowEnd);
  const t2 = performance.now();
  console.log(lowEnd ? "LITE" : "FULL", `city ${(t1 - t0).toFixed(0)} ms, taxis ${(t2 - t1).toFixed(0)} ms`);
  for (const s of a.services) {
    const legs = s.rounds.map((r) => r.legs.filter((l) => l.flight).map((l) => l.flight!.dur.toFixed(1)).join("/")).join(" ");
    const stays = s.rounds.map((r) => r.legs.filter((l) => !l.flight).map((l) => l.dur.toFixed(1)).join("/")).join(" ");
    console.log(`  ${s.name}: n ${s.n} c ${s.c} legs ${legs} stays ${stays} offsets ${s.offsets.join(",")}`);
  }
  console.log("  report:", a.report.join(" | ") || "none");
}
