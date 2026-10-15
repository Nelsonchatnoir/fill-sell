// Autotest : LE POIDS LEBONCOIN — ESTIMÉ PAR LEBONCOIN OU SAISI (11/10/2026 soir, Nico).
//
//     npm run selftest:lot-poids-leboncoin
//
// Historique : le 11/10 midi, après les 12 livres et 18 vêtements de Louis
// partis sans poids, le poids était devenu OBLIGATOIRE (lot, « Confirmer »,
// get-pending-jobs v234 qui ne servait plus une publication sans poids).
// Décision de Nico le même soir : « le poids obligatoire est une friction de
// trop » — sans poids, Leboncoin publie et estime lui-même (100 g format S
// pour un livre, 250 g pour un pyjama), c'est acceptable.
//
// Ce qu'il prouve, sans réseau ni base — et il tombe si l'une des deux moitiés
// casse :
//   A. LE POIDS SAISI PART : choix « Saisir le poids », une valeur pour le
//      lot → chaque article la porte (poidsConnu), la copie Leboncoin la
//      reçoit (appliquerLivraison), la fiche la garde, le serveur la sert en
//      grammes (« 650 g » → 650), le poids de la fiche complète un job qui
//      n'en a pas (livraisonLbcAuService), l'extension la pose (poserLivraisonLbc) ;
//      « Saisir » sans poids : l'article attend (jamais un envoi muet) ;
//   B. L'ESTIMATION LEBONCOIN PUBLIE SANS BLOQUER : « Laisser Leboncoin
//      estimer » est le DÉFAUT ; un article Leboncoin sans poids est prêt ;
//      le lot de Louis (12 livres) rejoué : 12 prêts, aucun poids inventé ;
//      le serveur sert une publication sans poids (jamais needs_user, jamais
//      retenue, même si la lecture de la fiche rate) ; le stepper ne grise
//      pas Publier ;
//   C. le choix est retenu (platform_settings.leboncoin.poids_choix, par
//      platform_settings_fusionner seulement) et câblé partout (lot, carte
//      d'article, bloc Livraison, « Confirmer ») ; un poids de la fiche part
//      toujours ; Beebs, Vinted, eBay, republication : inchangés.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const R = await charger("src/publication/lot/regles.js");
const C = await charger("src/utils/choixPoidsLeboncoin.js");
const P = await charger("supabase/functions/_shared/poids-leboncoin.js");
const LP = await charger("supabase/functions/_shared/livraison-poids.js");

const moteur = (plateformes, extra = {}) => ({
  plateformesPubliables: new Set(plateformes), price: 2, nbQuestions: 0, ctaDisabled: false, preparationAuRepos: true,
  texteVendeur: { titre: "Livre Hors saison de Françoise Bourdin", description: "Roman en très bon état" }, jumeaux: [],
  edited: { leboncoin: { platform_fields: {} } }, initialListing: {}, ...extra,
});
const ESTIMER = C.POIDS_LBC_ESTIMER, SAISIR = C.POIDS_LBC_SAISIR;

console.log("0. le choix");
ok(C.CHOIX_POIDS_LBC_DEFAUT === ESTIMER, "par défaut : « Laisser Leboncoin estimer »");
ok(C.choixPoidsValide(undefined) === ESTIMER && C.choixPoidsValide("n'importe") === ESTIMER && C.choixPoidsValide(SAISIR) === SAISIR, "un choix inconnu vaut le défaut (estimer)");
ok(C.choixPoidsDesReglages({ leboncoin: { poids_choix: "saisir", transporteurs: ["Colissimo"] } }) === SAISIR, "le choix se lit dans platform_settings.leboncoin.poids_choix");
ok(C.choixPoidsDesReglages(null) === ESTIMER && C.choixPoidsDesReglages({}) === ESTIMER, "aucun réglage : estimer");
ok(!C.poidsLbcManquantPour(ESTIMER, null), "estimer, sans poids : rien ne manque");
ok(C.poidsLbcManquantPour(SAISIR, null) && C.poidsLbcManquantPour(SAISIR, 0), "saisir, sans poids : le poids manque");
ok(!C.poidsLbcManquantPour(SAISIR, 500), "saisir, 500 g : rien ne manque");

