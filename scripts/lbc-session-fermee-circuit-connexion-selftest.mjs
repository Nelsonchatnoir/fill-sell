// Autotest — pause Leboncoin : une session fermée passe par le circuit CONNEXION, une preuve lève la pause, la synchro
// de la personne est la visite (07/11 soir, Goulvenk — tout le parc) —
// `npm run selftest:lbc-session-fermee-circuit-connexion`
// (_shared/blocage-leboncoin.js, _shared/attente-session.js, get-pending-jobs, handler-watch, update-job-status, extension).
//
// Le cas (données de prod lues le 07/11) : session Leboncoin fermée dans son Chrome vers le 06/11 00:25 (relevé des ventes
// « compte_absent_de_la_page »), veille des commandes en 403 à 01:33 avec le jeton périmé → pause « restriction » ;
// 9 visites de contrôle (06/11 15:39 → 07/11 17:38), toutes « session leboncoin : page de connexion » ; ses tâches
// affichaient « En pause : nouvel essai automatique, rien à faire » ; sa synchro de 18:10 restait « queued » (retirée de
// chaque réponse par la pause) ; compte revu connecté par l'extension à 19:11:27 ; la visite suivante n'est partie qu'à
// 19:39:59 (2 h après la précédente) et a lu 17/17 annonces.
import fs from "node:fs";
import {
  signeBlocageLbc, signeBlocageHorsConnexionLbc, murConnexionLbc, verdictVisiteControleLbc, etatBlocageLbc,
  blocageSessionFermee, contrePreuvePauseLbc, sessionLbcRevueLe, ESSAI_SUR_PREUVE_MIN_MS, blocageEssaiRefuse, messageBlocageLbc,
} from "../supabase/functions/_shared/blocage-leboncoin.js";
import {
  attenteSessionServeur, attentePoseeParLaPauseLbc, attentePoseeParLeServeur, ATTENTE_SESSION_POSE_PAR_PAUSE_LBC,
} from "../supabase/functions/_shared/attente-session.js";
import { etatJob } from "../supabase/functions/_shared/etat-job.js";
import { situationJob } from "../src/utils/fileDesJobs.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const T = (iso) => Date.parse(iso);

// Le blocage RÉEL de Goulvenk (platform_settings.leboncoin.blocage_acces, lu le 07/11 à 19:25).
const B_GOULVENK = {
  essai: { le: "2026-11-07T16:37:58.732Z", issue: "refuse", fin_le: "2026-11-07T16:39:58.791Z", controle: true, releve_id: "5e7a7a8e-fd94-42c8-a0cc-d365c0482eb0" },
  signe: "session_fermee", depuis: "2026-11-06T00:33:39.749288+00:00",
  detail: "{\"http\":403,\"build\":\"2026-11-05T20:38:34Z+1354a1d\",\"motif\":\"http_403\",\"platform\":\"leboncoin\",\"evenement\":\"coupure\"}",
  essais: 8, source: "extension (veille_commandes)", preuves: 1, essai_apres: "2026-11-07T18:39:58.791Z",
  derniere_preuve: "2026-11-07T16:39:58.791Z", essai_demande_le: "2026-11-07T16:36:22.700Z",
};
const PS = { leboncoin: { blocage_acces: B_GOULVENK } };
// Son extension_sessions RÉEL (extrait) : « connecté » écrit par le compte vu sur la page à 19:11:27 (Paris).
const SESSIONS_GOULVENK = { leboncoin: true, http: { leboncoin: "compte_vu_sur_la_page" },
  checked_at_par_plateforme: { leboncoin: "2026-11-07T18:11:27.426Z", vinted: "2026-11-07T18:13:57.939Z" } };
const VISITE_REELLE = "[incomplet] session leboncoin : page de connexion · [rattachement] par identifiant 0, automatiques 0, proposées 0, sans candidat 0, importées 0, disparues 0";

