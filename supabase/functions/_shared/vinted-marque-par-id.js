// ═══════════════════════════════════════════════════════════════════════════
// LA MARQUE DE L'ANNONCE VINTED, REPRISE PAR SON IDENTIFIANT (17/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : patrick giry « Paris 2024 » (brand_id 305315) et Romain Guerin
// « pago » (352029) — republications Vinted arrêtées au pré-vol sur « Vinted
// ne connaît pas la marque », alors que l'annonce EN LIGNE la porte. Ce sont
// d'anciennes marques libres (créées jadis par « Utiliser "X" comme marque ») :
// la capture garde leur identifiant (payload d'édition : brand_id +
// brand_dto), mais ni le menu Marque de Vinted (30 s) ni /api/v2/brands ne
// les proposent plus, et l'extension ne savait poser une marque qu'en
// cliquant une ligne de ce menu.
//
// LA RÈGLE (Nico, 17/10) : une republication reprend EXACTEMENT la marque de
// l'annonce en ligne — la ligne du menu quand Vinted la propose, sinon son
// identifiant CAPTURÉ posé dans le corps du dépôt (sonde réseau, jamais
// d'écrasement) ; brand_id 1 = « Sans marque » (ligne native). Jamais une
// marque cherchée, approchée, retenue ou répondue à la place, jamais
// « Sans marque » à la place d'une vraie marque, aucune question. La fiche
// FillSell ne change rien à l'annonce.
//
// LA GARDE : l'une-passe ne RETIRE l'annonce d'origine que si l'envoi direct
// de la marque est PROUVÉ (un dépôt où la sonde a posé brand_id a été accepté
// par Vinted ET sa réponse remet cette marque — platform_fields.
// marque_pose_envoi : http 2xx, relue = id — et aucun n'a été refusé depuis) :
// get-pending-jobs sert alors `marque_injection_prouvee`.
// Sinon : pause AVANT tout retrait (pause_marque_par_id), annonce intacte,
// jamais une question ; get-pending-jobs ne ressert un job en pause qu'une
// fois la preuve acquise, et seulement à un poste qui porte le correctif.
//
// Pur, sans import (Deno + Node).

// Le BUILD_ID (préfixe horodaté) du premier build d'extension qui pose la
// marque par son identifiant : la 0.6.123 (zip build/CWS-0.6.123-A-TELEVERSER/,
// BUILD_ID 2026-10-17T13:13:01Z+250dc2f, posé au paquet le 17/10 ; « 2099 »
// avant, valeur jamais atteinte). La preuve d'envoi reste exigée avant tout
// retrait (envoiMarqueProuve) : ce build ne l'ouvre pas à lui seul.
export const BUILD_VINTED_MARQUE_PAR_ID = "2026-10-17T13:13:01Z";

// (24/10, lot « zéro blocage », A3) Le premier build d'extension qui porte la CHAÎNE DE REPLI de la marque
// (attente du champ après le clic, garde qui compare la marque posée, ligne « Utiliser X comme marque » dans
// toutes les langues de Vinted, « Sans marque » quand le rayon l'accepte) : une republication en pause
// « marque » n'est relâchée vers une marque HORS catalogue que pour un poste à ce build ou plus récent.
// Horodatage borne basse du build 0.6.134 (posé au paquet le 24/10).
export const BUILD_VINTED_MARQUE_CHAINE = "2026-10-24T15:00:00Z";

/** L'identifiant de la marque de l'annonce d'origine (republish_snapshot.brand_id > 1), ou null. */
export function marqueAIdentifiantCapturee(pf) {
  const snap = pf && typeof pf === "object" && pf.republish_snapshot && typeof pf.republish_snapshot === "object"
    ? pf.republish_snapshot : null;
  const id = Number(snap?.brand_id);
  return Number.isInteger(id) && id > 1 ? id : null;
}

/**
 * L'envoi direct de la marque (brand_id posé par la sonde) est-il prouvé ?
 * Une preuve (platform_fields.marque_pose_envoi, écrite par l'extension) vaut :
 *   · ACCEPTÉE seulement si Vinted a répondu 2xx ET remis dans sa réponse la
 *     marque posée (relue = id, `confirmee`) — un 200 qui aurait ignoré
 *     l'identifiant (annonce créée sans marque) ne prouve RIEN ;
 *   · REFUSÉE sur un ≥ 400, ou sur un 2xx dont la marque relue est une AUTRE ;
 *   · neutre sinon (réponse sans marque lisible).
 * Prouvé = au moins une acceptée, et aucun refus plus récent que la dernière
 * acceptée. Une preuve illisible ne compte pas.
 * @param {Array<{ id?: number, http?: number, le?: string, relue?: number | null, confirmee?: boolean }>} preuves
 */
export function envoiMarqueProuve(preuves) {
  const l = (Array.isArray(preuves) ? preuves : [])
    .filter((p) => p && typeof p === "object" && Number(p.id) > 1)
    .map((p) => {
      const http = Number(p.http);
      const relue = Number(p.relue);
      const deux = http >= 200 && http < 300;
      return {
        le: Date.parse(String(p.le ?? "")),
        http,
        acceptee: deux && p.confirmee === true && relue === Number(p.id),
        refusee: http >= 400 || (deux && Number.isInteger(relue) && relue > 0 && relue !== Number(p.id)),
      };
    })
    .filter((p) => Number.isFinite(p.http) && Number.isFinite(p.le));
  const ok = l.filter((p) => p.acceptee).map((p) => p.le);
  if (!ok.length) return false;
  const dernierOk = Math.max(...ok);
  return !l.some((p) => p.refusee && p.le > dernierOk);
}

/** Une republication Vinted mise en pause par l'extension faute de preuve (jamais un needs_user). */
export function enPauseMarqueParId(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  return job?.platform === "vinted" && job?.action === "republish" && job?.status === "pending"
    && String(pf.republish_step ?? "") !== "deleted"
    && Boolean(pf.pause_marque_par_id && typeof pf.pause_marque_par_id === "object");
}
