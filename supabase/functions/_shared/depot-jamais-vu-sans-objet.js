// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT JAMAIS VU EN LIGNE DONT L'ARTICLE EST VENDU (OU LA FICHE SUPPRIMÉE) N'EST PAS UN ÉCHEC (07/11, famille 5)
// ═══════════════════════════════════════════════════════════════════════════
// Balayage du rouge du 07/11 14:06 : 27 dépôts « failed » (25 Beebs, 2 Leboncoin, 5 comptes) disent « Publication
// jamais vue en ligne sur … : deux relevés complets de ton compte ne l'ont pas trouvée ». Tous posés par
// get-pending-jobs quand le RETRAIT armé par la VENTE de l'article conclut « rien à retirer » (deux relevés complets) :
// la fiche est vendue (statut « vendu », 24) ou supprimée (inventaire_id NULL, 3), et aucune annonce de cette fiche
// n'est vivante sur la plateforme. Un échec rouge pour un article déjà vendu : rien à faire, rien à relancer.
//
// LA RÈGLE (Nico, 07/11) — un dépôt (publication ou republication) jamais vu en ligne (ni lien, ni numéro, jamais vu
// par un relevé), dont :
//   · la fiche est VENDUE — même définition que public.article_vendu (statut « vendu », ou quantité ≤ 0) —, ou
//     SUPPRIMÉE (inventaire_id NULL : la clé étrangère est ON DELETE SET NULL) ;
//   · ET aucune annonce VIVANTE sur la plateforme (annonces_plateforme de la fiche ou reliée à ce dépôt : ni disparue,
//     ni retirée, ni vendue — « inconnu » et « désactivée » comptent comme vivantes : le doute garde l'échec) ;
// se clôt « cancelled », message VRAI : jamais vue en ligne (le constat, inchangé) ; l'article est vendu / la fiche est
// supprimée : rien à faire ; non décomptée. Jamais « failed ». Rien n'est caché : le constat reste écrit, la trace
// listing_url_abandon reste posée (un retrait sans lien de ce dépôt se clôt toujours « dépôt jamais en ligne »), et
// l'erreur d'avant, quand il y en a une, est archivée par l'appelant (erreurs_archivees).
// Fiche en stock, fusionnée, illisible, ou une annonce vivante : rien ne change (l'échec reste, il dit vrai).
//
// Appelants : get-pending-jobs (les deux bascules « rien à retirer », retrait sans numéro et retrait sans lien) et
// handler-watch (passage borné sur les dépôts déjà « failed » dans cet état).
// Pur (Deno + Node), sans import : scripts/depot-jamais-vu-sans-objet-selftest.mjs.

export const MOTIF_DEUX_RELEVES = "deux_releves_complets";
export const REGLE_SANS_OBJET = "depot_jamais_vu_article_vendu_0711";

const NOMS = Object.freeze({ beebs: "Beebs", leboncoin: "Leboncoin", vinted: "Vinted", ebay: "eBay", depop: "Depop", opla: "Opla" });
/** Le nom d'une plateforme tel que l'app l'écrit. */
export const nomPlateforme = (p) => NOMS[String(p ?? "")] ?? String(p ?? "");

const vide = (v) => !String(v ?? "").trim();

/**
 * La fiche n'a plus d'objet à publier : « vendue » (public.article_vendu : statut « vendu » ou quantité ≤ 0),
 * « supprimee » (inventaire_id NULL), sinon null — fiche en stock, fusionnée, ou NON LUE (fiche null alors que le
 * dépôt porte un inventaire_id : le doute ne conclut rien).
 * @param {{ inventaire_id?: unknown }} depot
 * @param {{ statut?: unknown, quantite?: unknown, fusionne_dans?: unknown } | null} fiche
 * @returns {'vendue'|'supprimee'|null}
 */
export function ficheSansObjet(depot, fiche) {
  if (!depot) return null;
  if (depot.inventaire_id == null) return "supprimee";
  if (!fiche || typeof fiche !== "object") return null;
  if (fiche.fusionne_dans != null) return null; // fusionnée : la vraie fiche est ailleurs, on ne conclut rien
  if (String(fiche.statut ?? "") === "vendu") return "vendue";
  if (fiche.quantite != null && String(fiche.quantite).trim() !== "" && Number.isFinite(Number(fiche.quantite)) && Number(fiche.quantite) <= 0) return "vendue";
  return null;
}

/**
 * Les annonces VIVANTES de la plateforme qui peuvent être cet article : même compte, même plateforme, de la fiche du
 * dépôt ou reliées au dépôt lui-même (job_id) ; ni disparues, ni retirées, ni vendues.
 * @param {{ id?: unknown, user_id?: unknown, platform?: unknown, inventaire_id?: unknown }} depot
 * @param {Array<object>} annonces  lignes annonces_plateforme (user_id, platform, inventaire_id, job_id, statut_plateforme, disparu_le, retiree_le)
 */