console.log("\n1. UNE SESSION FERMÉE N'EST JAMAIS UNE RESTRICTION (règle 1)");
ok(signeBlocageHorsConnexionLbc("[incomplet] session leboncoin : page de connexion · relances : essai 1 : http_403") === null
  && signeBlocageLbc("[incomplet] session leboncoin : page de connexion · relances : essai 1 : http_403") === "http_403",
  "page de connexion + 403 du jeton périmé → aucun signe (avant : http_403, pause « restriction »)");
ok(signeBlocageHorsConnexionLbc("Connexion Leboncoin requise : connecte-toi. HTTP 403") === null, "tâche au mur de connexion + 403 → aucun signe");
ok(signeBlocageHorsConnexionLbc("session leboncoin : page de connexion · CHALLENGE DATADOME") === "datadome"
  && signeBlocageHorsConnexionLbc("page de connexion · « Accès temporairement restreint »") === "acces_temporairement_restreint",
  "un signe vu SUR LA PAGE (anti-robot, accès restreint) reste un signe");
ok(signeBlocageHorsConnexionLbc("http_403") === "http_403" && signeBlocageHorsConnexionLbc("Leboncoin a répondu HTTP 403") === "http_403",
  "un 403 sans mur de connexion reste une restriction (veille, tâche)");
ok(murConnexionLbc(VISITE_REELLE) && murConnexionLbc("En attente de ta connexion à Leboncoin dans Chrome") && !murConnexionLbc("Prix manquant"),
  "le mur de connexion se lit sur NOS textes");
const vReel = verdictVisiteControleLbc("absente", VISITE_REELLE);
ok(vReel.verdict === "refuse" && vReel.signe === "session_fermee", "visite réelle de Goulvenk (17:38) → refusée, session fermée", JSON.stringify(vReel));
const v403 = verdictVisiteControleLbc("absente", VISITE_REELLE + " · [adresse] essai 1 : http_403");
ok(v403.verdict === "refuse" && v403.signe === "session_fermee", "visite à la page de connexion + 403 de l'adresse → session fermée (avant : http_403)", JSON.stringify(v403));
ok(verdictVisiteControleLbc("done", "[défilement] [adresse] 1 page(s), 17 en ligne lues sur 17 annoncées").verdict === "passe",
  "visite lue en entier (19:40, 17/17) → passée");

console.log("\n2. LA SESSION FERMÉE PASSE PAR LE CIRCUIT CONNEXION (règle 2)");
ok(blocageSessionFermee(B_GOULVENK) && !blocageSessionFermee({ ...B_GOULVENK, signe: "http_403" }) && !blocageSessionFermee({ ...B_GOULVENK, leve_le: "x" }),
  "la pause de Goulvenk tient sur une session fermée (signe de sa dernière visite)");
const jobLego = { id: "53665705", platform: "leboncoin", action: "publish", status: "pending",
  error: messageBlocageLbc("Chrome", B_GOULVENK.depuis, "session_fermee"), platform_fields: { attente_blocage_lbc: { depuis: B_GOULVENK.depuis } } };
const avant = situationJob(jobLego, { maintenant: T("2026-11-07T18:30:00Z") });
ok(avant.motif === "essai" && /rien à faire/.test(avant.raison), "AVANT : « Editions 43019 Football » disait « En pause : nouvel essai automatique, rien à faire »", avant.raison);
const att = attenteSessionServeur(jobLego, { observeeLe: B_GOULVENK.derniere_preuve, navigateur: "Chrome", posePar: ATTENTE_SESSION_POSE_PAR_PAUSE_LBC,
  motif: "pause Leboncoin : la visite de contrôle a vu la page de connexion (session fermée)", maintenantIso: "2026-11-07T18:30:00Z" });
