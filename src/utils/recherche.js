// ═══════════════════════════════════════════════════════════════════════════
// LA RECHERCHE — UNE SEULE DÉFINITION (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Elle vivait en DEUX exemplaires : `searchMatch` dans App.jsx (stock, ventes
// groupées, historique) et `matchRecherche` dans VentesTab.jsx, dont le
// commentaire disait déjà « même recherche que searchMatch, cette fonction
// n'est pas exportée ». Deux copies d'une règle, c'est une divergence qui
// attend son tour : le jour où l'une apprend un champ de plus, l'autre ment.
//
// Champs regardés : le titre, la marque, la description, le type. Volontaire —
// pas l'emplacement (on ne cherche pas « étagère 3 » dans une barre qui
// s'appelle « Rechercher un article »), pas le prix (un nombre tapé là est
// presque toujours une référence de modèle, « 990 », pas un montant).
//
// ⛔ `item.title`, PAS `item.titre` : les lignes d'inventaire passent toutes
//    par `mapItem` (App.jsx) qui renomme `titre` → `title`. Une liste qui
//    n'aurait pas traversé `mapItem` ne serait donc pas cherchable — c'est le
//    seul piège de cette fonction.

export function searchMatch(item, query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return true;
  return !!(
    item?.title?.toLowerCase().includes(q)
    || item?.marque?.toLowerCase().includes(q)
    || item?.description?.toLowerCase().includes(q)
    || item?.type?.toLowerCase().includes(q)
  );
}

export default searchMatch;
