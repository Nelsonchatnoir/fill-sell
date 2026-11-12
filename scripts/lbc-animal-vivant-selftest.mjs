// VERROU (12/11/2026, point 6 de Nico) : UNE ANNONCE D'ANIMAL VIVANT SUR LEBONCOIN EST UN GESTE CLAIR AU PREMIER PASSAGE,
// JAMAIS CINQ ÉCHECS ; AUCUN POIDS DE COLIS.
//
//     npm run selftest:lbc-animal-vivant
//
// Cas fondateur : compte cfdfda6f, job 298e4944 (« Saillie Ragdoll… », Leboncoin, « Animaux › Animaux » posée par l'IA,
// poids 1 kg par défaut) : cinq passages, cinq « wizard pas passé à l'aperçu », la page ne montrant que le critère
// animal_type. Preuve de ce que Leboncoin demande : l'annonce 3229105886 du même article, déposée par la personne
// (animal_type, animal_offer_nature, animal_race, animal_age, animal_birthdate, animal_litter, vaccinated_animal,
// animal_breed ; shippable = false).
//   A. La règle (_shared/leboncoin-animal-vivant.js) : la catégorie seule décide ; « Accessoires animaux », les autres
//      plateformes, une republication engagée : jamais.
//   B. Le geste en mots simples ; les champs de la tâche (source, aucune question, aucune marque de travail).
//   C. get-pending-jobs ne la tente jamais : retenue au premier passage, AVANT le poids, écriture conditionnée.
//   D. handler-watch donne le même geste aux tâches déjà tombées en échec (faux client) ; rien d'autre n'est touché.
//   E. L'app ne pose aucun poids de colis pour cette catégorie.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

let A = null;
try { A = await charger("supabase/functions/_shared/leboncoin-animal-vivant.js"); } catch { /* absent avant le correctif */ }
const LE_CAS = { id: "298e4944", platform: "leboncoin", action: "publish", status: "pending",
  platform_fields: { lbcCategoryPath: ["Animaux", "Animaux"], lbcPoidsGrammes: 1000, poids_par_defaut: true, lbcAspects: { estimated_parcel_weight: "De 500 g à 1 kg" }, processing_since: "x" } };

