// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT BEEBS SANS NUMÉRO NE RESTE JAMAIS « EN LIGNE » À VIE (05/11, point 6 a, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Un dépôt sans numéro ne reste jamais "En ligne" à vie : il est jugé par la même règle que les autres. »
// Constat du 05/11 : 108 dépôts Beebs « published » SANS numéro NI lien (platform_listing_id et listing_url NULL),
// dont 43 chez XEWER (de63ca45), déposés du 16/09 au 31/10, jamais vus en ligne. Aucun juge ne les tranchait :
//   · trancher_publications_sans_lien (SQL) les saute (« aucun identifiant → attente ») ;
//   · get-pending-jobs ne les passe « failed » que par un RETRAIT (deux relevés complets, jugerRetraitIntrouvable) ;
//   · jugerSortieVerificationBeebs (handler-watch) et beebs_preuve_jamais_en_ligne exigent un numéro.
//
// LE JUGE — le MÊME que celui des retraits sans numéro (get-pending-jobs → _shared/retrait-introuvable.js), sans
// retrait : jugerRetraitIntrouvable, appelé tel quel pour CE dépôt (depotId, depotLe), sur les relevés Beebs du compte.
//   1. Plus de 7 jours depuis le dépôt (la fenêtre de modération Beebs : SORTIE_VERIFICATION_REFUS_MS = la constante
//      ATTENTE_MAX_MS de get-pending-jobs, 7 j) ;
//   2. les DEUX derniers relevés Beebs qui ont tourné sont COMPLETS (releveComplet) et commencés APRÈS ces 7 jours —
//      un relevé fait pendant la modération ne prouve rien (29/10 : une annonce n'y est ni dans l'index ni dans
//      « en vérification ») ; un relevé raté parmi les deux derniers : on attend le suivant ;
//   3. aucune annonce vue par ces deux relevés ne peut être lui (jugerRetraitIntrouvable : chacune est reliée par son
//      numéro à un autre dépôt ou à une autre fiche, née après le dépôt, ou numérotée avant lui) ;
//   ET, parce que ce dépôt n'a JAMAIS eu de numéro (le doute ne conclut rien) :
//   3 bis. ces deux relevés ont revu le compte : pas plus de lignes vivantes NON revues (ni revues, ni vues partir)
//      que de lignes revues, au-delà de 5 (7373c96c, 31/10 et 02/11 : « index public Beebs : 0 » après 285 la veille,
//      « disparues 0 ») ;
//   4. aucune candidate du dépôt (candidatesDuDepot, _shared/depot-sans-numero.js : celles que beebs-lien peut
//      encore lui rattacher par ses photos) ;
//   5. aucune annonce vivante de LA MÊME FICHE sur Beebs (l'article y est en ligne : le dépôt est peut-être elle —
//      mesuré le 05/11 : louis-seller, 7 dépôts du 26/10 sans numéro, 7 annonces apparues 40 min après et rattachées
//      à la fiche par le moteur) ;
//   6. aucune annonce non reliée par son numéro au même titre normalisé ET au même prix (titre, prix, photo ne
//      prouvent jamais rien : ici ils font DOUTER, et le doute attend) ;
//   7. une republication dont l'ancienne annonce est encore vue en vente attend ; un retrait Beebs actif du dépôt ou
//      de sa fiche attend (son propre juge, get-pending-jobs, tranche).
// EFFET (handler-watch, JUGER_BEEBS_SANS_NUMERO) : « failed », message vrai, publication rendue par le chemin existant
// (refund_publish_unconfirmed, idempotent), marque platform_fields.jamais_en_ligne, et listing_url_abandon — la trace
// que pose déjà le même verdict dans get-pending-jobs (l'app montre « Voir mes annonces Beebs » et ne propose pas de
// relance qui ferait un doublon ; un retrait sans lien de ce dépôt se clôt « dépôt jamais en ligne »). Compare-and-set
// sur « published » sans lien ni numéro. Rien n'est retiré, aucune plateforme n'est visitée.
// Pur, sans import réseau (Deno + Node) : scripts/beebs-depot-sans-numero-selftest.mjs.

