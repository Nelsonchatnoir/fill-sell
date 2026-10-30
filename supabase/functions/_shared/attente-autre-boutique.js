// ═══════════════════════════════════════════════════════════════════════════
// UN ARTICLE D'UNE AUTRE BOUTIQUE ATTEND EN SILENCE (03/10, point H)
// ═══════════════════════════════════════════════════════════════════════════
// ornellaracano (deux boutiques Vinted : @ornella-vend, @luciatrendyshop) :
// les chaussons bébé (job ef38f079) affichaient « Republication interrompue :
// nous n'avons pas pu vérifier l'état de ton annonce… Relance depuis l'app »
// (source « relancer ») alors que la vraie cause était prouvée : l'annonce vit
// sur @ornella-vend et Chrome était ouvert sur @luciatrendyshop. Un message
// d'alarme, et une relance qui rejoue le même mur.
//
// LA RÈGLE : une opération Vinted dont l'origine est PROUVÉE sur une autre
// boutique que celle ouverte attend, comme la garde « boutique_etrangere »
// (needs_user_source = 'boutique_etrangere') : get-pending-jobs la remet en
// file dès que la sonde voit CETTE boutique connectée — jamais avant, jamais
// sur une autre. La carte dit laquelle ouvrir ; rien à relancer.
// Posé par l'extension (0.6.91, une-passe) et, pour les jobs déjà arrêtés,
// par handler-watch (toutes versions).
// ES module sans import (Deno + Vite + node).

// (18/10 nuit, point 4) Le domaine Vinted nommé passe par ./lien-vinted.js (vinted.fr ici,
// le domaine du vendeur dans la copie de l'extension).
import { domaineVinted } from "./lien-vinted.js";
export const POSE_PAR_ORIGINE_PROUVEE = "handler-watch (origine prouvée du job)";
export const POSE_PAR_PAGE_EXACTE = "extension (propriétaire lu sur la page exacte)";
// (11/10) Une publication Vinted retenue sur la boutique de sa fiche (get-pending-jobs).
export const POSE_PAR_PUBLICATION_BOUTIQUE = "get-pending-jobs (publication, boutique de la fiche)";
// (12/10, A6) La garde « identité prouvée » de get-pending-jobs (boutique de
// l'article lue en base ≠ boutique ouverte) : elle ne se levait JAMAIS — un
// retrait d'article vendu restait en attente même une fois la bonne boutique
// ouverte. Levée comme les autres : quand CETTE boutique est vue connectée.
export const POSE_PAR_IDENTITE_PROUVEE = "get-pending-jobs (identité prouvée)";

/** Le marqueur posé peut-il être levé quand la sonde voit cette boutique ? */
export function attenteBoutiqueLevable(garde) {
  if (!garde || typeof garde !== "object") return false;
  if (garde.motif !== "boutique_etrangere") return false;
  if (!String(garde.article ?? "").trim()) return false;
  return garde.pose_par === POSE_PAR_PAGE_EXACTE || garde.pose_par === POSE_PAR_ORIGINE_PROUVEE
    // (11/10, Louis) Une PUBLICATION retenue sur la boutique de sa fiche
    // (identite-boutique.js, verifierBoutiquePublicationVinted) repart seule,
    // elle aussi, dès que CETTE boutique est vue connectée.
    || garde.pose_par === POSE_PAR_PUBLICATION_BOUTIQUE
    || garde.pose_par === POSE_PAR_IDENTITE_PROUVEE;
}

// (30/10, lot E — Amiral) Le navigateur RÉEL du poste (nom court sûr, platform_fields.navigateur_poste), sinon « ton
// navigateur » — jamais « Chrome » au hasard (Brave, Edge, Opera…). Même règle que _shared/navigateur-poste.js.
const dansNavigateurBoutique = (n) => (["Chrome", "Brave", "Edge", "Opera", "Firefox", "Safari"].includes(String(n ?? "")) ? `dans ${n}` : "dans ton navigateur");

/** Le texte de la carte : quelle boutique ouvrir, et que rien n'est touché.
 * @param {string | null | undefined} login
 * @param {string} [action]
 * @param {string | null} [navigateur] */
export function messageAttenteBoutique(login, action = "republish", navigateur = null) {
  const qui = login ? `ta boutique Vinted @${login}` : "ton autre boutique Vinted";
  // (11/10) Une publication : rien n'est encore en ligne, rien ne part ailleurs.
  if (action === "publish") return `En attente de ${qui} : cet article appartient à cette boutique, il ne se publie que sur elle. Ouvre-la sur ${domaineVinted()} ${dansNavigateurBoutique(navigateur)}, la publication repartira toute seule. Rien n'a été publié ailleurs.`;
  const suite = action === "delete" ? "le retrait repartira tout seul" : "la republication repartira toute seule";
  return `En attente de ${qui} : ouvre-la sur ${domaineVinted()} ${dansNavigateurBoutique(navigateur)}, ${suite}. Ton annonce est toujours en ligne, rien n'a été retiré.`;
}

/**
 * Un job arrêté dont la cause PROUVÉE est l'autre boutique, et qui ne porte
 * pas encore l'attente : ce qu'il faut écrire, ou null.
 * @param {any} job  cross_post_jobs (platform, action, status, error, platform_fields)
 * @param {Map<string, string|null>} logins  user_id Vinted → login (vinted_sync_pin)
 * @param {string} maintenant  ISO
 */
export function reclasserAutreBoutique(job, logins, maintenant) {
  if (!job || job.platform !== "vinted" || job.status !== "needs_user") return null;
  if (!["republish", "delete"].includes(String(job.action))) return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.needs_user_source === "boutique_etrangere") return null; // déjà dans la bonne file
  const verdict = pf.suppression_verdict && typeof pf.suppression_verdict === "object" ? pf.suppression_verdict : {};
  if (verdict.conclusion !== "boutique_etrangere") return null; // seule une preuve reclasse
  const article = String(pf.vinted_account_id ?? "").trim();
  if (!article) return null;
  const session = String(verdict.session ?? "").trim();
  if (session && session === article) return null; // contradiction : on ne touche pas
  const login = logins?.get?.(article) ?? null;
  const p = { ...pf };
  p.needs_user_source = "boutique_etrangere";
  p.boutique_etrangere = {
    motif: "boutique_etrangere", article, login_article: login,
    session: session || null, le: maintenant, pose_par: POSE_PAR_ORIGINE_PROUVEE,
  };
  return { platform_fields: p, error: messageAttenteBoutique(login, job.action, p.navigateur_poste ?? null) };
}
