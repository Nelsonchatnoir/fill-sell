// Autotest — remise en ligne Vinted : jamais un essai de plus sans relire le dressing —
// `npm run selftest:recreation-vinted-verifiee`
// (supabase/functions/_shared/recreation-vinted-verifiee.js, recreation-vinted-envois.js,
//  get-pending-jobs, update-job-status, migration 20261018170000).
// Heures RELEVÉES le 18/10 chez Régis (juchsregis, boutique 31995881), en UTC :
//   short Levi's f33d2e5d — retrait Vinted 13:11:38 (en-tête Date), daté 13:18:45 par la base ;
//   copies nées de nos envois : 13:11:49, 13:19:42, 13:32:58, 13:39:39, 13:51:37, 14:01:41, 14:07:40.
import { readFileSync } from "node:fs";
import {
  decisionVerificationRecreation, recreationAVerifier, copiesProbables, releveQualifiant, titreNorm, retraitLe, envoisDe,
  ATTENTE_RELEVE_MIN, MESSAGE_ATTENTE, MESSAGE_DEPOT_INCERTAIN, depotIncertainApresEnvoi, messageQuestionDepotIncertain,
} from "../supabase/functions/_shared/recreation-vinted-verifiee.js";
import { heureVintedDuRetrait, fusionnerEnvois, memesEnvois } from "../supabase/functions/_shared/recreation-vinted-envois.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const T = (h) => Date.parse(`2026-10-18T${h}Z`);

const pfLevis = {
  republish_step: "deleted", vinted_item_id: "7125590020", vinted_account_id: "31995881",
  suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-10-18T13:11:38.000Z" },
  deleted_at: "2026-10-18T13:18:45.791Z", deleted_at_serveur: "2026-10-18T13:18:45.791Z", deleted_at_client: "2026-10-18T13:11:38.000Z",
  recreation_tentee: { n: 2, at: "2026-10-18T13:18:45.900Z" },
  republish_snapshot: { titre: "Short jean Levi's levi Strauss 24x32 525 8501" },
};
const job = (pf, extra = {}) => ({ id: "f33d2e5d", platform: "vinted", action: "republish", status: "pending", inventaire_id: 1792328734917018,
  title: "Short jean Levi's levi Strauss 24x32 525 8501", platform_fields: pf, ...extra });

console.log("Heure Vinted du retrait, envois");
ok(heureVintedDuRetrait(pfLevis, T("14:00:00")) === T("13:11:38"), "l'en-tête Date de Vinted (13:11:38) fait foi");
ok(heureVintedDuRetrait({ suppression_verdict: { date_serveur: "2026-10-18T15:00:00Z" } }, T("14:00:00")) === null, "une date dans le futur n'est pas lue");
ok(heureVintedDuRetrait({}, T("14:00:00")) === null, "sans verdict : rien");
const env1 = fusionnerEnvois({ recreation_envois: ["2026-10-18T13:11:38.000Z"] }, pfLevis, T("14:00:00"));
ok(env1.length === 2 && env1[0] === "2026-10-18T13:11:38.000Z" && env1[1] === "2026-10-18T13:18:45.900Z", "les envois s'accumulent (base + écriture), à la seconde, triés", JSON.stringify(env1));
const env2 = fusionnerEnvois({ recreation_envois: env1 }, { ...pfLevis, recreation_tentee: { at: "2026-10-18T13:31:57Z" } }, T("14:00:00"));
ok(env2.length === 3 && env2[2] === "2026-10-18T13:31:57.000Z", "une nouvelle tentative s'ajoute sans perdre les précédentes");
ok(memesEnvois(env2, [...env2]) && !memesEnvois(env1, env2), "comparaison des envois");
ok(retraitLe(pfLevis) === T("13:11:38"), "le retrait le plus tôt (horloge Vinted) sert de seuil, pas 13:18:45");
ok(envoisDe(pfLevis).includes(T("13:11:38")), "le retrait compte comme un envoi (la une-passe soumet dans la foulée)");

