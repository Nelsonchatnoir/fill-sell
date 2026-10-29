// Autotest — LEBONCOIN N'OFFRE PLUS QUE « VALIDER ET PAYER » À UN COMPTE PRO (17/10)
// `node scripts/lbc-forfait-pro-selftest.mjs` (npm run selftest:lbc-forfait-pro)
// _shared/lbc-forfait.js, update-job-status (le mur n'hérite d'aucune question),
// get-pending-jobs (plus rien sur le mur), handler-watch (éclaireur, reprise,
// jamais soldé), l'app (une carte par compte, « ✋ Compléter » ferme la question).
// Cas réel : DeadRoz, 14/10 — 26 dépôts au mur, 5 passés intercalés, mêmes
// 10 photos ; 12 murs restés en « champ_a_choisir » d'une question répondue.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MOTIF_LBC_PAYANT, MOTIF_LBC_A_PAYER, MOTIFS_LBC_PAIEMENT, ATTENTE_PAIEMENT_MS, PREUVE_PAIEMENT_UTILISATEUR,
  ECLAIREUR_FORFAIT_INTERVALLE_MS, ESPACEMENT_REPRISE_FORFAIT_MS, FENETRE_FORFAIT_MS, MARQUEURS_QUESTION_PASSEE,
  MSG_FORFAIT_LBC_RETENUE, MSG_FORFAIT_LBC_REPUBLICATION_RETENUE, MSG_LBC_A_PAYER, FILTRE_PREUVE_PRO, URL_LEBONCOIN,
  dernierMotifMur, estAttentePaiement, attentePaiementVivante, attentePaiementCloseSansPaiement, attentesPaiementVivantes,
  partagerCandidatsAPayer, preparationDemandeeApres, prochainePublicationAPreparer, champsPreparerDeNouveau, publicationPayee, motifDiagnostic,
  jobProuvePro, compteProuvePro, murVuLe, dernierMurForfait, publicationApresMur, attendForfaitLbc, attentesForfaitLbc,
  candidatRetenueForfait, estEclaireurForfait, partagerCandidatsForfait, eclaireurForfaitLbc, champsRetenueForfait,
  champsEclaireurForfait, champsRepriseForfait, adressageDemande, typeCompteEstPro, comptesLbcProParType,
} from "../supabase/functions/_shared/lbc-forfait.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const MUR = "Leboncoin ne propose aucune option gratuite pour ce dépôt : son écran « Boostez votre annonce ! » n'affiche que « Valider et payer ». — Observabilité: /deposer-une-annonce/options · titres [\"Boostez votre annonce !\",\"Erreur !\"] · boutons [\"Voir détail\",\"Valider et payer\"]";
const FORM_PRO = "Leboncoin demande « Poids du colis* » pour ton compte — Observabilité: champs vides (4) [\"Vos conditions générales de vente [general_sales_condition]\",\"Référence [custom_ref]\",\"Prix neuf [new_item_price]\",\"Poids du colis* [:form-field-_r_5o_]\"]";
const t = (h) => `2026-10-14T${h}:00.000Z`;
const mur = (id, h, extra = {}, action = "publish") => ({
  id, platform: "leboncoin", status: "needs_user", action, created_at: t("01:45"), error: MUR,
  platform_fields: { needs_user_source: "relancer", last_diagnostic: { quoi: MOTIF_LBC_PAYANT, at: t(h) }, ...extra },
});

console.log("\n1. LE MOTIF EXACT, ET UN COMPTE PROUVÉ PRO");
ok(attendForfaitLbc(mur("a1", "03:16"), true), "Leboncoin + needs_user + last_diagnostic.quoi = lbc_options_payant_seulement + compte pro");
ok(!attendForfaitLbc(mur("a2", "03:16"), false), "un compte NON prouvé pro n'entre jamais (particulier : pack photos, annonce par annonce)");
ok(!attendForfaitLbc({ ...mur("a3", "03:16"), platform: "vinted" }, true) && !attendForfaitLbc({ ...mur("a3", "03:16"), status: "pending" }, true), "autre plateforme, ou pas en attente : non");
ok(!attendForfaitLbc({ ...mur("a4", "03:16"), action: "delete" }, true), "jamais un retrait");
ok(!attendForfaitLbc(mur("a5", "03:16", { republish_step: "deleted" }, "republish"), true) && attendForfaitLbc(mur("a5b", "03:16", { republish_step: "captured" }, "republish"), true),
  "une republication déjà retirée garde son circuit ; pas encore retirée : elle attend");
ok(!attendForfaitLbc(mur("a6", "03:16", { needsUserField: { field_key: "new_item_type" } }), true), "une vraie question (« Type d'article neuf ») garde sa ligne");
ok(!attendForfaitLbc(mur("a7", "03:16", { last_diagnostic: { quoi: "lbc_escrow_identite" } }), true), "le nom et prénom : sa propre carte");
ok(!attendForfaitLbc({ ...mur("a8", "03:16"), platform_fields: { last_diagnostic: "Valider et payer" } }, true), "un texte ne suffit jamais (motif exact seulement)");
ok(jobProuvePro({ platform: "leboncoin", error: FORM_PRO }) && jobProuvePro({ platform: "leboncoin", error: "x", platform_fields: { erreurs_archivees: [{ erreur: FORM_PRO }] } }),
  "preuve pro : un champ du seul formulaire pro, dans l'erreur ou une erreur archivée");
