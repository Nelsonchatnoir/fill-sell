// ═══════════════════════════════════════════════════════════════════════════
// eBAY NE RETROUVE PAS SA PROPRE DONNÉE (« introuvable… Réessayez ») : UN INCIDENT PASSAGER, PAS UNE FAUTE DE L'ARTICLE
// 19/11/2026, point 7 du lot de Nico
// ═══════════════════════════════════════════════════════════════════════════
// Le cas (19/11 10:04, compte f83b773c) : 7 articles publiés par l'API Inventory en dix minutes, 6 en ligne, un refusé à
// la mise en ligne (publishOffer, HTTP 400, errorId 25604 : « Erreur de saisie. Seller Inventory Service ne peut pas
// publier les données. Valeur Availability introuvable. Réessayez ou contactez le Service clients. »). Rien ne manquait
// à notre envoi : l'article portait availability.shipToLocationAvailability.quantity = 1, l'offre availableQuantity 1,
// merchantLocationKey, format, categoryId et les trois politiques, comme les six autres — corps écrits par le même code,
// sans variante par article ; createOrReplaceInventoryItem puis createOffer avaient été acceptés. C'est le Seller
// Inventory Service d'eBay qui ne retrouve pas, à la mise en ligne, la disponibilité qu'il vient d'enregistrer (même
// phrase dans l'incident d'eBay « Seller Inventory Service is unable to publish the data. Availability not found. Please
// try again », page d'état de l'API). Les preuves, corps identique : 3f91c02e (19/11 10:31, même refus) publié par une
// simple relance ; 48dd94f7 (03/11, 25002 « Informations sur le lieu introuvables. Réessayez » à createOffer, emplacement
// existant depuis le 19/10) publié par une relance deux minutes après. Les deux cas restants sont restés arrêtés :
// f0acd3af (12/11, abandonné) et f83b773c (19/11).
// Jusqu'ici la tâche partait en needs_user avec le brut d'eBay (« Erreur de saisie… ») : tout 4xx d'eBay était lu
// comme une faute de contenu (verdictHttp) — la personne cherchait quoi corriger, ou abandonnait.
// LA RÈGLE (tous les comptes, toutes catégories, toutes les étapes de la publication par l'API) :
//   · le refus est reconnu (refusMomentaneEbay) : 25604 « Availability … introuvable / not found », 25002 « Informations
//     sur le lieu introuvables / Location information not found … Réessayez / try again » — jamais un autre 25604
//     (« Erreur de saisie » sur un champ) ni un autre 25002 (EAN, retours, annonce identique, plafond de vente) ;
//     (19/11/2026 soir, point 5) élargie : 25002 « Exception du serveur de base de données » (panne du serveur d'eBay) et
//     25001 (erreur système de l'API) — même plafond de ESSAIS_MAX_REFUS_MOMENTANE essais ;
//   · c'est un incident passager d'eBay : la tâche repart SEULE au passage suivant (pending, message effacé) par le
//     chemin normal — l'article réécrit (createOrReplaceInventoryItem, disponibilité comprise), l'offre non publiée
//     reprise, publishOffer —, au plus ESSAIS_MAX_REFUS_MOMENTANE essais en tout (le compteur ebay_api.tentatives du
//     worker) ; au-delà, needs_user avec un message vrai (rien à corriger, relancer plus tard), jamais « Erreur de
//     saisie » ;
//   · les tâches déjà arrêtées sur ce refus (needs_user « relancer », diagnostic gardé, sans la marque de la règle)
//     repartent UNE fois par le même passage (refusMomentaneARearmer) ; la marque (CLE_REFUS_MOMENTANE) interdit toute
//     seconde reprise par l'entretien — jamais une boucle.
// Rien n'est créé ni modifié chez eBay par cette règle : elle ne décide que du statut de la tâche.
// Module PUR (aucun import) : lu par ebay-api-worker et le selftest.
// Selftest : scripts/ebay-refus-momentane-selftest.mjs (npm run selftest:ebay-refus-momentane).