const apresJob = { ...jobLego, error: att.error, platform_fields: att.platform_fields };
const apres = situationJob(apresJob, { maintenant: T("2026-11-07T18:30:00Z") });
ok(/^En attente de ta connexion à Leboncoin dans Chrome/.test(att.error) && etatJob(apresJob).etat === "a_toi" && etatJob(apresJob).motif === "connexion",
  "APRÈS : « En attente de ta connexion à Leboncoin… » → À toi de jouer, motif connexion", att.error);
ok(apres.raison === "À toi de jouer : connecte-toi à Leboncoin sur ton ordinateur", "l'app dit « À toi de jouer : connecte-toi à Leboncoin sur ton ordinateur »", apres.raison);
ok(attentePoseeParLaPauseLbc(att.platform_fields) && !attentePoseeParLeServeur(att.platform_fields),
  "marqueur propre à la pause : handler-watch ne l'efface pas sur une simple sonde (seule la levée le retire)");
ok(attenteSessionServeur(apresJob, { posePar: ATTENTE_SESSION_POSE_PAR_PAUSE_LBC }) === null, "une tâche déjà marquée n'est jamais réécrite");
ok(attenteSessionServeur({ platform: "leboncoin", action: "publish", platform_fields: {} }).platform_fields.attente_session.pose_par === "get-pending-jobs (session connue morte)",
  "sans posePar : le circuit « session connue morte » à l'identique");

console.log("\n3. UNE PAUSE NE DURE JAMAIS CONTRE UNE PREUVE (règle 3)");
ok(sessionLbcRevueLe(SESSIONS_GOULVENK) === "2026-11-07T18:11:27.426Z" && sessionLbcRevueLe({ leboncoin: false }) === null && sessionLbcRevueLe(null) === null,
  "« connecté » de l'extension : l'heure écrite, sinon rien");
const sans = etatBlocageLbc(PS, T("2026-11-07T18:12:00Z"));
ok(sans.etat === "bloque", "AVANT : compte revu connecté à 19:11:27, la pause attendait 19:39:59 (2 h après la visite de 17:37)");
const revue = etatBlocageLbc(PS, T("2026-11-07T18:12:00Z"), { sessionRevueLe: sessionLbcRevueLe(SESSIONS_GOULVENK) });
ok(revue.etat === "essai" && revue.par === "session_revue", "APRÈS : la visite part au passage de 19:12 (Paris)", JSON.stringify(revue));
const tot = etatBlocageLbc({ leboncoin: { blocage_acces: { ...B_GOULVENK, essai: { ...B_GOULVENK.essai, le: "2026-11-07T18:00:00Z" }, derniere_preuve: "2026-11-07T18:02:00Z" } } },
  T("2026-11-07T18:12:00Z"), { sessionRevueLe: "2026-11-07T18:11:27Z" });
ok(tot.etat === "bloque" && ESSAI_SUR_PREUVE_MIN_MS === 30 * 60_000, "jamais de rafale : une visite sur preuve 30 min au moins après la précédente");
const vieux = etatBlocageLbc(PS, T("2026-11-07T18:12:00Z"), { sessionRevueLe: "2026-11-07T16:30:00Z" });
ok(vieux.etat === "bloque", "un « connecté » d'AVANT la dernière visite refusée ne prouve rien");
const restr = etatBlocageLbc({ leboncoin: { blocage_acces: { ...B_GOULVENK, signe: "datadome" } } }, T("2026-11-07T18:12:00Z"), { sessionRevueLe: "2026-11-07T18:11:27Z" });
ok(restr.etat === "bloque", "une RESTRICTION (anti-robot) n'est pas levée par un « connecté » : rien à voir avec la session");
ok(contrePreuvePauseLbc(B_GOULVENK, { releveReussiLe: "2026-11-07T18:40:52Z" })?.par === "relevé Leboncoin lu en entier après la pause",
  "relevé lu en entier après la dernière preuve → levée");
