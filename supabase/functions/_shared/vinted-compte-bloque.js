// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTE VINTED BLOQUÉ PAR VINTED N'EST PAS « NOTRE ONGLET » (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// recrutementgroupezk704 (Business), retrait Vinted a7dd76cd « Jeans Levi's
// 511 » (vente faite sur Leboncoin) : les cinq essais du 01/10 ont fini sur
// https://www.vinted.fr/main/banned — Vinted a bloqué le compte. Le retrait
// n'a jamais pu être tenté ; le message disait « notre onglet n'était pas
// encore sur la page », puis « relance-le d'un clic » : une relance refrappe
// le même mur, et l'annonce reste achetable (risque de double vente).
// LA RÈGLE : la page d'arrivée /main/banned (lue par la fenêtre de travail,
// work_window_state) est un MUR de Vinted, jamais une page de notre fait :
// needs_user tout de suite, motif vrai (aucune action FillSell n'est possible
// sur ce compte), aucune tentative de plus, et le geste réel nommé — retirer
// l'annonce depuis l'appli Vinted si elle est encore en ligne.
// Pur, sans import réseau (Deno + Node).
//
// (03/10) LA REQUALIFICATION NE DÉPEND PLUS DU POSTE DE LA PERSONNE. Elle ne
// tournait que dans get-pending-jobs, au poll du compte : le poste de Dayane
// s'est tu le 01/10 à 23:43, et son retrait a gardé le faux « relance-le d'un
// clic » — annonce toujours achetable. handler-watch (toutes les 3 min, tout
// le parc) appelle maintenant la MÊME fonction (requalificationCompteVintedBloque).
// (03/10) Le message dit « tant que Vinted affiche cette page » : chez
// duport.leo3, Vinted montre /main/banned sur le formulaire alors que son
// compte répond encore — c'est une restriction de Vinted, pas forcément un
// compte fermé ; seule l'appli Vinted dit ce qu'elle attend.

import { archiverErreur } from "./erreurs-archivees.js";

export const SOURCE_COMPTE_VINTED_BLOQUE = "compte_vinted_bloque";
const BANNI_RE = /^https?:\/\/(?:www\.)?vinted\.[a-z.]+\/main\/banned(?:[/?#]|$)/i;

/** La fenêtre de travail a-t-elle fini sur la page « compte bloqué » de Vinted ? */
export function pageCompteVintedBloque(pf) {
  const w = pf && typeof pf === "object" ? pf.work_window_state : null;
  if (!w || typeof w !== "object") return false;
  const urls = [w.at_end?.tab_url, w.at_start?.tab_url, ...(Array.isArray(w.fins) ? w.fins.map((f) => f?.tab_url) : [])];
  return urls.some((u) => BANNI_RE.test(String(u ?? "")));
}

export function messageCompteVintedBloque(action, titre) {
  const quoi = titre ? ` « ${String(titre).slice(0, 80)} »` : "";
  if (action === "delete") {
    return `Vinted affiche « compte bloqué » sur ton ordinateur : tant que Vinted affiche cette page, FillSell ne peut rien faire sur ton compte Vinted, ` +
      `donc l'annonce${quoi} n'a PAS été retirée. Si elle est encore en ligne, retire-la toi-même depuis l'appli Vinted ` +
      "pour éviter une double vente ; l'appli te dit aussi ce que Vinted attend de toi.";
  }
  return "Vinted affiche « compte bloqué » sur ton ordinateur : tant que Vinted affiche cette page, FillSell ne peut rien faire sur ton compte Vinted, " +
    "et rien n'a été touché. Ouvre l'appli Vinted : elle te dit ce que Vinted attend de toi. Tes autres plateformes ne sont pas concernées.";
}

/**
 * Requalification d'un job ARRÊTÉ (needs_user ou failed) dont la fenêtre de
 * travail a fini sur /main/banned : le vrai motif, le vrai geste. Pure.
 * Appelée par get-pending-jobs (au poll du compte) ET par handler-watch (tout
 * le parc, poste muet compris). Rend null si rien à changer (autre plateforme,
 * autre page, motif déjà posé), sinon { status, error, platform_fields }.
 * @param {{platform?: string, action?: string, title?: string|null, error?: string|null, platform_fields?: object|null}} job
 * @param {string} quand — horodatage ISO de la requalification
 * @param {string} posePar — qui requalifie (trace)
 */
export function requalificationCompteVintedBloque(job, quand, posePar) {
  if (!job || job.platform !== "vinted") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? { ...job.platform_fields } : {};
  if (!pageCompteVintedBloque(pf)) return null;
  if (pf.needs_user_source === SOURCE_COMPTE_VINTED_BLOQUE) return null;
  pf.needs_user_source = SOURCE_COMPTE_VINTED_BLOQUE;
  pf.compte_vinted_bloque = { le: quand, pose_par: posePar };
  pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, "needs_user", `${posePar} (compte Vinted bloqué)`);
  return { status: "needs_user", error: messageCompteVintedBloque(job.action ?? "publish", job.title ?? null), platform_fields: pf };
}