/** La marque datée : { depuis, dernier_le, essais, errorId, etape, epuise_le?, repris_le? }. */
export const CLE_REFUS_MOMENTANE = "ebay_refus_momentane";
/** Essais en tout (le premier compris) avant de rendre la main à la personne. */
export const ESSAIS_MAX_REFUS_MOMENTANE = 3;
/** Les étapes de la publication par l'API où ce refus est reconnu (last_diagnostic.etape du worker). */
export const ETAPES_REFUS_MOMENTANE = ["inventory_item", "offre", "offre_maj", "publish"];

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const INTROUVABLE_RE = /introuvables?|not found/i;
const DISPONIBILITE_RE = /\bavailability\b|disponibilit/i;
const LIEU_RE = /\blieu\b|\blocation\b/i;
const REESSAYER_RE = /réessayez|try again/i;
// (19/11/2026 soir, point 5 de Nico — compte 8ac5bbda, 15:52 : 25002 « Une erreur utilisateur est survenue. Exception du
// serveur de base de données. », HTTP 400 ; relancée à la main à 16:07, publiée sans rien changer) Une PANNE DU SERVEUR
// d'eBay (sa base, son système interne) dans un 25002 : passagère, comme « lieu introuvable, réessayez ». Jamais un 25002
// qui nomme un champ, une règle ou une limite (EAN, retours, annonce identique, plafond de vente).
const SERVEUR_EBAY_RE = /exception du serveur|serveur de base de donn|server exception|database (server )?(exception|error)|internal (server )?error|erreur (interne|syst[eè]me)|system error/i;
// Les marqueurs d'une attente (même liste que les autres reprises du worker).
const CLES_ATTENTE = ["processing_since", "next_action_after", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le",
  "needs_user_vu_erreur", "needs_user_sans_motif"];

/**
 * Le refus d'eBay est-il « je ne retrouve pas ma propre donnée, réessayez » (incident passager du Seller Inventory
 * Service) ?
 * @param {{ errorId?: number|string|null, message?: string|null } | null | undefined} e
 * @returns {boolean}
 */
export function refusMomentaneEbay(e) {
  if (!e || typeof e !== "object") return false;
  const code = Number(e.errorId);
  const msg = String(e.message ?? "");
  if (code === 25604) return DISPONIBILITE_RE.test(msg) && INTROUVABLE_RE.test(msg);
  if (code === 25002) return (LIEU_RE.test(msg) && INTROUVABLE_RE.test(msg) && REESSAYER_RE.test(msg)) || SERVEUR_EBAY_RE.test(msg);
  // (19/11/2026 soir, point 5 de Nico) 25001 = l'erreur SYSTÈME de l'API Inventory (« Une erreur système s'est produite ») :
  // toujours chez eBay, jamais une faute de l'article.
  if (code === 25001) return true;
  return false;
}

/**
 * Le statut d'une tâche refusée ainsi, à l'essai n° `tentatives` (le premier = 1) : un nouvel essai au passage suivant
 * tant que les essais ne sont pas épuisés, puis la main à la personne.
 * @param {number} tentatives
 * @returns {"pending" | "needs_user"}
 */
export function verdictRefusMomentane(tentatives) {
  const n = Number(tentatives);
  return Number.isFinite(n) && n < ESSAIS_MAX_REFUS_MOMENTANE ? "pending" : "needs_user";
}

/**
 * Le message quand les essais sont épuisés : l'incident est chez eBay, rien n'a été publié, rien n'est à corriger —
 * jamais « Erreur de saisie », jamais le code ni le brut (≤ 300 caractères : humanizeJobError).
 * @returns {string}
 */
export function messageRefusMomentaneEpuise() {
  return `eBay n'a pas réussi à enregistrer cette publication de son côté (incident passager chez eBay, ${ESSAIS_MAX_REFUS_MOMENTANE} essais automatiques). `
    + "Rien n'a été publié et rien n'est à corriger sur l'article : relance-la un peu plus tard.";
}