ok(contrePreuvePauseLbc(B_GOULVENK, { depotReussiLe: "2026-11-07T18:45:00Z" })?.par === "dépôt Leboncoin réussi après la pause", "dépôt réussi après → levée");
ok(contrePreuvePauseLbc(B_GOULVENK, { releveReussiLe: "2026-11-05T17:45:33Z", depotReussiLe: "2026-11-05T18:24:16Z" }) === null,
  "relevé et dépôt d'AVANT la pause (05/11) → rien");
ok(contrePreuvePauseLbc({ ...B_GOULVENK, leve_le: "2026-11-07T18:41:00Z" }, { releveReussiLe: "2026-11-07T18:50:00Z" }) === null, "pause déjà levée → rien");

console.log("\n4. LA SYNCHRO DE LA PERSONNE EST LA VISITE, JAMAIS MUETTE (règle 4)");
const s1810 = etatBlocageLbc(PS, T("2026-11-07T17:12:00Z"), { synchroDemandee: true });
ok(etatBlocageLbc(PS, T("2026-11-07T17:12:00Z")).etat === "bloque" && s1810.etat === "essai" && s1810.par === "synchro_demandee",
  "synchro de 18:10 : AVANT retirée de chaque réponse (queued 1 h 30) ; APRÈS elle est la visite au passage suivant");
const enCours = { leboncoin: { blocage_acces: { ...B_GOULVENK, essai: { releve_id: "x", le: "2026-11-07T17:10:00Z", controle: true } } } };
ok(etatBlocageLbc(enCours, T("2026-11-07T17:12:00Z"), { synchroDemandee: true }).essai_en_cours === true,
  "une visite déjà en cours : la synchro attend son verdict (puis part)");
ok(etatBlocageLbc(enCours, T("2026-11-07T19:30:00Z"), { synchroDemandee: true }).etat === "essai", "visite servie jamais prise depuis 2 h : la synchro la remplace");
ok(etatBlocageLbc({}, T("2026-11-07T17:12:00Z"), { synchroDemandee: true, sessionRevueLe: "2026-11-07T17:00:00Z" }).etat === "libre", "sans pause : rien ne change");