ok(!jobProuvePro({ platform: "leboncoin", error: MUR }) && !jobProuvePro({ platform: "vinted", error: FORM_PRO }) && !compteProuvePro([mur("p", "03:16")]),
  "le mur seul ne prouve rien ; une autre plateforme non plus");
ok(/general_sales_condition/.test(FILTRE_PREUVE_PRO) && /custom_ref/.test(FILTRE_PREUVE_PRO) && /erreurs_archivees/.test(FILTRE_PREUVE_PRO), "le filtre serveur lit la même preuve (erreur et archives)");

console.log("\n2. LE CAS RÉEL (DeadRoz, 14/10) — c'est le compte, pas les photos");
// Photos réellement envoyées, relevées en base : 10 partout, sauf 8afe17aa (7, au mur) ; les 5 passés : 10.
const envoyeesMurs = [10, 10, 10, 10, 10, 7, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
const envoyeesPassees = [10, 10, 10, 10, 10];
ok(envoyeesMurs.length === 26 && envoyeesPassees.length === 5, "26 dépôts au mur, 5 passés, intercalés (05:16 → 22:50)");
ok(envoyeesPassees.includes(10) && envoyeesMurs.includes(10) && Math.min(...envoyeesMurs) < Math.min(...envoyeesPassees),
  "mêmes 10 photos des deux côtés, et un mur à 7 photos : ce n'est pas le pack photos");
const lot = [
  mur("b1b9bb68", "03:16", { needs_user_source: "champ_a_choisir", needsUserBoucle: { "lbcAspects.estimated_parcel_weight": { n: 1 } }, erreurs_archivees: [{ erreur: FORM_PRO }] }),
  mur("9ec3482a", "03:41"), mur("1fdbea03", "20:49"),
  { ...mur("b67c3bfb", "02:28", { needsUserField: { field_key: "new_item_type" } }), error: FORM_PRO, platform_fields: { needs_user_source: "champ_a_choisir", needsUserField: { field_key: "new_item_type" } } },
];
ok(compteProuvePro(lot), "le compte est prouvé pro (formulaire pro relevé sur ses jobs)");
ok(attentesForfaitLbc(lot, true).map((j) => j.id).join(",") === "b1b9bb68,9ec3482a,1fdbea03", "3 murs dans la carte ; la vraie question (b67c3bfb) garde sa ligne");
ok(dernierMurForfait(lot) === Date.parse(t("20:49")), "dernier mur vu = 22:49 Paris (relance du soir)");
const passees = [{ status: "published", published_at: t("03:25") }, { status: "published", published_at: t("04:48") }];
ok(!publicationApresMur(passees, dernierMurForfait(lot)), "les 5 passées de la nuit sont AVANT le dernier mur : le compte reste au mur");
ok(publicationApresMur([...passees, { status: "published", published_at: t("21:00") }], dernierMurForfait(lot)), "une publication passée après le dernier mur lève tout");

console.log("\n3. UPDATE-JOB-STATUS : LE MUR N'HÉRITE D'AUCUNE QUESTION (toutes versions)");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const iBloc = ujs.indexOf("LE MUR « VALIDER ET PAYER » N'HÉRITE JAMAIS D'UNE QUESTION PASSÉE");
const iFilet = ujs.indexOf("PLUS JAMAIS DE needs_user MUET (2026-09-27");
ok(iBloc > 0 && iFilet > iBloc, "le bloc passe AVANT le filet « needs_user sans motif » (qui ne remplit qu'un motif vide)");
const bloc = ujs.slice(iBloc, iFilet);
ok(/import \{ MOTIFS_LBC_PAIEMENT, MARQUEURS_QUESTION_PASSEE \} from "\.\.\/_shared\/lbc-forfait\.js";/.test(ujs), "une seule règle (module partagé)");
ok(/MOTIFS_LBC_PAIEMENT\.includes\(String\(diagMur\?\.\["quoi"\] \?\? ""\)\)/.test(bloc) && /for \(const k of MARQUEURS_QUESTION_PASSEE\) delete pfN\[k\];/.test(bloc) && /pfN\["needs_user_source"\] = "relancer";/.test(bloc),
  "motif EXACT → marqueurs de question retirés, motif « relancer »");
// La règle rejouée sur un mur écrit par la 0.6.110 (cas b1b9bb68).
const pfPoste = { ...lot[0].platform_fields, needsUserField: { field_key: "estimated_parcel_weight" } };
const pfN = { ...pfPoste };
for (const k of MARQUEURS_QUESTION_PASSEE) delete pfN[k];
pfN.needs_user_source = "relancer";
ok(!pfN.needsUserBoucle && !pfN.needsUserField && pfN.needs_user_source === "relancer" && pfN.last_diagnostic.quoi === MOTIF_LBC_PAYANT && pfN.erreurs_archivees?.length === 1,
  "b1b9bb68 rejoué : plus de « champ_a_choisir », la cause et les archives restent");
const bg = lire("chrome-extension/background.js");
const mursExt = bg.match(/const MARQUEURS_QUESTION_PASSEE = Object\.freeze\(\[([\s\S]*?)\]\);/);
ok(mursExt && JSON.stringify(eval(`[${mursExt[1]}]`)) === JSON.stringify([...MARQUEURS_QUESTION_PASSEE]), "les mêmes marqueurs que l'extension 0.6.121 (champsAttenteUtilisateur)");

console.log("\n4. GET-PENDING-JOBS : PLUS RIEN SUR LE MUR");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iG = gpj.indexOf("COMPTE LEBONCOIN PRO AU MUR « VALIDER ET PAYER » : PLUS RIEN SUR CE");
const iPorte = gpj.indexOf("PORTE « FORMULAIRE PRO LEBONCOIN »");
const gBloc = gpj.slice(iG, gpj.indexOf("UNE REPUBLICATION D'ANNONCE EN LIGNE A FORCÉMENT UNE CATÉGORIE", iG));
ok(iG > iPorte && iPorte > 0, "la garde suit la porte pro (poll d'exécution)");
ok(/if \(!includeProcessing && !includeNeedsUser\) \{/.test(gBloc) && /const candidatsForfait = out\.filter\(\(j\) => candidatRetenueForfait\(j as never\)\);\s+if \(candidatsForfait\.length\) \{/.test(gBloc),
  "aucune lecture tant qu'aucun job Leboncoin n'est dans la réponse");
ok(/\.in\("status", \["needs_user", "pending", "processing"\]\)/.test(gBloc) && /\.in\("platform_fields->last_diagnostic->>quoi", \[\.\.\.MOTIFS_LBC_PAIEMENT\]\)/.test(gBloc) && /\.gte\("created_at", new Date\(Date\.now\(\) - FENETRE_FORFAIT_MS\)/.test(gBloc),
  "mur lu par le motif EXACT, 30 j, y compris l'éclaireur remis en file");
ok(/\.eq\("status", "published"\)\s*\.gt\("published_at", new Date\(murForfait\)\.toISOString\(\)\)/.test(gBloc) && /\.or\(FILTRE_PREUVE_PRO\)/.test(gBloc),
  "aucune publication passée depuis le mur, et compte prouvé pro");
ok(/\.update\(\{ status: "needs_user", error: MSG_FORFAIT_LBC_RETENUE, platform_fields: pf \}\)\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gBloc),
  "retenue = needs_user, écriture conditionnelle sur pending, message du compte");
ok(/archiverErreur\(pf\["erreurs_archivees"\]/.test(gBloc), "l'erreur d'avant n'est jamais perdue");
// La règle rejouée : candidats d'un poll.
const pend = (id, action = "publish", pf = {}) => ({ id, platform: "leboncoin", status: "pending", action, platform_fields: pf });
const m0 = Date.parse(t("20:49"));
const cands = [pend("n1"), pend("r1", "republish", { republish_step: "captured" }), pend("r2", "republish", { republish_step: "deleted" }),
  pend("e1", "publish", { forfait_lbc: { eclaireur_le: t("21:30") } }), pend("e2", "publish", { forfait_lbc: { eclaireur_le: t("21:31") } }),
  pend("e0", "publish", { forfait_lbc: { eclaireur_le: t("19:00") } }), pend("rx", "republish", { forfait_lbc: { eclaireur_le: t("21:40") } }),
  { ...pend("v1"), platform: "vinted" }].filter(candidatRetenueForfait);
ok(cands.map((j) => j.id).join(",") === "n1,r1,e1,e2,e0,rx", "candidats : publications et republications pas encore retirées de Leboncoin seulement");
const { servis, retenus } = partagerCandidatsForfait(cands, m0);
ok(servis.map((j) => j.id).join(",") === "e1" && retenus.map((j) => j.id).join(",") === "n1,r1,e2,e0,rx",
  "UN éclaireur à la fois (relancé après le mur) ; jamais une republication ; un éclaireur d'avant le mur est retenu");
ok(!estEclaireurForfait(pend("rx2", "republish", { forfait_lbc: { eclaireur_le: t("23:00") } }), m0), "une republication n'est jamais l'éclaireur");
const pfR = champsRetenueForfait({ needs_user_source: "champ_a_choisir", needsUserBoucle: {}, needsUserField: { field_key: "x" }, processing_since: "x" }, t("21:00"));
ok(pfR.needs_user_source === "relancer" && !pfR.needsUserBoucle && !pfR.needsUserField && !pfR.processing_since && pfR.forfait_lbc.retenue_le === t("21:00")
  && pfR.last_diagnostic.quoi === MOTIF_LBC_PAYANT && pfR.last_diagnostic.retenue_avant_essai === true, "retenue : motif du mur, marque forfait_lbc.retenue_le");
ok(murVuLe({ platform_fields: pfR }) === 0 && dernierMurForfait([{ platform_fields: pfR }, mur("x", "03:16")]) === Date.parse(t("03:16")),
  "une retenue ne compte JAMAIS comme un mur vu");

console.log("\n5. HANDLER-WATCH : L'ÉCLAIREUR, LA REPRISE, JAMAIS SOLDÉ");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/if \(comptesForfaitLbc\.has\(String\(j\.user_id\)\) && attendForfaitLbc\(\{ \.\.\.j, status: "needs_user" \}, true\)\s+&& now - Date\.parse\(String\(j\.created_at \?\? ""\)\) < FENETRE_FORFAIT_MS\) return false;/.test(hw)
   && /if \(compteProuvePro\(l\)\) comptesForfaitLbc\.add\(u\); else aProuver\.push\(u\);/.test(hw),
  "jamais soldé à 72 h tant qu'il a moins de 30 j (compte prouvé pro, preuve lue sur ses attentes puis en base)");
const iH = hw.indexOf("LEBONCOIN N'OFFRE PLUS QUE « VALIDER ET PAYER » À UN COMPTE PRO :\n  //    L'ÉCLAIREUR");
const hBloc = hw.slice(iH, hw.indexOf("[handler-watch] forfait Leboncoin pro:", iH));
ok(iH > 0 && /\.in\("status", \["needs_user", "pending", "processing"\]\)/.test(hBloc) && /\.in\("platform_fields->last_diagnostic->>quoi", \[\.\.\.MOTIFS_LBC_PAIEMENT\]\)/.test(hBloc)
   && /preuve:platform_fields->lbc_depot->>preuve/.test(hBloc), "lecture par les motifs EXACTS (les deux parcours), 30 j, preuve de paiement lue");
ok(/if \(traitesF >= 10\) break;/.test(hBloc) && /now - \(vu as number\) > 24 \* 3_600_000\) continue;/.test(hBloc), "10 comptes par passage, poste vu < 24 h");
ok(/if \(!mur \|\| publicationApresMur\(pubsDuCompte as never\[\], mur\)\)/.test(hBloc) && /champsRepriseForfait\(j\.platform_fields/.test(hBloc) && /\.eq\("id", String\(j\.id\)\)\.eq\("status", "needs_user"\)/.test(hBloc),
  "publication passée après le mur → toutes les attentes repartent (compare-and-swap)");
ok(/eclaireurForfaitLbc\(enAttente as never\[\], true, now, ECLAIREUR_FORFAIT_INTERVALLE_MS, dernierEcl\.get\(u\) \?\? 0\)/.test(hBloc), "sinon UN éclaireur, au plus une fois par intervalle");
// La règle rejouée.
const att = [mur("c1", "03:16"), mur("c2", "03:20", {}, "republish"), mur("c3", "03:24")].map((j, k) => ({ ...j, created_at: t(`0${k + 1}:00`) }));
const t0 = Date.parse(t("23:00"));
ok(eclaireurForfaitLbc(att, true, t0)?.id === "c1", "éclaireur = la plus ancienne PUBLICATION");
ok(eclaireurForfaitLbc([att[1]], true, t0) === null, "que des republications : aucun éclaireur (elles attendent une publication passée)");
ok(eclaireurForfaitLbc(att, true, t0, ECLAIREUR_FORFAIT_INTERVALLE_MS, t0 - 3_600_000) === null && eclaireurForfaitLbc(att, true, t0, ECLAIREUR_FORFAIT_INTERVALLE_MS, t0 - ECLAIREUR_FORFAIT_INTERVALLE_MS - 1)?.id === "c1",
  "jamais deux éclaireurs dans l'intervalle (12 h)");
const pfE = champsEclaireurForfait({ needs_user_source: "relancer", next_action_after: "x", last_diagnostic: { quoi: MOTIF_LBC_PAYANT, at: t("03:16") } }, "geste", t("23:00"));
ok(pfE.forfait_lbc.eclaireur_le === t("23:00") && pfE.forfait_lbc.par === "geste" && pfE.forfait_lbc.n === 1 && !pfE.needs_user_source && !pfE.next_action_after && pfE.last_diagnostic.quoi === MOTIF_LBC_PAYANT,
  "éclaireur marqué ; il garde son mur (le mur ne recule pas)");
ok(estEclaireurForfait({ action: "publish", platform_fields: pfE }, Date.parse(t("03:16"))) && dernierMurForfait([{ status: "pending", platform_fields: pfE }]) === Date.parse(t("03:16")),
  "l'éclaireur remis en file est servi, et son mur compte encore");
const r3 = champsRepriseForfait({ needs_user_source: "relancer" }, 3, t0);
ok(r3.next_action_after === new Date(t0 + 3 * ESPACEMENT_REPRISE_FORFAIT_MS).toISOString() && !r3.needs_user_source && r3.forfait_lbc.par === "publication_passee", "reprise espacée de 45 s par rang");
ok(FENETRE_FORFAIT_MS === 30 * 86_400_000 && ECLAIREUR_FORFAIT_INTERVALLE_MS === 12 * 3_600_000, "30 j, 12 h (comme l'identité)");

console.log("\n6. L'APP : UNE CARTE PAR COMPTE");
const st = lire("src/tabs/StockTab.jsx");
ok(/if \(attendForfaitLbc\(j, compteLbcPro\)\) continue;/.test(st) && /\}, \[activiteParCle, fichesParId, lang, compteLbcPro\]\);/.test(st), "les tâches sortent des lignes par article");
ok(/tousLesJobs\.some\(\(j\) => attendForfaitLbc\(j, true\)\) && compteProuvePro\(tousLesJobs\)/.test(st), "la preuve pro n'est cherchée que s'il y a un mur");
ok(/const nbForfaitLbc = forfaitLbc\.length \? 1 : 0;/.test(st) && /const nbARegler = nbRetraitsBloques \+ nbIdentiteLbc \+ nbAttenteAction \+ nbForfaitLbc \+/.test(st), "« À régler » compte UNE carte, quel que soit le nombre");
ok(/\{ cle: 'lbc_forfait', n: nbForfaitLbc,/.test(st) && /setGesteOuvert\('lbc_forfait'\)/.test(st) && /<EcranForfaitLbc lang=\{lang\} attentes=\{forfaitLbc\} adressage=\{adressageDemande\(forfaitLbc\)\}/.test(st),
  "la ligne ouvre l'écran dédié (avec la « ligne d'adressage » quand un mur la porte)");
ok(/if \(newPf\.needs_user_source === "champ_a_choisir"\) delete newPf\.needs_user_source;/.test(st), "« ✋ Compléter » ferme la question : son motif ne survit pas à la relance");
const ec = lire("src/stock/EcranForfaitLbc.jsx");
ok(/relancer\(eclaireur, \(pf, iso\) => champsEclaireurForfait\(pf, 'geste', iso\)/.test(ec) && /\.eq\('status', 'needs_user'\)/.test(ec), "« C'est fait » : UN éclaireur, compare-and-swap");
ok(/attentes\.find\(\(j\) => String\(j\?\.action \?\? 'publish'\) === 'publish' && motifDiagnostic\(j\) === MOTIF_LBC_PAYANT\)/.test(ec), "l'éclaireur de la carte est une PUBLICATION au mur de l'ancienne extension");
ok(/href=\{URL_LEBONCOIN\}/.test(ec) && URL_LEBONCOIN === "https://www.leboncoin.fr/", "« Ouvrir Leboncoin » (aucune adresse devinée)");
ok(/ligne d’adressage/.test(ec) && adressageDemande([{ error: "titres [\"Mise à jour de ligne d’adressage requise\"]" }]) && !adressageDemande([{ error: MUR }]), "la ligne d'adressage n'est dite que si un mur la porte");
const ep = await import(pathToFileURL(join(ROOT, "src/utils/etatsPublication.js")).href);
const nat = ep.natureAttente(mur("z", "03:16"));
ok(nat.kind === "attente" && nat.motif === "paiement_lbc" && ep.phraseEtat("leboncoin", nat) === "en attente : Leboncoin demande un paiement pour ce dépôt",
  "l'état d'une plateforme : une attente de paiement, jamais « un champ »");
ok(ep.natureAttente({ ...mur("z2", "03:16"), platform_fields: { last_diagnostic: { quoi: MOTIF_LBC_PAYANT }, needsUserField: { field_key: "x", field_label: "Taille" } } }).kind === "attente_champ",
  "une vraie question reste une question");

console.log("\n7. LES TEXTES : NI DURÉE, NI MOT TECHNIQUE, NI ÉMOJI");
const textes = [MSG_FORFAIT_LBC_RETENUE, ...[...ec.matchAll(/'([^'\n]{25,})'|`([^`\n]{25,})`|"([^"\n]{25,})"/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((x) => !/^(\.\.\/|https?:|\s*[{(])/.test(x))];
const DUREE = /\b(dans|d'ici|sous|toutes les|vers) (environ |quelques |\d+ ?)?(min|minutes?|heures?|h\b|secondes?|jours?)\b|\b\d+ ?(min|h|s)\b|\bEnviron\b/i;
const TECH = /lbc_options|needs_user|forfait_lbc|last_diagnostic|platform_fields|retenue_avant_essai/;
ok(textes.length > 5 && textes.every((x) => !DUREE.test(x)), "aucune durée ni heure promise", textes.filter((x) => DUREE.test(x)).join(" | "));
ok(textes.every((x) => !TECH.test(x)), "aucun mot technique dans un texte montré", textes.filter((x) => TECH.test(x)).join(" | "));
ok(!/\p{Extended_Pictographic}/u.test(MSG_FORFAIT_LBC_RETENUE + ec), "aucun émoji");

console.log("\n8. (18/10) FILLSELL PRÉPARE, LA PERSONNE PAIE : « VALIDER ET PAYER » LUI APPARTIENT");
const prete = (id, h, extra = {}, status = "needs_user") => ({
  id, platform: "leboncoin", status, action: "publish", created_at: t("01:45"), error: MSG_LBC_A_PAYER,
  platform_fields: { needs_user_source: "relancer", last_diagnostic: { quoi: MOTIF_LBC_A_PAYER, at: t(h) }, attente_paiement: { depuis: t(h) }, ...extra },
});
ok(MOTIF_LBC_A_PAYER === "lbc_valider_et_payer" && MOTIFS_LBC_PAIEMENT.includes(MOTIF_LBC_PAYANT) && MOTIFS_LBC_PAIEMENT.includes(MOTIF_LBC_A_PAYER)
  && ATTENTE_PAIEMENT_MS === 24 * 3_600_000 && PREUVE_PAIEMENT_UTILISATEUR === "paiement_utilisateur", "motif exact, 24 h, preuve nommée");
ok(attendForfaitLbc(prete("p1", "10:00"), true) && estAttentePaiement(prete("p1", "10:00")) && !estAttentePaiement(mur("m1", "10:00"))
  && !estAttentePaiement(prete("p2", "10:00", {}, "pending")) && !estAttentePaiement({ ...prete("p3", "10:00"), action: "republish" }),
  "un dépôt prêt = Leboncoin + needs_user + publication + motif lbc_valider_et_payer ; il entre dans la carte");
const t10 = Date.parse(t("10:00"));
ok(attentePaiementVivante(prete("p4", "10:00"), t10 + 3_600_000) && !attentePaiementVivante(prete("p5", "10:00"), t10 + ATTENTE_PAIEMENT_MS + 1)
  && !attentePaiementVivante(prete("p6", "10:00", { attente_paiement: { depuis: t("10:00"), onglet_ferme_le: t("10:30") } }), t10 + 3_600_000),
  "vivante moins de 24 h, onglet ouvert ; close après 24 h ou onglet fermé");
ok(attentePaiementCloseSansPaiement(prete("p7", "10:00", { attente_paiement: { depuis: t("10:00"), onglet_ferme_le: t("10:30") } }), t10 + 3_600_000)
  && !attentePaiementCloseSansPaiement(prete("p8", "10:00"), t10 + 3_600_000) && attentesPaiementVivantes([prete("p9", "10:00"), mur("m2", "10:00")], t10 + 60_000).length === 1,
  "close sans paiement : onglet fermé ou 24 h ; les vivantes se listent");
ok(murVuLe(prete("p10", "10:00")) === t10 && dernierMotifMur([mur("m3", "03:16"), prete("p11", "10:00")]) === MOTIF_LBC_A_PAYER
  && dernierMotifMur([mur("m4", "11:00"), prete("p12", "10:00")]) === MOTIF_LBC_PAYANT && dernierMotifMur([]) === null,
  "le dépôt prêt compte comme un mur vu ; le dernier mur dit le parcours");
ok(!publicationApresMur([{ status: "published", published_at: t("12:00"), preuve: PREUVE_PAIEMENT_UTILISATEUR }], t10)
  && !publicationApresMur([{ status: "published", published_at: t("12:00"), platform_fields: { lbc_depot: { preuve: PREUVE_PAIEMENT_UTILISATEUR } } }], t10)
  && publicationApresMur([{ status: "published", published_at: t("12:00") }], t10) && publicationPayee({ preuve: PREUVE_PAIEMENT_UTILISATEUR }),
  "un dépôt payé par la personne ne prouve rien sur le forfait : il ne lève pas le mur");
const candsP = [pend("n1"), pend("n2"), pend("r1", "republish", { republish_step: "captured" }), pend("d1", "publish", { forfait_lbc: { prepare_de_nouveau_le: t("12:00") } })];
let part = partagerCandidatsAPayer(candsP, true, t10);
ok(part.servis.map((j) => j.id).join(",") === "n1" && part.silencieux.map((j) => j.id).join(",") === "n2,d1" && part.retenus.map((j) => j.id).join(",") === "r1",
  "auto : UNE publication servie, les autres en file sans écriture, la republication retenue");
part = partagerCandidatsAPayer(candsP, false, t10);
ok(part.servis.map((j) => j.id).join(",") === "d1" && part.silencieux.map((j) => j.id).join(",") === "n1,n2" && part.retenus.map((j) => j.id).join(",") === "r1",
  "attente en cours : seule la publication « Préparer à nouveau » (demandée après le mur) passe");
ok(partagerCandidatsAPayer([pend("n3")], false, t10).servis.length === 0 && preparationDemandeeApres(candsP[3], t10) && !preparationDemandeeApres(candsP[3], Date.parse(t("13:00"))),
  "rien ne passe pendant une attente vivante ou close sans paiement ; une demande d'avant le mur ne compte pas");
ok(prochainePublicationAPreparer([prete("p13", "10:00"), mur("m5", "03:16"), { ...mur("m6", "03:16"), created_at: t("00:30") }, mur("m7", "03:16", {}, "republish")])?.id === "m6"
  && prochainePublicationAPreparer([prete("p14", "10:00")]) === null,
  "après un paiement : la plus ancienne PUBLICATION retenue ou au mur revient en file, jamais le dépôt prêt ni une republication");
const pfP = champsPreparerDeNouveau({ needs_user_source: "relancer", attente_paiement: { depuis: t("10:00"), onglet_ferme_le: t("10:30") }, next_action_after: "x", forfait_lbc: { n_preparations: 1 } }, t("12:00"));
ok(!pfP.attente_paiement && !pfP.needs_user_source && !pfP.next_action_after && pfP.needsUserAttempts === 0 && pfP.forfait_lbc.prepare_de_nouveau_le === t("12:00") && pfP.forfait_lbc.n_preparations === 2,
  "« Préparer à nouveau » : l'attente tombe, la demande est datée et comptée");
const pfRet = champsRetenueForfait({}, t("12:00"), MOTIF_LBC_A_PAYER);
ok(pfRet.last_diagnostic.quoi === MOTIF_LBC_A_PAYER && pfRet.last_diagnostic.retenue_avant_essai === true && murVuLe({ platform_fields: pfRet }) === 0
  && champsRetenueForfait({}, t("12:00"), "autre").last_diagnostic.quoi === MOTIF_LBC_PAYANT, "republication retenue sous le motif du compte ; jamais un mur vu ; motif inconnu → ancien motif");
ok(eclaireurForfaitLbc([prete("p15", "10:00")], true, Date.parse(t("23:00"))) === null && eclaireurForfaitLbc([prete("p16", "10:00"), mur("m8", "03:16")], true, Date.parse(t("23:00")))?.id === "m8",
  "aucun éclaireur sur un dépôt prêt (nouvelle extension) ; l'ancien mur garde le sien");
// L'extension : le mur d'un compte PRO laisse l'onglet, le particulier garde la règle d'avant.
const lbcJs = lire("chrome-extension/content-scripts/leboncoin.js");
const iMur = lbcJs.indexOf("if (surEcranOptions() && trouverBoutonPayant()) {");
const blocMur = lbcJs.slice(iMur, lbcJs.indexOf("return depotNonFinalise(", iMur));
ok(iMur > 0 && /if \(estComptePro\(job, enumerated\) \|\| \(typeCompte && typeCompte !== "individual"\)\) \{/.test(blocMur) && /attenteMotif: "lbc_valider_et_payer", garderOnglet: true/.test(blocMur)
  && /preuve: "ecran_options_payant_pret"/.test(blocMur) && /error: MSG_LBC_A_PAYER,/.test(blocMur)
  && /attenteMotif: "lbc_options_payant_seulement",/.test(blocMur) && blocMur.indexOf("estComptePro") < blocMur.indexOf("lbc_options_payant_seulement"),
  "extension : compte pro → dépôt préparé, onglet gardé, motif lbc_valider_et_payer ; sinon la règle d'avant");
ok(/j\?\.platform_fields\?\.compte_pro === true\s*\|\| \(Array\.isArray\(champs\) && champs\.some\(\(c\) => \/general_sales_condition\|custom_ref\/\.test\(String\(c\?\.key \?\? ""\)\)\)\)/.test(lbcJs),
  "compte pro : dit par le serveur (compte_pro) ou vu sur le formulaire pro");
const mExt = lbcJs.match(/const MSG_LBC_A_PAYER =\s*((?:"[^"\n]*"\s*\+?\s*)+);/);
ok(mExt && eval(`(${mExt[1]})`) === MSG_LBC_A_PAYER, "le texte du dépôt prêt est le même dans l'extension et la règle partagée");
ok(!/trouverBoutonPayant\(\)\.click|boutonPayant\.click|valider et payer[^\n]*\.click\(/i.test(lbcJs), "FillSell ne clique JAMAIS « Valider et payer »");
ok(/^const MURS_SANS_QUESTION = Object\.freeze\(\["lbc_options_payant_seulement", "lbc_valider_et_payer"\]\);/m.test(bg)
  && /if \(result\?\.garderOnglet === true\) pf\.attente_paiement = \{ depuis: new Date\(\)\.toISOString\(\) \};/.test(bg)
  && /if \(result\.garderOnglet === true\) await rendreOngletALaPersonne\(job, motif\)/.test(bg), "background : le mur n'hérite d'aucune question, l'attente est datée, l'onglet est rendu");
ok(/async function rendreOngletALaPersonne\(job, motif\)/.test(bg) && /await chrome\.storage\.session\.remove\(key\)\.catch/.test(bg) && /chrome\.windows\.getLastFocused\(\{ windowTypes: \["normal"\] \}\)/.test(bg)
  && /chrome\.tabs\.move\(tabId, \{ windowId: cible, index: -1 \}\)/.test(bg) && /drawAttention: true/.test(bg) && !/rendreOngletALaPersonne[\s\S]{0,2500}focused: true/.test(bg.slice(bg.indexOf("async function rendreOngletALaPersonne"))),
  "l'onglet est détaché, déplacé dans la fenêtre de la personne, activé — sans voler le focus");
ok(/chrome\.tabs\.onUpdated\.addListener\(\(tabId, info, tab\) => \{\s*\(async \(\) => \{\s*const att = await lireAttentePaiementLbc\(\);/.test(bg)
  && /leboncoin\\\.fr\\\/deposer-une-annonce\\\/confirmation/.test(bg) && /async function conclureDepotPayeLbc\(att, url\)/.test(bg)
  && /preuve: "paiement_utilisateur"/.test(bg) && /await updateJobStatus\(session\.access_token, att\.jobId, "published", extra\);/.test(bg)
  && /chrome\.tabs\.onRemoved\.addListener\(\(tabId\) => \{\s*\(async \(\) => \{\s*const att = await lireAttentePaiementLbc\(\);/.test(bg) && /onglet_ferme_le: new Date\(\)\.toISOString\(\)/.test(bg),
  "deux écouteurs : confirmation → publié (preuve paiement_utilisateur), onglet fermé → noté");
ok(/if \(actuel !== "needs_user"\) \{ console\.warn\(`\[background\] dépôt payé : le job/.test(bg) && /let lbcPaiementPrepare = false;/.test(bg)
  && /if \(lbcPaiementPrepare && job\.platform === "leboncoin" && String\(job\.action \?\? "publish"\) === "publish"\) \{/.test(bg)
  && /if \(outcome\?\.garderOnglet === true && job\.platform === "leboncoin"\) lbcPaiementPrepare = true;/.test(bg),
  "jamais une écriture sur un job qui n'attend plus ; un seul dépôt préparé par cycle");
// Le serveur : le nouveau parcours dans get-pending-jobs, le compte pro dit à l'extension.
ok(/if \(motifMur === MOTIF_LBC_A_PAYER\) \{/.test(gBloc) && /const autoServir = !attenteVivante && !attenteClose;/.test(gBloc)
  && /partagerCandidatsAPayer\(candidatsForfait as never\[\], autoServir, murForfait\)/.test(gBloc)
  && /error: MSG_FORFAIT_LBC_REPUBLICATION_RETENUE, platform_fields: pf \}\)\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gBloc)
  && /const idsHors = new Set\(\[\.\.\.retenus, \.\.\.silencieux\]\.map/.test(gBloc) && /prochainePublicationAPreparer\(mursLus as never\[\]\)/.test(gBloc)
  && /champsPreparerDeNouveau\(ligne\.platform_fields as Record<string, unknown>, maintenantIso\)/.test(gBloc),
  "get-pending-jobs : une publication à la fois, republications retenues, la suivante remise en file après un paiement");
ok(/platform_fields->lbc_depot->>preuve\.is\.null,platform_fields->lbc_depot->>preuve\.neq\.paiement_utilisateur/.test(gBloc), "une publication payée par la personne ne lève pas le mur (serveur)");
ok(/const pubsLbc = out\.filter\(\(j\) => j\.platform === "leboncoin" && String\(j\.action \?\? "publish"\) === "publish"\);/.test(gpj)
  && /for \(const j of pubsLbc\) j\.platform_fields = \{ \.\.\.\(\(j\.platform_fields as Record<string, unknown>\) \?\? \{\}\), compte_pro: true \};/.test(gpj),
  "compte prouvé pro → platform_fields.compte_pro dans la réponse (jamais écrit)");
// L'app : la carte des deux parcours, l'état d'une plateforme.
ok(/estAttentePaiement\(j\)/.test(ec) && /attentePaiementVivante\(j, maintenant\)/.test(ec) && /champsPreparerDeNouveau/.test(ec)
  && /Préparer à nouveau/.test(ec) && /Préparer la prochaine/.test(ec) && /Valider et payer/.test(ec) && /C[’']est toi qui paies, jamais FillSell/.test(ec),
  "la carte : dépôt prêt (« Valider et payer » dans l'onglet), onglet fermé (« Préparer à nouveau »), suivante, republications");
const natP = ep.natureAttente(prete("p17", "10:00"));
ok(natP.kind === "attente" && natP.motif === "a_payer_lbc" && /Valider et payer/.test(ep.phraseEtat("leboncoin", natP)) && /onglet/.test(ep.phraseEtat("leboncoin", natP)),
  "l'état d'une plateforme : prête, à payer dans l'onglet");
// (29/10 soir, lot A point 8 — paugues.contact) LE TYPE DU COMPTE DIT PAR LEBONCOIN PROUVE LE COMPTE PRO.
{
  ok(typeCompteEstPro("business") && typeCompteEstPro("pro") && !typeCompteEstPro("individual") && !typeCompteEstPro("inconnu") && !typeCompteEstPro(null) && !typeCompteEstPro(""),
    "type du compte : « business » / « pro » = pro ; « individual », inconnu ou vide = non");
  const jPg = { platform: "leboncoin", error: MUR, platform_fields: { lbc_depot: { preuve: "ecran_options_payant_pret", type_compte: "business" } } };
  ok(jobProuvePro(jPg) && !jobProuvePro({ ...jPg, platform_fields: { lbc_depot: { type_compte: "individual" } } }),
    "un mur où l'extension a lu « business » prouve le compte pro ; « individual » non");
  ok(jobProuvePro({ platform: "leboncoin", error: "x", platform_fields: { last_diagnostic: { quoi: MOTIF_LBC_A_PAYER } } }),
    "le circuit pro déjà posé (lbc_valider_et_payer) prouve le compte pro (la carte « forfait » de l'app s'allume)");
  ok(/platform_fields->lbc_depot->>type_compte\.eq\.business/.test(FILTRE_PREUVE_PRO) && /platform_fields->last_diagnostic->>quoi\.eq\.lbc_valider_et_payer/.test(FILTRE_PREUVE_PRO),
    "le filtre serveur lit aussi le type lu au mur et le circuit pro");
  // Les lectures des ventes de paugues.contact (usage_logs releve_ventes, 21/10 → 29/10) : « compte_non_individual_business ».
  const appels = [];
  const faux = { from: (t) => { const q = { t, f: [] }; const c = {
    select: (s) => { q.select = s; return c; }, in: (k, v) => { q.f.push(["in", k, v]); return c; }, eq: (k, v) => { q.f.push(["eq", k, v]); return c; },
    gte: (k, v) => { q.f.push(["gte", k, v]); return c; }, like: (k, v) => { q.f.push(["like", k, v]); return c; },
    limit: async () => { appels.push(q); return { data: [
      { user_id: "pg", motif: "compte_non_individual_business" }, { user_id: "x", motif: "compte_non_individual_inconnu" }, { user_id: "y", motif: "compte_non_individual_individual" },
    ] }; } }; return c; } };
  const pros = await comptesLbcProParType(faux, ["pg", "x", "y"], Date.parse("2026-10-29T16:00:00Z"));
  ok(pros.has("pg") && !pros.has("x") && !pros.has("y") && appels[0]?.t === "usage_logs"
    && appels[0].f.some(([o, k, v]) => o === "eq" && k === "feature" && v === "releve_ventes") && appels[0].f.some(([o, k, v]) => o === "like" && k === "metadata->>motif" && v === "compte_non_individual_%"),
    "comptesLbcProParType : lit usage_logs releve_ventes, garde « business », écarte inconnu / individual");
  ok((await comptesLbcProParType({ from: () => { throw new Error("panne"); } }, ["pg"])).size === 0 && (await comptesLbcProParType(faux, [])).size === 0,
    "une lecture ratée ou aucun compte : rien de prouvé, jamais un point de panne");
  ok(/const lireTypeCompteLbc = async \(\) => \{[\s\S]{0,400}api\.leboncoin\.fr\/api\/account\/v2\/members\/me\/account/.test(lbcJs)
    && /const typeCompte = estComptePro\(job, enumerated\) \? null : await lireTypeCompteLbc\(\);/.test(lbcJs) && /type_compte: typeCompte/.test(lbcJs),
    "extension : au mur, le type du compte est lu chez Leboncoin et noté dans lbc_depot");
  ok((gpj.match(/comptesLbcProParType\(createClient\(/g) ?? []).length === 2, "get-pending-jobs : le type du compte prouve le pro (retenue au mur ET compte_pro servi à l'extension)");
  const hwPro = lire("supabase/functions/handler-watch/index.ts");
  ok((hwPro.match(/await comptesLbcProParType\(supabase, /g) ?? []).length === 2, "handler-watch : le type du compte prouve le pro (carte et éclaireur)");
}
const textes8 = [MSG_LBC_A_PAYER, MSG_FORFAIT_LBC_REPUBLICATION_RETENUE];
ok(textes8.every((x) => !DUREE.test(x) && !TECH.test(x) && !/\p{Extended_Pictographic}/u.test(x)), "textes du 18/10 : ni durée, ni mot technique, ni émoji");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ Leboncoin, compte pro au mur du paiement : une carte, FillSell prépare et la personne paie — tout est vert");
process.exit(ko ? 1 : 0);
