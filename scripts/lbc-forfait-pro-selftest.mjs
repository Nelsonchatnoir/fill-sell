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
  MOTIF_LBC_PAYANT, ECLAIREUR_FORFAIT_INTERVALLE_MS, ESPACEMENT_REPRISE_FORFAIT_MS, FENETRE_FORFAIT_MS, MARQUEURS_QUESTION_PASSEE,
  MSG_FORFAIT_LBC_RETENUE, FILTRE_PREUVE_PRO, URL_LEBONCOIN,
  jobProuvePro, compteProuvePro, murVuLe, dernierMurForfait, publicationApresMur, attendForfaitLbc, attentesForfaitLbc,
  candidatRetenueForfait, estEclaireurForfait, partagerCandidatsForfait, eclaireurForfaitLbc, champsRetenueForfait,
  champsEclaireurForfait, champsRepriseForfait, adressageDemande,
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
ok(/import \{ MOTIF_LBC_PAYANT, MARQUEURS_QUESTION_PASSEE \} from "\.\.\/_shared\/lbc-forfait\.js";/.test(ujs), "une seule règle (module partagé)");
ok(/=== MOTIF_LBC_PAYANT/.test(bloc) && /for \(const k of MARQUEURS_QUESTION_PASSEE\) delete pfN\[k\];/.test(bloc) && /pfN\["needs_user_source"\] = "relancer";/.test(bloc),
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
ok(/\.in\("status", \["needs_user", "pending", "processing"\]\)/.test(gBloc) && /\.eq\("platform_fields->last_diagnostic->>quoi", MOTIF_LBC_PAYANT\)/.test(gBloc) && /\.gte\("created_at", new Date\(Date\.now\(\) - FENETRE_FORFAIT_MS\)/.test(gBloc),
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
ok(iH > 0 && /\.in\("status", \["needs_user", "pending", "processing"\]\)/.test(hBloc) && /\.eq\("platform_fields->last_diagnostic->>quoi", MOTIF_LBC_PAYANT\)/.test(hBloc), "lecture par le motif EXACT, 30 j");
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
ok(/champsEclaireurForfait\(eclaireur\.platform_fields, 'geste'/.test(ec) && /\.eq\('status', 'needs_user'\)/.test(ec), "« C'est fait » : UN éclaireur, compare-and-swap");
ok(/attentes\.find\(\(j\) => String\(j\?\.action \?\? 'publish'\) === 'publish'\)/.test(ec), "l'éclaireur de la carte est une PUBLICATION");
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

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ Leboncoin, compte pro au mur du paiement : une carte, un éclaireur, plus rien sur le mur — tout est vert");
process.exit(ko ? 1 : 0);