console.log("\n5. LE SERVEUR APPLIQUE LA RÈGLE (get-pending-jobs, handler-watch, update-job-status)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(gpj.includes("if (blocageSessionFermee(blocageLbc(psB))) {") && gpj.includes('.select("extension_sessions").eq("id", user.id).maybeSingle();')
  && gpj.includes("synchroDemandee: !!synchroPersonneLbc,") && gpj.includes("sessionRevueLe: sessionLbcRevueLe(sessionsLbcB),"),
  "l'état de la pause lit la synchro de la personne et le « connecté » de l'extension (lu seulement pour une session fermée)");
ok(gpj.includes("let releveLbc = synchroPersonneLbc ?? syncCommandsAnnonces.find("), "la synchro de la personne fait la visite");
ok(gpj.includes("if (eb.etat !== \"reprise\" && blocageSessionFermee(eb.blocage)) {") && gpj.includes("posePar: ATTENTE_SESSION_POSE_PAR_PAUSE_LBC,"),
  "session fermée : les tâches retenues passent par le circuit connexion");
ok(gpj.includes("const preuveP = contrePreuvePauseLbc(bP, {") && gpj.includes("blocageLeve(bP, { par: `get-pending-jobs (${preuveP.par}"),
  "relevé ou dépôt réussi après la dernière preuve : pause levée");
ok(gpj.includes('.eq("platform_fields->attente_session->>pose_par", ATTENTE_SESSION_POSE_PAR_PAUSE_LBC).limit(40)') && gpj.includes("delete pfM.attente_session;"),
  "pause levée : l'attente de connexion qu'elle avait posée part (40 au plus)");
ok(gpj.includes("if (attentePoseeParLaPauseLbc(pfJ)) delete pfJ.attente_session;"), "restriction revenue : l'attente de connexion de la pause part");
ok(lire("supabase/functions/handler-watch/index.ts").includes("const signe = signeBlocageHorsConnexionLbc(r.erreur);"),
  "handler-watch : un relevé arrêté sur la page de connexion ne pose jamais de pause sur un 403");
ok(lire("supabase/functions/update-job-status/index.ts").includes("const signeB = signeBlocageHorsConnexionLbc(texteB);"),
  "update-job-status : une tâche au mur de connexion ne pose jamais de pause sur un 403");

console.log("\n6. L'EXTENSION (0.6.179) NE MENT PLUS SUR LA SESSION");
const lbcJs = lire("chrome-extension/content-scripts/leboncoin.js");
const deb = lbcJs.indexOf("function jetonLuatValable(");
const fin = lbcJs.indexOf("\nif (window.top === window", deb);
const jetonLuatValable = new Function(`${lbcJs.slice(deb, fin)}; return jetonLuatValable;`)();
const jwt = (exp) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
const maintenant = T("2026-11-07T18:11:27Z");
ok(jetonLuatValable(jwt(Math.floor(maintenant / 1000) - 3600), maintenant) === false, "jeton périmé (session fermée) → plus de « compte vu sur la page »");
ok(jetonLuatValable(jwt(Math.floor(maintenant / 1000) + 7000), maintenant) === true && jetonLuatValable(null) === false && jetonLuatValable("illisible") === true,
  "jeton valable → « compte vu » ; absent → rien ; illisible → comme avant");
ok(lbcJs.includes('try { jeton = jetonLuatValable(window.localStorage.getItem("luat")); }'), "le signal « compte vu » passe par ce juge");
const bg = lire("chrome-extension/background.js");
ok((bg.match(/if \(Number\.isFinite\(exp\) && exp \* 1000 < Date\.now\(\) \+ 30_000\) return \{ ok: false, motif: "jeton_expire"/g) ?? []).length === 2,
  "veille des commandes et relevé des ventes : aucune requête avec un jeton périmé (le 403 du 06/11 01:33)");
ok(bg.includes("erreur: `session leboncoin : page de connexion (« Mes annonces » s'ouvre sur la connexion de Leboncoin [${porteLbc}])`")
  && bg.includes("if (tab?.url && PORTE_RELEVE_RE.test(tab.url) && (platform !== \"leboncoin\" || porteLbc)) {"),
  "relevé : la porte de connexion vue deux fois, nommée, avec les motifs de l'adresse");
ok(bg.includes('.replace(/\\bhttp_(\\d{3})\\b/gi, "réponse $1")'), "les motifs de l'adresse ne portent jamais « http_403 » à côté de la page de connexion");

console.log("\n7. LA CHAÎNE DE GOULVENK, REJOUÉE");
{
  // 17:39:58 : visite refusée, session fermée → tâches en « connecte-toi » ; 18:10 : sa synchro EST la visite.
  const ref = blocageEssaiRefuse({ ...B_GOULVENK, essai: { releve_id: "5e7a7a8e", le: "2026-11-07T16:37:58.732Z", controle: true } },
    { signe: verdictVisiteControleLbc("absente", VISITE_REELLE).signe, maintenant: "2026-11-07T16:39:58.791Z" });
  ok(blocageSessionFermee(ref), "17:39:58 — visite refusée : pause « session fermée » (circuit connexion)");
  ok(etatBlocageLbc({ leboncoin: { blocage_acces: ref } }, T("2026-11-07T17:12:00Z"), { synchroDemandee: true }).etat === "essai",
    "18:12 — sa synchro de 18:10 part comme visite (au lieu de rester « queued »)");
  ok(verdictVisiteControleLbc("done", "[défilement] [adresse] 1 page(s), 17 en ligne lues sur 17 annoncées · [statuts] active 17").verdict === "passe",
    "visite lue 17/17 → pause levée, « Editions 43019 Football » repart à son tour");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — session fermée Leboncoin : circuit connexion, preuve, synchro`);
process.exit(ko ? 1 : 0);
