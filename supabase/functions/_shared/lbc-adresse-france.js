// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN, RÉSERVÉ AUX ADRESSES EN FRANCE (25/10/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Pas de Leboncoin pour les adresses hors de France (cas Marta, Italie) : la
// plateforme ne doit plus être proposée ni tentée pour ces comptes. Ses dépôts
// Leboncoin en attente sont à clore proprement, sans alarme. »
// LE CAS : Marta, adresse de remise « Via CANALE 24 C 16035 RAPALLO ». 0 dépôt
// Leboncoin réussi sur 52 depuis le 24/10 11:44 : chacun refusé « Adresse … sans
// suggestion dans l'autocomplete Leboncoin » (leboncoin.js), son poste réessayait
// 5/15/30/60 min puis passait le job en échec « … écris-nous » — une alarme pour
// une impossibilité, que rien ne pouvait lever.
//
// LA RÈGLE (aucun champ pays n'existe) : le CODE POSTAL de l'adresse de remise
// (platform_settings.leboncoin : le champ code_postal, sinon le dernier nombre de
// cinq chiffres de l'adresse en une ligne, forme d'avant le 18/09) figure-t-il
// dans la base officielle des codes postaux français (geo.api.gouv.fr, outre-mer
// compris — codes-postaux-fr.js, généré par scripts/gen-codes-postaux-fr.mjs) ?
//   · oui → France, rien ne change ;
//   · cinq chiffres absents de la base → HORS DE FRANCE : Leboncoin n'est plus
//     proposé, ni tenté, pour ce compte ; ses dépôts en attente sont clos ;
//   · pas d'adresse, ou un code qui n'a pas cinq chiffres → on ne sait pas :
//     Leboncoin reste proposé. Jamais retiré sur un doute.
// Mesuré le 25/10 : 204 comptes ont un code postal, 2 hors de la base — 16035
// (Rapallo, Italie) et 06890 (Transinne, code belge complété d'un zéro).
// ⛔ LEBONCOIN SEUL. La même adresse sert à Beebs (Transinne : 71 annonces Beebs,
//    0 job Leboncoin) : aucune autre plateforme ne change.
// ⛔ CLORE ≠ ARRÊTER À TA DEMANDE : la clôture ne pose JAMAIS arret_utilisateur
//    (« à ta demande » serait faux). Sa marque est platform_fields.lbc_hors_france.
//
// Lu par get-pending-jobs (Deno), l'app (Vite) et les selftests (Node) : une
// seule définition, un seul texte. CE MODULE NE LIT RIEN ET N'ÉCRIT RIEN.
// Preuve : scripts/lbc-adresse-france-selftest.mjs.
import { CODES_POSTAUX_FR, CODES_POSTAUX_FR_LE } from "./codes-postaux-fr.js";
import { republicationEngagee } from "./file-pause.js";

export { CODES_POSTAUX_FR_LE };

/** La marque d'un job clos par cette règle (platform_fields). */
export const CLE_LBC_HORS_FRANCE = "lbc_hors_france";

// Le message du job clos — la phrase de Nico, mot pour mot.
export const MESSAGE_LBC_HORS_FRANCE =
  "Leboncoin n'accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n'a été publié, et tes autres plateformes continuent normalement.";
export const MESSAGE_LBC_HORS_FRANCE_EN =
  "Leboncoin only accepts addresses in France. Your pickup address is outside France, so FillSell doesn't publish on Leboncoin for your account. Nothing was published, and your other platforms carry on as usual.";
export const messageLbcHorsFrance = (lang = "fr") => (lang === "en" ? MESSAGE_LBC_HORS_FRANCE_EN : MESSAGE_LBC_HORS_FRANCE);

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

let ENSEMBLE = null;
/** Les codes postaux français (Set), décodés une fois. */
export function codesPostauxFrancais() {
  if (ENSEMBLE) return ENSEMBLE;
  const s = new Set();
  for (const ligne of CODES_POSTAUX_FR) {
    const i = ligne.indexOf(":");
    const prefixe = ligne.slice(0, i);
    const suites = ligne.slice(i + 1);
    for (let k = 0; k + 3 <= suites.length; k += 3) s.add(prefixe + suites.slice(k, k + 3));
  }
  ENSEMBLE = s;
  return s;
}

/** Ce code est-il un code postal français ? (espaces tolérés : « 16 035 ») */
export function codePostalFrancais(code) {
  const v = String(code ?? "").replace(/\s+/g, "");
  return /^\d{5}$/.test(v) && codesPostauxFrancais().has(v);
}

/**
 * Le code postal de l'adresse de remise : le champ structuré (code_postal, ou
 * `cp` pour l'objet que l'app tient en mémoire), sinon le DERNIER nombre de
 * cinq chiffres de l'adresse en une ligne (« 12 rue du 8 mai 1945 26230 Grignan »
 * → 26230 ; « 1945 » n'a que quatre chiffres).
 * → { code: string|null, source: "code_postal" | "adresse" | null }
 */
