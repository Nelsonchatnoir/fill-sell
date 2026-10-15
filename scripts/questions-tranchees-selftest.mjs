// Autotest : PLUS AUCUN « GESTE À FAIRE » QUE L'APP PEUT TRANCHER SEULE (15/10 soir, Nico).
//
//     npm run selftest:questions-tranchees
//
// Cas Louis (Amiral) : boutique_a_choisir ×2, État ×1, la file (bouton « Voir »,
// estimations de temps) ; cas PAUGUES : poids Leboncoin d'un compte PRO.
// Ce qu'il prouve, sans réseau ni base :
//   A. BOUTIQUE : article lié → sa boutique ; sinon choix de la file, défaut
//      des Réglages, boutique ouverte ; jamais une boutique hors du compte ;
//      plus aucune question « boutique_a_choisir » ;
//   B. ÉTAT : l'annonce capturée, puis la fiche, puis les autres plateformes,
//      traduites dans la grille demandée ; jamais un niveau deviné ;
//   C. LA FILE : aucune heure ni durée promise ; une attente automatique est une
//      pause, jamais un geste ; le bouton mène à l'action en une étape ;
//   D. POIDS LEBONCOIN : un compte qui l'exige le donne AVANT l'envoi, au lot
//      comme à l'unité ; le serveur ne sert jamais une publication sans lui ;
//      un lot de 11 articles (cas PAUGUES) : chaque job Leboncoin porte son
//      poids après le geste du lot ; jamais une tranche apprise « sans format ».
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