console.log("A. le poids saisi part");
const mS = (extra) => moteur(["leboncoin"], { poidsLbcChoix: SAISIR, ...extra });
const sansS = R.bilanArticle(mS(), {}, "fr");
ok(!sansS.pret && sansS.motifs.some((x) => x.cle === "poids"), "« Saisir », sans poids : l'article attend son poids (motif « poids »), jamais un envoi muet");
ok(R.bilanArticle(mS(), { poids: 500 }, "fr").pret, "« Saisir », 500 g donné dans le lot : prêt");
const livres = Array.from({ length: 12 }, () => mS());
const dec = livres.map(() => ({ poids: R.lirePoidsSaisi("500 g") }));
ok(livres.filter((m, i) => R.bilanArticle(m, dec[i], "fr").pret).length === 12 && livres.every((m, i) => R.poidsConnu(m, dec[i]) === 500),
  "lot de Louis en « Saisir » : « Appliquer aux 12 sans poids » (500 g) → 12 prêts, 12 × 500 g");
ok(R.bilanArticle(moteur(["leboncoin"], { poidsLbcChoix: ESTIMER, initialListing: { poids_g: 700 } }), {}, "fr").pret
  && R.poidsConnu(moteur(["leboncoin"], { initialListing: { poids_g: 700 } }), {}) === 700, "un poids sur la FICHE part toujours (même en « estimer »)");
ok(R.poidsConnu(moteur(["leboncoin"], { edited: { leboncoin: { platform_fields: { lbcPoidsGrammes: 300 } } } }), {}) === 300, "un poids sur la copie Leboncoin part");
// Serveur : le poids saisi arrive en grammes, celui de la fiche complète le job.
const job = (pf, extra = {}) => ({ platform: "leboncoin", action: "publish", platform_fields: pf, ...extra });
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: 500 })).action === "rien", "serveur : 500 g servi tel quel");
const n1 = P.decisionPoidsLbc(job({ lbcPoidsGrammes: "650 g" }));
ok(n1.action === "normaliser" && n1.valeur === 650, "serveur : « 650 g » servi en 650 g");
ok(P.decisionPoidsLbc(job({ lbcPoidsGrammes: "1,2 kg" })).valeur === 1200 && P.decisionPoidsLbc(job({ lbcPoidsGrammes: "500" })).valeur === 500, "serveur : « 1,2 kg » → 1 200 g ; « 500 » → 500 g");
const pfFiche = {};
LP.livraisonLbcAuService(pfFiche, { poidsFiche: 800 });
ok(pfFiche.lbcPoidsGrammes === 800, "serveur : le poids de la fiche complète un job qui n'en a pas (800 g)");
const pfDeja = { lbcPoidsGrammes: 450 };
LP.livraisonLbcAuService(pfDeja, { poidsFiche: 800 });
ok(pfDeja.lbcPoidsGrammes === 450, "serveur : le poids saisi n'est jamais écrasé par celui de la fiche");
ok(P.grammesLbc(R.lirePoidsSaisi("150 kg")) === 150000 && P.grammesLbc(150001) === null, "toute saisie que l'app accepte est servie (bornes alignées)");
const ext = lire("chrome-extension/content-scripts/leboncoin.js");
ok(/const poids = Number\(fields\?\.lbcPoidsGrammes\) > 0 \? Number\(fields\.lbcPoidsGrammes\) : null;/.test(ext), "extension : le poids du job est posé sur le formulaire Leboncoin");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/\.\.\.\(g != null \? \{ lbcPoidsGrammes: g \} : \{\}\)/.test(lot) && /supabase\.from\("inventaire"\)\.update\(\{ poids_g: g \}\)/.test(lot),
  "lot : le poids saisi va sur la copie Leboncoin ET sur la fiche");

