// Selftest « verrou » du 17/11 — Leboncoin : le poids ET le format du colis viennent de la FICHE.
// Constat (compte Business, mails du 17/11 09:29 et 09:36, rapport docs/enquetes/lbc-colis-fiche-1711) : à la
// republication, le poids de l'ANNONCE d'origine passait devant celui de la fiche (traces « poids ← 250 g (annonce ;
// copie : 200 g) »), la tranche PRO suivait, et le format restait celui de l'ancienne annonce (articles de 100 g en
// « Moyen », une fiche à 500 g repartie en « De 500 g à 1 kg »). Le format n'existait pas sur la fiche.
// RÈGLE (Nico, 17/11) : la fiche porte le format ; par défaut il se calcule du poids ; il se recalcule quand le poids
// change, sauf un choix fait à la main APRÈS le dernier changement de poids ; publication et republication prennent
// le poids ET le format de la fiche.
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatLbcDuPoids, formatDeLaFiche, choixFormatPourLaFiche, colisLbcAuService, FORMAT_DE_LA_FICHE,
} from "../supabase/functions/_shared/colis-de-la-fiche.js";
import { trancheLbcDepuisGrammes } from "../supabase/functions/_shared/lbc-poids-tranche.js";
import { avecFormatChoisi, formatLbcDuJob } from "../src/utils/leboncoinColis.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// ── 1. Le format par défaut, calculé du poids ──────────────────────────────────────────────────────────────────────
assert.equal(formatLbcDuPoids(15), "Petit");
assert.equal(formatLbcDuPoids(200), "Petit");
assert.equal(formatLbcDuPoids(1000), "Petit");
assert.equal(formatLbcDuPoids(1001), "Moyen");
assert.equal(formatLbcDuPoids(2000), "Moyen");
assert.equal(formatLbcDuPoids(40000), "Moyen");
assert.equal(formatLbcDuPoids(40001), "Volumineux");
assert.equal(formatLbcDuPoids(null), null);
assert.equal(formatLbcDuPoids(0), null);
ok("défaut : ≤ 1 kg Petit, ≤ 40 kg Moyen, au-delà Volumineux ; sans poids, rien");

// ── 2. La borne 500 g : 500 g = la tranche 500 g (jamais 1 kg) ────────────────────────────────────────────────────
assert.equal(trancheLbcDepuisGrammes(500), "De 250 g à 500 g");
assert.equal(trancheLbcDepuisGrammes(501), "De 500 g à 1 kg");
assert.equal(trancheLbcDepuisGrammes(200), "De 100 g à 250 g");
ok("500 g → « De 250 g à 500 g » (la borne est juste : la tranche 1 kg venait du poids de l'annonce)");

// ── 3. Le format de la fiche : choix à la main, ou le poids ───────────────────────────────────────────────────────
const choix = (v, le, poids_g) => ({ format_colis_lbc: { v, source: "manuel", at: le, poids_g } });
assert.deepEqual(formatDeLaFiche({ poids_g: 200, poids_change_le: "2026-11-17T08:00:00Z", attributs: null }),
  { valeur: "Petit", origine: "poids", poids_g: 200 });
assert.deepEqual(formatDeLaFiche({ poids_g: 200, poids_change_le: "2026-11-17T08:00:00Z", attributs: choix("Moyen", "2026-11-17T08:05:00Z", 200) }),
  { valeur: "Moyen", origine: "choisi", poids_g: 200 });
ok("un format choisi à la main après le dernier changement de poids est gardé");
assert.equal(formatDeLaFiche({ poids_g: 2000, poids_change_le: "2026-11-17T09:00:00Z", attributs: choix("Moyen", "2026-11-17T08:05:00Z", 200) }).origine, "poids");
assert.equal(formatDeLaFiche({ poids_g: 200, poids_change_le: "2026-11-17T09:00:00Z", attributs: choix("Moyen", "2026-11-17T08:05:00Z", 200) }).origine, "poids",
  "poids changé ailleurs puis revenu à la même valeur : le choix est plus ancien que le dernier changement");
ok("le poids a changé après le choix → le format se recalcule (même revenu à la même valeur)");
assert.deepEqual(formatDeLaFiche({ poids_g: 200, poids_change_le: "2026-11-17T08:00:00Z", attributs: choix("auto", "2026-11-17T08:05:00Z", 200) }),
  { valeur: "Petit", origine: "poids", poids_g: 200 });