export function annoncesVivantesDuDepot(depot, annonces) {
  if (!depot) return [];
  return (Array.isArray(annonces) ? annonces : []).filter((a) => a && typeof a === "object"
    && (a.user_id == null || depot.user_id == null || String(a.user_id) === String(depot.user_id))
    && String(a.platform ?? depot.platform ?? "") === String(depot.platform ?? "")
    && ((depot.inventaire_id != null && a.inventaire_id != null && String(a.inventaire_id) === String(depot.inventaire_id))
      || (depot.id != null && a.job_id != null && String(a.job_id) === String(depot.id)))
    && !a.disparu_le && !a.retiree_le
    && !/^vendue?$/i.test(String(a.statut_plateforme ?? "").trim()));
}

/**
 * Le dépôt relève-t-il du passage de handler-watch ? « failed », publication ou republication, ni lien ni numéro,
 * jamais vu en ligne, et déclaré jamais vu par DEUX RELEVÉS COMPLETS (listing_url_abandon, motif deux_releves_complets
 * — posé par get-pending-jobs ou par le juge des dépôts Beebs sans numéro).
 */
export function estDepotJamaisVuEnEchec(job) {
  if (!job || job.status !== "failed") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  if (!vide(job.listing_url) || !vide(job.platform_listing_id) || job.vu_en_ligne_le) return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  return String(pf.listing_url_abandon?.motif ?? "") === MOTIF_DEUX_RELEVES;
}

/**
 * La décision pour un dépôt jamais vu en ligne : le clore « sans objet », ou le laisser tel quel.
 * @param {any} depot
 * @param {{ fiche?: any, annonces?: any[] | null }} [o]
 * @returns {{ clore: true, raison: 'vendue'|'supprimee' } | { clore: false, motif: string, vivantes?: string[] }}
 */
export function decisionDepotJamaisVu(depot, { fiche = null, annonces = [] } = {}) {
  const raison = ficheSansObjet(depot, fiche);
  if (!raison) return { clore: false, motif: depot?.inventaire_id != null && !fiche ? "fiche_non_lue" : "fiche_en_stock" };
  const vivantes = annoncesVivantesDuDepot(depot, annonces);
  if (vivantes.length) return { clore: false, motif: "annonce_vivante", vivantes: vivantes.map((a) => String(a.listing_id ?? "")).slice(0, 5) };
  return { clore: true, raison };
}

/**
 * La publication ne compte-t-elle pas dans les limites ? Seulement PROUVÉ par le résultat de refund_publish_unconfirmed :
 * rendue (rembourse > 0), déjà rendue, rien de capturé, ou antérieure aux réservations (rien n'a jamais été pris). Un
 * résultat absent ou illisible (appel raté, réservation introuvable) : on ne l'affirme pas.
 */
export function publicationNonDecomptee(refund) {
  if (!refund || typeof refund !== "object") return false;
  if (Number(refund.rembourse) > 0) return true;
  return ["deja_rembourse", "rien_a_rembourser", "sans_reservation"].includes(String(refund.raison ?? ""));
}

/**
 * Le message vrai : le constat (jamais vue en ligne), la raison (vendue / supprimée), rien à faire, non décomptée si prouvé.
 * @param {unknown} platform
 * @param {string} raison
 * @param {{ refund?: any }} [o]
 * @returns {string}
 */
export function messageDepotJamaisVuSansObjet(platform, raison, { refund = null } = {}) {
  const constat = `Publication jamais vue en ligne sur ${nomPlateforme(platform)} : deux relevés complets de ton compte ne l'ont pas trouvée, ` +
    "et nous n'avons jamais eu son numéro.";
  const pourquoi = raison === "supprimee"
    ? " La fiche de l'article a été supprimée : il n'y a rien à faire."
    : " L'article est vendu : il n'y a rien à faire.";
  return `${constat}${pourquoi}${publicationNonDecomptee(refund) ? " Cette publication ne compte pas dans tes limites." : ""}`;
}

/**
 * Les platform_fields du dépôt clos : la marque de la règle, la trace listing_url_abandon GARDÉE (complétée si absente).
 * L'archive de l'erreur d'avant est ajoutée par l'appelant (archiverErreur).
 * @param {any} pf
 * @param {{ raison?: string, maintenant?: string, par?: string, releves?: any[] | null, refund?: any }} [o]
 * @returns {Record<string, any>}
 */
export function champsDepotJamaisVuSansObjet(pf, { raison, maintenant = new Date().toISOString(), par, releves = null, refund = undefined } = {}) {
  const out = { ...((pf && typeof pf === "object") ? pf : {}) };
  out.depot_jamais_vu_sans_objet = { le: maintenant, raison, par: String(par ?? ""), regle: REGLE_SANS_OBJET };
  if (!out.listing_url_abandon || typeof out.listing_url_abandon !== "object") {
    out.listing_url_abandon = { at: maintenant, motif: MOTIF_DEUX_RELEVES, releves: Array.isArray(releves) ? releves : [], refund: refund ?? null };
  } else if (refund !== undefined) {
    out.listing_url_abandon = { ...out.listing_url_abandon, refund };
  }
  return out;
}