console.log("B. l'estimation Leboncoin publie sans bloquer");
const sansE = R.bilanArticle(moteur(["leboncoin"]), {}, "fr");
ok(sansE.pret && !sansE.motifs.some((x) => x.cle === "poids"), "défaut (aucun choix posé) : Leboncoin sans poids est PRÊT");
ok(R.bilanArticle(moteur(["leboncoin"], { poidsLbcChoix: ESTIMER }), {}, "fr").pret, "« Laisser Leboncoin estimer » : prêt");
ok(R.bilanArticle(moteur(["leboncoin", "vinted", "ebay", "beebs"], { poidsLbcChoix: ESTIMER }), {}, "fr").pret, "Leboncoin parmi d'autres plateformes, sans poids : prêt");
const livresE = Array.from({ length: 12 }, () => moteur(["leboncoin"], { poidsLbcChoix: ESTIMER }));
ok(livresE.filter((m) => R.bilanArticle(m, {}, "fr").pret).length === 12 && livresE.every((m) => R.poidsConnu(m, {}) == null),
  "lot de Louis en « estimer » : 12 prêts, aucun poids inventé");
ok(P.decisionPoidsLbc(job({})).action === "rien", "serveur : publication Leboncoin sans poids SERVIE (Leboncoin estime)");
ok(["null", "0", "abc"].every((v) => P.decisionPoidsLbc(job({ lbcPoidsGrammes: v === "null" ? null : v === "0" ? 0 : v })).action === "rien"),
  "serveur : poids null, 0 ou illisible : servie, jamais une question");
const pfVide = {};
LP.livraisonLbcAuService(pfVide, { poidsFiche: null });
ok(pfVide.lbcPoidsGrammes === undefined, "serveur : sans poids de fiche, aucun poids inventé");
ok(/if \(!\(demandes && demandes\.length\) && !format && !poids\) return; \/\/ rien demandé : on ne touche à rien/.test(ext),
  "extension : sans poids, rien n'est touché — Leboncoin garde son estimation");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const bloc = gpj.slice(gpj.indexOf("LEBONCOIN : AUCUN FORMAT DEVINÉ, LE POIDS DE LA FICHE"), gpj.indexOf("OPLA : UN PRIX AU-DESSUS DE SON PLAFOND"));
ok(bloc.length > 500 && /decisionPoidsLbc\(\{ \.\.\.j, platform_fields: pfL \}\)/.test(bloc) && bloc.indexOf("livraisonLbcAuService(") < bloc.indexOf("decisionPoidsLbc({"),
  "gpj : le poids de la fiche d'abord, puis la lecture en grammes");
