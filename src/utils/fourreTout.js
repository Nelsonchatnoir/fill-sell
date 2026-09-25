// ═══════════════════════════════════════════════════════════════════════════
// LE FOURRE-TOUT D'UN CATALOGUE N'EST PAS UN RAYON (2026-09-25, point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Le pichet de Jocabroc (job c9a75a0a, 22/09) est parti en « Divers > Autres »
// alors que l'objet était reconnu (« pichet ») — Leboncoin a confirmé le dépôt
// puis l'a retiré à la modération. Recensé le 25/09 : 23 dépôts Leboncoin
// « Divers > Autres » depuis le 18/09, 10 refusés par la modération, 3 en
// ligne. Règle de Nico : un refus de modération, c'est NOTRE faute ; « Autre »
// n'est pas une catégorie.
//
// UNE définition, lue par l'app (descente de l'arbre, relance d'un dépôt
// refusé) ET par le serveur (get-pending-jobs, garde avant tout essai) :
//   · « Divers » (racine Leboncoin dont le seul enfant est « Autres ») ;
//   · tout chemin de 1 ou 2 niveaux dont le dernier libellé est un « Autre(s)… »,
//     « Divers », « Other… » — « Divers > Autres », « Collections > Autres »,
//     « Services > Autres services », « Enfants > Autres articles pour bébé et
//     enfant ». Plus profond, un « Autres … » est le « autres » d'une branche
//     (« Robes > Autres robes ») : un vrai rayon, il n'est pas visé.
const FOURRE_TOUT = /^(autres?|divers|other|others|miscellaneous)(\s|$)/i;

const normaliser = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Le chemin est-il un fourre-tout de catalogue (jamais une réponse) ? */
export function estFourreToutCatalogue(chemin) {
  if (!Array.isArray(chemin) || !chemin.length || chemin.length > 2) return false;
  const dernier = normaliser(chemin[chemin.length - 1]);
  if (FOURRE_TOUT.test(dernier)) return true;
  // La racine « Divers » de Leboncoin : son seul enfant est « Autres ».
  return chemin.length === 1 && /^divers$/i.test(dernier);
}

export default estFourreToutCatalogue;
