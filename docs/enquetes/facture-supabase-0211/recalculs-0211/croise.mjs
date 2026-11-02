import fs from "node:fs";
const S = process.argv[2];
const lire = (f) => { const s = fs.readFileSync(`${S}/${f}`, "utf8"); return JSON.parse(s.slice(s.indexOf("{"))).rows; };
const pe = lire("pe.json"), obj = lire("obj.json");
const P = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const nomDe = (u) => { const b = u.split("?")[0].slice(P.length); try { return decodeURIComponent(b); } catch { return b; } };
const objets = new Map(obj.map((o) => [o.n, o]));
const parContenu = new Map(); // etag|taille -> [{nom, c}]
const lignes = pe.map((r) => { const nom = nomDe(r.u); const o = objets.get(nom); return { ...r, nom, o, cle: o ? `${o.e}|${o.t}` : null, t: Date.parse(r.c.replace(" ", "T").replace(/\+00$/, "Z")) }; });
for (const l of lignes) if (l.cle) { if (!parContenu.has(l.cle)) parContenu.set(l.cle, []); parContenu.get(l.cle).push(l); }
const parNom = new Map(); for (const l of lignes) { if (!parNom.has(l.nom)) parNom.set(l.nom, []); parNom.get(l.nom).push(l); }
const maintenant = Date.now(), H24 = maintenant - 24 * 3600e3, J30 = maintenant - 30 * 24 * 3600e3;
const bilan = (depuis) => {
  const r = lignes.filter((l) => l.t > depuis);
  const b = { calculees: r.length, sans_objet: 0, avec_query: 0, meme_objet_autre_url_avant: 0, meme_contenu_autre_objet_avant: 0, contenu_unique: 0, par_dossier: {}, par_dossier_doublon: {} };
  for (const l of r) {
    const dossier = l.nom.split("/")[1]?.match(/^[a-z_-]+$/i) ? l.nom.split("/")[1] : (l.nom.split("/").length > 2 ? "autre-sous-dossier" : "racine-compte");
    b.par_dossier[dossier] = (b.par_dossier[dossier] ?? 0) + 1;
    if (l.u.includes("?")) b.avec_query++;
    if (!l.o) { b.sans_objet++; continue; }
    if ((parNom.get(l.nom) ?? []).some((x) => x.u !== l.u && x.t < l.t)) { b.meme_objet_autre_url_avant++; continue; }
    if ((parContenu.get(l.cle) ?? []).some((x) => x.nom !== l.nom && x.t < l.t)) { b.meme_contenu_autre_objet_avant++; b.par_dossier_doublon[dossier] = (b.par_dossier_doublon[dossier] ?? 0) + 1; continue; }
    b.contenu_unique++;
  }
  return b;
};
console.log("24 h :", JSON.stringify(bilan(H24), null, 1));
console.log("30 j :", JSON.stringify(bilan(J30), null, 1));
// objets du bucket : combien de contenus distincts
const contenus = new Map(); for (const o of obj) { const k = `${o.e}|${o.t}`; contenus.set(k, (contenus.get(k) ?? 0) + 1); }
console.log({ objets: obj.length, contenus_distincts: contenus.size, lignes_bucket: pe.length, lignes_sans_objet: lignes.filter((l) => !l.o).length });