// (15/10 soir, PAUGUES) SEULE exception : un compte où Leboncoin EXIGE le poids
// (formulaire PRO, preuve notée par handler-watch) — jamais un particulier.
const blocSansExige = bloc.replace(/\/\/ ── \(15\/10 soir, PAUGUES\) UN COMPTE QUI EXIGE LE POIDS[\s\S]*$/, "");
ok(!/needs_user/.test(blocSansExige) && !/retenusPoids/.test(bloc) && !/QUESTION_POIDS_LBC|MESSAGE_POIDS_LBC/.test(gpj)
  && /if \(poidsExige\) \{/.test(bloc) && /poidsManquantCompteExige\(j, reglagesL\.leboncoin/.test(bloc),
  "gpj : aucune publication retenue pour son poids, sauf chez un compte où Leboncoin l'EXIGE (preuve notée)");
ok(P.QUESTION_POIDS_LBC === undefined && !Object.values(P).some((v) => typeof v === "function" && /demander/.test(String(v))), "_shared/poids-leboncoin.js : plus de « demander »");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/const poidsLbcManquant = poidsLbcVise\s*&& poidsLbcManquantPour\(choixPoidsLbc\.choix, lirePoidsGrammes\(poidsLbcSaisi\)\.valeur \?\? poidsDeLaFiche\);/.test(lps),
  "stepper : Publier n'attend le poids QUE si la personne a choisi « Saisir le poids »");
ok(!/\.\.\.\(poidsLbcManquant \? \["leboncoin"\] : \[\]\)/.test(lps), "stepper : plus de « Continuer sans Leboncoin » pour un poids (l'autre choix est à un tap)");

console.log("C. choix retenu, câblage, rien d'autre ne bouge");
const hook = lire("src/utils/useChoixPoidsLeboncoin.js");
ok(/fusionnerReglages\(\['leboncoin'\], \{ \[CLE_REGLAGE_POIDS_LBC\]: c \}\)/.test(hook) && !/\.update\(\{\s*platform_settings/.test(hook),
  "le choix est retenu par platform_settings_fusionner, jamais l'objet entier");
ok(/const poidsLbc = useChoixPoidsLeboncoin\(userId\);/.test(lot) && (lot.match(/poidsLbcChoix: poidsLbcChoixRef\.current/g) ?? []).length === 2,
  "lot : le choix atteint les DEUX bilans (pilote et envoi)");
ok(/choixPoidsLbc=\{poidsLbc\.choix\} choisirPoidsLbc=\{poidsLbc\.choisir\}/.test(lot) && /choixPoidsLbc = "estimer", choisirPoidsLbc = \(\) => \{\},/.test(lot)
  && /choixPoidsLbc=\{choixPoidsLbc\} choisirPoidsLbc=\{choisirPoidsLbc\}/.test(lot), "lot : EcranAvant REÇOIT le choix (leçon de la page blanche du 10/10) et le passe au bloc Livraison");
ok(/\[tick, lot, etats, actifs, decisions, poidsLbc\.choix\]/.test(lot), "lot : changer de choix refait le bilan des articles");
const liv = lire("src/publication/lot/LivraisonDuLot.jsx");
ok(/Laisser Leboncoin estimer/.test(liv) && /Saisir le poids/.test(liv) && /choisirPoidsLbc\(POIDS_LBC_ESTIMER\)/.test(liv) && /choisirPoidsLbc\(POIDS_LBC_SAISIR\)/.test(liv),
  "bloc Livraison : « Laisser Leboncoin estimer » / « Saisir le poids »");
ok(/const champPoidsVisible = !avecLbc\.length \|\| saisirLbc;/.test(liv) && /poserPoidsDuLot\(sansPoids, gLot\)/.test(liv), "bloc Livraison : en « Saisir », une valeur pour le lot ; Beebs seul : champ facultatif comme avant");
ok(/aPoids && poserPoids &&/.test(lot) && /lirePoidsSaisi\(ev\.target\.value\)/.test(lot), "carte d'article : le poids se donne là aussi (choix « Saisir »)");
const carte = lire("src/components/PoidsLeboncoin.jsx");
ok(/Laisser Leboncoin estimer/.test(carte) && /Saisir le poids/.test(carte) && /pl\.choisir\?\.\(POIDS_LBC_SAISIR\)/.test(carte) && /\{saisir && \(/.test(carte),
  "« Confirmer » : la carte offre les deux choix, le champ seulement en « Saisir »");
ok(/<CartePoidsLeboncoin m=\{m\} \/>/.test(lire("src/publication/EcranConfirmer.jsx")), "« Confirmer » montre la carte");
ok(R.bilanArticle(moteur(["beebs"]), {}, "fr").pret && R.bilanArticle(moteur(["vinted", "ebay"]), {}, "fr").pret, "Beebs, Vinted, eBay : rien d'exigé (inchangé)");
ok(P.decisionPoidsLbc(job({}, { action: "republish" })).action === "rien" && P.decisionPoidsLbc(job({}, { action: "delete" })).action === "rien",
  "republication et retrait : non concernés");
ok(P.decisionPoidsLbc({ platform: "vinted", action: "publish", platform_fields: {} }).action === "rien", "Vinted : non concerné");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
