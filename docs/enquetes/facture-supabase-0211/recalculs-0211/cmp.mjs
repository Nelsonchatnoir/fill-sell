import fs from "node:fs"; import readline from "node:readline";
const S = process.argv[2];
const raw = fs.readFileSync(`${S}/apres.json`, "utf8"); const rows = JSON.parse(raw.slice(raw.indexOf("{"))).rows;
const snap = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[3]) });
let maxSnap = "";
for await (const l of rl) { const r = JSON.parse(l); snap.set(r[0], { cal: r[8], sv: r[4] == null, src: r[7] }); if (r[8] > maxSnap) maxSnap = r[8]; }
console.log("instantané : lignes", snap.size, "calculee_le max", maxSnap);
const apres = rows.filter((r) => new Date(r.calculee_le) > new Date(maxSnap));
const bucket = (u) => u.includes("/storage/v1/object/public/listing-photos/");
let neuves = 0, recalc = 0, recalcSv = 0, recalcBucket = 0, neuvesBucket = 0; const ex = [];
for (const r of apres) {
  const s = snap.get(r.url);
  if (!s) { neuves++; if (bucket(r.url)) neuvesBucket++; continue; }
  recalc++; if (s.sv) recalcSv++; if (bucket(r.url)) recalcBucket++;
  if (ex.length < 8) ex.push({ url: r.url.slice(-70), avant: s.cal, sans_variantes_avant: s.sv, apres: r.calculee_le });
}
console.log({ calculees_apres_instantane: apres.length, premiere: apres[0]?.calculee_le, derniere: apres.at(-1)?.calculee_le, neuves, neuvesBucket, recalc, recalcBucket, recalc_qui_navaient_pas_de_variantes: recalcSv });
console.log(ex);
