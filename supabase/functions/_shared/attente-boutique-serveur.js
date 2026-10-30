// ═══════════════════════════════════════════════════════════════════════════
// UN JOB RETENU PAR LA GARDE DE BOUTIQUE DU SERVEUR LE DIT — RETRAIT ET
// REPUBLICATION (12/10 pour les retraits ; 30/10, lot D, pour les republications)
// ═══════════════════════════════════════════════════════════════════════════
// get-pending-jobs ne sert pas un retrait ni une republication Vinted dont
// l'annonce est sur une AUTRE boutique que celle ouverte dans Chrome (un 404 ou
// un 403 sur le mauvais compte). Le job reste « pending », intact.
// Jusqu'au 30/10 seul le retrait le disait (attente_boutique_retrait + erreur) :
// 4 republications d'Ornella (@ornella-vend, Chrome sur @luciatrendyshop)
// attendaient depuis le 20/10 avec `error` NULL — tout ce qui lit l'erreur du
// job restait muet. Même règle désormais : une clé par action, écrite UNE fois
// par couple (boutique de l'annonce, boutique ouverte), « depuis » gardé, levée
// dès que la bonne boutique est ouverte.

export const CLES_ATTENTE_BOUTIQUE = Object.freeze({
  delete: "attente_boutique_retrait",
  republish: "attente_boutique_republication",
});

/** La clé platform_fields du marqueur pour cette action, sinon null. */
export const cleAttenteBoutique = (action) => CLES_ATTENTE_BOUTIQUE[action] ?? null;

/** Le message du job retenu (le texte du retrait est celui du 12/10, inchangé). */
// (30/10, lot E) `navigateur` : le nom court sûr du navigateur du poste (« Brave »…), sinon « ton navigateur ».
/** @param {string} action @param {string | null | undefined} login @param {string | null | undefined} loginConnectee @param {string | null} [navigateur] */
export function messageJobRetenuAutreBoutique(action, login, loginConnectee, navigateur = null) {
  const nav = ["Chrome", "Brave", "Edge", "Opera"].includes(String(navigateur ?? "")) ? String(navigateur) : null;
  const leNav = nav ?? "ton navigateur";
  const dansNav = nav ? `dans ${nav}` : "dans ton navigateur";
  const a = login ? `@${login}` : null;
  const ouverte = loginConnectee ? `@${loginConnectee}` : "une autre boutique";
  if (action === "delete") {
    return `Retrait Vinted en attente : cette annonce est sur ta boutique ${a ?? "Vinted"}, `
      + `et ${leNav} est ouvert sur ${ouverte}. Ouvre ta boutique ${a ?? "qui porte l'annonce"} sur vinted.fr ${dansNav}, `
      + "sur ton ordinateur : FillSell retirera l'annonce aussitôt. Rien n'a été touché.";
  }
  return `Republication Vinted en attente : cette annonce est sur ta boutique ${a ?? "Vinted"}, `
    + `et ${leNav} est ouvert sur ${ouverte}. Ouvre ta boutique ${a ?? "qui porte l'annonce"} sur vinted.fr ${dansNav}, `
    + "sur ton ordinateur : FillSell la republiera à son tour. Rien n'a été touché.";
}
