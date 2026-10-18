// ═══════════════════════════════════════════════════════════════════════════
// UNE BOUTIQUE = UN COMPTE FILLSELL (18/10, Louis) — module PUR, testé par
// scripts/boutique-autre-compte-app-selftest.mjs (et les selftests voisins).
// ═══════════════════════════════════════════════════════════════════════════
// Le serveur refuse l'import d'une boutique Vinted déjà suivie par un AUTRE
// compte FillSell (migration 20261018200000) : l'erreur porte
// `[boutique_a_confirmer][boutique_autre_compte]` — l'ancien marqueur reste
// devant pour les vieilles extensions, qui s'arrêtent sans réessayer. Le même
// marqueur arrive quand la personne répond « c'est bien ma boutique » (le pin
// refuse la boutique d'un autre compte).
// Ce n'est PAS une question (« c'est ta boutique ? ») : la réponse « oui »
// serait refusée. Une seule phrase, la même partout (bilan du relevé, point du
// bloc de synchro, refus de la confirmation) : rien n'a bougé, et les deux
// seuls gestes possibles.
// Pseudo : celui que le RUN a vu (`vinted_login`), jamais deviné du texte.
import { textesAnnonces } from './textes.js';

export const MARQUEUR_BOUTIQUE_AUTRE_COMPTE = '[boutique_autre_compte]';

/** Le texte (erreur d'un run, message d'un refus) dit-il « boutique d'un autre compte » ? */
export function estBoutiqueAutreCompte(texte) {
  return String(texte ?? '').includes(MARQUEUR_BOUTIQUE_AUTRE_COMPTE);
}

/** Le pseudo vu par le run, ou null. */
export function loginDuRun(run) {
  const l = typeof run?.vinted_login === 'string' ? run.vinted_login.trim().replace(/^@/, '') : '';
  return l || null;
}

/** LA phrase (fr / en), pseudo facultatif. */
export function texteBoutiqueAutreCompte(login, lang = 'fr') {
  return textesAnnonces(lang === 'en' ? 'en' : 'fr').finBoutiqueAutreCompte(login ? String(login).replace(/^@/, '') : null);
}

/** Leboncoin, Beebs, Depop, eBay : les annonces écartées parce qu'un autre compte les suit déjà. */
export function texteEcarteesAutreCompte(n, lang = 'fr') {
  return textesAnnonces(lang === 'en' ? 'en' : 'fr').ecarteesAutreCompte(n);
}

/** Son titre court (« Leboncoin : 3 annonces suivies par un autre compte »). */
export function titreEcarteesAutreCompte(nom, n, lang = 'fr') {
  return textesAnnonces(lang === 'en' ? 'en' : 'fr').titreEcarteesAutreCompte(nom, n);
}