console.log("Garde avant tout nouvel essai");
ok(recreationAVerifier(job(pfLevis))?.essai === T("13:18:45.900"), "une republication retirée avec un essai est à vérifier");
ok(recreationAVerifier(job({ ...pfLevis, republish_step: "captured" })) === null, "étape captured : rien");
ok(recreationAVerifier(job(pfLevis, { platform: "leboncoin" })) === null, "Leboncoin : son propre circuit");
ok(recreationAVerifier(job({ ...pfLevis, recreation_tentee: undefined, recreation_envois: undefined })) === null, "aucun essai : servie comme avant");

const d1 = decisionVerificationRecreation(job(pfLevis), { releves: [], fiches: [], maintenant: T("13:25:00") });
ok(d1?.action === "retenir" && d1.error === MESSAGE_ATTENTE, "moins de 12 min après l'essai : retenue, message vrai");
const d2 = decisionVerificationRecreation(job(pfLevis), { releves: [], fiches: [], maintenant: T("13:31:00") });
ok(d2?.action === "retenir", "12 min passées sans relevé de la personne : toujours retenue (aucun relevé automatique demandé)");
ok(d2.platform_fields.recreation_attente_releve?.depuis, "l'attente est datée");
ok(decisionVerificationRecreation(job(pfLevis), { releves: [], fiches: [], maintenant: T("13:31:00"), pageUneAveugle: false }) === null,
  "compte sans mur de brouillons (ou extension 0.6.128) : servie comme avant");

const releveTot = { id: "r1", kind: "dressing", status: "done", declencheur: "bouton", started_at: "2026-10-18T13:25:00Z", items_vus: 104, total_entries: 104 };
const releveIncomplet = { id: "r2", kind: "dressing", status: "done", declencheur: "bouton", started_at: "2026-10-18T13:40:00Z", items_vus: 96, total_entries: 104 };
const releveBon = { id: "r3", kind: "dressing", status: "done", declencheur: "bouton_distant", started_at: "2026-10-18T13:40:00Z", items_vus: 104, total_entries: 104 };
const releveAuto = { id: "r4", kind: "dressing", status: "done", declencheur: "serveur:verif_redepot", started_at: "2026-10-18T13:40:00Z", items_vus: 104, total_entries: 104 };
ok(releveQualifiant([releveTot], T("13:18:45.900")) === null, "un relevé commencé trop tôt après l'essai ne compte pas");
ok(releveQualifiant([releveIncomplet], T("13:18:45.900")) === null, "un relevé incomplet (96/104) ne compte pas");
ok(releveQualifiant([releveBon], T("13:18:45.900"))?.id === "r3", "un relevé complet de la personne, commencé ≥ 12 min après, compte");
ok(releveQualifiant([releveAuto], T("13:18:45.900")) === null, "un relevé AUTOMATIQUE ne compte jamais (il n'importe aucun article neuf — Régis 18:56)");

const d3 = decisionVerificationRecreation(job(pfLevis), { releves: [releveBon], fiches: [], maintenant: T("13:45:00") });
ok(d3?.action === "servir" && d3.platform_fields.recreation_verifiee?.releve === "r3", "relevé complet sans copie : essai suivant autorisé, tracé");
ok(recreationAVerifier(job(d3.platform_fields)) === null, "une fois vérifiée, la même tentative n'est plus retenue");
ok(recreationAVerifier(job({ ...d3.platform_fields, recreation_tentee: { at: "2026-10-18T13:50:00Z", n: 3 } })) !== null,
  "un nouvel essai rouvre la vérification (jamais deux essais sans relecture)");