export function codePostalDeLAdresse(reglagesLbc) {
  const r = reglagesLbc && typeof reglagesLbc === "object" ? reglagesLbc : {};
  const champ = String(r.code_postal ?? r.cp ?? "").replace(/\s+/g, "");
  if (champ) return { code: champ, source: "code_postal" };
  const ligne = propre(r.adresse);
  const trouves = [...ligne.matchAll(/(?:^|\D)(\d{5})(?!\d)/g)];
  return trouves.length ? { code: trouves[trouves.length - 1][1], source: "adresse" } : { code: null, source: null };
}

/**
 * LE verdict, jugé sur l'adresse de remise Leboncoin (platform_settings.leboncoin).
 * → { horsFrance, code, motif, source }
 *   motif : "sans_adresse" | "code_illisible" (inconnu : Leboncoin reste proposé)
 *         | "france" | "hors_france"
 */
export function adresseLbcHorsFrance(reglagesLbc) {
  const { code, source } = codePostalDeLAdresse(reglagesLbc);
  if (!code) return { horsFrance: false, code: null, motif: "sans_adresse", source: null };
  if (!/^\d{5}$/.test(code)) return { horsFrance: false, code, motif: "code_illisible", source };
  if (codesPostauxFrancais().has(code)) return { horsFrance: false, code, motif: "france", source };
  return { horsFrance: true, code, motif: "hors_france", source };
}

/** Les plateformes FERMÉES à ce compte par son adresse (utils/stockFiltres.plateformesDuCompte). */
export function plateformesFermeesHorsFrance(reglagesLbc) {
  return adresseLbcHorsFrance(reglagesLbc).horsFrance ? ["leboncoin"] : [];
}

const actionDe = (job) => (job?.action == null || job?.action === "" ? "publish" : String(job.action));

/** Une publication ou une republication Leboncoin (jamais un retrait). */
export function estPublicationLbc(job) {
  if (!job || String(job.platform ?? "") !== "leboncoin") return false;
  const a = actionDe(job);
  return a === "publish" || a === "republish";
}

/**
 * Ce job, d'un compte hors de France, est-il SERVI quand même ? Seulement s'il
 * est déjà en cours (processing) ou si c'est une republication dont le retrait
 * a commencé (son annonce est hors ligne : elle va au bout, comme partout).
 * Tout le reste — publications, republications pas encore commencées — n'est
 * JAMAIS servi.
 */
export function lbcServiMalgreHorsFrance(job) {
  if (!estPublicationLbc(job)) return true;
  if (String(job.status ?? "") === "processing") return true;
  return republicationEngagee(job);
}

// Les statuts qu'on clôt : ce qui attend encore (pending, needs_user) et ce qui
// a échoué sur cette impossibilité (failed). ⛔ Jamais un job en cours
// (processing : un poste le tient) ni un job fini (published, cancelled…).
const STATUTS_A_CLORE = new Set(["pending", "needs_user", "failed"]);
export const STATUTS_LBC_HORS_FRANCE_A_CLORE = Object.freeze([...STATUTS_A_CLORE]);

/**
 * À clore ? Une publication ou republication Leboncoin, en attente ou en échec,
 * SANS annonce (une publication qui porte un lien n'est jamais touchée), et pas
 * une republication dont le retrait a commencé. Un retrait : jamais.
 */
export function lbcACloreHorsFrance(job) {
  if (!estPublicationLbc(job)) return false;
  if (!STATUTS_A_CLORE.has(String(job.status ?? ""))) return false;
  if (actionDe(job) === "publish" && (propre(job.listing_url) || propre(job.platform_listing_id))) return false;
  return !republicationEngagee(job);
}

/**
 * Ce qu'on écrit sur un job à clore. `archiver` = archiverErreur
 * (erreurs-archivees.js), passé par l'appelant pour garder ce module sans
 * dépendance d'écriture. `code` = la preuve (le code postal hors de la base).
 * Rend { status, error, platform_fields } — status 'cancelled', état neutre
 * partout (« Arrêtée », jamais « à toi de jouer », jamais rouge).
 * @param {Record<string, any> | null | undefined} job
 * @param {{ par?: string, code?: string | null, maintenant?: number, archiver?: Function }} [options]
 */
export function clotureLbcHorsFrance(job, { par, code = null, maintenant, archiver } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  if (typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, job?.error, String(job?.status ?? ""), `${par ?? CLE_LBC_HORS_FRANCE} (Leboncoin hors de France)`);
  }
  pf[CLE_LBC_HORS_FRANCE] = {
    le,
    par: String(par ?? CLE_LBC_HORS_FRANCE),
    statut_avant: job?.status ?? null,
    source_avant: pf.needs_user_source ?? null,
    preuve: code == null ? null : String(code),
  };
  // Ne compte dans aucun quota (même marque que la remise en vente après annulation).
  pf.hors_quota = true;
  // Plus rien à attendre ni à relancer : le job est clos.
  delete pf.needs_user_source;
  delete pf.next_action_after;
  delete pf.processing_since;
  return { status: "cancelled", error: MESSAGE_LBC_HORS_FRANCE, platform_fields: pf };
}

/** Un job clos par cette règle (état neutre au suivi, aucune relance). */
export function estClotureLbcHorsFrance(job) {
  const m = job?.platform_fields?.[CLE_LBC_HORS_FRANCE];
  return String(job?.status ?? "") === "cancelled" && Boolean(m) && typeof m === "object";
}
