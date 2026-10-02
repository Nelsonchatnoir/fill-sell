// ═══════════════════════════════════════════════════════════════════════════
// DEMANDE D'AVIS — LA RÈGLE, UNE SEULE FOIS (02/10/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// FillSell n'a que 3 avis sur l'App Store alors que beaucoup de gens s'en
// servent. On demande un avis, proprement et dans les règles des stores :
//   · iOS / Android : UNIQUEMENT la fenêtre officielle du store (StoreKit
//     requestReview, Play In-App Review). Jamais de fenêtre maison avant,
//     jamais un lien direct vers le store à la place, jamais de contrepartie.
//   · Extension et web (ordinateur) : une carte qui mène à la page d'avis de
//     l'extension sur le Chrome Web Store.
//
// QUAND (mêmes règles partout, jugées ICI, côté serveur, sur les jobs réels) :
//   · déclencheur UNIQUE : 10 actions réussies d'affilée (publications,
//     republications, retraits aboutis) SANS AUCUN échec entre elles ;
//   · le moindre échec (failed, needs_user, pause de notre fait) remet à zéro ;
//   · jamais si le compte a moins de 3 jours, n'a pas fini son entrée, a payé
//     dans les dernières 24 h, ou si une action est en cours ;
//   · au plus une demande tous les 60 jours par compte (toutes plateformes) ;
//   · « Plus tard » = rien pendant 30 jours ; « C'est déjà fait » = plus jamais.
//   · une demande consomme la série : la suivante exige 10 NOUVELLES réussites.
//
// ⛔ CE MODULE NE LIT RIEN ET N'ÉCRIT RIEN : il juge des faits qu'on lui donne.
//    La fonction edge `avis-demande` lit la base, l'app et l'extension
//    n'affichent que ce qu'elle a décidé. Un fait illisible = on n'ouvre pas.
//
// Mesure : usage_logs, feature 'avis_demande', metadata
// { evenement, plateforme, declencheur, serie } — evenement ∈ EVENEMENTS.

export const AVIS = Object.freeze({
  SERIE_REQUISE: 10,
  ECART_MIN_JOURS: 60,
  PLUS_TARD_JOURS: 30,
  COMPTE_MIN_JOURS: 3,
  PAIEMENT_CALME_H: 24,
  FEATURE: "avis_demande",
  DECLENCHEUR: "serie_10_reussites",
  URL_AVIS_EXTENSION: "https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm/reviews",
});

export const PLATEFORMES_AVIS = Object.freeze(["ios", "android", "extension", "web"]);

// affiche       : la carte (extension, web) ou la fenêtre officielle (iOS,
//                 Android) a été ouverte — écrit par le serveur lui-même ;
// laisser_avis  : « Laisser un avis » touché (extension, web) ;
// plus_tard     : « Plus tard » (extension, web) → 30 jours ;
// deja_fait     : « C'est déjà fait » (extension, web) → plus jamais.
export const EVENEMENTS = Object.freeze(["affiche", "laisser_avis", "plus_tard", "deja_fait"]);

const JOUR_MS = 24 * 3600_000;
const ACTIONS = new Set(["publish", "republish", "delete"]);

