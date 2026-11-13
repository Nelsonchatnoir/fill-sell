// Selftest (31/10 soir, lot J) : pause Leboncoin levée après l'essai et remise sur un refus, bouton « Synchroniser »,
// compte eBay hors d'eBay France, adresse Leboncoin passée en publication.
//   npm run selftest:lot-j-3110
import {
  blocagePose, blocageLeve, blocageAvecEssai, etatBlocageLbc, clesARetirerAuBlocage, lecturesExtensionEnPause, blocageArchive,
  ESSAI_APRES_MS, REPRISE_PRUDENTE_MS,
} from "../supabase/functions/_shared/blocage-leboncoin.js";
import {
  etatBoutonSynchro, prochaineSynchroAuto, texteToutAJour, texteVersHeure, SYNCHRO_A_JOUR_MS, PLANCHER_AUTO_MS, ALARME_AUTO_MS,
  avecDernierReussi, texteAutomatique,
} from "../src/stock/boutonSynchro.js";
import { clotureEbayHorsFrance, ebaySiteHorsFrance } from "../supabase/functions/_shared/ebay-hors-france.js";
import { archiverErreur } from "../supabase/functions/_shared/erreurs-archivees.js";
import {
  repliCommuneDesReglages, decisionRueInconnueLbc, decisionAdresseRepublicationLbc, adresseRefuseeAvantRetrait,
  publicationAvecLaMemeAdresse, messageAdresseChezNous, adresseComparableLbc,
} from "../supabase/functions/_shared/lbc-voie-des-reglages.js";
import { readFileSync } from "node:fs";

let ok = 0, ko = 0;
const t = (cond, nom) => { if (cond) ok++; else { ko++; console.log("  ✗ " + nom); } };
const iso = (ms) => new Date(ms).toISOString();

// ── 1. Leboncoin : la pause se lève après l'essai, se remet sur un refus ──
// platform_settings_fusionner : (avant || patch) - p_supprimer, à l'objet visé — simulé ici.
const fusion = (avant, patch, supprimer = []) => {
  const o = { ...(avant ?? {}), ...patch };
  for (const k of supprimer) delete o[k];
  return o;
};
const T0 = Date.parse("2026-10-30T18:37:09Z");
const b0 = blocagePose({}, { signe: "acces_temporairement_restreint", source: "test", maintenant: iso(T0) });
const bE = blocageAvecEssai(b0, { jobId: "", maintenant: iso(T0 + ESSAI_APRES_MS + 60_000) });
const L = T0 + ESSAI_APRES_MS + 3 * 60_000;
const bL = blocageLeve(bE, { par: "test", maintenant: iso(L) });
t(etatBlocageLbc({ leboncoin: { blocage_acces: bL } }, L + 1000).etat === "libre", "essai passé : libre tout de suite (reprise prudente supprimée, 05/11)");
t(lecturesExtensionEnPause("reprise") === false, "reprise : l'extension relit les ventes (veille des commandes, relevé des ventes)");
t(lecturesExtensionEnPause("bloque") === true && lecturesExtensionEnPause("essai") === true, "pause et essai : lectures coupées");
// Refus APRÈS la levée : avant le correctif, la fusion gardait leve_le → état « reprise », pas de pause.
const R = L + 3600_000;
const ps1 = { leboncoin: { blocage_acces: bL } };
const nouveau = blocagePose(ps1, { signe: "http_403", source: "test", maintenant: iso(R) });
const sansRetrait = fusion(bL, nouveau);
t(etatBlocageLbc({ leboncoin: { blocage_acces: sansRetrait } }, R + 1000).etat !== "bloque", "témoin : sans retrait des clés, la pause ne se remettait pas (défaut du 31/10)");
const cles = clesARetirerAuBlocage(ps1, nouveau);
t(cles.includes("leve_le") && cles.includes("essai") && cles.includes("leve_par"), "les clés de la levée sont retirées");
const apres = fusion(bL, nouveau, cles);
const e2 = etatBlocageLbc({ leboncoin: { blocage_acces: apres } }, R + 1000);
t(e2.etat === "bloque", "refus après la levée : pause remise");
t(apres.essai_apres === iso(R + ESSAI_APRES_MS), "même délai : un essai 24 h après le refus");
t(etatBlocageLbc({ leboncoin: { blocage_acces: apres } }, R + ESSAI_APRES_MS).etat === "essai", "24 h après : un essai");
t(clesARetirerAuBlocage({ leboncoin: { blocage_acces: bE } }, blocagePose({ leboncoin: { blocage_acces: bE } }, { signe: "http_403", source: "t" })).length === 0,
  "blocage actif (essai en cours) : rien n'est retiré, l'essai garde son verdict");
