import { getCityData } from "../components/train/cityData";

for (const lowEnd of [false, true]) {
  const c = getCityData(lowEnd);
  console.log(lowEnd ? "LITE" : "FULL", "pads", c.pads.length, "free", c.pads.filter((p) => !p.parked).length);
  const bio = c.lots.filter((l) => l.arch === "biodome");
  for (const [px, pz, nm] of [[177, -21, "yard"], [373, 303, "skyport"], [78, -78, "harbour"]] as const) {
    const near = c.pads.filter((p) => Math.hypot(p.x - px, p.z - pz) < 260);
    console.log(" ", nm, "pads within 260:", near.length, "free:", near.filter((p) => !p.parked).length);
    for (const R of [200, 260, 320, 400]) {
      const b = bio.filter((l) => Math.hypot(l.x - px, l.z - pz) < R);
      console.log("    biodomes <", R, b.length, b.map((l) => `${l.x.toFixed(0)},${l.z.toFixed(0)} ${(l.fw ?? 0).toFixed(1)}x${(l.fd ?? 0).toFixed(1)} top${l.top.toFixed(0)}`).join(" | "));
    }
  }
}
