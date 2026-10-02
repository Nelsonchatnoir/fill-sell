// Autotest de la reprise SERVEUR des pauses « page de dépôt Leboncoin »
// écrites par les postes ≤ 0.6.83 — `npm run selftest:lbc-pause-page-depot`
// (supabase/functions/_shared/lbc-pause-page-depot.js, get-pending-jobs).
//
// Cas fondateur (02/10, xxewwer, 0.6.82) : 5 republications en needs_user
// « le titre n'est plus au rendez-vous », session Leboncoin fermée (relevés
// « jeton_absent » depuis le 01/10 22:28). Forme RELEVÉE en base, pas imaginée.
import {
  pausePageDepotLbc, sessionLbcDuCompte, decisionPausePageDepotLbc, MESSAGE_ATTENTE_CONNEXION_LBC,
} from "../supabase/functions/_shared/lbc-pause-page-depot.js";
import { ATTENTE_SESSION_RE } from "../supabase/functions/_shared/attente-session.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ERREUR_0682 = "Republication Leboncoin mise en pause AVANT tout retrait : sur la page de vente Leboncoin, le titre n'est plus au rendez-vous. Ton annonce est TOUJOURS en ligne, rien n'a été touché. C'est de notre côté, on s'en occupe ; la republication repartira toute seule.";
const job = (pf = {}, sur = {}) => ({
  id: "edc916d5-e1af-41ff-9cc3-2c3ceb8123e9", platform: "leboncoin", action: "republish", status: "needs_user",
  error: ERREUR_0682, handler_build: "2026-10-01T10:50:14Z+3f3ff91 · v0.6.82", inventaire_id: 1,
  platform_fields: {
    republish_step: "captured", needs_user_source: "relancer",
    gardes: { prevol_page: { at: "2026-10-02T06:28:17.731Z", verdict: "bloque", manquants: ["le titre"], plateforme: "leboncoin", champs_verifies: ["page_de_depot"] } },
    republish_prevol_page: { at: "2026-10-02T06:28:17.731Z", lisible: true, manquants: ["le titre"] },
    ...pf,
  },
  ...sur,
});
// Relevés de xxewwer tels qu'en base (vinted_sync_runs, platform leboncoin).
const RELEVES_XXEWWER = [
  { status: "failed", started_at: "2026-10-01T20:51:15Z", erreur: "[incomplet] « Mes annonces » n'a pas rendu sa liste … [adresse muette : essai 1 : jeton_absent] repli sur la page" },
  { status: "failed", started_at: "2026-10-01T20:39:20Z", erreur: "… jeton_absent …" },
  { status: "done", started_at: "2026-09-30T17:07:54Z", erreur: "[défilement] [adresse] 2 page(s), 187 en ligne" },
];
const SESSIONS_XXEWWER = { leboncoin: null, http: { leboncoin: 403 }, checked_at_par_plateforme: { leboncoin: "2026-10-02T06:47:35Z" } };
const MAINTENANT = Date.parse("2026-10-02T07:30:00Z");

console.log("\n1. LA PAUSE EST RECONNUE PAR SA GARDE ET SON MESSAGE, JAMAIS PAR UN TEXTE SEUL");
ok(!!pausePageDepotLbc(job()), "la pause de xxewwer (0.6.82) est reconnue");
ok(!pausePageDepotLbc(job({}, { status: "pending" })), "un job pending n'est pas une pause");
ok(!pausePageDepotLbc(job({ republish_step: "deleted" })), "jamais à l'étape 'deleted'");
ok(!pausePageDepotLbc(job({ needsUserField: { field_key: "x", field_label: "X" } })), "une vraie question attend sa réponse : on n'y touche pas");
ok(!pausePageDepotLbc(job({ gardes: { prevol_page: { at: "2026-10-02T06:28:17Z", verdict: "ok" } } })), "garde « ok » : rien");
ok(!pausePageDepotLbc(job({}, { error: "Republication Leboncoin mise en pause AVANT tout retrait : Leboncoin ne propose aucune adresse" })), "autre motif (adresse) : rien");
ok(!pausePageDepotLbc(job({}, { platform: "beebs" })), "autre plateforme : rien");
ok(!pausePageDepotLbc(job({}, { action: "delete" })), "un retrait : rien");

console.log("\n2. CE QUE LE COMPTE DIT DE SA SESSION");
const sx = sessionLbcDuCompte(RELEVES_XXEWWER, SESSIONS_XXEWWER);
ok(sx.fermee === true, "xxewwer : session fermée (dernier relevé « jeton_absent »)", JSON.stringify(sx));
const sOk = sessionLbcDuCompte([{ status: "done", started_at: "2026-10-02T08:00:00Z", erreur: "" }, ...RELEVES_XXEWWER], SESSIONS_XXEWWER);
ok(sOk.fermee === false && sOk.derniereReussite === Date.parse("2026-10-02T08:00:00Z"), "un relevé réussi plus récent : session bonne");
const sPage = sessionLbcDuCompte([], { leboncoin: false, http: { leboncoin: "login_redirect_observee" }, checked_at_par_plateforme: { leboncoin: "2026-10-02T06:00:00Z" } });
ok(sPage.fermee === true, "déconnexion vue par la page (0.6.84) : session fermée");
const s403 = sessionLbcDuCompte([], { leboncoin: false, http: { leboncoin: 403 } });
ok(s403.fermee === false, "un 403 de la sonde ne prouve rien");
ok(sessionLbcDuCompte([], null).fermee === false, "aucun relevé : on ne sait pas");