/**
 * L'écriture d'une tâche refusée ainsi pendant la publication (pure : la tâche d'entrée n'est pas modifiée).
 * @param {{ platform_fields?: unknown } | null | undefined} job
 * @param {{ errorId?: number|string|null } | null | undefined} e
 * @param {{ tentatives?: number, etape?: string, maintenant?: string }} [o]
 * @returns {{ status: "pending" | "needs_user", error: string | null, platform_fields: Record<string, unknown> }}
 */
export function ecritureRefusMomentane(job, e, { tentatives = 1, etape = "publish", maintenant = new Date().toISOString() } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  const avant = objet(pf[CLE_REFUS_MOMENTANE]);
  const status = verdictRefusMomentane(tentatives);
  const code = Number(e?.errorId);
  pf[CLE_REFUS_MOMENTANE] = {
    depuis: avant?.depuis ?? maintenant,
    dernier_le: maintenant,
    essais: (Number(avant?.essais) || 0) + 1,
    errorId: Number.isFinite(code) ? code : null,
    etape,
    ...(avant?.repris_le ? { repris_le: avant.repris_le } : {}),
    ...(status === "needs_user" ? { epuise_le: maintenant } : {}),
  };
  if (status === "pending") {
    delete pf.needs_user_source;
    return { status, error: null, platform_fields: pf };
  }
  pf.needs_user_source = "relancer";
  return { status, error: messageRefusMomentaneEpuise(), platform_fields: pf };
}

/**
 * Une tâche arrêtée sur ce refus AVANT la règle (needs_user « relancer » ou sans source, diagnostic gardé d'une étape de
 * la publication, aucune marque de la règle) : à faire repartir une fois.
 * @param {{ platform?: string, status?: string, action?: string, platform_fields?: unknown } | null | undefined} job
 * @returns {boolean}
 */
export function refusMomentaneARearmer(job) {
  if (!job || job.platform !== "ebay" || job.status !== "needs_user") return false;
  if (job.action !== "publish" && job.action !== "republish") return false;
  const pf = objet(job.platform_fields) ?? {};
  if (pf.needs_user_source != null && pf.needs_user_source !== "relancer") return false;
  if (objet(pf[CLE_REFUS_MOMENTANE])) return false;
  const d = objet(pf.last_diagnostic);
  if (!d || !ETAPES_REFUS_MOMENTANE.includes(String(d.etape ?? ""))) return false;
  return refusMomentaneEbay({ errorId: d.errorId, message: d.message });
}

/**
 * L'écriture de la reprise d'une tâche d'avant la règle : en file, message effacé (archivé), source et marqueurs
 * d'attente levés, la marque posée (datée du refus) — plus jamais reprise par l'entretien.
 * @param {{ status?: string, error?: string|null, platform_fields?: unknown } | null | undefined} job
 * @param {{ maintenant?: string, archiver?: ((a: unknown, e: string, s: string, p: string) => unknown) | null }} [o]
 * @returns {{ status: "pending", error: null, platform_fields: Record<string, unknown> }}
 */
export function ecritureRearmementRefusMomentane(job, { maintenant = new Date().toISOString(), archiver = null } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  if (job?.error && typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, String(job.error), job?.status ?? "needs_user", "ebay-api-worker (refus passager d'eBay : reprise)");
  }
  delete pf.needs_user_source;
  for (const k of CLES_ATTENTE) delete pf[k];
  const d = objet(pf.last_diagnostic) ?? {};
  const code = Number(d.errorId);
  const le = typeof d.at === "string" && d.at ? d.at : maintenant;
  pf[CLE_REFUS_MOMENTANE] = { depuis: le, dernier_le: le, essais: 1, errorId: Number.isFinite(code) ? code : null, etape: String(d.etape ?? ""), repris_le: maintenant };
  return { status: "pending", error: null, platform_fields: pf };
}
