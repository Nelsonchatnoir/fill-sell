// (09/11, point 1 de Nico — xxewwer, « MediEvil ») Le lien du mail de vente « Répondre à « Déjà vendu ? » »
// (/app?ventes=deja-vendu) : l'intention survit à la connexion (sessionStorage, comme ?ventes=a-decider), App ouvre
// le Stock, et le Stock ouvre l'écran « Déjà vendu ? » dès que ses questions sont lues — une fois, jamais en boucle.
// Aucune lecture en base de plus : le Stock lit déjà ces questions (lireDoublonsProposes) pour « À régler ».
const CLE = 'fillsell:deja-vendu';

/** App : le lien du mail est arrivé. */
export function noterLienDejaVendu() {
  try { sessionStorage.setItem(CLE, '1'); } catch { /* stockage indisponible : le Stock montre « À régler » */ }
}

/** Stock : le lien attend-il ? Le lit et l'efface (une seule ouverture). */
export function prendreLienDejaVendu() {
  try {
    const voulu = sessionStorage.getItem(CLE) === '1';
    if (voulu) sessionStorage.removeItem(CLE);
    return voulu;
  } catch { return false; }
}

/** Le Stock, ses questions LUES : ouvrir l'écran ? (vide → rien, le lien est consommé quand même). */
export function ouvrirDejaVenduAuLien({ lues, nbQuestions, prendre = prendreLienDejaVendu }) {
  if (!lues) return false;
  return prendre() && nbQuestions > 0;
}