console.log("A. La règle");
ok(!!A, "_shared/leboncoin-animal-vivant.js existe");
if (A) {
  ok(A.estAnnonceAnimalVivantLbc(LE_CAS), "le cas : publication Leboncoin « Animaux › Animaux » → règle");
  ok(A.estAnnonceAnimalVivantLbc({ ...LE_CAS, action: "republish", platform_fields: { ...LE_CAS.platform_fields, republish_step: "captured" } }), "une republication pas encore engagée → règle");
  ok(!A.estAnnonceAnimalVivantLbc({ ...LE_CAS, action: "republish", platform_fields: { ...LE_CAS.platform_fields, republish_step: "deleted" } }), "une republication déjà engagée (annonce retirée) : jamais ici");
  ok(!A.estAnnonceAnimalVivantLbc({ ...LE_CAS, platform_fields: { lbcCategoryPath: ["Animaux", "Accessoires animaux"] } }), "« Accessoires animaux » (un objet) : jamais");
  ok(!A.estAnnonceAnimalVivantLbc({ ...LE_CAS, platform: "vinted" }) && !A.estAnnonceAnimalVivantLbc({ ...LE_CAS, action: "delete" }), "une autre plateforme, un retrait : jamais");
  ok(!A.estAnnonceAnimalVivantLbc({ ...LE_CAS, platform_fields: {} }) && A.cheminAnimalVivantLbc([" animaux ", "Animaux"]), "sans catégorie : rien ; la casse et les blancs ne comptent pas");

  console.log("B. Le geste");
  const m = A.messageAnimalVivantLbc(LE_CAS);
  ok(/type d'animal/.test(m) && /saillie/.test(m) && /dépose cette annonce toi-même sur Leboncoin/.test(m) && /« Synchroniser »/.test(m) && /Rien n'a été publié\.$/.test(m),
    "publication : ce que Leboncoin demande, ce qu'il faut faire, rien de publié", m);
  ok(/« Accessoires animaux »/.test(m), "un objet pour animaux mal rangé : la bonne catégorie est dite");
  ok(/rien n'a été retiré\.$/.test(A.messageAnimalVivantLbc({ ...LE_CAS, action: "republish" })), "republication : l'annonce reste en ligne, rien retiré");
  ok(!/wizard|combobox|critère|needs_user/.test(m), "aucun jargon");
  const pf = A.champsAnimalVivantLbc({ ...LE_CAS.platform_fields, needsUserField: { field_key: "x" } }, "essai", "2026-11-12T13:00:00Z");
  ok(pf.needs_user_source === "lbc_animal_vivant" && pf.animal_vivant_lbc.pose_par === "essai" && !("processing_since" in pf) && !("needsUserField" in pf),
    "la tâche : la source du geste, la trace, aucune question en cours, aucune marque de travail");
  ok(A.sansPoidsDeColisLbc(LE_CAS.platform_fields) && !A.sansPoidsDeColisLbc({ lbcCategoryPath: ["Animaux", "Accessoires animaux"] }), "aucun poids de colis pour un animal vivant (shippable = false)");
}

console.log("C. get-pending-jobs ne la tente jamais");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iGarde = gpj.indexOf("LEBONCOIN, ANIMAL VIVANT : UN GESTE CLAIR AU PREMIER PASSAGE");
const iPoids = gpj.indexOf("══ LEBONCOIN : AUCUN FORMAT DEVINÉ, LE POIDS DE LA FICHE");
const bloc = iGarde > 0 ? gpj.slice(iGarde, iPoids) : "";
ok(iGarde > 0 && iGarde < iPoids, "la garde est AVANT le poids Leboncoin (aucun poids calculé pour un animal)");
ok(/j\.status === "pending" && estAnnonceAnimalVivantLbc\(j as never\)/.test(bloc) && /status: "needs_user", error: messageAnimalVivantLbc\(j\)/.test(bloc)
  && /\.eq\("status", "pending"\)/.test(bloc) && /out = out\.filter\(\(j\) => !ids\.has\(String\(j\.id\)\)\)/.test(bloc),
  "premier passage : retenue « geste », écriture conditionnée à « pending », jamais servie");
ok(/if \(!includeProcessing && !includeNeedsUser\)/.test(bloc), "le popup et les reprises en cours ne sont pas touchés");

console.log("D. handler-watch : le même geste pour une tâche déjà en échec");
function fauxClient(etat) {
  const ecritures = [];
  const valeur = (l, col) => {
    const m = /^platform_fields->(\w+)->>(\d+)$/.exec(col);
    if (m) return (l.platform_fields?.[m[1]] ?? [])[Number(m[2])];
    if (col.includes("->>")) { const [a, b] = col.split("->>"); return (l[a] ?? {})[b] ?? null; }
    return l[col];
  };
  const from = (table) => {
    const q = { f: [], op: "select", patch: null, sel: "" };
    const lignes = () => (etat[table] ?? []).filter((l) => q.f.every(([op, c, v]) => {
      const x = valeur(l, c);
      if (op === "eq") return String(x) === String(v);
      if (op === "in") return v.map(String).includes(String(x));
      if (op === "is") return v === null ? x == null : x === v;
      return true;
    }));
    const api = {
      select(s) { if (q.op === "select") q.sel = s ?? ""; return api; },
      eq(c, v) { q.f.push(["eq", c, v]); return api; }, in(c, v) { q.f.push(["in", c, v]); return api; },
      is(c, v) { q.f.push(["is", c, v]); return api; }, not() { return api; }, gt() { return api; }, lt() { return api; },
      gte() { return api; }, lte() { return api; }, like() { return api; }, ilike() { return api; }, or() { return api; },
      order() { return api; }, limit() { return api; }, maybeSingle() { q.un = true; return api; },
      update(p) { q.op = "update"; q.patch = p; return api; },
      then(res, rej) {
        let data;
        if (q.op === "update") { const t = lignes(); for (const l of t) { Object.assign(l, q.patch); ecritures.push({ id: l.id, filtres: q.f }); } data = t.map((l) => ({ id: l.id })); }
        else data = /inventaire!inner/.test(q.sel) ? [] : lignes().map((l) => ({ ...l }));
        return Promise.resolve({ data: q.un ? (data[0] ?? null) : data, error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), ecritures };
}
const { trancherQuestions } = await charger("supabase/functions/_shared/questions-tranchees.ts");
const ECHEC = "La publication n'a pas abouti après plusieurs essais automatiques. Rien n'a été publié.";
const etat = {
  profiles: [], inventaire: [], ventes: [],
  cross_post_jobs: [
    { id: "298e4944", user_id: "u", platform: "leboncoin", action: "publish", status: "needs_user", error: ECHEC, created_at: "2026-11-12",
      platform_fields: { lbcCategoryPath: ["Animaux", "Animaux"], needs_user_source: "relancer", needsUserAttempts: 5 } },
    { id: "deja", user_id: "u", platform: "leboncoin", action: "publish", status: "needs_user", error: "geste déjà posé", created_at: "2026-11-12",
      platform_fields: { lbcCategoryPath: ["Animaux", "Animaux"], needs_user_source: "lbc_animal_vivant" } },
    { id: "objet", user_id: "u", platform: "leboncoin", action: "publish", status: "needs_user", error: ECHEC, created_at: "2026-11-12",
      platform_fields: { lbcCategoryPath: ["Animaux", "Accessoires animaux"], needs_user_source: "relancer" } },
    { id: "engagee", user_id: "u", platform: "leboncoin", action: "republish", status: "needs_user", error: ECHEC, created_at: "2026-11-12",
      platform_fields: { lbcCategoryPath: ["Animaux", "Animaux"], republish_step: "deleted", deleted_at: "x" } },
  ],
};
const sb = fauxClient(etat);
const nT = await trancherQuestions(sb);
const j = (id) => etat.cross_post_jobs.find((x) => x.id === id);
ok(j("298e4944").platform_fields.needs_user_source === "lbc_animal_vivant" && /dépose cette annonce toi-même sur Leboncoin/.test(j("298e4944").error ?? "")
  && j("298e4944").status === "needs_user" && (j("298e4944").platform_fields.erreurs_archivees ?? []).some((e) => e.erreur === ECHEC),
  "LE CAS : l'échec « relance-la » devient le geste clair, l'ancien texte archivé", j("298e4944"));
ok(sb.ecritures.find((e) => e.id === "298e4944")?.filtres.some(([op, c, v]) => op === "eq" && c === "status" && v === "needs_user"), "écriture conditionnée à « needs_user »");
ok(j("deja").error === "geste déjà posé" && j("objet").error === ECHEC && j("engagee").error === ECHEC, "déjà posé, objet pour animaux, republication engagée : jamais réécrits");
ok(nT.animal_lbc === 1 && sb.ecritures.length === 1, "une seule écriture", { n: nT, e: sb.ecritures.map((e) => e.id) });

console.log("E. L'app ne pose aucun poids pour un animal vivant");
const lps = lire("src/components/ListingPreviewScreen.jsx");
const iC = lps.indexOf("const comblerPoidsFiche = (copies) => {");
ok(iC > 0 && /if \(sansPoidsDeColisLbc\(pf\)\) return copies;/.test(lps.slice(iC, iC + 1400)), "le colis par défaut n'est jamais posé sur « Animaux › Animaux »");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
