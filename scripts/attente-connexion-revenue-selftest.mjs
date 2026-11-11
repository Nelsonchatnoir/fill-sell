// Autotest — un retrait Vinted qui attend la connexion repart dès que la connexion est prouvée (11/11, A1a, défaut D2) —
// `npm run selftest:attente-connexion-revenue`.
//   · module pur _shared/attente-connexion-revenue.js : rejeu de la chronologie réelle du compte aa957efd (10/11, heure
//     de Paris) → servi sans échéance ; preuve plus ancienne, sonde sans identité, autre boutique, autre domaine,
//     republication, Cloud ou plusieurs postes sans preuve du poste qui poll, 7e levée en 24 h → non ;
//   · update-job-status : la marque `levee_connexion` de la copie servie est lue puis retirée du corps (même endroit
//     que `attente_connexion`), comptée dans `verification_boutique_vinted.levees_connexion` (6 par 24 h) ;
//   · get-pending-jobs : branché juste avant le filtre des attentes programmées, aucune écriture au poll, profil lu
//     seulement si un job porte `attente_connexion` et que la garde de boutique ne l'a pas déjà lu.
// Valeurs factices : boutique 70000001 (autre : 70000002), annonce 10000000001 — jamais l'identité d'un client.
import fs from "node:fs";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => { try { return fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };

// Le module n'existe pas avant le correctif : chaque assertion tombe, pas l'import.
let M = {};
try { M = await import("../supabase/functions/_shared/attente-connexion-revenue.js"); } catch (e) { ok(false, "module _shared/attente-connexion-revenue.js présent", String(e?.message ?? e)); }
const appeler = (nom, ...a) => (typeof M[nom] === "function" ? M[nom](...a) : undefined);

const BOUTIQUE = "70000001", AUTRE = "70000002";
const MESSAGE = "Connecte-toi à Vinted sur ton ordinateur. Rien n'a été touché : le retrait repart tout seul dès que tu es connecté.";
const h = (iso) => Date.parse(iso);
// ── Chronologie réelle (aa957efd, 10/11/2026, heure de Paris) ──
const OBSERVATION = "2026-11-10T14:35:37+01:00";   // dernière observation sans session (n = 16)
const ECHEANCE = "2026-11-10T15:05:38+01:00";      // reprise prévue (30 min)
const SONDE_1 = "2026-11-10T14:46:44+01:00";       // sonde : bonne boutique connectée
const SONDE_2 = "2026-11-10T14:56:49+01:00";
const POSTE_ETEINT = "2026-11-10T15:01:05+01:00";  // dernier signe du poste : 4 min avant l'échéance

const retrait = (o = {}, pf = {}) => ({
  id: "90056625-0000-4000-8000-000000000001", action: "delete", platform: "vinted", status: "pending", error: MESSAGE,
  inventaire_id: 1790000000000031, listing_url: "https://www.vinted.fr/items/10000000001-article-essai",
  platform_fields: {
    arme_par: { chemin: "vente_article_serveur", le: "2026-11-06T19:40:00+01:00" },
    vinted_account_id: BOUTIQUE,
    attente_connexion: { platform: "vinted", depuis: "2026-11-06T19:45:00+01:00" },
    verification_boutique_vinted: { motif: "session_inconnue", le: OBSERVATION, n: 16, depuis: "2026-11-06T19:45:00+01:00", pose_par: "extension (garde avant retrait)" },
    next_action_after: ECHEANCE,
    ...pf,
  },
  ...o,
});
const sessions = (le = SONDE_1, ident = { user_id: BOUTIQUE, login: "vendeur-essai-1" }, extra = {}) => ({
  checked_at: le, checked_at_par_plateforme: { vinted: le }, vinted: true, vinted_identite: ident, ...extra,
});
const posteSeulPoste = { "sess-a": { le: SONDE_1 } };
const decider = (job, { s = sessions(), run = null, capture = null, poste = null, posteCloud = false, cloudVoie = false, postes = posteSeulPoste, maintenant } = {}) => {
  const posteSeul = appeler("preuveDuSeulPoste", { posteCloud, cloudVoie, postes, maintenant });
  const preuves = appeler("preuvesConnexionVinted", { sessions: s, run, capture, poste }) ?? [];
  const domaineSession = appeler("domaineDeLaSession", s);
  return appeler("decisionConnexionRevenue", job, { preuves, domaineSession, posteSeul, maintenant }) ?? { lever: false, motif: "module absent" };
};

console.log("1. Rejeu aa957efd : la sonde revoit la bonne boutique → le retrait part au poll suivant");
const POLL_1 = h("2026-11-10T14:47:30+01:00");
ok(appeler("retraitEnAttenteDeConnexion", retrait(), POLL_1) === true, "retrait Vinted : attente_connexion + « Connecte-toi à … » + échéance future → candidat");
const d1 = decider(retrait(), { maintenant: POLL_1 });
ok(d1.lever === true && d1.preuve?.source === "sonde", "sonde de 14:46:44 (bonne boutique, après l'observation de 14:35:37) → levée", JSON.stringify(d1));
const servi = d1.lever ? appeler("retraitServiConnexionRevenue", retrait(), d1.preuve, POLL_1) : null;
ok(!!servi && !("next_action_after" in servi.platform_fields), "servi SANS échéance : le filtre des attentes programmées le laisse passer, l'extension ne le saute plus");
ok(!!servi && servi.platform_fields.levee_connexion?.par === "get-pending-jobs" && servi.platform_fields.levee_connexion?.preuve === "sonde"
  && Date.parse(servi.platform_fields.levee_connexion?.le) === POLL_1, "la copie porte la marque `levee_connexion` (comptée par update-job-status)");
ok(retrait().platform_fields.next_action_after === ECHEANCE, "l'original n'est pas modifié (rien n'est écrit en base au poll)");
ok(!!servi && servi.platform_fields.attente_connexion && servi.platform_fields.verification_boutique_vinted?.le === OBSERVATION, "le reste du job est intact");
ok(decider(retrait(), { s: sessions(SONDE_2), maintenant: h("2026-11-10T14:57:10+01:00") }).lever === true, "sonde de 14:56:49 → levée aussi");
ok(h(POSTE_ETEINT) < h(ECHEANCE), "constat d'origine : poste éteint à 15:01:05, avant l'échéance de 15:05:38 (le retrait aurait dû partir à 14:47)");
ok(decider(retrait(), { s: sessions("2026-11-10T14:30:00+01:00"), maintenant: h("2026-11-10T14:40:00+01:00") }).lever === false, "avant la sonde de 14:46 (dernière sonde à 14:30) → rien");

console.log("\n2. Les bornes : jamais sans preuve exacte");
const M2 = POLL_1;
const r = (o, pf) => retrait(o, pf);
const motif = (dec) => `${dec.lever} ${dec.motif}`;
let dx = decider(r(), { s: sessions("2026-11-10T14:35:00+01:00"), maintenant: M2 });
ok(dx.lever === false, "preuve plus ancienne que l'observation → non", motif(dx));
dx = decider(r(), { s: sessions(OBSERVATION), maintenant: M2 });
ok(dx.lever === false, "preuve à la seconde de l'observation (pas postérieure) → non", motif(dx));
dx = decider(r(), { s: { checked_at: SONDE_1, checked_at_par_plateforme: { vinted: SONDE_1 }, vinted: true, vinted_identite: null, http: { vinted: "jeton_expire_session_ouverte" } }, maintenant: M2 });
ok(dx.lever === false, "sonde « connectée » SANS identité (jeton expiré, session ouverte) → non", motif(dx));
dx = decider(r(), { s: sessions(SONDE_1, { user_id: AUTRE, login: "vendeur-essai-2" }), maintenant: M2 });
ok(dx.lever === false && dx.motif === "autre_boutique", "une AUTRE boutique connectée → non", motif(dx));
dx = decider(r(), { s: sessions(SONDE_1), run: { vinted_user_id: AUTRE, started_at: "2026-11-10T14:47:00+01:00" }, maintenant: M2 });
ok(dx.lever === false && dx.motif === "autre_boutique", "bonne boutique à 14:46:44 puis AUTRE lue à 14:47:00 (la plus récente tranche) → non", motif(dx));
dx = decider(r({}, { vinted_account_id: undefined }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "boutique_du_retrait_inconnue", "boutique du retrait inconnue (identité exigée, jamais « quand elle est connue ») → non", motif(dx));
dx = decider(r({ listing_url: "https://www.vinted.it/items/10000000001-articolo" }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "autre_domaine", "annonce sur vinted.it, session sur vinted.fr → non", motif(dx));
dx = decider(r({ listing_url: "https://www.vinted.it/items/10000000001-articolo" }), { s: sessions(SONDE_1, { user_id: BOUTIQUE, login: "vendeur-essai-1", domaine: "www.vinted.it" }), maintenant: M2 });
ok(dx.lever === true, "annonce et session sur vinted.it (domaine dit par la sonde) → levée", motif(dx));
dx = decider(r({ listing_url: "https://www.vinted.fr/items/10000000001" }), { s: sessions(SONDE_1, { user_id: BOUTIQUE, domaine: "www.vinted.it" }), maintenant: M2 });
ok(dx.lever === false && dx.motif === "autre_domaine", "annonce sur vinted.fr, session sur vinted.it → non", motif(dx));
dx = decider(r({ listing_url: null }), { maintenant: M2 });
ok(dx.lever === false, "lien de l'annonce illisible (domaine inconnu) → non", motif(dx));
dx = decider(r(), { s: { checked_at: SONDE_1, vinted: true, vinted_identite: null }, run: { vinted_user_id: BOUTIQUE, started_at: SONDE_1 }, maintenant: M2 });
ok(dx.lever === false && dx.motif === "domaine_illisible", "relevé de la bonne boutique mais aucune identité de sonde (domaine de session inconnu) → non", motif(dx));
dx = decider(r({ action: "republish" }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "hors_champ", "une REPUBLICATION en attente de connexion garde sa cadence → non", motif(dx));
dx = decider(r({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/1" }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "hors_champ", "un retrait d'une autre plateforme → non", motif(dx));
dx = decider(r({ error: "Retrait Vinted en attente : la page de cette annonce n'a pas pu être lue…" }), { maintenant: M2 });
ok(dx.lever === false, "sans le message « Connecte-toi à … » → non", motif(dx));
dx = decider(r({}, { attente_connexion: undefined }), { maintenant: M2 });
ok(dx.lever === false, "sans le marqueur attente_connexion → non", motif(dx));
dx = decider(r({}, { next_action_after: "2026-11-10T14:40:00+01:00" }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "hors_champ", "échéance déjà passée → rien à lever (servi par la règle d'avant)", motif(dx));
dx = decider(r(), { s: sessions("2026-11-10T14:52:00+01:00"), maintenant: M2 });
ok(dx.lever === false, "preuve datée de plus d'une minute dans le futur (horloge fausse) → non", motif(dx));
dx = decider(r(), { s: { ...sessions(SONDE_1), vinted: false }, maintenant: M2 });
ok(dx.lever === false, "sonde qui dit Vinted DÉCONNECTÉ → non", motif(dx));

console.log("\n3. Les autres preuves (compte à un seul poste)");
const sansSondeFraiche = sessions("2026-11-10T14:00:00+01:00");
dx = decider(r(), { s: sansSondeFraiche, run: { vinted_user_id: BOUTIQUE, started_at: "2026-11-10T14:45:00+01:00" }, maintenant: M2 });
ok(dx.lever === true && dx.preuve?.source === "releve_dressing", "relevé du dressing de la bonne boutique, postérieur → levée", motif(dx));
dx = decider(r(), { s: sansSondeFraiche, capture: { session: BOUTIQUE, lu_le: "2026-11-10T14:45:00+01:00" }, maintenant: M2 });
ok(dx.lever === true && dx.preuve?.source === "capture", "boutique lue sur la page par une capture, postérieure → levée", motif(dx));
dx = decider(r(), { s: sansSondeFraiche, poste: { vinted_user_id: BOUTIQUE, vinted_le: "2026-11-10T14:45:00+01:00" }, maintenant: M2 });
ok(dx.lever === true && dx.preuve?.source === "poste", "boutique dite par ce poste à son poll, postérieure → levée", motif(dx));
ok(JSON.stringify(appeler("preuvesConnexionVinted", { sessions: { checked_at: SONDE_1, checked_at_par_plateforme: {}, vinted: true, vinted_identite: { user_id: BOUTIQUE } } }) ?? [""]) === "[]",
  "sonde : datée par checked_at_par_plateforme.vinted (une identité gardée d'une sonde plus ancienne ne prend pas l'heure du relevé partiel)");

console.log("\n4. Cloud ou plusieurs postes : seule la preuve du poste qui poll");
const deuxPostes = { "sess-a": { le: "2026-11-10T14:46:00+01:00" }, "sess-b": { le: "2026-11-10T14:44:00+01:00" } };
ok(appeler("preuveDuSeulPoste", { posteCloud: false, cloudVoie: false, postes: posteSeulPoste, maintenant: M2 }) === false, "un seul poste vivant, pas de Cloud → toutes les preuves du compte");
ok(appeler("preuveDuSeulPoste", { posteCloud: false, cloudVoie: false, postes: deuxPostes, maintenant: M2 }) === true, "deux postes vivants → preuve du poste seulement");
ok(appeler("preuveDuSeulPoste", { posteCloud: true, cloudVoie: false, postes: posteSeulPoste, maintenant: M2 }) === true, "poste Cloud → preuve du poste seulement");
ok(appeler("preuveDuSeulPoste", { posteCloud: false, cloudVoie: true, postes: posteSeulPoste, maintenant: M2 }) === true, "compte au Cloud actif → preuve du poste seulement");
ok(appeler("preuveDuSeulPoste", { posteCloud: false, cloudVoie: null, postes: posteSeulPoste, maintenant: M2 }) === true, "drapeau Cloud illisible → on ne devine pas : preuve du poste seulement");
ok(appeler("preuveDuSeulPoste", { posteCloud: false, cloudVoie: false, postes: { ...posteSeulPoste, "sess-b": { le: "2026-11-10T14:20:00+01:00" } }, maintenant: M2 }) === false,
  "un second poste muet depuis plus de 15 min ne compte pas");
dx = decider(r(), { cloudVoie: true, poste: null, maintenant: M2 });
ok(dx.lever === false && dx.motif === "aucune_preuve_du_poste", "Cloud : la sonde du COMPTE prouve, le poste qui poll ne dit rien → non", motif(dx));
dx = decider(r(), { cloudVoie: true, poste: { vinted_user_id: BOUTIQUE, vinted_le: "2026-11-10T14:30:00+01:00" }, maintenant: M2 });
ok(dx.lever === false, "Cloud : boutique du poste lue AVANT l'observation → non", motif(dx));
dx = decider(r(), { posteCloud: true, poste: { vinted_user_id: BOUTIQUE, vinted_le: "2026-11-10T14:46:30+01:00" }, maintenant: M2 });
ok(dx.lever === true && dx.preuve?.source === "poste", "poste Cloud qui dit la bonne boutique après l'observation → levée", motif(dx));
dx = decider(r(), { postes: deuxPostes, run: { vinted_user_id: BOUTIQUE, started_at: "2026-11-10T14:46:00+01:00" }, poste: { vinted_user_id: AUTRE, vinted_le: "2026-11-10T14:46:30+01:00" }, maintenant: M2 });
ok(dx.lever === false, "deux postes : relevé du compte sur la bonne boutique, mais CE poste est sur une autre → non", motif(dx));

console.log("\n5. Plafond : 6 levées par retrait et par 24 h, comptées par update-job-status à l'observation suivante");
const iso = (ms) => new Date(ms).toISOString();
const six = [1, 2, 3, 4, 5, 6].map((k) => iso(M2 - k * 3600_000));
dx = decider(r({}, { verification_boutique_vinted: { motif: "session_inconnue", le: OBSERVATION, n: 22, levees_connexion: six } }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "plafond_24h", "6 levées dans les dernières 24 h → la 7e est refusée (cadence d'origine)", motif(dx));
const sixDontVieille = [...six.slice(0, 5), iso(M2 - 25 * 3600_000)];
dx = decider(r({}, { verification_boutique_vinted: { motif: "session_inconnue", le: OBSERVATION, n: 22, levees_connexion: sixDontVieille } }), { maintenant: M2 });
ok(dx.lever === true, "5 levées dans les 24 h (la 6e a 25 h) → levée", motif(dx));
const sixSur24h = [...six.slice(0, 5), iso(M2 - 20 * 3600_000)];
dx = decider(r({}, { verification_boutique_vinted: { motif: "session_inconnue", le: OBSERVATION, n: 22, levees_connexion: sixSur24h } }), { maintenant: M2 });
ok(dx.lever === false && dx.motif === "plafond_24h", "6 levées dont la plus ancienne a 20 h → toujours au plafond (la fenêtre est de 24 h)", motif(dx));
const avant = { motif: "session_inconnue", le: OBSERVATION, n: 16, levees_connexion: [iso(M2 - 2 * 3600_000), iso(M2 - 30 * 3600_000)] };
const marque = { le: iso(M2 - 60_000), preuve: "sonde", par: "get-pending-jobs" };
const apres = appeler("leveesApresObservation", avant, marque, M2) ?? [];
ok(apres.length === 2 && apres[1] === marque.le, "observation suivante : la levée reçue est comptée, celle de plus de 24 h oubliée", JSON.stringify(apres));
ok((appeler("leveesApresObservation", { ...avant, levees_connexion: apres }, marque, M2) ?? []).length === 2, "la même marque reçue deux fois ne compte qu'une fois");
ok((appeler("leveesApresObservation", avant, null, M2) ?? [""]).length === 1, "aucune marque (service à l'échéance) → rien de plus");
ok((appeler("leveesApresObservation", { levees_connexion: six }, marque, M2) ?? []).length === 6, "6 dates gardées au plus");
// Cycle complet : levée → essai → nouvelle observation (sans session) → nouvelle levée seulement sur une preuve plus récente.
let job = retrait();
let compte = 0;
for (let k = 0; k < 9; k++) {
  const t0 = h(OBSERVATION) + k * 12 * 60_000;
  const poll = t0 + 11 * 60_000; // une sonde toutes les 10 min, toujours sur la bonne boutique ; la garde dit « sans session »
  const dk = decider(job, { s: sessions(iso(poll - 60_000)), maintenant: poll });
  if (!dk.lever) break;
  compte++;
  const copie = appeler("retraitServiConnexionRevenue", job, dk.preuve, poll);
  // L'extension recopie la copie servie ; update-job-status compte la marque et repose l'attente (30 min).
  const obs = poll + 60_000;
  const v = job.platform_fields.verification_boutique_vinted;
  const levees = appeler("leveesApresObservation", v, copie.platform_fields.levee_connexion, obs);
  job = retrait({}, { verification_boutique_vinted: { motif: "session_inconnue", le: iso(obs), n: (v.n ?? 0) + 1, depuis: v.depuis, levees_connexion: levees },
    next_action_after: iso(obs + 30 * 60_000) });
}
ok(compte === 6, `sonde et garde en désaccord : ${compte} levée(s) puis la cadence d'origine (jamais un essai toutes les 10 min)`);

console.log("\n6. update-job-status : la marque est lue, comptée, jamais persistée");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const iDel = ujs.indexOf("delete (body.platform_fields as Record<string, unknown>).attente_connexion;");
const blocDel = iDel > 0 ? ujs.slice(ujs.lastIndexOf("if (body.platform_fields", iDel), ujs.indexOf("\n    }", iDel)) : "";
ok(blocDel.includes("leveeConnexionRecue = (body.platform_fields as Record<string, unknown>)[MARQUE_LEVEE_CONNEXION] ?? null;") && blocDel.includes("delete (body.platform_fields as Record<string, unknown>)[MARQUE_LEVEE_CONNEXION];")
  && blocDel.indexOf("leveeConnexionRecue =") < blocDel.indexOf("delete (body.platform_fields as Record<string, unknown>)[MARQUE_LEVEE_CONNEXION]"),
  "`levee_connexion` lue PUIS retirée du corps reçu, au même endroit que `attente_connexion`");
const iObs = ujs.indexOf("pfV.verification_boutique_vinted = {");
ok(iObs > iDel && /leveesApresObservation\(avant \?\? null, leveeConnexionRecue\)/.test(ujs.slice(iObs - 400, iObs)) && /levees_connexion: leveesC/.test(ujs.slice(iObs, iObs + 200)),
  "comptée dans l'écriture de l'observation (verification_boutique_vinted.levees_connexion)");
ok(/import \{ MARQUE_LEVEE_CONNEXION, leveesApresObservation \} from "\.\.\/_shared\/attente-connexion-revenue\.js";/.test(ujs), "update-job-status importe le module partagé");
ok(M.MARQUE_LEVEE_CONNEXION === "levee_connexion", "une seule clé pour la marque (module partagé)");

console.log("\n7. get-pending-jobs : branché juste avant le filtre des attentes programmées, sans écriture");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iVente = gpj.indexOf("UNE VENTE PROUVÉE RETIRE SES COPIES TOUT DE");
const iLev = gpj.indexOf("UN RETRAIT VINTED QUI ATTEND LA CONNEXION REPART DÈS QU'ELLE EST PROUVÉE");
const iFiltre = gpj.indexOf("UNE TÂCHE EN ATTENTE PROGRAMMÉE N'EST PAS SERVIE (04/10)");
ok(iVente > 0 && iLev > iVente && iFiltre > iLev, "après la levée de la vente prouvée, juste avant le filtre des attentes programmées");
const bloc = iLev > 0 && iFiltre > iLev ? gpj.slice(iLev, iFiltre) : "";
ok(bloc.length > 0 && !/\.(update|insert|upsert|delete)\(|\.rpc\(/.test(bloc), "AUCUNE écriture au poll (ni update, ni insert, ni rpc)");
ok(/if \(!includeProcessing && !includeNeedsUser && out\.length\)/.test(bloc) && /const enAttenteC = out\.filter\(\(j\) => retraitEnAttenteDeConnexion\(/.test(bloc),
  "seulement au poll d'exécution, sur les retraits en attente de connexion");
const iProfil = bloc.indexOf("from(\"profiles\")");
ok(iProfil > bloc.indexOf("if (enAttenteC.length)") && iProfil > bloc.indexOf("if (!lus)") && bloc.indexOf("if (!lus)") > bloc.indexOf("if (enAttenteC.length)"),
  "profil lu seulement si un job porte attente_connexion ET que la garde de boutique ne l'a pas lu");
ok(/let lus = identitesVintedLues;/.test(bloc) && /if \(prof\) identitesVintedLues = \{ sessions, run, capture \};/.test(gpj)
  && gpj.indexOf("identitesVintedLues = { sessions, run, capture }") < iLev, "réutilise les trois relevés d'identité déjà lus par la garde de boutique");
ok(/preuveDuSeulPoste\(\{ posteCloud, cloudVoie, postes: postesC, maintenant: maintenantC \}\)/.test(bloc)
  && /preuvesConnexionVinted\(\{ \.\.\.lus, poste: sessionId \? posteCourant : null \}\)/.test(bloc), "Cloud et postes : la preuve du poste qui poll (posteCourant)");
ok(/retraitServiConnexionRevenue\(/.test(bloc) && /out = out\.map\(/.test(bloc), "seule la copie servie change");
ok(/catch \(e\) \{[\s\S]{0,200}l'attente d'avant s'applique/.test(bloc), "une erreur de lecture : l'attente d'avant s'applique (jamais un point de panne)");
ok(/import \{ retraitEnAttenteDeConnexion, preuvesConnexionVinted, preuveDuSeulPoste, domaineDeLaSession, decisionConnexionRevenue, retraitServiConnexionRevenue \} from "\.\.\/_shared\/attente-connexion-revenue\.js";/.test(gpj),
  "get-pending-jobs importe le module partagé");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — un retrait Vinted repart dès que la connexion est prouvée`);
process.exit(ko ? 1 : 0);
