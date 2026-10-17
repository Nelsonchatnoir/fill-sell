// ═══════════════════════════════════════════════════════════════════════════
// L'ORIGINE VINTED DES TEXTES ET DES LIENS PARTAGÉS (18/10 nuit, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Ces modules sont lus par l'app, par le serveur ET (copie générée) par le
// popup de l'extension : src/utils/publicationState.js (lien d'une annonce
// importée du dressing), src/utils/retenueServeur.js et
// _shared/attente-autre-boutique.js (« ouvre-la sur vinted.fr dans Chrome »).
// Ils écrivaient vinted.fr en dur — dans l'extension, c'est interdit : une
// vendeuse italienne (Marta, 09/10) doit lire SON domaine, et l'extension n'a
// qu'UNE origine Vinted, chrome-extension/vinted-origine.js
// (selftest:vinted-origine, a. : aucun littéral vinted.fr de code hors du
// module).
//
// LA RÈGLE : l'origine passe par ici. Dans l'app et au serveur, rien ne
// change (vinted.fr, les textes au caractère près). Dans la copie générée de
// l'extension, scripts/gen-etat-job-extension.mjs remplace CE module par
// l'origine de vinted-origine.js (le domaine du vendeur, vinted.fr par défaut).
export const ORIGINE_VINTED = "https://www.vinted.fr";

/** L'origine Vinted (https://www.vinted.<pays>). */
export function origineVinted() {
  return ORIGINE_VINTED;
}

/** Le domaine tel qu'on le nomme dans une phrase (« vinted.fr »). */
export function domaineVinted() {
  return new URL(origineVinted()).host.replace(/^www\./, "");
}

/** Le lien d'une annonce Vinted par son numéro. */
export function lienAnnonceVinted(numero) {
  return `${origineVinted()}/items/${numero}`;
}