console.log("\n3. LA DÉCISION");
const d1 = decisionPausePageDepotLbc(job(), { releves: RELEVES_XXEWWER, sessions: SESSIONS_XXEWWER, maintenant: MAINTENANT });
ok(d1?.action === "attente_session" && d1.status === "pending", "xxewwer → attente de session (pending)", JSON.stringify(d1?.action));
ok(ATTENTE_SESSION_RE.test(d1.error), "message ancré « En attente de ta connexion à » (app, relancer_jobs_connexion)");
ok(d1.error === MESSAGE_ATTENTE_CONNEXION_LBC && /reconnecte-toi à Leboncoin sur ton ordinateur/.test(d1.error), "message vrai : reconnecte-toi, rien n'a été touché");
ok(!/de notre côté|on s'en occupe/.test(d1.error), "plus de « on s'en occupe » quand c'est la session");
ok(d1.platform_fields.attente_session?.platform === "leboncoin" && d1.platform_fields.attente_session.derniere === "2026-10-02T06:28:17.731Z", "attente_session posée, datée de la pause");
ok(d1.platform_fields.attente_session.observations >= 4, "session prouvée fermée : barème à l'heure, pas aux 3/6/10 min");
ok(d1.platform_fields.next_action_after === "2026-10-02T07:28:17.731Z", "échéance = pause + 1 h", d1.platform_fields.next_action_after);
ok(!("needs_user_source" in d1.platform_fields), "plus de « relancer » : aucun geste demandé");
ok(d1.platform_fields.republish_step === "captured", "étape intacte : rien n'a été retiré");
// Le même poste re-teste à l'échéance, toujours déconnecté : nouvelle pause, l'attente s'allonge.
const rejeu = job({ attente_session: d1.platform_fields.attente_session, gardes: { prevol_page: { at: "2026-10-02T07:30:00Z", verdict: "bloque", manquants: ["le titre"] } } });
const d2 = decisionPausePageDepotLbc(rejeu, { releves: RELEVES_XXEWWER, sessions: SESSIONS_XXEWWER, maintenant: MAINTENANT + 3_600_000 });
ok(d2?.action === "attente_session" && d2.platform_fields.attente_session.observations === d1.platform_fields.attente_session.observations + 1
  && d2.platform_fields.attente_session.depuis === d1.platform_fields.attente_session.depuis, "re-test toujours déconnecté : observations + 1, « depuis » conservé");

const d3 = decisionPausePageDepotLbc(job(), { releves: [{ status: "done", started_at: "2026-10-02T09:00:00Z", erreur: "" }, ...RELEVES_XXEWWER], sessions: SESSIONS_XXEWWER, maintenant: MAINTENANT });
ok(d3?.action === "relancer" && d3.status === "pending" && d3.error === null, "relevé réussi APRÈS la pause → le job repart");
ok(d3.platform_fields.republish_step === "a_capturer", "il repart en re-vérifiant l'annonce (a_capturer), avant tout retrait");
ok(!d3.platform_fields.attente_session && !d3.platform_fields.next_action_after, "plus d'attente ni d'échéance");

const d4 = decisionPausePageDepotLbc(job(), { releves: [{ status: "done", started_at: "2026-10-02T05:00:00Z", erreur: "" }], sessions: null, maintenant: MAINTENANT });
ok(d4?.action === "reessai" && d4.status === "pending", "session bonne avant la pause, page illisible → nouvel essai (de notre fait)");
ok(/de notre côté, rien à faire/.test(d4.error) && /nouvel essai automatique dans ~1 h/.test(d4.error) && !ATTENTE_SESSION_RE.test(d4.error), "message vrai : de notre côté, essai dans ~1 h, aucun « connecte-toi »");
ok(d4.platform_fields.pause_page_depot?.n === 1 && Date.parse(d4.platform_fields.next_action_after) >= MAINTENANT + 5 * 60_000, "pause comptée, échéance dans le futur");
const d5 = decisionPausePageDepotLbc(job({ pause_page_depot: d4.platform_fields.pause_page_depot }), { releves: [], sessions: null, maintenant: MAINTENANT });
ok(d5?.action === "reessai" && d5.platform_fields.pause_page_depot.n === 2 && /~3 h/.test(d5.error), "deuxième pause : essai dans ~3 h");

ok(decisionPausePageDepotLbc(job({}, { status: "pending" }), { releves: RELEVES_XXEWWER }) === null, "rien à décider hors pause");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ pauses « page de dépôt Leboncoin » : reprise serveur sans geste, garde intacte");