// Reprise finie : rangée.
t(etatBlocageLbc(ps1, L + REPRISE_PRUDENTE_MS + 1).etat === "libre", "6 h après la levée : libre");
const arch = blocageArchive(bL, { maintenant: iso(L + REPRISE_PRUDENTE_MS + 1) });
t(arch.supprimer.includes("blocage_acces") && arch.patch.blocage_acces_dernier?.leve_le === bL.leve_le, "reprise finie : blocage rangé dans blocage_acces_dernier");
const lbcApres = fusion({ blocage_acces: bL, adresse: "x" }, arch.patch, arch.supprimer);
t(!("blocage_acces" in lbcApres) && lbcApres.adresse === "x", "le reste des réglages Leboncoin est intact");
t(etatBlocageLbc({ leboncoin: lbcApres }, L + REPRISE_PRUDENTE_MS + 2).etat === "libre", "clé rangée : libre");
// Le serveur : reprise → rien dit à l'extension ; un poste virtuel ne fait jamais l'essai.
const gpj = readFileSync("supabase/functions/get-pending-jobs/index.ts", "utf8");
t(/if \(lecturesExtensionEnPause\(eb\.etat\)\) \{\s*blocageLbcReponse =/.test(gpj), "get-pending-jobs : blocages.leboncoin seulement en pause ou essai");
t(/eb\.etat === "essai" && !garde && essaiPossible/.test(gpj) && /!releveLbc && eb\.etat === "essai" && essaiPossible/.test(gpj), "get-pending-jobs : pas d'essai sur un poste virtuel");
// (03/11, point 7) L'essai n'est JAMAIS une action : une visite de contrôle (le relevé, posé par le serveur s'il manque).
t(!/eb\.etat === "essai" && lbc\.length/.test(gpj) && !/jobId: garde/.test(gpj) && /declencheur: "controle_blocage_lbc"/.test(gpj), "get-pending-jobs : l'essai est une visite de contrôle, jamais une action");
t(/eb\.etat === "libre" && eb\.blocage\)[\s\S]{0,400}blocageArchive/.test(gpj), "get-pending-jobs : reprise finie → blocage rangé");
for (const f of ["handler-watch", "update-job-status"]) {
  const src = readFileSync(`supabase/functions/${f}/index.ts`, "utf8");
  t(/p_supprimer: clesARetirerAuBlocage\(psB, nouveau\)/.test(src), `${f} : la pause se remet après une levée`);
}