import { jugerRetraitIntrouvable, releveComplet } from "./retrait-introuvable.js";
import { candidatesDuDepot } from "./depot-sans-numero.js";
import { SORTIE_VERIFICATION_REFUS_MS, releveVoitToutEnLigne } from "./beebs-sortie-verification.js";

/** 7 jours : la fenêtre de modération Beebs (= ATTENTE_MAX_MS de get-pending-jobs, = SORTIE_VERIFICATION_REFUS_MS). */
export const BEEBS_ATTENTE_MAX_MS = SORTIE_VERIFICATION_REFUS_MS;
export const POSE_PAR_SANS_NUMERO = "handler-watch (dépôt Beebs sans numéro)";
export const REGLE_SANS_NUMERO = "beebs_depot_sans_numero_0511";
export const MESSAGE_JAMAIS_EN_LIGNE_SANS_NUMERO =
  "Beebs n'a jamais mis cette annonce en ligne : FillSell ne la compte plus comme en ligne. Rien n'a été retiré.";

const ms = (v) => { if (typeof v === "number") return Number.isFinite(v) ? v : NaN; const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const iso = (t) => new Date(t).toISOString();
const vide = (v) => !String(v ?? "").trim();
// Même liste que jugerRetraitIntrouvable : une demande jamais réclamée, expirée ou en cours n'a pas « tourné ».
const STATUTS_JAMAIS_TOURNES = new Set(["queued", "expired", "cancelled", "running", "claimed"]);
const HORS_VENTE = /^(vendue|retiree|retirée)$/i;
// Quelques lignes vivantes non revues sont l'ordinaire (mesuré le 05/11 : 6 chez XEWER sur 34, 5 sur 290 chez
// afeef3c7 — annonces vendues ou closes que le relevé n'a pas marquées) ; au-delà, et plus que de lignes revues, les
// relevés n'ont pas montré le compte entier.
const RELEVES_PARTIELS_TOLERANCE = 5;

/** Même normalisation que public.titre_norm (et src/utils/rapprochementJumeau.js titreNorm). */
export function titreNormBeebs(t) {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Le dépôt relève-t-il de ce juge ? Beebs, publication ou republication « published », ni numéro ni lien, jamais vu en ligne. */
export function estDepotBeebsSansNumero(job) {
  return !!job && job.platform === "beebs" && ["publish", "republish"].includes(String(job.action ?? "publish"))
    && job.status === "published" && vide(job.platform_listing_id) && vide(job.listing_url) && !job.vu_en_ligne_le;
}

/** Les deux derniers relevés qui ont TOURNÉ (même sélection que jugerRetraitIntrouvable), le plus récent d'abord. */
export function deuxDerniersRelevesBeebs(releves) {
  return (Array.isArray(releves) ? releves : [])
    .filter((r) => r && !STATUTS_JAMAIS_TOURNES.has(String(r.status ?? "")) && Number.isFinite(ms(r.started_at)))
    .sort((a, b) => ms(b.started_at) - ms(a.started_at)).slice(0, 2);
}

/** L'ancien numéro d'une republication (l'annonce qu'elle a retirée), ou null. */
function ancienNumero(job) {
  const pf = job?.platform_fields ?? {};
  const brut = String(pf.old_platform_listing_id ?? "").trim();
  if (/^\d{6,}$/.test(brut)) return brut;
  const m = String(pf.old_listing_url ?? "").match(/\/p\/(\d{6,})(?:[-/?#]|$)/);
  return m ? m[1] : null;
}

const numeroDe = (a) => {
  const brut = String(a?.listing_id ?? "").trim();
  if (/^https?:/i.test(brut)) { const m = brut.match(/\/p\/(\d+)/); return m ? m[1] : brut; }
  return brut || (String(a?.url ?? "").match(/\/p\/(\d+)/)?.[1] ?? "");
};

/**
 * Le verdict pour UN dépôt Beebs publié sans numéro ni lien.
 * @param {any} job  cross_post_jobs (id, platform, action, status, created_at, published_at, listing_url,
 *   platform_listing_id, vu_en_ligne_le, inventaire_id, title, price, platform_fields)
 * @param {{ releves?: any[], annonces?: any[], retraitActif?: boolean, maintenant?: number }} [ctx]
 *   releves : vinted_sync_runs Beebs (kind annonces) du compte — status, started_at, finished_at, items_vus,
 *             total_entries, erreur, vinted_user_id ; tout ordre ;
 *   annonces : TOUTES les lignes annonces_plateforme Beebs du compte (disparues comprises : le plancher des numéros
 *             « avant le dépôt » se lit sur elles) — listing_id, url, titre, prix, job_id, inventaire_id,
 *             source_rapprochement, vu_le, disparu_le, retiree_le, statut_plateforme, created_at ;
 *   retraitActif : un retrait Beebs de ce dépôt ou de sa fiche est en file (pending, processing, needs_user).
 * @returns {null | { verdict: 'attente', motif: string, [k: string]: any }
 *   | { verdict: 'jamais_en_ligne', depot_le: string, releves: any[], releves_fr: string[], nees_apres_depot?: string[], numerotees_avant_depot?: string[] }}
 *   null : pas ce juge (numéro ou lien, autre plateforme ou statut, vu en ligne un jour).
 */
export function jugerDepotBeebsSansNumero(job, { releves = [], annonces = [], retraitActif = false, maintenant = Date.now() } = {}) {
  if (!estDepotBeebsSansNumero(job)) return null;
  if (retraitActif) return { verdict: "attente", motif: "retrait_en_cours" };
  const depot = ms(job.published_at ?? job.created_at);
  if (!Number.isFinite(depot)) return { verdict: "attente", motif: "date_inconnue" };
  const finModeration = depot + BEEBS_ATTENTE_MAX_MS;
  if (maintenant <= finModeration) return { verdict: "attente", motif: "moderation_beebs", fin_moderation: iso(finModeration) };

  // Le juge des retraits sans numéro, tel quel : la « demande » commence à la fin de la modération (les deux relevés
  // doivent être commencés après elle), le dépôt est CE job (une annonce reliée à lui = il est en ligne).
  const v = jugerRetraitIntrouvable(
    { action: "delete", platform: "beebs", created_at: iso(finModeration), platform_listing_id: null, listing_url: null },
    { releves, annonces, depotId: job.id ?? null, depotLe: iso(depot), maintenant },
  );
  if (!v) return { verdict: "attente", motif: "en_ligne_par_releve" };
  if (v.verdict === "attente") return { verdict: "attente", motif: "releves_insuffisants", releves_fr: v.releves };
  if (v.verdict === "non_reliee") return { verdict: "attente", motif: "annonce_non_reliee", annonces: v.nonReliees ?? [] };
  if (v.verdict !== "deja_retire") return { verdict: "attente", motif: "verdict_inconnu" };

  const deux = deuxDerniersRelevesBeebs(releves);
  if (deux.length < 2 || !deux.every((r) => releveComplet(r) && ms(r.started_at) > finModeration)) {
    return { verdict: "attente", motif: "releves_insuffisants" }; // garde : jamais atteint si les deux juges lisent pareil
  }
  const comptes = new Set(deux.map((r) => String(r.vinted_user_id ?? "").trim()).filter(Boolean));
  if (comptes.size > 1) return { verdict: "attente", motif: "deux_comptes_beebs" };
  const depuis = ms(deux[1].started_at);
  const lignes = Array.isArray(annonces) ? annonces : [];
  // Les annonces que ces deux relevés ont vues en vente (même filtre que jugerRetraitIntrouvable).
  const vues = lignes.filter((a) => ms(a?.vu_le) >= depuis - 60_000 && !a.disparu_le && !a.retiree_le
    && !HORS_VENTE.test(String(a.statut_plateforme ?? "")));
  // 3 bis. Des relevés qui n'ont PAS revu la plupart des annonces que le compte avait en vente, sans les voir partir
  // (ni disparues ni retirées : le relevé lui-même n'a pas conclu à leur absence), ne montrent pas tout le compte.
  // Mesuré le 05/11 (7373c96c) : 285 annonces en ligne au relevé du 30/10, puis « index public Beebs : 0 » le 31/10
  // et le 02/11, « disparues 0 » — 293 lignes vivantes non revues. Aucune absence ne se conclut sur eux.
  const nonRevues = lignes.filter((a) => /^(en_ligne|en_verification)$/.test(String(a?.statut_plateforme ?? ""))
    && !a.disparu_le && !a.retiree_le && !(ms(a.vu_le) >= depuis - 60_000));
  if (nonRevues.length > Math.max(RELEVES_PARTIELS_TOLERANCE, vues.length)) {
    return { verdict: "attente", motif: "releves_partiels", non_revues: nonRevues.length, revues: vues.length };
  }

  // 4. Une candidate que beebs-lien peut encore rattacher (libre, apparue après le dépôt, pas numérotée avant).
  const cands = candidatesDuDepot(job, lignes, "beebs");
  if (cands.length) return { verdict: "attente", motif: "annonce_candidate", annonces: [...new Set(cands.map(numeroDe))].slice(0, 3) };

  // 5. L'article est en vente sur Beebs sous une autre annonce de SA fiche : le dépôt est peut-être elle.
  if (job.inventaire_id != null) {
    const memeFiche = vues.filter((a) => a.inventaire_id != null && String(a.inventaire_id) === String(job.inventaire_id)
      && String(a.job_id ?? "") !== String(job.id ?? ""));
    if (memeFiche.length) return { verdict: "attente", motif: "article_en_ligne_sur_beebs", annonces: [...new Set(memeFiche.map(numeroDe))].slice(0, 3) };
  }

  // 6. Même titre normalisé ET même prix qu'une annonce que rien ne relie par son numéro : doute.
  const titre = titreNormBeebs(job.title);
  const prix = Number(job.price);
  if (titre && Number.isFinite(prix)) {
    const jumelles = vues.filter((a) => (!a.job_id || String(a.source_rapprochement ?? "") !== "job")
      && String(a.job_id ?? "") !== String(job.id ?? "")
      && titreNormBeebs(a.titre) === titre && Number.isFinite(Number(a.prix)) && a.prix != null && Math.abs(Number(a.prix) - prix) < 0.005);
    if (jumelles.length) return { verdict: "attente", motif: "meme_titre_meme_prix", annonces: [...new Set(jumelles.map(numeroDe))].slice(0, 3) };
  }

  // 7. Republication : l'ancienne annonce encore vue en vente (retrait non fait) — l'article est en ligne.
  const ancien = job.action === "republish" ? ancienNumero(job) : null;
  if (ancien && vues.some((a) => numeroDe(a) === ancien)) return { verdict: "attente", motif: "ancienne_annonce_en_ligne", annonces: [ancien] };

  return {
    verdict: "jamais_en_ligne", depot_le: iso(depot),
    releves: deux.slice().reverse().map((r) => ({
      started_at: iso(ms(r.started_at)), finished_at: Number.isFinite(ms(r.finished_at)) ? iso(ms(r.finished_at)) : null,
      total_entries: r.total_entries ?? null, items_vus: r.items_vus ?? null, voit_tout_en_ligne: releveVoitToutEnLigne(r),
    })),
    releves_fr: v.releves,
    ...(v.neesApresDepot ? { nees_apres_depot: v.neesApresDepot } : {}),
    ...(v.numeroteesAvantDepot ? { numerotees_avant_depot: v.numeroteesAvantDepot } : {}),
  };
}

const jourFr = (t) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
const heureFr = (t) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const leA = (t) => `le ${jourFr(t)} à ${heureFr(t)}`;

/**
 * Le message vrai : ce qui est constaté (dates des deux relevés, heure de Paris), ce qui n'a pas été fait. Aucune durée.
 * @param {{ rendue?: boolean }} [o]  rendue : la publication a été rendue (refund_publish_unconfirmed) — dit seulement alors.
 */
export function messageDepotBeebsJamaisEnLigne(job, verdict, { rendue = false } = {}) {
  const r = Array.isArray(verdict?.releves) ? verdict.releves : [];
  const t1 = ms(r[0]?.started_at); const t2 = ms(r[1]?.started_at);
  const constat = Number.isFinite(t1) && Number.isFinite(t2)
    ? ` Beebs ne nous a jamais donné son numéro, et tes annonces Beebs, relevées en entier ${leA(t1)} puis ${leA(t2)}, n'en montrent aucune qui pourrait être elle.`
    : " Beebs ne nous a jamais donné son numéro, et tes annonces Beebs relevées en entier n'en montrent aucune qui pourrait être elle.";
  const pf = job?.platform_fields ?? {};
  const ancienneRetiree = job?.action === "republish" && (pf.deleted_at || pf.deleted_at_serveur || pf.deleted_at_client);
  return MESSAGE_JAMAIS_EN_LIGNE_SANS_NUMERO + constat
    + (ancienneRetiree ? " L'ancienne annonce, elle, avait été retirée par cette republication : ton article n'est plus en ligne sur Beebs." : "")
    // Jamais « ton article reste dans ton stock » : la fiche peut être vendue ou supprimée (mesuré le 05/11 : 1 et 3).
    + (rendue ? " Cette publication ne compte pas dans tes limites." : "");
}

const CLES_A_RETIRER = ["pas_encore_visible", "sale_signal", "unavailable_since", "unavailable_pending_since", "processing_since", "next_action_after"];

/**
 * Le patch du dépôt jugé (statut, message, platform_fields). L'archive de l'erreur d'avant est ajoutée par l'appelant.
 * @returns {{ status: 'failed', error: string, platform_fields: Record<string, unknown> }}
 */
export function patchDepotBeebsJamaisEnLigne(job, verdict, { maintenant = Date.now(), par = POSE_PAR_SANS_NUMERO } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  for (const k of CLES_A_RETIRER) delete pf[k];
  const at = iso(maintenant);
  pf.jamais_en_ligne = {
    at, releves: verdict.releves, pose_par: par, regle: REGLE_SANS_NUMERO, depot_le: verdict.depot_le,
    ...(verdict.nees_apres_depot ? { nees_apres_depot: verdict.nees_apres_depot } : {}),
    ...(verdict.numerotees_avant_depot ? { numerotees_avant_depot: verdict.numerotees_avant_depot } : {}),
  };
  pf.listing_url_abandon = { at, motif: "deux_releves_complets", releves: verdict.releves_fr ?? [], refund: null, par };
  return { status: "failed", error: messageDepotBeebsJamaisEnLigne(job, verdict), platform_fields: pf };
}

/**
 * Après refund_publish_unconfirmed : le résultat est noté, et la phrase « ne compte pas dans tes limites » ajoutée
 * seulement si la publication est rendue (ou l'était déjà). null : rien à réécrire (aucune ligne inchangée réécrite).
 */
export function patchApresRemboursement(job, patch, refund) {
  if (refund == null) return null;
  const rendue = Number(refund?.rembourse) > 0 || refund?.raison === "deja_rembourse";
  const pf = { ...patch.platform_fields };
  pf.jamais_en_ligne = { ...(pf.jamais_en_ligne ?? {}), refund };
  pf.listing_url_abandon = { ...(pf.listing_url_abandon ?? {}), refund };
  const v = { releves: pf.jamais_en_ligne?.releves ?? [] };
  return { error: rendue ? messageDepotBeebsJamaisEnLigne(job, v, { rendue: true }) : patch.error, platform_fields: pf };
}
