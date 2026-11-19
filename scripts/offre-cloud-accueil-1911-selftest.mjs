// VERROU (19/11/2026 soir, demandes de Nico) — L'OFFRE CLOUD DE L'ACCUEIL, MÊME RÈGLE PARTOUT, ET CHAQUE REFUS DIT POURQUOI.
// 1. Android : « Pas d'ordinateur » montrait l'offre SANS essai (918461b2 10:39, a9a96191 11:42, 031c36fa 13:08 — raison
//    boutique_sans_semaine), alors que la carte du Stock la proposait deux minutes plus tard (918461b2, 10:41:55). Cause :
//    l'accueil ne demandait jamais les prix des FORMULES à Google Play (demanderPrixFormules), et etatEssaiBoutique
//    répondait « non » pour un produit pas encore lu. Maintenant : l'accueil et la carte du Stock demandent ces prix dès
//    que les formules se montrent ; un produit Google pas encore lu est « inconnu » (rien promis, rien refusé) ; lu avec
//    sa semaine gratuite → l'essai est proposé.
// 2. iPhone (fc2b7ebf, 14:57) : offre_cloud=false sans raison. Maintenant chaque refus d'offre dit sa raison
//    (raisonSansCloud : interrupteur, pays du fuseau, binaire), à l'accueil et sur la carte absente du Stock.
// Rouge sur 41eefce, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

console.log("1. Google : un produit pas encore lu n'est jamais « sans semaine »");
const P = await import("../src/lib/prixBoutique.js");
const R = await import("../src/entree/regles.js");
const charge = { canal: "google", statut: "pret", prix: { cloud: { texte: "24,99 €", essai: true } } };
ok(P.etatEssaiBoutique("pro_cloud", charge) === "inconnu", "formule pas encore lue (seul le Cloud lu) → « inconnu », pas « non »");
ok(P.etatEssaiBoutique("pro_cloud", { canal: "google", statut: "chargement", prix: {} }) === "inconnu", "lecture en cours → « inconnu »");
ok(P.etatEssaiBoutique("pro_cloud", { canal: "google", statut: "pret", prix: { pro_cloud: { essai: true } } }) === "oui", "lue avec sa semaine gratuite → « oui »");
ok(P.etatEssaiBoutique("pro_cloud", { canal: "google", statut: "pret", prix: { pro_cloud: { essai: false } } }) === "non", "lue SANS semaine → « non » (vrai refus)");
const carte = (boutique, cta) => ({ cartes: [{ formule: "pro_cloud", boutique, cta }] });
ok(R.offreAccueil(carte("inconnu", "souscrire"), true).raison === "boutique_incertaine", "accueil : produit pas lu → raison « boutique_incertaine » (plus jamais « boutique_sans_semaine »)");
ok(R.offreAccueil(carte("oui", "essai"), true).essaiPropose === true, "accueil : lu avec semaine → essai proposé");

console.log("2. L'accueil et le Stock DEMANDENT les prix des formules");
const hook = lire("src/entree/useOffreAccueil.js");
ok(/useEffect\(\(\) => \{ if \(formules\) demanderPrixFormules\(\)\.catch\(\(\) => \{\}\); \}, \[formules\]\);/.test(hook), "useOffreAccueil demande les prix des formules dès qu'elles se montrent");
const stock = lire("src/cloud/CarteCloudStock.jsx");
ok(/if \(actif && formules\) demanderPrixFormules\(\)/.test(stock), "la carte du Stock aussi (même règle partout)");

console.log("3. Chaque refus d'offre dit sa raison");
const C = await import("../src/config/cloudOffer.js");
const I = await import("../src/config/interrupteurs.js");
ok(typeof C.raisonSansCloud === "function", "raisonSansCloud existe");
if (typeof C.raisonSansCloud === "function") {
  I._remettreAZero({});
  C._binaireCloudAZero("2.9.214", "ios");
  ok(C.raisonSansCloud("compte-essai", { plateforme: "ios", fuseau: "Europe/Paris" })?.raison === "interrupteur_ferme", "interrupteurs fermés → « interrupteur_ferme »");
  I._remettreAZero({ cloud_offre_ouverte: 1, cloud_formules_apple: 1, cloud_formules_google: 1, cloud_formules_stripe: 1 });
  ok(C.raisonSansCloud("compte-essai", { plateforme: "ios", fuseau: "Europe/Paris" }) === null, "ouvert, France, binaire récent → vendu (aucune raison)");
  const pays = C.raisonSansCloud("compte-essai", { plateforme: "ios", fuseau: "America/Martinique" });
  ok(pays?.raison === "pays_hors_france" && pays.detail === "America/Martinique", "fuseau hors Europe/Paris → « pays_hors_france » + le fuseau lu");
  C._binaireCloudAZero(null, "ios");
  const bin = C.raisonSansCloud("compte-essai", { plateforme: "ios", fuseau: "Europe/Paris" });
  ok(bin?.raison === "binaire" && bin.detail === "inconnu", "binaire pas lu ou trop ancien → « binaire »");
  I._remettreAZero(null); C._binaireCloudAZero(null, null);
}
const etapes = lire("src/entree/EtapesAccueil.jsx");
ok(/raison_sans_offre: o\.sansOffre\.raison/.test(etapes) && /raison_sans_essai: o\.essaiPropose \? null : \(o\.raison \?\? null\)/.test(etapes),
  "ordinateur_oui / ordinateur_non : raison de l'essai absent ET de l'offre absente");
ok(/sansOffre/.test(hook) && /raisonSansCloud\(c\.user\.id/.test(hook), "useOffreAccueil calcule la raison d'une offre absente");
ok(/stock_carte_cloud_absente/.test(stock) && /raison_sans_offre/.test(stock), "Stock : une carte absente dit pourquoi, une fois");

console.log(echecs ? `✗ offre-cloud-accueil-1911 : ${total - echecs}/${total}` : `✓ offre-cloud-accueil-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
