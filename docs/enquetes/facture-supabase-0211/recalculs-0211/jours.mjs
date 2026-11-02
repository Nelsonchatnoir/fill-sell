import fs from "node:fs";
const S = process.argv[2];
const lire = (f) => { const s = fs.readFileSync(`${S}/${f}`, "utf8"); return JSON.parse(s.slice(s.indexOf("{"))).rows; };
const pe = lire("pe.json"), obj = lire("obj.json");
const P = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const nomDe = (u) => { const b = u.split("?")[0].slice(P.length); try { return decodeURIComponent(b); } catch { return b; } };
const objets = new Map(obj.map((o) => [o.n, o]));
const ts = (s) => Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
const jour = (t) => new Date(t + 3600e3).toISOString().slice(0, 10);
const J = {};
for (const r of pe) {
  const t = ts(r.c); const o = objets.get(nomDe(r.u)); const j = jour(t);
  J[j] ??= { emp: 0, obj_meme_jour: 0, obj_1_7j: 0, obj_plus_7j: 0, sans_objet: 0 };
  J[j].emp++;
  if (!o) { J[j].sans_objet++; continue; }
  const lag = (t - ts(o.c)) / 86400e3;
  if (lag < 1) J[j].obj_meme_jour++; else if (lag < 7) J[j].obj_1_7j++; else J[j].obj_plus_7j++;
}
const O = {}; for (const o of obj) { const j = jour(ts(o.c)); O[j] = (O[j] ?? 0) + 1; }
for (const j of Object.keys(J).sort().slice(-35)) console.log(j, JSON.stringify(J[j]), "objets créés:", O[j] ?? 0);
