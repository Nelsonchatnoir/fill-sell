// Autotest : UN LOT LEBONCOIN NE PART JAMAIS SANS POIDS (11/10/2026, Louis).
//
//     npm run selftest:lot-poids-leboncoin
//
// La régression : 9bdcfce (10/10 13:50, OTA 2.9.75) rendait le poids du lot
// « facultatif ». Les 12 livres (11/10 10:07) et les 18 vêtements (11:05) de
// Louis sont partis sur Leboncoin SANS poids — Leboncoin a gardé son
// estimation du rayon (livres : 100 g, format S). Le lot du 10/10 19:44
// n'avait le sien (500 g) que parce que les fiches le portaient déjà.
//
// Ce qu'il prouve, sans réseau ni base — et il tombe si l'un revient :
//   1. le lot : un article visé sur Leboncoin SANS poids n'est jamais « Prêt »
//      (motif « poids ») ; le poids donné UNE fois pour le lot les rend tous
//      prêts ; fiche ou copie qui portent un poids : prêt ; Beebs seul,
//      Vinted, eBay : rien d'exigé (inchangé) ;
//   2. le lot de Louis rejoué : 12 livres Leboncoin sans poids → 0 prêt ;
//      « Appliquer aux 12 sans poids » (500 g) → 12 prêts, 12 × 500 g ;
//   3. le serveur : une PUBLICATION Leboncoin sans poids n'est jamais servie
//      (needs_user avec le champ) ; un poids écrit autrement est lu en
//      grammes ; la republication et les autres plateformes sont intactes ;
//   4. le câblage : envoi du lot, bloc Livraison, carte d'article, stepper
//      (« Confirmer »), get-pending-jobs, question « À régler » (une fois pour
//      le lot).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const R = await charger("src/publication/lot/regles.js");
const P = await charger("supabase/functions/_shared/poids-leboncoin.js");

const moteur = (plateformes, extra = {}) => ({
  plateformesPubliables: new Set(plateformes), price: 2, nbQuestions: 0, ctaDisabled: false, preparationAuRepos: true,
  texteVendeur: { titre: "Livre Hors saison de Françoise Bourdin", description: "Roman en très bon état" }, jumeaux: [],
  edited: { leboncoin: { platform_fields: {} } }, initialListing: {}, ...extra,
});

console.log("1. le lot : Leboncoin sans poids n'est jamais prêt");
const sans = R.bilanArticle(moteur(["leboncoin"]), {}, "fr");
ok(!sans.pret, "Leboncoin sans poids : PAS prêt");
ok(sans.motifs.some((x) => x.cle === "poids"), "le motif dit « poids »");
ok(!R.bilanArticle(moteur(["leboncoin", "vinted", "ebay", "beebs"]), {}, "fr").pret, "Leboncoin parmi d'autres plateformes, sans poids : PAS prêt");
ok(R.bilanArticle(moteur(["leboncoin"]), { poids: 500 }, "fr").pret, "poids donné dans le lot : prêt");
ok(R.bilanArticle(moteur(["leboncoin"], { initialListing: { poids_g: 500 } }), {}, "fr").pret, "poids déjà sur la fiche (cas du 10/10 19:44) : prêt");
ok(R.bilanArticle(moteur(["leboncoin"], { edited: { leboncoin: { platform_fields: { lbcPoidsGrammes: 300 } } } }), {}, "fr").pret, "poids sur la copie Leboncoin : prêt");
ok(R.bilanArticle(moteur(["beebs"]), {}, "fr").pret, "Beebs seul : rien d'exigé (inchangé depuis le 10/10)");
ok(R.bilanArticle(moteur(["vinted", "ebay"]), {}, "fr").pret, "Vinted + eBay : rien d'exigé (inchangé)");
ok(R.poidsExigePour(["leboncoin"]) && !R.poidsExigePour(["beebs", "vinted", "ebay", "depop"]), "poids exigé pour Leboncoin seulement");

console.log("2. le lot de Louis rejoué (11/10 10:07, 12 livres)");
const livres = Array.from({ length: 12 }, () => moteur(["leboncoin"]));
ok(livres.filter((m) => R.bilanArticle(m, {}, "fr").pret).length === 0, "12 livres sans poids : 0 prêt — rien ne part");
const decisions = livres.map(() => ({ poids: R.lirePoidsSaisi("500 g") }));
ok(livres.filter((m, i) => R.bilanArticle(m, decisions[i], "fr").pret).length === 12, "« Appliquer aux 12 sans poids » (500 g) : 12 prêts");
ok(livres.every((m, i) => R.poidsConnu(m, decisions[i]) === 500), "chaque livre part avec 500 g");