assert.deepEqual(formatDeLaFiche({ poids_g: null, poids_change_le: null, attributs: choix("Volumineux", "2026-11-17T08:05:00Z", null) }),
  { valeur: "Volumineux", origine: "choisi", poids_g: null });
assert.equal(formatDeLaFiche({ poids_g: null, poids_change_le: null, attributs: null }), null);
assert.equal(formatDeLaFiche({ poids_g: 200, poids_change_le: null, attributs: choix("Grand", "2026-11-17T08:05:00Z", 200) }).origine, "poids", "valeur hors liste ignorée");
ok("« Automatique » rend le calcul ; un choix sans poids vaut ; ni poids ni choix → rien ; une valeur inconnue est ignorée");
const ecrit = choixFormatPourLaFiche("Moyen", { poids_g: 200, maintenant: new Date("2026-11-17T10:00:00Z") });
assert.deepEqual(ecrit, { format_colis_lbc: { v: "Moyen", source: "manuel", at: "2026-11-17T10:00:00.000Z", poids_g: 200 } });
assert.deepEqual(choixFormatPourLaFiche("", { poids_g: 200, maintenant: new Date("2026-11-17T10:00:00Z") }).format_colis_lbc.v, "auto");
ok("le choix s'écrit dans attributs (source « manuel », le poids du moment) — aucune colonne neuve, aucune migration");

// ── 4. LE TEST DE NICO : fiche passée de 2 kg à 200 g → republication en 250 g ET Petit ──────────────────────────
// Le job de republication tel que get-pending-jobs le tenait avant ce correctif : la copie d'origine (2 kg, « Moyen »
// marqué manuel), le poids de l'annonce repris par-dessus (2000 g), la tranche PRO de 2 kg.
const jobRepublication = () => ({
  lbcPoidsGrammes: 2000, format_colis: "Moyen", format_colis_source: "manuel",
  lbcAspects: { estimated_parcel_weight: "De 1 kg à 2 kg", condition: "Très bon état" },
  lbcTransporteurs: ["Mondial Relay", "Colissimo"],
});
const fiche200 = { poids_g: 200, poids_change_le: "2026-11-17T09:40:00Z", attributs: { taille: { v: "M", source: "vinted_liste" } } };
const pfR = jobRepublication();
const fait = colisLbcAuService(pfR, fiche200, { action: "republish", maintenant: new Date("2026-11-17T10:00:00Z") });
assert.equal(pfR.lbcPoidsGrammes, 200);
assert.equal(pfR.lbcAspects.estimated_parcel_weight, "De 100 g à 250 g");
assert.equal(pfR.lbcAspects.condition, "Très bon état", "les autres critères ne bougent pas");
assert.equal(pfR.format_colis, "Petit");
assert.equal(pfR.format_colis_source, FORMAT_DE_LA_FICHE);
assert.equal(formatLbcDuJob(pfR), "Petit", "l'extension lit bien « Petit »");
assert.deepEqual(pfR.lbcTransporteurs, ["Mondial Relay", "Colissimo"]);
assert.ok(fait.length >= 3 && pfR.colis_de_la_fiche?.pose_par, "tracé sur le job");
ok("2 kg → 200 g : republication en « De 100 g à 250 g » (palier 250 g) ET « Petit », tracé (colis_de_la_fiche)");

// ── 5. Le format choisi à la main est respecté ───────────────────────────────────────────────────────────────────
const pfM = jobRepublication();
colisLbcAuService(pfM, { ...fiche200, attributs: choix("Moyen", "2026-11-17T09:45:00Z", 200) }, { action: "republish", maintenant: new Date("2026-11-17T10:00:00Z") });
assert.equal(pfM.format_colis, "Moyen");
assert.equal(pfM.lbcPoidsGrammes, 200);
assert.equal(pfM.lbcAspects.estimated_parcel_weight, "De 100 g à 250 g");
ok("format choisi à la main sur la fiche (après le poids) : « Moyen » respecté, poids et tranche de la fiche");
// Publication : un format choisi sur la carte Livraison PENDANT cette publication (horodaté, au poids de la copie)
// est plus récent que la fiche — il part (et l'app le range sur la fiche au clic Publier).
const pfC = avecFormatChoisi({ lbcPoidsGrammes: 200 }, "Volumineux", new Date("2026-11-17T09:50:00Z"));
colisLbcAuService(pfC, fiche200, { action: "publish", maintenant: new Date("2026-11-17T10:00:00Z") });
assert.equal(pfC.format_colis, "Volumineux");
ok("publication : le format choisi sur la carte pendant la publication est respecté");
// Une copie rouverte qui porte un vieux « manuel » sans date (avant ce correctif) ne passe pas devant la fiche.
const pfV = { lbcPoidsGrammes: 100, format_colis: "Moyen", format_colis_source: "manuel" };
colisLbcAuService(pfV, { poids_g: 100, poids_change_le: "2026-10-18T16:24:49Z", attributs: null }, { action: "publish" });
assert.equal(pfV.format_colis, "Petit");
ok("un ancien « manuel » sans date (copie d'origine) cède au poids de la fiche : 100 g → « Petit »");
// Une réponse à une question (needsUserResolved) reste devant tout : c'est la plus récente.
const pfQ = { ...jobRepublication(), needsUserResolved: { format_colis: "Moyen", lbcPoidsGrammes: 2000 } };
colisLbcAuService(pfQ, fiche200, { action: "republish" });
assert.equal(pfQ.format_colis, "Moyen");
assert.equal(pfQ.lbcPoidsGrammes, 2000);
ok("une réponse à une question sur CE job reste devant la fiche");