console.log("Copie déjà au stock (importée pendant un essai)");
const ficheCopie = { id: 777, vinted_item_id: "10427636564", titre: "Short jean Levi's levi Strauss 24x32 525 8501", listed_at_guess: "2026-10-18T13:19:42Z", vinted_account_id: "31995881" };
const ficheAutreTitre = { ...ficheCopie, id: 778, vinted_item_id: "1", titre: "Short Levi's 501" };
const ficheAutreBoutique = { ...ficheCopie, id: 779, vinted_item_id: "2", vinted_account_id: "999" };
const ficheHorsFenetre = { ...ficheCopie, id: 780, vinted_item_id: "3", listed_at_guess: "2026-10-18T17:00:00Z" };
const ficheAvantRetrait = { ...ficheCopie, id: 781, vinted_item_id: "4", listed_at_guess: "2026-10-18T13:05:00Z" };
const ficheOrigine = { ...ficheCopie, id: 1792328734917018, vinted_item_id: "7125590020" };
const copies = copiesProbables(job(pfLevis), [ficheCopie, ficheAutreTitre, ficheAutreBoutique, ficheHorsFenetre, ficheAvantRetrait, ficheOrigine]);
ok(copies.length === 1 && copies[0].vinted_item_id === "10427636564", "seule la copie née de nos envois (titre + boutique + heure) est retenue",
  JSON.stringify(copies.map((c) => c.vinted_item_id)));
