// ═══════════════════════════════════════════════════════════════════════════
// Selftest « UNE FUSION AUTO PAR PHOTO IDENTIQUE VAUT PREUVE » (06/10, Nico)
//   node scripts/retrait-fusion-photo-identique-selftest.mjs
//
// Cas Ornella, « Pyjama Tape à l'œil » : la copie Beebs, arrivée par une fusion
// « auto (doublon certain : photo_identique) », n'était jamais retirée après la
// vente. Prouvé ici, sur la DERNIÈRE définition de retrait_job_prouve du dépôt :
//   1. le filtre des fusions, appliqué aux `par` RÉELS relevés en prod le 06/10 :
//      photo identique = preuve, toute autre fusion automatique reste refusée,
//      les fusions de la personne restent des preuves ;
//   2. les autres gardes (titre jamais preuve, relevé sans rattachement) sont
//      toujours là, à l'identique.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = join(ROOT, "supabase/migrations");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// La dernière migration qui (re)définit retrait_job_prouve fait foi.
const fichiers = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
let def = null; let source = null;
for (const f of fichiers) {
  const t = fs.readFileSync(join(MIG, f), "utf8");
  const m = t.match(/CREATE OR REPLACE FUNCTION public\.retrait_job_prouve\(p_job uuid\)[\s\S]*?\$function\$;/g);
  if (m) { def = m[m.length - 1]; source = f; }
}
ok("une définition de retrait_job_prouve est trouvée", !!def);
console.log(`  (définition lue dans ${source})`);

// Les clauses NOT LIKE du filtre des fusions → expressions régulières (LIKE, échappement \).
const likeVersRegex = (motif) => new RegExp("^" + motif.replace(/\\(.)|([%_])|([.*+?^${}()|[\]\\])/g,
  (m, echappe, joker, special) => echappe ? echappe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : joker === "%" ? ".*" : joker === "_" ? "." : "\\" + special) + "$", "s");
const blocFusions = def.match(/FROM inventaire_fusions f([\s\S]*?)\? j\.id::text\)/)?.[1] ?? "";
const exclus = [...blocFusions.matchAll(/COALESCE\(f\.par, ''\) NOT LIKE '([^']*)'/g)].map((m) => likeVersRegex(m[1]));
ok("le filtre des fusions porte deux exclusions (personne, photo identique)", exclus.length === 2, String(exclus.length));
const fusionRefusee = (par) => !exclus.some((re) => re.test(par));

console.log("\n[1] Les fusions relevées en prod le 06/10");
const PREUVES = [
  "auto (doublon certain : photo_identique)",                       // le pyjama d'Ornella
  "recensement 25/09 : doublon certain (photo_identique)",
  "recensement 25/09 : remise en ligne Vinted (photo_identique)",
  "recensement 25/09 : remise en ligne Vinted, titre voisin (photo_identique)",
  "utilisateur", "utilisateur (doublon proposé)", "utilisateur:photo_auto", "utilisateur:photo_go_nico_3009",
];
const REFUSEES = [
  "auto (doublon certain : titre_exact_prix_egal)",
  "recensement 25/09 : remise en ligne Vinted (remise_en_ligne_titre_identique)",
  "support (check du 25/09 : doublons créés par le relevé sur de fausses ventes)",
  "", "auto (doublon certain : photo_identique_proche)", "auto photo_identique sans motif",
];
for (const p of PREUVES) ok(`preuve   ${p || "(vide)"}`, !fusionRefusee(p));
for (const p of REFUSEES) ok(`refusée  ${p || "(vide)"}`, fusionRefusee(p));

console.log("\n[2] Les autres gardes, inchangées");
ok("un rattachement par titre n'est jamais une preuve (par 'auto' sans motif ni import)",
  /\{rattachement,par\}', ''\) IN \('', 'utilisateur'\)/.test(def) && !/'titre_exact'/.test(def));
ok("photo identique et dépôt clos restent des motifs de rattachement prouvés",
  (def.match(/IN \('identifiant_depot_clos', 'photo_identique'\)/g) ?? []).length === 2);
ok("un relevé sans rattachement prouvé reste refusé", /platform_fields ->> 'source', ''\) <> 'releve'/.test(def));
ok("une fusion défaite ne compte plus", /f\.defait_le IS NULL/.test(def));

console.log(ko ? `\n${ko} contrôle(s) en échec.` : "\nTous les contrôles passent : photo identique = preuve, titre = jamais.");
process.exit(ko ? 1 : 0);