// ── 2. Le bouton « Synchroniser » ──
const N = Date.parse("2026-10-31T21:00:00Z");
const pf = (p, phase, finiMin, extra = {}) => ({ p, nom: p[0].toUpperCase() + p.slice(1), phase, fini: finiMin == null ? null : iso(N - finiMin * 60_000), ...extra });
const tout = etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3), pf("leboncoin", "fait", 4), pf("beebs", "absente", 30, { session: "ko" })], maintenant: N });
t(tout.grise === true, "toutes les plateformes connectées lues il y a moins de 15 min : grisé");
t(tout.lignes.map((l) => l.texte).join(" · ") === "Vinted à jour il y a 3 min · Leboncoin à jour il y a 4 min", "sous le bouton : « Vinted à jour il y a 3 min · Leboncoin à jour il y a 4 min »");
t(!tout.connectees.includes("beebs"), "une plateforme pas connectée ne compte pas");
t(tout.finGriseA === N - 4 * 60_000 + SYNCHRO_A_JOUR_MS, "réouverture à la fin des 15 min de la plus ancienne");
t(etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3), pf("leboncoin", "fait", 16)], maintenant: N }).grise === false, "une plateforme lue il y a 16 min : cliquable");
const connectee = etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3), pf("beebs", "absente", 30, { session: "ok" })], maintenant: N });
t(connectee.grise === false && connectee.lignes.some((l) => /Beebs vient d’être connecté/.test(l.texte)), "une plateforme qui vient d'être connectée : cliquable, dit");
t(etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3), pf("leboncoin", "echec", 5)], maintenant: N }).grise === false, "un relevé raté : cliquable");
t(etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3), pf("leboncoin", "incomplet", 5)], maintenant: N }).grise === false, "un relevé incomplet : cliquable");
t(etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3)], maintenant: N, enCours: true }).grise === false, "en cours : la règle d'en cours (pas « tout est à jour »)");
t(etatBoutonSynchro({ plateformes: [pf("vinted", "fait", 3)], maintenant: N, stockVideAvecAnnonces: true }).grise === false, "stock remis à zéro, annonces trouvées : jamais grisé (règle du 26/10)");
t(etatBoutonSynchro({ plateformes: [pf("ebay", "jamais", null, { api: true })], maintenant: N }).grise === false, "eBay relié par l'API, jamais lu : cliquable");
// La prochaine synchro automatique.
const runs = [
  { platform: "vinted", kind: "dressing", declencheur: "bouton", status: "done", started_at: iso(N - 4 * 60_000), finished_at: iso(N - 3 * 60_000) },
  { platform: "vinted", kind: "dressing", declencheur: "cron", status: "done", started_at: "2026-10-30T13:10:00Z", finished_at: "2026-10-30T13:11:00Z" },
  { platform: "leboncoin", kind: "annonces", declencheur: "app", status: "done", started_at: iso(N - 5 * 60_000), finished_at: iso(N - 4 * 60_000) },
];
const p1 = prochaineSynchroAuto(runs, { connectees: ["vinted", "leboncoin"], maintenant: N });
// Vinted : plancher = 20:57Z + 20 h = 01/11 16:57Z ; phase 13:10Z → 01/11 13:10Z < plancher → 02/11 13:10Z.
// Leboncoin : aucun relevé automatique connu → plancher 01/11 16:56Z. La plus proche : Leboncoin.
t(p1 === N - 4 * 60_000 + PLANCHER_AUTO_MS, "la plus proche des plateformes connectées (plancher de 20 h sans relevé automatique connu)");
const p2 = prochaineSynchroAuto(runs, { connectees: ["vinted"], maintenant: N });
t(p2 === Date.parse("2026-10-30T13:10:00Z") + 3 * ALARME_AUTO_MS, "Vinted : l'heure de l'alarme quotidienne, premier tir après le plancher");
t(prochaineSynchroAuto([{ platform: "ebay", kind: "annonces", declencheur: "serveur:quotidien_api", status: "done", started_at: iso(N - 9 * 60_000), finished_at: iso(N - 8 * 60_000) }],
  { connectees: ["ebay"], ebayApi: true, maintenant: N }) === N - 8 * 60_000 + PLANCHER_AUTO_MS + 10 * 60_000, "eBay API : 20 h après le dernier relevé, au tour suivant");
