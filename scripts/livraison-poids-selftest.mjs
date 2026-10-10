// Autotest : POIDS, FORMAT ET TRANSPORTEURS — AUCUN FORMAT DEVINÉ (04/10/2026,
// Louis — 13 « Rangement » identiques partis 7 en « Petit », 6 en « Moyen »).
//
//     node --import ./scripts/loader-ext.mjs scripts/livraison-poids-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. l'app : seul un format CHOISI compte ; les transporteurs suivent le
//      poids (relevé live du 04/10 : Courrier suivi ≤ 2 kg, Shop2Shop ≤ 20 kg,
//      Mondial Relay et Colissimo ≤ 30 kg ; Volumineux = aucun partenaire) ;
//   2. le lot (10/10, Nico : « exactement comme l'unité ») : sans poids, un
//      article visé sur Leboncoin ou Beebs est PRÊT — la plateforme garde son
//      estimation d'après le rayon, comme pour un article publié seul ; le
//      poids connu (lot, copie, fiche) part et choisit le palier ;
//   3. le serveur : format deviné écarté, poids de la fiche, transporteurs
//      retenus bornés au poids, rien d'inventé ;
//   4. le câblage : prompt sans format, gpj, carte, moteur, lot.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const C = await charger("src/utils/leboncoinColis.js");
const R = await charger("src/publication/lot/regles.js");
const S = await charger("supabase/functions/_shared/livraison-poids.js");

console.log("1. l'app : format choisi, transporteurs au poids");
ok(C.formatChoisiLbc({ format_colis: "Petit colis" }) === null, "un format de la rédaction (non marqué) n'est pas un choix");
ok(C.formatChoisiLbc({ format_colis: "Moyen", format_colis_source: "manuel" }) === "Moyen", "un format marqué « manuel » est le choix de la personne");
const pf = C.avecFormatChoisi({ format_colis: "Petit colis", lbcFormatColis: "Petit", autre: 1 }, "Volumineux");
ok(pf.format_colis === "Volumineux" && pf.format_colis_source === "manuel" && !("lbcFormatColis" in pf) && pf.autre === 1, "poser un format : marqué, l'ancien repli effacé, le reste intact");
const vide = C.avecFormatChoisi(pf, "");
ok(!("format_colis" in vide) && !("format_colis_source" in vide), "retirer le format : plus rien de posé");
ok(C.transporteursPourPoids(300).length === 4, "300 g : les quatre transporteurs");
ok(C.transporteursPourPoids(5000).join() === "Shop2Shop by Chronopost,Mondial Relay,Colissimo", "5 kg : plus de Courrier suivi (2 kg au plus)");
ok(C.transporteursPourPoids(25000).join() === "Mondial Relay,Colissimo", "25 kg : Mondial Relay et Colissimo seuls (relevé : Moyen 30 kg)");
ok(C.transporteursPourPoids(null).length === 4, "poids inconnu : rien n'est retiré");
ok(Array.isArray(C.transporteursPlausibles("Volumineux", 300)) && C.transporteursPlausibles("Volumineux", 300).length === 0, "Volumineux : « Livraison colis XL », aucun partenaire");
ok(C.transporteursPlausibles("Moyen", 250).includes("courrier_suivi"), "Moyen 250 g : Courrier suivi reste proposé (relevé live)");
ok(C.LBC_PALIERS_G.length === 11 && C.LBC_PALIERS_G[0] === 100 && C.LBC_PALIERS_G[10] === 70000, "les onze paliers relevés (100 g … plus de 40 kg)");

console.log("2. le lot : sans poids, prêt — comme à l'unité (10/10)");
const moteur = (plateformes, extra = {}) => ({
  plateformesPubliables: plateformes, price: 12, nbQuestions: 0, ctaDisabled: false, preparationAuRepos: true,
  texteVendeur: { titre: "Rangement noir", description: "Rangement noir pour 12 pots" }, jumeaux: [],
  edited: { leboncoin: { platform_fields: {} } }, initialListing: {}, ...extra,
});
const b1 = R.bilanArticle(moteur(["leboncoin", "vinted"]), {}, "fr");
ok(b1.pret && !b1.motifs.some((x) => x.cle === "poids"), "Leboncoin sans poids : Prêt, aucune question (Leboncoin garde son estimation, comme à l'unité)");
ok(R.bilanArticle(moteur(["beebs"]), {}, "fr").pret, "Beebs sans poids : Prêt aussi (pré-remplissage de Beebs ou palier du rayon)");
ok(!R.bilanArticle(moteur(["leboncoin"], { nbQuestions: 1 }), {}, "fr").pret, "un « Poids du colis » EXIGÉ par la plateforme (question du moteur) reste une question, comme au stepper");
ok(R.bilanArticle(moteur(["vinted", "ebay"]), {}, "fr").pret, "Vinted + eBay : pas de poids exigé (Vinted demande une taille, eBay rien)");
ok(R.bilanArticle(moteur(["leboncoin"]), { poids: 650 }, "fr").pret, "poids réglé dans le lot : Prêt");
ok(R.bilanArticle(moteur(["leboncoin"], { initialListing: { poids_g: 300 } }), {}, "fr").pret, "poids déjà sur la fiche : Prêt");
ok(R.bilanArticle(moteur(["leboncoin"], { edited: { leboncoin: { platform_fields: { lbcPoidsGrammes: 900 } } } }), {}, "fr").pret, "poids sur la copie Leboncoin : Prêt");
ok(R.poidsConnu(moteur(["leboncoin"], { initialListing: { poids_g: 300 } }), { poids: 650 }) === 650, "le poids réglé dans le lot passe devant celui de la fiche");
ok(R.lirePoidsSaisi("1,2 kg") === 1200 && R.lirePoidsSaisi("650") === 650 && R.lirePoidsSaisi("300 g") === 300, "saisies lues : « 1,2 kg », « 650 », « 300 g »");
ok(R.lirePoidsSaisi("abc") === null && R.lirePoidsSaisi("0") === null && R.lirePoidsSaisi("") === null, "saisies refusées : texte, zéro, vide");

