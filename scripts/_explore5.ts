import { sdfAt, groundAt } from "../components/train/terrain";
for (const x of [240, 250, 258, 266, 275]) {
  const row: string[] = [];
  for (let z = -250; z >= -310; z -= 4) row.push(`${z}:${sdfAt(x, z).toFixed(0)}/${groundAt(x, z).toFixed(1)}`);
  console.log(x, row.join(" "));
}
for (const x of [60, 70, 80, 90, 100, 106]) {
  const row: string[] = [];
  for (let z = -60; z >= -96; z -= 6) row.push(`${z}:${sdfAt(x, z).toFixed(0)}`);
  console.log(x, row.join(" "));
}