function ms(v) {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function pf(job) {
  const v = job?.platform_fields;
  return v && typeof v === "object" ? v : {};
}

/** Un import (relevé, synchro du dressing) n'est pas une action de la personne. */
export function estImport(job) {
  const b = String(job?.handler_build ?? "");
  return /sync-dressing|releve-annonces/i.test(b);
}

/**
 * L'issue d'un job pour la série :
 *   'reussite' — publié / republié (published, sold, deleted avec date de mise
 *                en ligne) ou retrait abouti (deleted) ;
 *   'echec'    — failed, needs_user, ou une pause de NOTRE fait (reprise
 *                pas-de-rouge en attente, republication retenue par le
 *                serveur), ou un job clos par nous sur un échec (pas-de-rouge) ;
 *   'en_cours' — une action est en train de se faire (processing) ;
 *   'neutre'   — ce qui ne dit rien : en file, annulé par la personne,
 *                import, clôture de la sortie d'Opla, autre action.
 */
export function issueJob(job) {
  if (!job || !ACTIONS.has(String(job.action))) return "neutre";
  if (estImport(job)) return "neutre";
  const p = pf(job);
  // La sortie d'Opla clôt des jobs que la personne n'a pas ratés : ni
  // réussite ni échec (règle A5 du 02/10).
  if (p.opla_sortie) return "neutre";
  const st = String(job.status ?? "");
  if (st === "processing") return "en_cours";
  if (st === "failed" || st === "needs_user") return "echec";
  if (st === "pending") {
    const pdr = p.pas_de_rouge && typeof p.pas_de_rouge === "object" ? p.pas_de_rouge : null;
    if (pdr && pdr.verdict === "reprise") return "echec";
    if (p.retenue_serveur && !p.retenue_levee) return "echec";
    return "neutre";
  }
  if (st === "cancelled") {
    // Clos par notre classeur (« la plateforme ne sait pas faire », reprises
    // épuisées) : l'action n'a pas abouti. Une annulation de la personne ou
    // un remplacement par un job plus récent ne dit rien.
    const pdr = p.pas_de_rouge && typeof p.pas_de_rouge === "object" ? p.pas_de_rouge : null;
    return pdr ? "echec" : "neutre";
  }
  if (job.action === "delete") return st === "deleted" ? "reussite" : "neutre";
  if (st === "published" || st === "sold" || st === "deleted") {
    return job.published_at ? "reussite" : "neutre";
  }
  return "neutre";
}

/**
 * La série en cours, du plus récent au plus ancien (ordre de création).
 * `jobs` : n'importe quel ordre. Rend { serie, enCours, echecVu }.
 */
export function serieReussites(jobs) {
  const tries = [...(Array.isArray(jobs) ? jobs : [])]
    .filter((j) => Number.isFinite(ms(j?.created_at)))
    .sort((a, b) => ms(b.created_at) - ms(a.created_at));
  let serie = 0;
  let enCours = false;
  let echecVu = false;
  for (const j of tries) {
    const issue = issueJob(j);
    if (issue === "en_cours") { enCours = true; continue; }
    if (echecVu) continue;
    if (issue === "echec") { echecVu = true; continue; }
    if (issue === "reussite") serie++;
  }
  return { serie, enCours, echecVu };
}

function evt(l) {
  const m = l?.metadata && typeof l.metadata === "object" ? l.metadata : {};
  return { evenement: String(m.evenement ?? ""), le: ms(l?.created_at) };
}

/**
 * LA décision. Tous les faits sont fournis par l'appelant :
 *   maintenant          ms
 *   compteCreeLe        profiles.created_at
 *   entreeFinieLe       profiles.onboarded_at (null = entrée pas finie)
 *   jobs                jobs du compte (créés depuis la dernière demande,
 *                       l'appelant peut en passer plus : on filtre ici)
 *   evenements          lignes usage_logs 'avis_demande' du compte
 *   paiementsLes        dates des paiements récents (montée de plan, pack,
 *                       ouverture d'un paiement)
 * Rend { ouvrir, motif, serie }. `motif` ne s'affiche jamais : il sert au
 * journal et à l'autotest.
 */
export function decisionAvis({ maintenant, compteCreeLe, entreeFinieLe, jobs, evenements, paiementsLes } = {}) {
  const now = Number.isFinite(maintenant) ? maintenant : Date.now();
  const cree = ms(compteCreeLe);
  if (!Number.isFinite(cree)) return { ouvrir: false, motif: "compte_illisible", serie: 0 };
  if (now - cree < AVIS.COMPTE_MIN_JOURS * JOUR_MS) return { ouvrir: false, motif: "compte_trop_recent", serie: 0 };
  if (!Number.isFinite(ms(entreeFinieLe))) return { ouvrir: false, motif: "entree_pas_finie", serie: 0 };

  const evts = (Array.isArray(evenements) ? evenements : []).map(evt).filter((e) => Number.isFinite(e.le));
  if (evts.some((e) => e.evenement === "deja_fait")) return { ouvrir: false, motif: "deja_fait", serie: 0 };
  const derniereDemande = Math.max(-Infinity, ...evts.filter((e) => e.evenement === "affiche").map((e) => e.le));
  if (now - derniereDemande < AVIS.ECART_MIN_JOURS * JOUR_MS) return { ouvrir: false, motif: "demande_recente", serie: 0 };
  const dernierPlusTard = Math.max(-Infinity, ...evts.filter((e) => e.evenement === "plus_tard").map((e) => e.le));
  if (now - dernierPlusTard < AVIS.PLUS_TARD_JOURS * JOUR_MS) return { ouvrir: false, motif: "plus_tard", serie: 0 };

  const paiements = (Array.isArray(paiementsLes) ? paiementsLes : []).map(ms).filter(Number.isFinite);
  if (paiements.some((t) => now - t < AVIS.PAIEMENT_CALME_H * 3600_000)) {
    return { ouvrir: false, motif: "paiement_recent", serie: 0 };
  }

  // La série ne compte que ce qui a été fait APRÈS la dernière demande :
  // une demande consomme la série.
  const tous = Array.isArray(jobs) ? jobs : [];
  if (tous.some((j) => issueJob(j) === "en_cours")) return { ouvrir: false, motif: "action_en_cours", serie: 0 };
  const depuis = Number.isFinite(derniereDemande) ? derniereDemande : -Infinity;
  const { serie } = serieReussites(tous.filter((j) => ms(j?.created_at) > depuis));
  if (serie < AVIS.SERIE_REQUISE) return { ouvrir: false, motif: "serie_insuffisante", serie };
  return { ouvrir: true, motif: "serie_atteinte", serie };
}