console.log("3. le serveur");
const j1 = { format_colis: "Petit colis" };
const f1 = S.livraisonLbcAuService(j1, { poidsFiche: 300, transporteursRetenus: ["Courrier suivi", "Mondial Relay"], maintenant: new Date("2026-10-04T23:00:00Z") });
ok(!("format_colis" in j1) && j1.format_colis_ecarte?.de === "Petit colis", "format deviné écarté (trace format_colis_ecarte)");
ok(j1.lbcPoidsGrammes === 300 && j1.lbcTransporteurs.join() === "Courrier suivi,Mondial Relay" && f1.length === 3, "poids de la fiche et transporteurs retenus posés");
const j2 = { format_colis: "Moyen", format_colis_source: "manuel", lbcPoidsGrammes: 5000 };
S.livraisonLbcAuService(j2, { poidsFiche: 300, transporteursRetenus: ["Courrier suivi", "Colissimo"] });
ok(j2.format_colis === "Moyen" && j2.lbcPoidsGrammes === 5000, "un format CHOISI et un poids déjà sur la copie ne bougent pas");
ok(j2.lbcTransporteurs.join() === "Colissimo", "5 kg : Courrier suivi retiré du choix retenu (2 kg au plus)");
const j3 = { lbcPoidsGrammes: 5000 };
S.livraisonLbcAuService(j3, { transporteursRetenus: ["Courrier suivi"] });
ok(!("lbcTransporteurs" in j3), "aucun transporteur retenu n'accepte ce poids : rien posé, Leboncoin garde les siens");
const j4 = { lbcTransporteurs: ["Colissimo"] };
S.livraisonLbcAuService(j4, { transporteursRetenus: ["Mondial Relay"] });
ok(j4.lbcTransporteurs.join() === "Colissimo", "un choix déjà sur le job n'est jamais remplacé");
const j5 = {};
ok(S.livraisonLbcAuService(j5, {}).length === 0 && !("livraison_au_service" in j5), "rien de connu : rien d'inventé, pas de trace");
const jb = { format_colis: "Moyen colis" };
ok(S.ecarterFormatDevine(jb) && !("format_colis" in jb), "Beebs : format deviné écarté aussi");

console.log("4. câblage");
ok(!/format_colis/.test(lire("supabase/functions/_shared/redaction-plateformes.ts")), "la rédaction ne devine plus de format (prompt Leboncoin)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/livraisonLbcAuService\(pfL, \{/.test(gpj) && /\(j\.action \?\? "publish"\) === "publish"/.test(gpj), "gpj : livraison Leboncoin au service des PUBLICATIONS");
ok(/\(formatChoisi\(pfJ\) \? formatBeebsDuChoix\(pfJ\.format_colis\) : null\)/.test(gpj), "gpj : Beebs ne prend un format que s'il est choisi, sinon le poids de la fiche");
ok(/formatChoisiLbc\(champs\)/.test(lire("src/components/CarteLivraisonLeboncoin.jsx")), "la carte n'affiche que le format choisi");
const ecran = lire("src/components/ListingPreviewScreen.jsx");
ok(/poserLivraisonLbc: \(patch\) =>/.test(ecran) && (ecran.match(/avecFormatChoisi\(/g) ?? []).length >= 3, "moteur : format marqué depuis la carte, la liste des champs et le lot");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/<LivraisonDuLot /.test(lot) && /update\(\{ poids_g: g \}\)/.test(lot) && /fusionnerReglages\(\["leboncoin"\], \{ transporteurs: liste \}\)/.test(lot),
  "lot : bloc Livraison, poids écrit sur la fiche, transporteurs retenus (platform_settings_fusionner)");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