t(texteVersHeure(Date.parse("2026-11-01T15:40:00Z"), N) === "vers 17 h demain", "heure de Paris, arrondie, « demain »");
t(texteVersHeure(Date.parse("2026-10-31T21:40:00Z"), N) === "vers 23 h", "heure de Paris le jour même");
t(texteToutAJour(Date.parse("2026-10-31T21:40:00Z"), N) === "Tout est à jour, prochaine synchro automatique vers 23 h", "la phrase du bouton grisé");
t(texteToutAJour(null, N) === "Tout est à jour", "sans heure connue : la phrase sans heure");
const bloc = readFileSync("src/stock/BlocSynchro.jsx", "utf8");
t(/const ctaInactif = enCours \|\| occupe \|\| !extVue \|\| grise;/.test(bloc), "BlocSynchro : le bouton grisé ne relance rien");
t(/demarrerRelecture\(lire, \{ intervalleMs: 60_000/.test(bloc) && !/setInterval/.test(bloc), "BlocSynchro : relecture bornée, jamais de setInterval");

// ── 2 bis. (01/11) Le dernier relevé RÉUSSI, quel que soit son déclencheur ; la carte sobre ──
// Compte de Nico, 01/11 00:08 : Vinted « 29/10 » (bouton) alors que le cron a réussi le 30/10 à 20:05 ; eBay « 29/10 »
// alors que l'API a relevé le 31/10 à 10:10.
const vinted = avecDernierReussi({ phase: "fait", fini: "2026-10-29T18:00:00Z", tentative: "2026-10-29T18:00:00Z" }, "2026-10-30T19:05:00Z");
t(vinted.phase === "fait" && vinted.fini === Date.parse("2026-10-30T19:05:00Z"), "Vinted : le relevé automatique du 30/10 compte");
const ebay = avecDernierReussi({ phase: "fait", fini: "2026-10-29T18:00:00Z", tentative: "2026-10-29T18:00:00Z" }, "2026-10-31T09:10:00Z");
t(ebay.fini === Date.parse("2026-10-31T09:10:00Z"), "eBay : le relevé par l'API du 31/10 compte");
t(avecDernierReussi({ phase: "echec", fini: null, tentative: "2026-10-31T10:00:00Z" }, "2026-10-31T11:00:00Z").phase === "fait", "un relevé réussi APRÈS un échec demandé : à jour");
const echecRecent = avecDernierReussi({ phase: "echec", fini: null, tentative: "2026-10-31T12:00:00Z" }, "2026-10-31T11:00:00Z");
t(echecRecent.phase === "echec" && echecRecent.fini === Date.parse("2026-10-31T11:00:00Z"), "un échec demandé plus récent reste un échec, avec la date du dernier réussi");
t(avecDernierReussi({ phase: "absente", tentative: "2026-10-31T10:00:00Z" }, "2026-10-31T10:30:00Z").phase === "fait", "pas connecté puis relevé réussi : connecté, à jour");
t(avecDernierReussi({ phase: "en_cours", fini: null }, "2026-10-31T10:30:00Z").phase === "en_cours", "en cours : inchangé");
t(avecDernierReussi({ phase: "jamais" }, null).phase === "jamais", "aucun relevé réussi : inchangé");
const cron = etatBoutonSynchro({ plateformes: [
  { p: "vinted", nom: "Vinted", ...avecDernierReussi({ phase: "fait", fini: iso(N - 3 * 86_400_000), tentative: iso(N - 3 * 86_400_000) }, iso(N - 5 * 60_000)) },
  { p: "ebay", nom: "eBay", api: true, ...avecDernierReussi({ phase: "fait", fini: iso(N - 3 * 86_400_000), tentative: iso(N - 3 * 86_400_000) }, iso(N - 6 * 60_000)) },
], maintenant: N });
t(cron.grise === true && cron.lignes[0].texte === "Vinted à jour il y a 5 min", "grisage et détail comptent le relevé automatique");
t(texteAutomatique() === "La synchro et la surveillance des ventes sont automatiques.", "la phrase courte");
const bloc2 = readFileSync("src/stock/BlocSynchro.jsx", "utf8");
t(bloc2.includes("{detailOuvert && etatBouton.lignes.length > 0 && (") && bloc2.includes("aria-expanded={detailOuvert}"), "le détail par plateforme est replié, il s'ouvre en touchant la carte");
t(bloc2.includes("grise ? texteToutAJour(prochaineAuto, Date.now(), fr) : texteAutomatique(fr)"), "une seule phrase sous le bouton");
t(bloc2.includes("avecDernierReussi({ phase: t.e.phase, fini, tentative }, r.reussis?.[t.p])") && bloc2.includes("r.reussis?.[p]"), "« Synchronisé il y a… », détail et grisage : le dernier relevé réussi");
const sp = readFileSync("src/utils/syncPlateformes.js", "utf8");
const corpsReussis = sp.slice(sp.indexOf("export async function lireDerniersReussis"), sp.indexOf("export async function lireDerniersReussis") + 900);
t(corpsReussis.includes(".eq('status', 'done')") && !corpsReussis.includes("FILTRE_SANS_VEILLE"), "tous déclencheurs, relevés réussis seulement");

// ── 3. eBay hors d'eBay France ──
const jobRosa = {
  id: "4fb536fb", status: "needs_user", error: "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre…",
  platform_fields: {
    needs_user_source: "ebay_compte_a_finir", ebay_a_finir: { etape: "vendeur", url: "https://www.ebay.fr/sh/ovw" },
    error_technique: { at: "2026-10-31T19:06:22Z", brut: "The page keeping the extension port is moved into back/forward cache, so the message channel is closed." },
  },
};
const cl = clotureEbayHorsFrance(jobRosa, { par: "test", site: "US", compte: "reginat8117", archiver: archiverErreur });
t(cl.status === "cancelled" && cl.error === "FillSell publie seulement sur eBay France : ton compte eBay « reginat8117 » est sur eBay États-Unis. Rien n'a été publié.", "la vraie raison, avec le compte et le pays");
t(!cl.platform_fields.needs_user_source && !cl.platform_fields.ebay_a_finir && !cl.platform_fields.error_technique, "ni « compte à finir » ni message technique");
t((cl.platform_fields.erreurs_archivees ?? []).some((e) => /back\/forward cache/.test(e.erreur)) && (cl.platform_fields.erreurs_archivees ?? []).some((e) => /pas encore vendre/.test(e.erreur)), "le brut et l'ancien message archivés, jamais perdus");
t(cl.platform_fields.hors_quota === true, "hors quota");
t(ebaySiteHorsFrance("France").horsFrance === false, "eBay France ne bouge pas");
const worker = readFileSync("supabase/functions/ebay-api-worker/index.ts", "utf8");
// (13/11, décision de Nico — D9 « AUCUNE tâche close ») Plus de clôture : la tâche d'un compte étranger passe EN ATTENTE
// de son site (jamais « à finir », jamais close) ; verrou scripts/ebay-site-attente-selftest.mjs.
t(/if \(s\?\.site && siteEbayEnAttente\(s\.site, \{ ouvertes \}\)\) \{[\s\S]{0,300}ecritureAttenteSiteEbay/.test(worker), "voie extension → api : un compte étranger attend son site (13/11 : jamais clos), jamais « à finir »");
t(/mettreEnAttenteEbayHorsFrance\(admin, ouvertes\)/.test(worker) && /\.in\("status", \["needs_user", "pending"\]\)/.test(worker), "filet : les attentes d'un compte étranger passent en attente de leur site (jamais processing, jamais closes)");
const app = readFileSync("src/App.jsx", "utf8");
t(/addEventListener\('visibilitychange',auRetour\)/.test(app) && /select\('ebay_voie_api'\)/.test(app), "app : l'état eBay relu au retour dans l'app");

// ── 4. Leboncoin : adresse refusée en republication seulement ──
const reglages = { adresse: "2 rue arsene soulages 12110 viviez", rue: "2 rue arsene soulages", code_postal: "12110", ville: "viviez" };
const warnPub = [{ code: "adresse_barreau3_repli_commune", message: "adresse: Leboncoin ne connaît pas « 2 rue arsene soulages 12110 viviez » — annonce localisée à la commune (« 12110 viviez » → suggestion « Viviez (12110) »)" }];
t(repliCommuneDesReglages(warnPub, reglages)?.commune === "12110 viviez", "une publication passée par la commune prouve la rue inconnue de Leboncoin");
t(repliCommuneDesReglages(warnPub, { ...reglages, adresse: "5 rue du port 12110 viviez" }) === null, "une autre adresse des Réglages : rien de prouvé");
t(adresseComparableLbc("12110 viviez") === adresseComparableLbc("Viviez 12110") && adresseComparableLbc("3bis rue") === adresseComparableLbc("3 bis rue"), "adresses comparées sans ordre ni casse");
const loServie = { code_postal: "12110", libelle: "Viviez 12110", ville: "Viviez", voie: "2 rue arsene soulages",
  voie_des_reglages: { motif: "rue des Réglages, même commune (Leboncoin exige une rue en mode précis)", pose_par: "get-pending-jobs (lbc-voie-des-reglages)" } };
const jobDoriane = { id: "2734ec09", platform: "leboncoin", action: "republish", platform_fields: { localisation_origine: loServie } };
const d1 = decisionRueInconnueLbc(jobDoriane, reglages, true);
t(d1.action === "commune" && !d1.job.platform_fields.localisation_origine.voie && !d1.job.platform_fields.localisation_origine.voie_des_reglages
  && d1.job.platform_fields.localisation_origine.voie_des_reglages_retiree?.rue === "2 rue arsene soulages", "rue servie retirée : la republication tape la commune, comme la publication");
t(decisionRueInconnueLbc(jobDoriane, reglages, false).action === "tel_quel", "sans preuve : rien ne change");
t(decisionRueInconnueLbc({ ...jobDoriane, platform_fields: { localisation_origine: { ...loServie, voie_des_reglages: undefined } } }, reglages, true).action === "tel_quel",
  "une rue lue sur l'annonce d'origine n'est jamais touchée");
const loCommune = { code_postal: "12110", libelle: "Viviez 12110", ville: "Viviez" };
const jobCommune = { ...jobDoriane, platform_fields: { localisation_origine: loCommune } };
t(decisionAdresseRepublicationLbc(jobCommune, reglages, false).action === "rue", "témoin : sans preuve, la rue des Réglages est servie (règle du 01/10)");
t(decisionAdresseRepublicationLbc(jobCommune, reglages, false, { rueInconnue: true }).action === "tel_quel", "rue inconnue de Leboncoin : la commune");
t(decisionAdresseRepublicationLbc({ ...jobDoriane, platform_fields: { localisation_origine: { ...loCommune, voie_des_reglages_retiree: { rue: "x" } } } }, reglages, false).action === "tel_quel",
  "une rue déjà retirée n'est jamais remise");
const msgExt = "Republication Leboncoin mise en pause AVANT tout retrait : Leboncoin ne propose aucune adresse pour « 2 rue arsene soulages 12110 Viviez ». Ton annonce est TOUJOURS en ligne, rien n'a été touché. Vérifie l'« Adresse de remise Leboncoin » dans tes Réglages (numéro, rue, code postal, ville), puis relance la republication.";
t(adresseRefuseeAvantRetrait(msgExt) === "2 rue arsene soulages 12110 Viviez", "l'adresse refusée lue dans le message de l'extension");
const pubs = [{ id: "b80ce26b", adresse: "2 rue arsene soulages 12110 viviez", warnings: warnPub }];
// (02/11, labrunettedu44) Leboncoin a refusé cette RUE (repli sur la commune) : il ne l'a pas « acceptée ». Elle suit
// désormais l'échelle des écritures puis la commune prouvée (prochaineAdresseLbc, selftest lbc-rue-introuvable-0211).
t(publicationAvecLaMemeAdresse("2 rue arsene soulages 12110 Viviez", pubs) === null, "la rue refusée (repli) n'est jamais « une adresse acceptée »");
t(publicationAvecLaMemeAdresse("Viviez 12110", pubs)?.id === "b80ce26b", "la commune où la publication s'est posée compte aussi");
t(publicationAvecLaMemeAdresse("8 rue haute 75001 Paris", pubs) === null, "une autre adresse : le message de l'extension reste");
t(!/R[ée]glages/.test(messageAdresseChezNous()) && /chez nous/.test(messageAdresseChezNous()) && /nouvel essai automatique/.test(messageAdresseChezNous()), "jamais « tes Réglages » : c'est chez nous");
t(/Relancer/.test(messageAdresseChezNous(true)), "reprises épuisées : « Relancer »");
const ujs = readFileSync("supabase/functions/update-job-status/index.ts", "utf8");
t(/if \(pfAdresseChezNous\) patch\.platform_fields = pfAdresseChezNous;/.test(ujs) && /statutEffectif = "pending";[\s\S]{0,80}\}/.test(ujs), "update-job-status : reprise « chez nous », jamais needs_user « Réglages »");
t(/decisionRueInconnueLbc\(j, reglagesLbc, rueInconnue\)/.test(gpj) && /\{ rueInconnue \}/.test(gpj), "get-pending-jobs : la commune servie quand la rue est inconnue");

console.log(`lot-j-3110 : ${ok} ok, ${ko} ko`);
if (ko) process.exit(1);
