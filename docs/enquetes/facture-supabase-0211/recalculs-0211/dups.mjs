import fs from "node:fs";
const S = process.argv[2];
const lire = (f) => { const s = fs.readFileSync(`${S}/${f}`, "utf8"); return JSON.parse(s.slice(s.indexOf("{"))).rows; };
const pe = lire("pe.json"), obj = lire("obj.json");
const P = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const nomDe = (u) => { const b = u.split("?")[0].slice(P.length); try { return decodeURIComponent(b); } catch { return b; } };
const ts = (s) => Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
const objets = new Map(obj.map((o) => [o.n, o]));
const parCle = new Map(); for (const o of obj) { const k = `${o.e}|${o.t}`; if (!parCle.has(k)) parCle.set(k, []); parCle.get(k).push(o.n); }
const empreinte = new Map(pe.map((r) => [nomDe(r.u), ts(r.c)]));
const depuis = Date.now() - 24 * 3600e3, d15 = Date.parse("2026-10-15T00:00:00Z");
const rel = {}; let n = 0; const ex = [];
const bilan = (seuil) => { let tot = 0, dup = 0; for (const r of pe) { const t = ts(r.c); if (t <= seuil) continue; tot++; const nom = nomDe(r.u); const o = objets.get(nom); if (!o) continue; const autres = (parCle.get(`${o.e}|${o.t}`) ?? []).filter((x) => x !== nom && (empreinte.get(x) ?? Infinity) < t); if (autres.length) dup++; } return { tot, dup, part: (100 * dup / tot).toFixed(1) + " %" }; };
for (const r of pe) {
  const t = ts(r.c); if (t <= depuis) continue;
  const nom = nomDe(r.u); const o = objets.get(nom); if (!o) continue;
  const autres = (parCle.get(`${o.e}|${o.t}`) ?? []).filter((x) => x !== nom && (empreinte.get(x) ?? Infinity) < t);
  if (!autres.length) continue;
  n++;
  const [ua, da, fa] = nom.split("/"), [ub, db, fb] = autres[0].split("/");
  const k = `${ua === ub ? "meme compte" : "autre compte"} · ${da}→${db} · ${fa === fb ? "même dossier" : "autre dossier"}`;
  rel[k] = (rel[k] ?? 0) + 1;
  if (ex.length < 4) ex.push([nom, autres[0]]);
}
console.log(n, rel, ex);
console.log("depuis le 15/10 :", bilan(d15), "24 h :", bilan(depuis));