const d4 = decisionVerificationRecreation(job(pfLevis), { releves: [releveBon], fiches: [ficheCopie], maintenant: T("13:45:00") });
ok(d4?.action === "question" && /10427636564/.test(d4.error) && /Rien n'a été recréé/.test(d4.error), "copie probable : la question, jamais un essai de plus");

console.log("Six heures sans relevé");
const d5 = decisionVerificationRecreation(job({ ...pfLevis, recreation_attente_releve: { depuis: "2026-10-18T07:00:00Z" } }),
  { releves: [], fiches: [], maintenant: T("13:45:00") });
ok(d5?.action === "question" && /à l'aveugle/.test(d5.error), "au-delà de 6 h sans relevé : la question honnête");

// ── (25/10) Vincent A., job 9138772c : retrait 18:52:54, envoi 18:53:11 (Paris), onglet renvoyé sur
// /member, copie « Champavert, le lycanthropePar Pétrus Borel » non reconnue → depot_incertain ; resservi
// 15 min plus tard (compte sans mur de brouillons, extension 0.6.131), second envoi à 19:46:01 → deux annonces.
console.log("(25/10) Dépôt d'issue inconnue : jamais un second envoi sans preuve d'absence (Vincent A., 9138772c)");
const V = (h) => Date.parse(`2026-10-24T${h}Z`);
const TITRE_NL = "Champavert, le lycanthrope\nPar Pétrus Borel";
const pfChamp = {
  republish_step: "deleted", vinted_item_id: "3532781567", vinted_account_id: "21011125",
  suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-10-24T16:52:54.000Z" },
  deleted_at: "2026-10-24T16:52:54.000Z", deleted_at_serveur: "2026-10-24T16:52:54.000Z", deleted_at_client: "2026-10-24T16:52:59.341Z",
  recreation_envois: ["2026-10-24T16:52:54.000Z", "2026-10-24T16:53:11.557Z"],
  depot_parti_vers_profil: { at: "2026-10-24T16:53:12.100Z", url: "https://www.vinted.fr/member/21011125" },
  depot_incertain: { at: "2026-10-24T16:53:20.000Z", motif: "redirection_profil_sans_copie_lue" },
  republish_snapshot: { titre: TITRE_NL },
};
const jobV = (pf, extra = {}) => ({ id: "9138772c", platform: "vinted", action: "republish", status: "pending",
  inventaire_id: 1792328734917999, title: TITRE_NL, platform_fields: pf, ...extra });
const copieChamp = { id: 1792842213155002, vinted_item_id: "10514173498", titre: "Champavert, le lycanthropePar Pétrus Borel",
  listed_at_guess: "2026-10-24T16:53:11Z", vinted_account_id: "21011125" };
const releveGeste = (h) => ({ id: "rv", kind: "dressing", status: "done", declencheur: "bouton", started_at: `2026-10-24T${h}Z`, items_vus: 312, total_entries: 312 });
const releveAutoV = { ...releveGeste("17:30:00"), id: "ra", declencheur: "serveur:quotidien" };
ok(depotIncertainApresEnvoi(pfChamp, V("16:53:11.557"))?.motif === "redirection_profil_sans_copie_lue", "le dépôt incertain suit le dernier envoi");
const v1 = decisionVerificationRecreation(jobV(pfChamp), { releves: [], fiches: [], maintenant: V("17:08:30"), pageUneAveugle: false });
ok(v1?.action === "retenir" && v1.error === MESSAGE_DEPOT_INCERTAIN && v1.platform_fields.recreation_attente_releve?.motif === "depot_incertain",
  "15 min après, compte SANS mur de brouillons (0.6.131) : RETENUE — c'est là que partait le second envoi", JSON.stringify(v1));
ok(/vérifie que ta nouvelle annonce est bien en ligne avant tout nouvel envoi/.test(MESSAGE_DEPOT_INCERTAIN) && !/relance/i.test(MESSAGE_DEPOT_INCERTAIN), "message vrai, sans geste demandé");
const v2 = decisionVerificationRecreation(jobV(v1.platform_fields), { releves: [releveAutoV], fiches: [], maintenant: V("19:46:00"), pageUneAveugle: false });
ok(v2?.action === "retenir", "à 20:46 Paris, relevé AUTOMATIQUE seulement : toujours retenue (il n'importe aucune annonce neuve)");
const v3 = decisionVerificationRecreation(jobV(v1.platform_fields), { releves: [releveGeste("17:20:00")], fiches: [copieChamp], maintenant: V("17:40:00"), pageUneAveugle: false });
ok(v3?.action === "question" && /10514173498/.test(v3.error), "relevé de la personne qui importe la copie « …lycanthropePar… » : reconnue (memeTitre), la question — rien de redéposé");
const v4 = decisionVerificationRecreation(jobV(v1.platform_fields), { releves: [releveGeste("17:20:00")], fiches: [], maintenant: V("17:40:00"), pageUneAveugle: false });
ok(v4?.action === "servir" && v4.platform_fields.recreation_verifiee?.apres === "depot_incertain", "relevé COMPLET de la personne, ≥ 12 min après l'envoi, sans copie : preuve d'absence, l'essai suivant part (une fois)");
ok(decisionVerificationRecreation(jobV(v1.platform_fields), { releves: [{ ...releveGeste("17:20:00"), items_vus: 200 }], fiches: [], maintenant: V("17:40:00"), pageUneAveugle: false })?.action === "retenir",
  "relevé incomplet : pas une preuve");
const v5 = decisionVerificationRecreation(jobV({ ...v1.platform_fields, recreation_attente_releve: { depuis: "2026-10-24T17:08:30.000Z", essai: "2026-10-24T16:53:11.557Z", motif: "depot_incertain" } }),
  { releves: [], fiches: [], maintenant: V("23:10:00"), pageUneAveugle: false });
ok(v5?.action === "question" && v5.platform_fields.needs_user_source === "recreation_deja_partie" && /le 24\/10 18:53/.test(v5.error) && /affiché ton profil/.test(v5.error),
  "6 h sans preuve : la question recreation_deja_partie, heure de l'envoi à Paris, motif vrai", v5?.error);
ok(/Ton annonce a été envoyée à Vinted le 24\/10 18:53/.test(messageQuestionDepotIncertain(V("16:53:11.557"))), "heure de Paris (UTC+2 le 24/10)");
ok(!/affiché ton profil/.test(messageQuestionDepotIncertain(V("16:53:11.557"), "autre")), "autre motif : on ne parle pas du profil");
ok(decisionVerificationRecreation(jobV({ ...pfChamp, depot_incertain: { at: "2026-10-24T16:40:00Z", motif: "redirection_profil_sans_copie_lue" } }),
  { releves: [], fiches: [], maintenant: V("17:08:30"), pageUneAveugle: false }) === null, "un dépôt incertain d'un envoi PRÉCÉDENT ne retient pas : servie comme avant");
ok(depotIncertainApresEnvoi({ ...pfChamp, depot_incertain: { at: "2026-10-24T16:51:30Z" } }, V("16:53:11.557")) !== null, "horloge du poste en retard de 2 min : toujours vu");
ok(decisionVerificationRecreation(jobV({ ...pfChamp, derniere_relance_manuelle: "2026-10-24T23:30:00Z" }), { releves: [], fiches: [], maintenant: V("23:31:00"), pageUneAveugle: false }) === null,
  "la personne a relancé APRÈS le dépôt incertain : elle a tranché, servie comme avant (l'extension relit le dressing avant tout dépôt)");
ok(recreationAVerifier(jobV(pfChamp, { status: "published" })) === null, "copie rattachée (le job quitte 'deleted') : plus rien à retenir");
ok(titreNorm(TITRE_NL) !== titreNorm(copieChamp.titre) && copiesProbables(jobV(pfChamp), [copieChamp]).length === 1,
  "la normalisation seule ne reconnaissait pas la copie ; memeTitre, si");
ok(copiesProbables(jobV({ ...pfChamp, titre_saisi: "Champavert lycanthrope (Borel)" }), [{ ...copieChamp, titre: "Champavert lycanthrope (Borel)" }]).length === 1,
  "la copie tapée avec le titre de la recréation (titre_saisi) est reconnue aussi");

console.log("Normalisation du titre (identique à la base)");
ok(titreNorm("Short jean Levi’s  levi-Strauss 24x32") === titreNorm("short jean levi s levi strauss 24x32"), "ponctuation et casse ignorées");
ok(titreNorm("France bloc feuillet n° 10 BF10 NEUF++") === "france bloc feuillet n 10 bf10 neuf", "symboles retirés");

console.log("Branchements (ancres)");
const ujs = readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const mig = readFileSync(new URL("../supabase/migrations/20261018170000_recreation_vinted_rattachee_au_releve.sql", import.meta.url), "utf8");
ok(/if \(pfW\.deleted_at_serveur !== serveurDeja\) \{\s*pfW\.deleted_at_serveur = serveurDeja;\s*touche = true;/.test(ujs),
  "update-job-status : les repères du retrait ne sont plus effacés (touche marqué)");
ok(/heureVintedDuRetrait\(pfW\) \?\? heureVintedDuRetrait\(pfH\)/.test(ujs) && /pfW\.recreation_envois = envois;/.test(ujs),
  "update-job-status : heure Vinted d'abord, envois accumulés");
const blocGpj = gpj.slice(gpj.indexOf("REMISE EN LIGNE VINTED : JAMAIS UN ESSAI DE PLUS"), gpj.indexOf("JAMAIS UN DEUXIÈME DÉPÔT BEEBS"));
ok(blocGpj.length > 0 && blocGpj.includes("recreationAVerifier(j)") && blocGpj.includes("pageUneAveugle = (nBrouillons ?? 0) >= BROUILLONS_PAGE_UNE")
  && blocGpj.includes('versionAuMoins(version, "0.6.128")') && !blocGpj.includes("vinted_sync_runs\").insert"),
  "get-pending-jobs : garde branchée (mur de brouillons, extension < 0.6.128), aucun relevé automatique demandé");
ok(/create trigger inventaire_a_rattache_recreation_vinted\s+before insert on public\.inventaire/i.test(mig)
  && "inventaire_a_rattache_recreation_vinted" < "inventaire_ecarte_import_sync", "migration : le rattachement tire AVANT l'écart des imports automatiques");

if (ko) { console.error(`\n${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\nTous les contrôles passent.");
