// ═══════════════════════════════════════════════════════════════════════════
// UN CONTENU DESSINÉ PAR APP DANS LE STOCK, TOUJOURS À JOUR (31/10, fiche lente sur téléphone)
// ═══════════════════════════════════════════════════════════════════════════
// La feuille « Plus en ligne — vendue ? » est dessinée par App (rendrePlusEnLigne : ses questions, ses champs de prix
// en cours de saisie) et affichée DANS le Stock. Le Stock est mémorisé : il ne se redessine plus à chaque rendu d'App
// (src/utils/fonctionsStables.js). Le contenu passe donc par un CONTEXTE, que React propage même quand le Stock saute
// son rendu : la feuille suit chaque lettre tapée, comme avant.
import { createContext, useContext } from 'react';

export const RenduPlusEnLigne = createContext(null);

/** Le contenu de la feuille « Plus en ligne », dessiné par la dernière version d'App (repli : `rendre` reçu). */
export function ContenuPlusEnLigne({ fermer, repli = null }) {
  const rendre = useContext(RenduPlusEnLigne) ?? repli;
  return typeof rendre === 'function' ? rendre({ fermer }) : null;
}
