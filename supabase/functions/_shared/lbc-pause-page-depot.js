// ═══════════════════════════════════════════════════════════════════════════
// LA PAUSE « PAGE DE DÉPÔT LEBONCOIN » DES POSTES ≤ 0.6.83 (02/10, xxewwer)
// ═══════════════════════════════════════════════════════════════════════════
// Le 02/10, cinq republications Leboncoin de xxewwer (0.6.82) se sont arrêtées
// AVANT tout retrait sur « sur la page de vente Leboncoin, le titre n'est plus
// au rendez-vous », en needs_user (source « relancer »), avec la promesse « la
// republication repartira toute seule » — que rien ne tenait.
// La cause n'était pas le formulaire : la session Leboncoin du poste était
// fermée (relevés en « jeton_absent » depuis le 01/10 22:28). Déconnecté,
// Leboncoin garde /deposer-une-annonce et affiche « Connectez-vous ou créez un
// compte pour déposer votre annonce. » — la garde des postes ≤ 0.6.83 ne
// reconnaît pas ce mur (la 0.6.84 le reconnaît : attente de session).
//
// LA RÈGLE, côté serveur, pour les pauses déjà écrites par ces postes :
//   · un relevé Leboncoin RÉUSSI après la pause → la session est bonne : le
//     job repart (pending, l'annonce est re-vérifiée avant tout retrait) ;
//   · la session du compte est connue FERMÉE (dernier relevé Leboncoin en
//     « jeton_absent », ou déconnexion vue par une page) → attente de session
//     nommée, le contrat existant (« En attente de ta connexion à Leboncoin »,
//     attente_session) : levée seule par la sonde, le compte vu sur la page ou
//     un relevé réussi (relancer_jobs_connexion), et re-testée à l'échéance ;
//   · on ne sait pas → c'est de notre côté : pending, nouvel essai espacé
//     (1 h, 3 h, 6 h), message vrai, aucun geste demandé.
// La garde ne s'assouplit jamais : chaque reprise repasse par elle, AVANT
// tout retrait. Aucune décision sur un titre. Pur, sans import réseau.
import { delaiAttenteSessionMin } from "./attente-session.js";