// ── 6. Rien d'inventé ; les transporteurs suivent le poids ───────────────────────────────────────────────────────
const pfS = jobRepublication();
const faitS = colisLbcAuService(pfS, { poids_g: null, poids_change_le: null, attributs: null }, { action: "republish" });
assert.deepEqual(faitS, []);
assert.deepEqual(pfS, jobRepublication());
ok("fiche sans poids ni choix : le job est servi tel qu'avant (aucun format inventé)");
const pfL = { lbcPoidsGrammes: 500, lbcTransporteurs: ["Courrier suivi", "Mondial Relay"] };
colisLbcAuService(pfL, { poids_g: 3000, poids_change_le: "2026-11-17T09:40:00Z", attributs: null }, { action: "republish" });
assert.deepEqual(pfL.lbcTransporteurs, ["Mondial Relay"], "Courrier suivi (≤ 2 kg) retiré pour 3 kg");
assert.equal(pfL.format_colis, "Moyen");
ok("fiche à 3 kg : Courrier suivi (≤ 2 kg) n'est plus demandé, format « Moyen »");
const pfI = { lbcPoidsGrammes: 200, format_colis: "Petit", format_colis_source: FORMAT_DE_LA_FICHE, lbcAspects: { estimated_parcel_weight: "De 100 g à 250 g" } };
assert.deepEqual(colisLbcAuService(pfI, fiche200, { action: "republish" }), [], "déjà conforme : rien à faire, rien de tracé");
ok("un job déjà conforme n'est pas retouché");

// ── 7. Les branchements ───────────────────────────────────────────────────────────────────────────────────────────
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
assert.ok(gpj.includes('import { colisLbcAuService, formatDeLaFiche } from "../_shared/colis-de-la-fiche.js";'), "get-pending-jobs importe la règle");
assert.ok(gpj.includes('!ficheDitPoids && !reponduL("lbcPoidsGrammes")') && gpj.includes('!ficheDitFormat && !reponduL("format_colis")'),
  "republication : l'annonce ne repose plus poids ni format quand la fiche les dit (sinon une écriture du job à chaque passage)");
assert.equal((gpj.match(/colisLbcAuService\(/g) ?? []).length, 2, "appelée deux fois : republication reprise de l'annonce (écrite) + passe finale (servie)");
assert.ok(/LE COLIS DE LA FICHE, AU SERVICE/.test(gpj), "la passe finale Leboncoin (publication et republication)");
const app = lire("src/App.jsx");
assert.ok(app.includes("formatDeLaFiche(") && app.includes("choixFormatPourLaFiche("), "la fiche article affiche et écrit le format");
assert.ok(/poids_change_le:v\.poids_change_le\?\?null/.test(app), "mapItem transporte poids_change_le");
const ecranP = lire("src/components/ListingPreviewScreen.jsx");
assert.ok(ecranP.includes("choixFormatPourLaFiche("), "le format choisi sur la carte se range sur la fiche au clic Publier");
assert.ok(lire("src/components/CarteLivraisonLeboncoin.jsx").includes("formatDeLaFiche("), "la carte Livraison montre le format de la fiche par défaut");
ok("branché : get-pending-jobs (2 appels), fiche article, carte Livraison, rangement au clic Publier");

console.log(`lbc-colis-de-la-fiche : ${n} contrôles verts`);