// ── A. Boutique ─────────────────────────────────────────────────────────────
console.log("A. Boutique Vinted d'une publication");
const B = await charger("supabase/functions/_shared/boutique-publication-vinted.js");
const louis = [{ user_id: "247512093", login: "neyenonie" }, { user_id: "371531", login: "evat" }];
ok(B.boutiquePublicationVinted({ boutiqueArticle: "247512093", boutiqueSession: "371531", boutiques: louis }).boutique === "247512093", "(1) article lié : SA boutique, quelle que soit celle ouverte");
ok(B.boutiquePublicationVinted({ boutiqueDefaut: "247512093", boutiqueSession: "371531", boutiques: louis }).source === "defaut", "(2) sans boutique d'article : la boutique par défaut des Réglages");
const s3 = B.boutiquePublicationVinted({ boutiqueSession: "371531", boutiques: louis });
ok(s3.boutique === "371531" && s3.source === "session", "(3) sans réglage : la boutique ouverte dans le navigateur (@evat)");
ok(B.boutiquePublicationVinted({ boutiqueChoisie: "@neyenonie", boutiqueDefaut: "371531", boutiqueSession: "371531", boutiques: louis }).boutique === "247512093", "le changement fait dans la file passe avant le défaut");
ok(B.boutiquePublicationVinted({ boutiqueSession: "999", boutiques: louis }).motif === "boutique_non_confirmee", "GARDE-FOU : une boutique ouverte hors du compte → rien ne part");
ok(B.boutiquePublicationVinted({ boutiqueDefaut: "999", boutiqueSession: "371531", boutiques: louis }).source === "session", "un défaut qui n'est plus sur le compte est ignoré");
ok(B.boutiquePublicationVinted({ boutiques: louis }).motif === "session_inconnue", "aucune boutique lisible → la publication attend (sans question)");
ok(B.boutiquePublicationVinted({ boutiqueSession: "371531", boutiques: [louis[1]] }).motif === "mono", "compte à une boutique : rien ne change");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(!/needs_user_source: "boutique_a_choisir"/.test(gpj), "get-pending-jobs ne pose plus jamais « boutique_a_choisir »");
ok(/boutiquePublicationVinted\(\{/.test(gpj) && /vinted_boutique_auto/.test(gpj), "get-pending-jobs pose la boutique retenue sur le job (l'extension la relit avant le dépôt)");
const qt = lire("supabase/functions/_shared/questions-tranchees.ts");
ok(/"boutique_a_choisir"/.test(qt) && /status: "pending"/.test(qt), "handler-watch fait repartir les questions « boutique_a_choisir » existantes");
ok(/<BoutiqueVintedParDefaut c=\{c\} \/>/.test(lire("src/reglages/SousPagePlateformes.jsx")), "Réglages › Mes plateformes : la boutique par défaut");
ok(/ChoixBoutiqueFile/.test(lire("src/components/FileDesJobs.jsx")), "la file dit sur quelle boutique ça part et permet de la changer");

// ── B. État ─────────────────────────────────────────────────────────────────
console.log("B. État traduit d'une grille à l'autre");
const E = await charger("supabase/functions/_shared/etat-correspondance.js");
const grilleElec = ["État neuf", "Très bon état", "Bon état", "État satisfaisant - fonctionnel", "Pour pièces"];
const r1 = E.etatDepuisSources([{ source: "annonce", valeur: "État satisfaisant" }, { source: "fiche", valeur: "État satisfaisant" }], grilleElec);
ok(r1?.valeur === "État satisfaisant - fonctionnel" && r1.source === "annonce", "Targus (Louis) : « État satisfaisant » de l'annonce → « État satisfaisant - fonctionnel »");
ok(E.etatDepuisSources([{ source: "annonce", valeur: null }, { source: "fiche", valeur: "Très bon état" }], grilleElec)?.source === "fiche", "sans annonce lisible : la fiche");
ok(E.etatDepuisSources([{ source: "autre_plateforme", valeur: "Used - Good" }], grilleElec)?.valeur === "Bon état", "Depop « Used - Good » → « Bon état »");
const grilleMode = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
ok(E.etatDepuisSources([{ source: "fiche", valeur: "État neuf" }], grilleMode) === null, "« État neuf » face à « avec / sans étiquette » : jamais deviné");
ok(E.etatDepuisSources([{ source: "fiche", valeur: "Neuf avec étiquette" }], grilleElec)?.valeur === "État neuf", "« Neuf avec étiquette » → « État neuf » quand la grille ne les sépare pas");
ok(E.etatDepuisSources([{ source: "fiche", valeur: "Satisfaisant" }], ["Neuf", "Très bon état", "Bon état", "Pour pièces"]) === null, "un niveau absent de la grille → la question reste");
ok(E.estQuestionEtat({ field_key: "condition", field_label: "État" }) && !E.estQuestionEtat({ field_key: "brand", field_label: "Marque" }), "seules les questions d'ÉTAT sont tranchées ainsi");
ok(/etat_tranche_par_fillsell\?\.valeur === r\.valeur/.test(qt), "jamais deux fois la même réponse (la question redevient vraie)");

// ── C. La file ──────────────────────────────────────────────────────────────
console.log("C. La file");
const F = await charger("src/utils/fileDesJobs.js");
const maintenant = Date.parse("2026-10-15T15:00:00Z");
const dans = (min) => new Date(maintenant + min * 60000).toISOString();
const ctx = { maintenant, lang: "fr" };
const hl = F.situationJob({ status: "processing", action: "republish", platform: "leboncoin", platform_fields: { republish_step: "deleted", deleted_at: dans(-3), next_action_after: dans(4) } }, ctx);
ok(!/\d{1,2}:\d{2}|vers /.test(hl.raison), `remise en ligne : sans heure (« ${hl.raison} »)`);
const es = F.situationJob({ status: "pending", action: "publish", platform: "vinted", platform_fields: { next_action_after: dans(15) } }, ctx);
ok(!/\d{1,2}:\d{2}/.test(es.raison), `nouvel essai : sans heure (« ${es.raison} »)`);
const cr = F.situationJob({ status: "pending", action: "republish", platform: "vinted", platform_fields: { republish_source: "auto" } }, { ...ctx, creneaux: { vinted: { dans_creneau: false, reprise: dans(120) } } });
ok(!/\d{1,2}:\d{2}/.test(cr.raison) && cr.groupe === "pause", `créneau : l'état, pas l'heure (« ${cr.raison} »)`);
ok(F.sansEstimation("Ton annonce est intacte. Reprise automatique dans ~6 min (tentative 2/5).") === "Ton annonce est intacte.", "un texte du serveur perd sa durée promise");
ok(F.sansEstimation("Rien n'a été publié.") === "Rien n'a été publié.", "un texte sans durée reste tel quel");
const intro = F.situationJob({ status: "needs_user", action: "republish", platform: "vinted", platform_fields: { needs_user_source: "introuvable_a_confirmer", republish_step: "a_capturer" } }, ctx);
ok(intro.groupe === "pause", "« plus en ligne » à confirmer par un relevé : une pause, pas un geste");
const tech = F.situationJob({ status: "needs_user", action: "republish", platform: "leboncoin", error: "Republication en pause AVANT tout retrait : l'état de ton annonce Leboncoin n'a pas pu être vérifié (Leboncoin a bloqué notre lecture par une protection anti-robot).", platform_fields: { needs_user_source: "relancer", republish_step: "a_capturer" } }, ctx);
ok(tech.groupe === "pause", "pause technique avant tout retrait (anti-robot) : une pause, pas un geste");
const vrai = F.situationJob({ status: "needs_user", action: "publish", platform: "leboncoin", error: "Leboncoin demande ton nom et ton prénom", platform_fields: { needs_user_source: "relancer" } }, ctx);
ok(vrai.groupe === "geste", "une vraie question (compte à finir) reste un geste");
const barres = lire("src/utils/barresJobs.js");
ok(!/remiseVers/.test(barres) && /sansEstimation\(ctx\.texteErreur/.test(barres), "les barres : plus de « remise en ligne vers… », textes nettoyés");
const stock = lire("src/tabs/StockTab.jsx");
ok(!/estimationRepub\(/.test(stock) && !/Recréation prévue vers/.test(stock), "Stock : plus de « ~15-21 min » ni de « recréation prévue vers »");
const i1 = stock.indexOf("if(needsUserOuvrable(job))return <button type=\"button\" style={style} onClick={()=>{fermer();setNeedsUserJob(job);}}>{fr?'Répondre':'Answer'}</button>;");
const i2 = stock.indexOf("{fr?'Compléter':'Complete'}</button>;", i1);
ok(i1 > 0 && i2 > i1, "« Ta file » : une question s'ouvre DIRECTEMENT (Répondre), avant tout écran de suivi");
ok(/onRepondre=\{\(j\)=>\{setRepubProgress\(null\);setNeedsUserJob\(j\);\}\}/.test(stock), "l'écran d'une republication propose « Répondre » (plus de renvoi en boucle vers la file)");

// ── D. Poids Leboncoin ──────────────────────────────────────────────────────
console.log("D. Poids Leboncoin d'un compte qui l'exige");
const C = await charger("src/utils/choixPoidsLeboncoin.js");
ok(C.choixPoidsDesReglages({ leboncoin: { poids_exige: { depuis: "x" } } }) === "saisir", "compte qui exige le poids : « Saisir le poids », sans alternative");
ok(C.choixPoidsDesReglages({ leboncoin: {} }) === "estimer", "particulier : « Laisser Leboncoin estimer » reste le défaut (zéro régression)");
const R = await charger("src/publication/lot/regles.js");
const P = await charger("supabase/functions/_shared/poids-leboncoin.js");
// Un lot de 11 articles Leboncoin (cas PAUGUES) : un seul porte un poids sur sa fiche.
const lot = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, price: 20, plateformesPubliables: ["leboncoin"], nbQuestions: 0,
  initialListing: { poids_g: i === 0 ? 3000 : null }, edited: { leboncoin: { platform_fields: {} } }, poidsLbcChoix: "saisir" }));
const decisions = {};
const aCompleter = () => lot.filter((m) => R.bilanArticle(m, { texteValide: true, ...(decisions[m.id] ?? {}) }).motifs.some((x) => x.cle === "poids"));
ok(aCompleter().length === 10, "AVANT l'envoi : les 10 articles sans poids sont « à compléter » (aucun ne part sans)");
// Le geste du lot : un poids pour les 10 sans poids (LivraisonDuLot → poserPoidsDuLot → appliquerLivraison).
for (const m of lot) if (R.poidsConnu(m, decisions[m.id]) == null) decisions[m.id] = { poids: R.lirePoidsSaisi("1,2 kg") };
ok(aCompleter().length === 0, "après « Appliquer aux 10 sans poids » : plus rien à compléter");
const jobs = lot.map((m) => ({ platform: "leboncoin", action: "publish", platform_fields: { ...m.edited.leboncoin.platform_fields, lbcPoidsGrammes: R.poidsConnu(m, decisions[m.id]) } }));
ok(jobs.every((j) => Number(j.platform_fields.lbcPoidsGrammes) > 0), "CHAQUE job Leboncoin du lot porte son poids (3000 g pour celui de la fiche, 1200 g pour les autres)");
ok(jobs[0].platform_fields.lbcPoidsGrammes === 3000, "un poids déjà sur la fiche n'est jamais écrasé par celui du lot");
ok(jobs.every((j) => !P.poidsManquantCompteExige(j, { poids_exige: { depuis: "x" } })), "le serveur les sert tous");
ok(P.poidsManquantCompteExige({ platform: "leboncoin", action: "publish", platform_fields: {} }, { poids_exige: { depuis: "x" } }), "sans poids, chez un compte qui l'exige : jamais servi (question avant tout dépôt)");
ok(!P.poidsManquantCompteExige({ platform: "leboncoin", action: "publish", platform_fields: {} }, {}), "particulier sans poids : servi, Leboncoin estime (inchangé)");
ok(!P.poidsManquantCompteExige({ platform: "leboncoin", action: "republish", platform_fields: {} }, { poids_exige: {} }), "republication : inchangée");
ok(/poidsManquantCompteExige\(j, reglagesL\.leboncoin/.test(gpj), "get-pending-jobs applique le filet");
ok(/t !== "\(absent\)" && !memoire\.poids\.has\(t\)/.test(gpj), "jamais une tranche apprise « sans format » servie à un autre article");
const lv = lire("src/publication/lot/LivraisonDuLot.jsx");
ok(/poidsExigeLbc \|\| choixPoidsValide/.test(lv) && /Leboncoin exige le poids du colis sur ton compte/.test(lv), "écran du lot : le poids demandé d'office, la raison dite");
ok(/poidsExigeLbc=\{poidsLbc\.exige\}/.test(lire("src/publication/lot/LotPublication.jsx")), "le lot transmet l'exigence du compte");
ok(/\["lbcPoidsGrammes", "estimated_parcel_weight"\]\.includes\(f\?\.field_key\)/.test(stock), "le geste « un poids pour tout le lot » règle aussi la question en tranche (PRO)");
ok(/in\("status", \["needs_user", "pending"\]\)/.test(stock) && /poidsAutres\[a\.id\]/.test(stock), "… pour les annonces du lot en question ET en file, modifiable article par article");
ok(/poids_exige/.test(qt) && /platform_settings_fusionner/.test(qt), "handler-watch note le compte sur preuve (« Poids du colis* » exigé)");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