export const PAUSE_PAGE_LBC_RE = /sur la page de vente Leboncoin, .*(n'est|ne sont) plus au rendez-vous/;
export const MESSAGE_ATTENTE_CONNEXION_LBC =
  "En attente de ta connexion à Leboncoin dans Chrome : reconnecte-toi à Leboncoin sur ton ordinateur, " +
  "la republication repartira toute seule. Ton annonce est toujours en ligne, rien n'a été touché.";

// Les clés d'un needs_user qui n'ont plus d'objet quand le job repart.
export const CLES_NEEDS_USER = [
  "needs_user_source", "needsUserBoucle", "needsUserResolved", "needs_user_vu_le", "needs_user_vu_erreur",
  "needs_user_tick_le", "needs_user_actif_ms", "error_technique", "processing_since", "pas_de_rouge", "pas_de_rouge_reprises",
];

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** La pause d'un poste ≤ 0.6.83, reconnue par SA garde et SON message ; null sinon. */
export function pausePageDepotLbc(job) {
  if (!job || job.platform !== "leboncoin" || job.action !== "republish" || job.status !== "needs_user") return null;
  const pf = objet(job.platform_fields) ?? {};
  if (String(pf.republish_step ?? "") === "deleted") return null; // jamais : cette garde précède tout retrait
  if (pf.needsUserField) return null;                                // une vraie question attend une réponse
  const g = objet(objet(pf.gardes)?.prevol_page);
  if (!g || g.verdict !== "bloque") return null;
  if (!PAUSE_PAGE_LBC_RE.test(String(job.error ?? ""))) return null;
  const at = ms(g.at);
  if (!Number.isFinite(at)) return null;
  return { at, manquants: Array.isArray(g.manquants) ? g.manquants.map(String) : [] };
}

/**
 * Ce que le compte dit de sa session Leboncoin.
 * `releves` : relevés Leboncoin du compte (vinted_sync_runs, platform =
 * 'leboncoin'), { status, started_at, erreur }, dans n'importe quel ordre.
 * `sessions` : profiles.extension_sessions.
 */
export function sessionLbcDuCompte(releves, sessions) {
  const liste = (Array.isArray(releves) ? releves : [])
    .map((r) => ({ status: String(r?.status ?? ""), at: ms(r?.started_at), erreur: String(r?.erreur ?? "") }))
    .filter((r) => Number.isFinite(r.at))
    .sort((a, b) => b.at - a.at);
  const reussis = liste.filter((r) => r.status === "done");
  const derniereReussite = reussis.length ? reussis[0].at : NaN;
  const dernier = liste[0] ?? null;
  let fermeeDepuis = NaN;
  let preuve = null;
  if (dernier && dernier.status !== "done" && /jeton_absent/.test(dernier.erreur)) {
    fermeeDepuis = dernier.at;
    preuve = "relevé Leboncoin sans jeton de session (jeton_absent)";
  }
  const s = objet(sessions) ?? {};
  const http = objet(s.http) ?? {};
  if (s.leboncoin === false && String(http.leboncoin ?? "") === "login_redirect_observee") {
    const vu = ms(objet(s.checked_at_par_plateforme)?.leboncoin ?? s.checked_at);
    if (Number.isFinite(vu) && !(vu <= derniereReussite) && !(vu <= fermeeDepuis)) {
      fermeeDepuis = vu;
      preuve = "déconnexion vue par la page Leboncoin";
    }
  }
  return {
    derniereReussite: Number.isFinite(derniereReussite) ? derniereReussite : null,
    fermee: Number.isFinite(fermeeDepuis) && !(fermeeDepuis <= derniereReussite),
    preuve,
  };
}

/**
 * La décision pour UNE pause : { action, status, error, platform_fields, motif }
 * ou null (rien à faire). `maintenant` en ms.
 *   action 'relancer'        → pending, error null, annonce re-vérifiée (a_capturer)
 *   action 'attente_session' → pending, attente de session nommée
 *   action 'reessai'         → pending, nouvel essai espacé (de notre fait)
 * @param {any} job
 * @param {{ releves?: Array<any>, sessions?: any, maintenant?: number }} [ctx]
 */
export function decisionPausePageDepotLbc(job, { releves = [], sessions = null, maintenant = Date.now() } = {}) {
  const pause = pausePageDepotLbc(job);
  if (!pause) return null;
  const pf0 = objet(job.platform_fields) ?? {};
  const pf = { ...pf0 };
  for (const k of CLES_NEEDS_USER) delete pf[k];
  const session = sessionLbcDuCompte(releves, sessions);
  const iso = (t) => new Date(t).toISOString();

  if (session.derniereReussite != null && session.derniereReussite > pause.at) {
    delete pf.attente_session;
    delete pf.pause_page_depot;
    delete pf.next_action_after;
    delete pf.capture_id;
    pf.republish_step = "a_capturer";
    pf.pause_page_lbc_levee = { le: iso(maintenant), par: "releve_leboncoin_reussi", releve_le: iso(session.derniereReussite), pause_le: iso(pause.at) };
    return { action: "relancer", status: "pending", error: null, platform_fields: pf, motif: "relevé Leboncoin réussi après la pause" };
  }

  if (session.fermee) {
    const prec = objet(pf0.attente_session);
    // Session prouvée fermée (pas un mur d'un instant) : le barème démarre à
    // l'heure, jamais aux 3/6/10 min faits pour les faux murs.
    const observations = Math.max((Number(prec?.observations) || 0) + 1, 4);
    pf.attente_session = {
      platform: "leboncoin",
      depuis: typeof prec?.depuis === "string" ? prec.depuis : iso(pause.at),
      derniere: iso(pause.at),
      observations,
      motif: String(job.error ?? "").slice(0, 300),
      reconnu_par: `garde prevol_page d'un poste ≤ 0.6.83 sur un mur de connexion (${session.preuve})`,
      pose_par: "get-pending-jobs",
    };
    pf.next_action_after = iso(pause.at + delaiAttenteSessionMin(observations) * 60_000);
    delete pf.pause_page_depot;
    return { action: "attente_session", status: "pending", error: MESSAGE_ATTENTE_CONNEXION_LBC, platform_fields: pf, motif: session.preuve };
  }

  const prec = objet(pf0.pause_page_depot);
  const n = (Number(prec?.n) || 0) + 1;
  const delaiMin = n <= 1 ? 60 : n === 2 ? 180 : 360;
  pf.pause_page_depot = { depuis: typeof prec?.depuis === "string" ? prec.depuis : iso(pause.at), derniere: iso(pause.at), n, manquants: pause.manquants, pose_par: "get-pending-jobs" };
  pf.next_action_after = iso(Math.max(pause.at + delaiMin * 60_000, maintenant + 5 * 60_000));
  const dans = delaiMin < 60 ? `${delaiMin} min` : `${Math.round(delaiMin / 60)} h`;
  return {
    action: "reessai", status: "pending", platform_fields: pf, motif: "page de dépôt illisible, session non mise en cause",
    error: "Republication Leboncoin en pause AVANT tout retrait : la page de dépôt Leboncoin n'a pas pu être lue. " +
      "Ton annonce est TOUJOURS en ligne, rien n'a été touché. C'est de notre côté, rien à faire : " +
      `nouvel essai automatique dans ~${dans}.`,
  };
}