console.log("3. le serveur (_shared/poids-leboncoin.js)");
const job = (pf, extra = {}) => ({ platform: "leboncoin", action: "publish", platform_fields: pf, ...extra });
ok(P.decisionPoidsLbc(job({})).action === "demander", "publication Leboncoin sans poids : demander (jamais servie)");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: null })).action === "demander", "poids null : demander");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: 0 })).action === "demander", "poids 0 : demander");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: "abc" })).action === "demander", "poids illisible : demander");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: 500 })).action === "rien", "500 g : servi tel quel");
const n1 = P.decisionPoidsLbc(job({ lbcPoidsGrammes: "650 g" }));
ok(n1.action === "normaliser" && n1.valeur === 650, "« 650 g » (réponse d'une ancienne app) : lu 650 g, jamais une question en boucle");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: "1,2 kg" })).valeur === 1200, "« 1,2 kg » : 1 200 g");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: "500" })).valeur === 500, "« 500 » (chaîne) : 500 g");
ok(P.decisionPoidsLbc(job({}, { action: "republish" })).action === "rien", "republication : non concernée (poids de l'annonce en ligne)");
ok(P.decisionPoidsLbc(job({}, { action: "delete" })).action === "rien", "retrait : non concerné");
ok(P.decisionPoidsLbc({ platform: "vinted", action: "publish", platform_fields: {} }).action === "rien", "Vinted : non concerné");
ok(P.decisionPoidsLbc({ platform: "beebs", action: "publish", platform_fields: {} }).action === "rien", "Beebs : non concerné");
ok(P.QUESTION_POIDS_LBC.field_key === "lbcPoidsGrammes" && P.QUESTION_POIDS_LBC.target.key === "lbcPoidsGrammes" && !P.QUESTION_POIDS_LBC.target.root, "la question écrit lbcPoidsGrammes à la racine du job");
ok(P.grammesLbc(R.lirePoidsSaisi("150 kg")) === 150000 && P.grammesLbc(150001) === null, "toute saisie que l'app accepte est servie (bornes alignées)");

console.log("4. câblage");
const lot = lire("src/publication/lot/LotPublication.jsx");
const envoi = lot.slice(lot.indexOf("async function envoyer()"), lot.indexOf("async function envoyer()") + 2500);
ok(/etatsRef\.current\[id\]\?\.phase === "pret"/.test(envoi) && /bilanArticle\(/.test(envoi) && /!b\?\.pret\) \{ majEtat\(id, \{ phase: "questions"/.test(envoi),
  "envoi du lot : seuls les « prêts » partent, bilan refait juste avant chaque envoi");
ok(/<ArticleAQuestions[^>]*poserPoids=\{poserPoids\}/.test(lot.replace(/\n\s*/g, " ")), "la carte d'article reçoit poserPoids");
ok(/aPoids && poserPoids &&/.test(lot) && /lirePoidsSaisi\(ev\.target\.value\)/.test(lot), "la carte d'article demande le poids (motif « poids »)");
const liv = lire("src/publication/lot/LivraisonDuLot.jsx");
ok(/obligatoire pour Leboncoin/.test(liv) && /lbcSansPoids/.test(liv) && /poserPoidsDuLot\(sansPoids, gLot\)/.test(liv), "bloc Livraison : poids obligatoire pour Leboncoin, une valeur pour le lot");
const reg = lire("src/publication/lot/regles.js");
ok(/poidsExigePour\(plateformes\) && poidsConnu\(m, decisions\) == null/.test(reg), "regles.js : le motif « poids » est posé");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/poidsLbcManquant \|\|/.test(lps) && /\.\.\.\(poidsLbcManquant \? \["leboncoin"\] : \[\]\)/.test(lps) && /poidsLbc: \{/.test(lps),
  "stepper : Publier grisé sans poids Leboncoin, « Continuer sans Leboncoin », champ exposé");
ok(/<CartePoidsLeboncoin m=\{m\} \/>/.test(lire("src/publication/EcranConfirmer.jsx")), "« Confirmer » montre le champ « Poids du colis (Leboncoin) »");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const bloc = gpj.slice(gpj.indexOf("LEBONCOIN : AUCUN FORMAT DEVINÉ, LE POIDS DE LA FICHE"), gpj.indexOf("OPLA : UN PRIX AU-DESSUS DE SON PLAFOND"));
ok(/decisionPoidsLbc\(\{ \.\.\.j, platform_fields: pfL \}\)/.test(bloc) && bloc.indexOf("livraisonLbcAuService(") < bloc.indexOf("decisionPoidsLbc({"),
  "gpj : le poids de la fiche d'abord, PUIS la règle");
ok(/status: "needs_user", error: MESSAGE_POIDS_LBC/.test(bloc) && /needsUserField: QUESTION_POIDS_LBC/.test(bloc), "gpj : sans poids → needs_user avec le champ");
ok(/out = out\.filter\(\(j\) => !retenusPoids\.has/.test(bloc) && /catch \(e\) \{[\s\S]*retenusPoids\.add/.test(bloc), "gpj : jamais servi, même si la lecture rate");
const st = lire("src/tabs/StockTab.jsx");
ok(/questionPoidsLbc = job\.platform === "leboncoin" && f\?\.field_key === "lbcPoidsGrammes"/.test(st) && /newPf\.lbcPoidsGrammes = poidsLbcLu/.test(st), "« À régler » : le poids part en grammes");
ok(/memePoidsPourLot \? autresDuLot : \[\]/.test(st) && /\.eq\("id", a\.id\)\.eq\("status", "needs_user"\)/.test(st), "« À régler » : une réponse pour tout le lot, jamais un job déjà repris");
ok(st.indexOf("const [autresDuLot, setAutresDuLot]") < st.indexOf("if (!f && !descriptionRequise) return null;"), "« À régler » : les hooks avant le retour anticipé");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
